export type WorkerRequest = {
  type: 'parse'
  id: number
  source: string
  options: { gnuExtensions: boolean }
}

export type WorkerResponse =
  | { type: 'success'; id: number; ast: object; elapsed: number }
  | { type: 'error'; id: number; error: { message: string }; elapsed: number }
