export type { Diagnostic } from '../../../src/diagnostics'
import type { Diagnostic } from '../../../src/diagnostics'

export type WorkerRequest = {
  type: 'parse'
  id: number
  source: string
  options: { gnuExtensions: boolean }
}

export type WorkerResponse =
  // success = the parser returned an AST; recovered errors ride along as
  // diagnostics. error = the parser itself threw (a bug, not a syntax error).
  | { type: 'success'; id: number; ast: object; diagnostics: Diagnostic[]; elapsed: number }
  | { type: 'error'; id: number; error: { message: string }; elapsed: number }
