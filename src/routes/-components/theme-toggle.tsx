import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '#/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/ui/tooltip'

type Theme = 'dark' | 'light'

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return window.localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    setTheme(readStoredTheme())
  }, [])

  const toggle = (): void => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    window.localStorage.setItem('theme', next)
  }

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button size="icon-sm" variant="ghost" onClick={toggle} aria-label={label}>
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
