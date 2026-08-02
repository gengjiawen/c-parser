// Shared diagnostic type for all pipeline phases (lexer, preprocessor, parser).
// Plain data object (no `type` field) so normalizeAstLocations never treats it
// as an AST node.

export interface Diagnostic {
  message: string
  start: number
  end: number
  phase: 'lexer' | 'preprocessor' | 'parser'
  severity: 'error' | 'warning'
}
