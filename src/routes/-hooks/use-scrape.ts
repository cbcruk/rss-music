import { useCallback, useEffect, useReducer, useRef } from 'react'
import { useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import type { PipelineEvent, PipelineStats } from '#/server/pipeline'

export interface ScrapeResult {
  events: Array<{ kind: string; message: string }>
  stats: PipelineStats
  trackCount: number
}

type StreamMessage =
  | { type: 'event'; event: PipelineEvent }
  | { type: 'done'; stats: PipelineStats; trackCount: number }
  | { type: 'error'; message: string }

const runScrape = createServerFn({ method: 'POST' }).handler(async () => {
  const { runPipeline } = await import('#/server/pipeline')
  return new ReadableStream<StreamMessage>({
    async start(controller) {
      const generator = runPipeline()
      try {
        while (true) {
          const { value, done } = await generator.next()
          if (done) {
            controller.enqueue({
              type: 'done',
              stats: value.stats,
              trackCount: value.tracks.length,
            })
            controller.close()
            return
          }
          controller.enqueue({ type: 'event', event: value })
        }
      } catch (e) {
        controller.enqueue({
          type: 'error',
          message: e instanceof Error ? e.message : String(e),
        })
        controller.close()
      }
    },
  })
})

function flattenEvent(e: PipelineEvent): { kind: string; message: string } {
  return e.type === 'log'
    ? { kind: e.level, message: e.message }
    : { kind: `stage:${e.stage}`, message: e.message }
}

type ScrapeState =
  | { status: 'idle' }
  | { status: 'running'; events: PipelineEvent[] }
  | { status: 'success'; events: PipelineEvent[]; result: ScrapeResult }
  | { status: 'error'; events: PipelineEvent[]; message: string }

type ScrapeAction =
  | { type: 'start' }
  | { type: 'event'; event: PipelineEvent }
  | { type: 'done'; result: ScrapeResult }
  | { type: 'error'; message: string }

function reducer(state: ScrapeState, action: ScrapeAction): ScrapeState {
  switch (action.type) {
    case 'start':
      return { status: 'running', events: [] }
    case 'event':
      if (state.status !== 'running') return state
      return { status: 'running', events: [...state.events, action.event] }
    case 'done':
      if (state.status !== 'running') return state
      return { status: 'success', events: state.events, result: action.result }
    case 'error': {
      const events = state.status === 'idle' ? [] : state.events
      return { status: 'error', events, message: action.message }
    }
  }
}

const initialState: ScrapeState = { status: 'idle' }

export function useScrape() {
  const router = useRouter()
  const [state, dispatch] = useReducer(reducer, initialState)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const run = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    dispatch({ type: 'start' })

    try {
      const stream = await runScrape()
      if (!stream) throw new Error('No stream returned')
      const accumulated: PipelineEvent[] = []
      for await (const msg of stream) {
        if (controller.signal.aborted) {
          await stream.cancel().catch(() => {})
          return
        }
        if (msg.type === 'event') {
          accumulated.push(msg.event)
          dispatch({ type: 'event', event: msg.event })
        } else if (msg.type === 'done') {
          dispatch({
            type: 'done',
            result: {
              events: accumulated.map(flattenEvent),
              stats: msg.stats,
              trackCount: msg.trackCount,
            },
          })
          void router.invalidate()
        } else {
          dispatch({ type: 'error', message: msg.message })
        }
      }
    } catch (e) {
      if (controller.signal.aborted) return
      dispatch({ type: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [router])

  return {
    state,
    run,
    running: state.status === 'running',
    events: state.status === 'idle' ? [] : state.events,
    result: state.status === 'success' ? state.result : null,
    error: state.status === 'error' ? state.message : null,
  }
}
