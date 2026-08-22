import { Duration, Effect, Schedule, pipe } from 'effect'

interface RetryByStatusOptions<E extends Error> {
  isRetryable: (err: E) => boolean
  maxAttempts: number
  label: string
}

/** status-based exponential backoff schedule: base 1s, doubling, capped by maxAttempts.
 * 재시도 사유는 Effect.logWarning으로 표출.
 *
 * @param opts.isRetryable 이 에러를 다시 시도할지 판정. false면 즉시 중단한다
 * @param opts.maxAttempts 최초 호출 포함 총 시도 횟수 (재시도는 `maxAttempts - 1`회)
 * @param opts.label 경고 로그에 붙는 서비스 이름 (예: `'Gemini'`)
 * @returns `Effect.retry`에 넘길 Schedule */
export function retryByStatus<E extends Error>(opts: RetryByStatusOptions<E>) {
  return pipe(
    Schedule.exponential(Duration.seconds(1)),
    Schedule.intersect(Schedule.recurs(opts.maxAttempts - 1)),
    Schedule.whileInput(opts.isRetryable),
    Schedule.tapInput((err: E) => Effect.logWarning(`${opts.label} retry — ${err.message}`)),
  )
}
