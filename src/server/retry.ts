import { Duration, Effect, Schedule, pipe } from 'effect'

interface RetryByStatusOptions<E extends Error> {
  isRetryable: (err: E) => boolean
  maxAttempts: number
  label: string
}

/** status-based exponential backoff schedule: base 1s, doubling, capped by maxAttempts.
 * 재시도 사유는 Effect.logWarning으로 표출. */
export function retryByStatus<E extends Error>(opts: RetryByStatusOptions<E>) {
  return pipe(
    Schedule.exponential(Duration.seconds(1)),
    Schedule.intersect(Schedule.recurs(opts.maxAttempts - 1)),
    Schedule.whileInput(opts.isRetryable),
    Schedule.tapInput((err: E) => Effect.logWarning(`${opts.label} retry — ${err.message}`)),
  )
}
