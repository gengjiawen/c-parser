// Public API for the C parser.
// Usage: import { parse } from 'c-parser-ts';

import { Scanner, unterminatedLiteralMessage } from './lexer/scanner'
import { Token, TokenKind } from './lexer/token'
import { Parser } from './parser/parser'
import * as AST from './ast/nodes'
import type { Diagnostic } from './diagnostics'
import { normalizeAstLocations } from './ast/locations'
import { preprocess } from './preprocessor/preprocessor'
import { spellingOf } from './preprocessor/directives'

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
  // Absolute resource cap for the number of non-EOF tokens emitted by the
  // preprocessor. Default: 1,000,000.
  maxPreprocessedTokens?: number
}

const UNTERMINATED_LITERAL = new Set([
  unterminatedLiteralMessage('"'),
  unterminatedLiteralMessage("'"),
])

/**
 * The scanner runs before the preprocessor, so it lexes text the compiler
 * proper never sees — and prose parked in it ("don't do this", "$5 @ 50% off")
 * lexes as an unterminated character constant. GCC reports the same text, but
 * only as a warning; match that severity rather than failing a translation
 * unit over a comment. Two kinds of region qualify:
 *
 * - `#if 0` groups, which the scanner has no way to know are dead. Every
 *   scanner error in one demotes: none of that text is ever compiled.
 * - The operand of `#error`/`#warning`, which C11 6.10.5 defines as a
 *   diagnostic message rather than code. GCC lexes it (so `#warning don't do
 *   this` does report `missing terminating ' character`) but the tokens stop
 *   at the directive, so the diagnostic stays a warning and `#warning` still
 *   exits 0. Only the unterminated-literal diagnostic demotes here: an
 *   unterminated comment on the same line swallows the rest of the file, and
 *   GCC keeps that one an error.
 *
 * `#pragma` is deliberately not in the list. Its operand is implementation-
 * defined, and GCC hands a *recognized* pragma's tokens to the front end,
 * which does turn the bad literal into an error — `#pragma pack(don't)`,
 * `#pragma message(don't)` and `#pragma GCC diagnostic don't` all exit 1,
 * while an unrecognized `#pragma don't` only warns. That boundary is GCC's
 * pragma registry, not something this parser can know, so the error stands.
 */
function demoteUncompiledDiagnostics(
  diagnostics: Diagnostic[],
  directives: AST.PreprocessorDirective[],
): Diagnostic[] {
  const skipped: AST.SourceSpan[] = []
  const message: AST.SourceSpan[] = []
  for (const d of directives) {
    if ((d.type === 'IfDirective' || d.type === 'ElseDirective') && d.skippedRange !== undefined) {
      skipped.push(d.skippedRange)
    } else if (d.type === 'ErrorDirective') {
      message.push(d)
    }
  }
  if (skipped.length === 0 && message.length === 0) return diagnostics
  const covers = (s: AST.SourceSpan, d: Diagnostic): boolean =>
    d.start >= s.start && d.start < s.end
  return diagnostics.map((d) =>
    d.severity === 'error' &&
    (skipped.some((s) => covers(s, d)) ||
      (UNTERMINATED_LITERAL.has(d.message) && message.some((s) => covers(s, d))))
      ? { ...d, severity: 'warning' as const }
      : d,
  )
}

/**
 * A stray preprocessing token (C11 6.4p1: `\`, `@`, a backtick, any other
 * odd byte) has to survive the lexer and the preprocessor, because `#` must
 * be able to stringify its spelling — but no C grammar rule accepts one.
 * GCC draws the line in the same place: cpp passes the token through without
 * a word, and the compiler proper reports `stray '\' in program` once per
 * token and then continues as if it were absent. Do exactly that, so a stray
 * byte costs one diagnostic instead of derailing the declaration around it.
 */
function rejectStrayTokens(tokens: Token[], source: string, out: Diagnostic[]): Token[] {
  if (!tokens.some((t) => t.kind === TokenKind.Stray)) return tokens
  const kept: Token[] = []
  for (const t of tokens) {
    if (t.kind === TokenKind.Stray) {
      out.push({
        message: `stray '${spellingOf(t, source)}' in program`,
        start: t.start,
        end: t.end,
        phase: 'parser',
        severity: 'error',
      })
      continue
    }
    kept.push(t)
  }
  return kept
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
      maxPreprocessedTokens: options?.maxPreprocessedTokens,
    })
    tokens = pp.tokens
    directives = pp.directives
    ppDiagnostics = pp.diagnostics
  }

  const strayDiagnostics: Diagnostic[] = []
  const parser = new Parser(rejectStrayTokens(tokens, source, strayDiagnostics))
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

  const errors = [
    ...demoteUncompiledDiagnostics(scanner.diagnostics, directives),
    ...ppDiagnostics,
    ...strayDiagnostics,
    ...parser.diagnostics,
  ]
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
