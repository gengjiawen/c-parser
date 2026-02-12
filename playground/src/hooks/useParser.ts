import { useState, useEffect, useRef, useCallback } from 'react'
import type { WorkerRequest, WorkerResponse } from '../worker/protocol'

interface ParserState {
  ast: object | null
  error: string | null
  elapsed: number | null
}

export function useParser() {
  const [state, setState] = useState<ParserState>({ ast: null, error: null, elapsed: null })
  const workerRef = useRef<Worker | null>(null)
  const idRef = useRef(0)

  useEffect(() => {
    const worker = new Worker(new URL('../worker/parser.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      // Discard stale responses
      if (msg.id !== idRef.current) return

      if (msg.type === 'success') {
        setState({ ast: msg.ast, error: null, elapsed: msg.elapsed })
      } else {
        setState({ ast: null, error: msg.error.message, elapsed: msg.elapsed })
      }
    }

    return () => worker.terminate()
  }, [])

  const doParse = useCallback((source: string, options: { gnuExtensions: boolean }) => {
    const id = ++idRef.current
    const msg: WorkerRequest = { type: 'parse', id, source, options }
    workerRef.current?.postMessage(msg)
  }, [])

  return { ...state, doParse }
}
