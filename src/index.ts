// Public API for the C parser.
// Usage: import { parse } from 'c-parser-ts';

import { Scanner } from './lexer/scanner'
import { Token, TokenKind } from './lexer/token'
import { Parser } from './parser/parser'
import * as AST from './ast/nodes'
import type { Diagnostic } from './diagnostics'
import { normalizeAstLocations } from './ast/locations'
import { preprocess } from './preprocessor/preprocessor'

// Import all parser extensions to register prototype methods
import './parser/expressions'
import './parser/types'
import './parser/statements'
import './parser/declarations'
import './parser/declarators'

export interface ParseOptions {
  gnuExtensions?: boolean
  // Compute loc { line, column } for each node on demand. Default: false.
  loc?: boolean
  // Run the built-in preprocessor: directives become AST nodes instead of
  // leaking into the parser. Default: true. Set to false to parse the token
  // stream exactly as written.
  preprocess?: boolean
  // Predefined-macro profile for the preprocessor: compiler/target macros
  // plus the <stdint.h>/<limits.h> constants and <stdarg.h> shims system
  // headers would provide. Default: 'gcc-linux-x64'; 'none' predefines
  // nothing.
  profile?: 'gcc-linux-x64' | 'none'
  // Extra macros, like -D on a compiler command line: string = body text,
  // number = that literal, true = '1', false = force-undefine (masks the
  // profile). A key like 'MAX(a, b)' defines a function-like macro.
  macros?: Record<string, string | number | boolean>
}

export function parse(source: string, options?: ParseOptions): AST.TranslationUnit {
  const gnuExtensions = options?.gnuExtensions ?? true
  const includeLoc = options?.loc ?? false
  const runPreprocessor = options?.preprocess ?? true

  const scanner = new Scanner(source, gnuExtensions)
  let tokens = scanner.scan()
  let directives: AST.PreprocessorDirective[] = []
  let ppDiagnostics: Diagnostic[] = []
  if (runPreprocessor) {
    const pp = preprocess(source, tokens, {
      gnuExtensions,
      profile: options?.profile,
      macros: options?.macros,
    })
    tokens = pp.tokens
    directives = pp.directives
    ppDiagnostics = pp.diagnostics
  }

  const parser = new Parser(tokens)
  const decls: AST.ExternalDeclaration[] = []

  // Tokens no external declaration could start from are skipped; consecutive
  // skips coalesce into a single diagnostic to keep poisoned regions from
  // flooding the error list.
  let skipStart = 0
  let skipEnd = 0
  let skipCount = 0
  const flushSkipped = (): void => {
    if (skipCount === 0) return
    parser.diagnostics.push({
      message: `skipped ${skipCount} unexpected token${skipCount === 1 ? '' : 's'}`,
      start: skipStart,
      end: skipEnd,
      phase: 'parser',
      severity: 'error',
    })
    skipCount = 0
  }

  while (!parser.atEof()) {
    const decl = parser.parseExternalDecl()
    if (decl !== null) {
      flushSkipped()
      decls.push(decl)
    } else {
      // Skip unrecognized token to avoid infinite loop
      if (!parser.atEof()) {
        const span = parser.peekSpan()
        if (skipCount === 0) skipStart = span.start
        skipEnd = span.end
        skipCount++
        parser.advance()
      }
    }
  }
  flushSkipped()

  const errors = [...scanner.diagnostics, ...ppDiagnostics, ...parser.diagnostics]
  errors.sort((a, b) => a.start - b.start || a.end - b.end)

  const ast: AST.TranslationUnit = {
    type: 'TranslationUnit',
    decls,
    directives,
    errors,
    start: 0,
    end: source.length,
  }

  normalizeAstLocations(ast, source, includeLoc)
  return ast
}

// Re-export types for consumers
export { AST }
export type { Diagnostic } from './diagnostics'
export type { TokenKind, Token } from './lexer/token'
export { Scanner } from './lexer/scanner'
export { Parser } from './parser/parser'
