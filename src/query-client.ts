import { QueryClient } from '@tanstack/react-query'

/**
 * QueryClient를 새로 만든다. SSR에서 요청 간 캐시가 섞이지 않도록 모듈 싱글턴 대신 매번 생성한다.
 * `staleTime` 60초는 hydration 직후 불필요한 refetch를 막기 위한 값.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
  })
}
