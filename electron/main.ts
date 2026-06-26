import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  Notification,
  nativeImage,
  powerSaveBlocker,
  powerMonitor,
  shell,
  clipboard,
} from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { connect } from 'node:net'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'

const PROJECT_ROOT =
  process.env.RSS_PROJECT_ROOT ??
  (app.isPackaged ? '/Users/ieunsu/Documents/GitHub/rss-extensions' : join(__dirname, '..'))
const VP_BIN = '/Users/ieunsu/.vite-plus/bin/vp'
const VP_NODE = '/Users/ieunsu/.vite-plus/bin/node'
const PORT = 3333
const APP_URL = `http://localhost:${PORT}`
const SERVER_READY_TIMEOUT_MS = 30_000
const SCRAPE_INTERVAL_MS = 2 * 60 * 60 * 1000

let serverProcess: ChildProcess | null = null
let scrapeProcess: ChildProcess | null = null
let scrapeTimer: NodeJS.Timeout | null = null
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

const READY_HOSTS = ['::1', '127.0.0.1']

function checkHost(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port }, () => {
      socket.end()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
  })
}

async function checkPort(port: number): Promise<boolean> {
  for (const host of READY_HOSTS) {
    if (await checkHost(host, port)) return true
  }
  return false
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await checkPort(port)) return true
    await delay(300)
  }
  return false
}

async function ensureServer(): Promise<boolean> {
  if (await checkPort(PORT)) return true
  serverProcess = spawn(VP_BIN, ['preview', '--port', String(PORT)], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: 'ignore',
  })
  serverProcess.on('exit', () => {
    serverProcess = null
  })
  return waitForPort(PORT, SERVER_READY_TIMEOUT_MS)
}

function notify(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
}

function summarize(line: string): string {
  const idx = line.indexOf('— ')
  return idx >= 0 ? line.slice(idx + 2) : line
}

function runScrape(manual: boolean): void {
  if (scrapeProcess) {
    if (manual) notify('Scrape', 'A scrape is already running.')
    return
  }
  scrapeProcess = spawn(VP_NODE, ['--env-file=.env', 'dist/scrape.mjs'], {
    cwd: PROJECT_ROOT,
    env: process.env,
  })
  const logStream = createWriteStream(join(PROJECT_ROOT, 'data', 'scrape.log'), { flags: 'a' })
  let lastLine = ''
  const onChunk = (chunk: Buffer): void => {
    logStream.write(chunk)
    const text = chunk.toString().trim()
    if (text) lastLine = text.split('\n').filter(Boolean).pop() ?? lastLine
  }
  scrapeProcess.stdout?.on('data', onChunk)
  scrapeProcess.stderr?.on('data', onChunk)
  scrapeProcess.on('exit', (code) => {
    logStream.end()
    scrapeProcess = null
    if (code === 0) {
      notify('Scrape complete', summarize(lastLine))
      if (mainWindow && !mainWindow.isFocused()) mainWindow.webContents.reload()
    } else if (manual) {
      notify('Scrape failed', 'See data/scrape.log for details.')
    }
  })
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  mainWindow.show()
  mainWindow.focus()
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'rss-extensions',
    webPreferences: { contextIsolation: true },
  })
  mainWindow = win
  void win.loadURL(APP_URL)

  win.webContents.on('context-menu', (_event, params) => {
    const template: Electron.MenuItemConstructorOptions[] = []

    if (params.linkURL) {
      template.push(
        { label: 'Open Link in Browser', click: () => void shell.openExternal(params.linkURL) },
        { label: 'Copy Link Address', click: () => clipboard.writeText(params.linkURL) },
        { type: 'separator' },
      )
    }

    if (params.isEditable) {
      template.push(
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll' },
      )
    } else if (params.selectionText) {
      template.push({ role: 'copy' }, { type: 'separator' }, { role: 'selectAll' })
    }

    if (template.length > 0) template.push({ type: 'separator' })
    template.push(
      {
        label: 'Back',
        enabled: win.webContents.navigationHistory.canGoBack(),
        click: () => win.webContents.navigationHistory.goBack(),
      },
      {
        label: 'Forward',
        enabled: win.webContents.navigationHistory.canGoForward(),
        click: () => win.webContents.navigationHistory.goForward(),
      },
      { role: 'reload' },
      { type: 'separator' },
      { label: 'Inspect Element', click: () => win.webContents.inspectElement(params.x, params.y) },
    )

    Menu.buildFromTemplate(template).popup({ window: win })
  })

  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })
}

function createTray(): void {
  const icon = nativeImage.createFromPath(join(__dirname, 'tray-icon.png'))
  if (process.platform === 'darwin' && !icon.isEmpty()) icon.setTemplateImage(true)
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('rss-extensions')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open', click: () => showWindow() },
      { label: 'Scrape now', click: () => runScrape(true) },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ]),
  )
  tray.on('click', () => showWindow())
}

void app.whenReady().then(async () => {
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true })
  }

  powerSaveBlocker.start('prevent-app-suspension')
  powerMonitor.on('resume', () => runScrape(false))

  const ready = await ensureServer()
  createTray()
  createWindow()

  if (!ready) {
    notify('rss-extensions', `Server did not become ready on port ${PORT}.`)
  }

  scrapeTimer = setInterval(() => runScrape(false), SCRAPE_INTERVAL_MS)
  runScrape(false)
})

app.on('activate', () => showWindow())

app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  isQuitting = true
  if (scrapeTimer) clearInterval(scrapeTimer)
  serverProcess?.kill()
  scrapeProcess?.kill()
})
