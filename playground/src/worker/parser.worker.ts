import { parse } from '../../../src/index'
import type { WorkerRequest, WorkerResponse } from './protocol'

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, source, options } = e.data
  const start = performance.now()
  try {
    const ast = parse(source, options)
    const elapsed = performance.now() - start
    const resp: WorkerResponse = { type: 'success', id, ast, elapsed }
    self.postMessage(resp)
  } catch (err) {
    const elapsed = performance.now() - start
    const message = err instanceof Error ? err.message : String(err)
    const resp: WorkerResponse = { type: 'error', id, error: { message }, elapsed }
    self.postMessage(resp)
  }
}
