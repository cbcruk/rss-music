import * as React from 'react'

const MOBILE_BREAKPOINT = 768

/**
 * 뷰포트가 모바일 폭(768px 미만)인지 구독한다.
 * @returns 모바일이면 `true`. 측정 전인 SSR/첫 렌더에서는 `false`
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener('change', onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isMobile
}
