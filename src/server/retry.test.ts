import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { retryByStatus } from './retry'

class TestError extends Error {
  readonly _tag = 'TestError'
}

describe('retryByStatus — edge cases', () => {
  it('with maxAttempts=1, performs only 1 attempt (no retries)', async () => {
    let attempts = 0
    const policy = retryByStatus<TestError>({
      isRetryable: () => true,
      maxAttempts: 1,
      label: 'test',
    })

    const effect = Effect.suspend(() => {
      attempts++
      return Effect.fail(new TestError('boom'))
    })

    await Effect.runPromise(effect.pipe(Effect.retry(policy), Effect.either))

    expect(attempts).toBe(1)
  })
})
