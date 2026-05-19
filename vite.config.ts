import { defineConfig } from 'vite-plus'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  fmt: { ignorePatterns: ['src/routeTree.gen.ts'], singleQuote: true, semi: false },
  lint: { options: { typeAware: true, typeCheck: true }, ignorePatterns: ['src/routeTree.gen.ts'] },
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  test: { setupFiles: ['./vitest-setup.ts'] },
})

export default config
