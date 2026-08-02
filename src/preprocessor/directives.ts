// Directive-line parsing: turns one `#...` logical line (delimited by the
// driver via BOL flags) into an AST node, applying #define/#undef to the
// macro table. Conditional evaluation and macro expansion live elsewhere.

import { Token, TokenKind, TokenFlags, tokenStaticSpelling } from '../lexer/token'
import type { Diagnostic } from '../diagnostics'
import type * as AST from '../ast/nodes'
import type { MacroDef, MacroTable } from './macro-table'

/**
 * The source spelling of a token. Works for tokens without a `value` field
 * (keywords, punctuation): macro arguments and even macro names can be
 * keyword tokens (`DEF(if, "if")`, `#define _Atomic`). Synthetic tokens
 * (created by `##` paste) carry their spelling in `value`; all other kinds
 * fall back to slicing the source by span.
 */
export function spellingOf(tok: Token, source: string): string {
  if (tok.spelling !== undefined) return tok.spelling
  if (((tok.flags ?? 0) & TokenFlags.Synthetic) !== 0) {
    // Synthetic tokens without an explicit spelling keep only value/bigValue;
    // bigValue is the exact one when both exist.
    return String(tok.bigValue ?? tok.value ?? '')
  }
  if (tok.kind === TokenKind.Identifier) return tok.value as string
  return tokenStaticSpelling(tok.kind) ?? source.slice(tok.start, tok.end)
}

/**
 * The identifier spelling of a token, or null when it cannot act as one
 * (macro name, parameter, operand of defined()). Keyword tokens qualify:
 * `#define _Atomic` and `DEF(if, "if")` name macros/arguments with tokens
 * the scanner lexes as keywords.
 */
export function identSpellingOf(tok: Token, source: string): string | null {
  if (tok.kind === TokenKind.Identifier) return tok.value as string
  const s = tokenStaticSpelling(tok.kind)
  if (s !== undefined) {
    const c = s.charCodeAt(0)
    if (c === 0x5f /* _ */ || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) return s
  }
  return null
}

export interface DirectiveContext {
  source: string
  gnuExtensions: boolean
  diagnostics: Diagnostic[]
  macros: MacroTable
}

export function report(
  ctx: DirectiveContext,
  severity: 'error' | 'warning',
  message: string,
  start: number,
  end: number,
): void {
  ctx.diagnostics.push({ message, start, end, phase: 'preprocessor', severity })
}

function isIntLiteralKind(kind: TokenKind): boolean {
  return kind >= TokenKind.IntLiteral && kind <= TokenKind.ULongLongLiteral
}

/** Raw source text from the line's i-th token to the end of the line. */
function textFrom(line: Token[], i: number, source: string): string {
  if (i >= line.length) return ''
  return source.slice(line[i].start, line[line.length - 1].end)
}

/**
 * Parse one non-conditional directive line into an AST node. `line` holds
 * the tokens after the introducing `#` up to the end of the logical line.
 * The driver intercepts the conditional family (#if/#ifdef/#ifndef/#elif/
 * #else/#endif) before calling this, and only calls this in active regions —
 * so #define/#undef may touch the macro table and #error may report freely.
 * Returns null for the null directive (`#` alone).
 */
export function handleDirectiveLine(
  hash: Token,
  line: Token[],
  ctx: DirectiveContext,
): AST.PreprocessorDirective | null {
  if (line.length === 0) return null // null directive: `#` alone, no effect
  const nameTok = line[0]
  const start = hash.start
  const end = line[line.length - 1].end

  if (nameTok.kind !== TokenKind.Identifier && tokenStaticSpelling(nameTok.kind) === undefined) {
    // GCC line marker (`# 42 "file.c"`) that got past the scanner's skip
    if (isIntLiteralKind(nameTok.kind)) {
      return { type: 'LineDirective', text: textFrom(line, 0, ctx.source), start, end }
    }
    const name = spellingOf(nameTok, ctx.source)
    report(ctx, 'warning', `invalid preprocessing directive #${name}`, nameTok.start, nameTok.end)
    return { type: 'UnknownDirective', name, start, end }
  }

  const name = spellingOf(nameTok, ctx.source)
  switch (name) {
    case 'define':
      return handleDefine(hash, line, ctx, start, end)
    case 'undef':
      return handleUndef(hash, line, ctx, start, end)
    case 'include':
    case 'include_next': {
      const path = textFrom(line, 1, ctx.source)
      if (path === '') {
        report(ctx, 'error', `#${name} expects "FILENAME" or <FILENAME>`, start, end)
      }
      return { type: 'IncludeDirective', path, system: path.startsWith('<'), start, end }
    }
    case 'pragma':
      return { type: 'PragmaDirective', text: textFrom(line, 1, ctx.source), start, end }
    case 'error':
    case 'warning': {
      // Only reached in active regions, where GCC reports the raw line text.
      const text = textFrom(line, 1, ctx.source)
      const sev = name === 'error' ? 'error' : 'warning'
      report(ctx, sev, text === '' ? `#${name}` : `#${name} ${text}`, start, end)
      return { type: 'ErrorDirective', kind: name, text, start, end }
    }
    case 'line':
      return { type: 'LineDirective', text: textFrom(line, 1, ctx.source), start, end }
    default:
      report(ctx, 'warning', `invalid preprocessing directive #${name}`, nameTok.start, nameTok.end)
      return { type: 'UnknownDirective', name, start, end }
  }
}

function handleDefine(
  hash: Token,
  line: Token[],
  ctx: DirectiveContext,
  start: number,
  end: number,
): AST.PreprocessorDirective {
  const source = ctx.source
  const nameTok = line[1]
  if (nameTok === undefined) {
    report(ctx, 'error', 'macro name missing', hash.start, end)
    return { type: 'UnknownDirective', name: 'define', start, end }
  }
  const name = identSpellingOf(nameTok, source)
  if (name === null) {
    report(ctx, 'error', 'macro name must be an identifier', nameTok.start, nameTok.end)
    return { type: 'UnknownDirective', name: 'define', start, end }
  }

  let functionLike = false
  let variadic = false
  const params: string[] = []
  let bodyStart = 2
  let ok = true

  // Function-like iff `(` immediately follows the name (no whitespace):
  // `#define F(x)` is function-like, `#define G (x)` is object-like. The
  // SpaceBefore flag is the arbiter, not span adjacency: a phase-2 splice
  // between name and `(` leaves a physical gap yet still means
  // function-like, while a comment (`#define H/*c*/(x)`) reads as a space
  // and means object-like — both matching GCC.
  const lp = line[2]
  if (
    lp !== undefined &&
    lp.kind === TokenKind.LParen &&
    ((lp.flags ?? 0) & TokenFlags.SpaceBefore) === 0
  ) {
    functionLike = true
    let i = 3
    if (line[i] !== undefined && line[i].kind === TokenKind.RParen) {
      i++
    } else {
      for (;;) {
        const p = line[i]
        if (p === undefined) {
          report(ctx, 'error', "missing ')' in macro parameter list", end, end)
          ok = false
          break
        }
        if (p.kind === TokenKind.Ellipsis) {
          variadic = true
          params.push('__VA_ARGS__')
          i++
        } else {
          const pn = identSpellingOf(p, source)
          if (pn === null) {
            report(
              ctx,
              'error',
              `'${spellingOf(p, source)}' may not appear in macro parameter list`,
              p.start,
              p.end,
            )
            ok = false
            break
          }
          if (params.includes(pn)) {
            report(ctx, 'error', `duplicate macro parameter '${pn}'`, p.start, p.end)
            ok = false
            break
          }
          params.push(pn)
          i++
          // GNU named variadic parameter: `#define m(args...)`
          if (line[i] !== undefined && line[i].kind === TokenKind.Ellipsis) {
            variadic = true
            i++
          }
        }
        const sep = line[i]
        if (sep === undefined) {
          report(ctx, 'error', "missing ')' in macro parameter list", end, end)
          ok = false
          break
        }
        if (sep.kind === TokenKind.RParen) {
          i++
          break
        }
        // Nothing may follow a variadic parameter except `)`
        if (variadic || sep.kind !== TokenKind.Comma) {
          report(ctx, 'error', "expected ',' or ')' in macro parameter list", sep.start, sep.end)
          ok = false
          break
        }
        i++
      }
    }
    bodyStart = i
  }

  // Body constraints the expander relies on (all diagnosed at definition
  // time, like GCC, and the macro is not defined on failure).
  if (ok) {
    const body = line.slice(bodyStart)
    const first = body[0]
    const last = body[body.length - 1]
    if (
      first !== undefined &&
      (first.kind === TokenKind.HashHash || last.kind === TokenKind.HashHash)
    ) {
      const at = first.kind === TokenKind.HashHash ? first : last
      report(
        ctx,
        'error',
        "'##' cannot appear at either end of a macro expansion",
        at.start,
        at.end,
      )
      ok = false
    }
    const vaName = variadic ? params[params.length - 1] : null
    for (let k = 0; ok && k < body.length; k++) {
      const t = body[k]
      if (functionLike && t.kind === TokenKind.Hash) {
        const operand = body[k + 1]
        const pn = operand !== undefined ? identSpellingOf(operand, source) : null
        if (pn === null || !params.includes(pn)) {
          report(ctx, 'error', "'#' is not followed by a macro parameter", t.start, t.end)
          ok = false
        }
      } else if (identSpellingOf(t, source) === '__VA_ARGS__' && vaName !== '__VA_ARGS__') {
        report(
          ctx,
          'error',
          '__VA_ARGS__ can only appear in the expansion of a C99 variadic macro',
          t.start,
          t.end,
        )
        ok = false
      }
    }
  }

  const bodyTokens = ok ? line.slice(bodyStart) : []
  const bodyText =
    bodyTokens.length > 0
      ? source.slice(bodyTokens[0].start, bodyTokens[bodyTokens.length - 1].end)
      : ''

  if (ok) {
    const def: MacroDef = {
      name,
      functionLike,
      params,
      variadic,
      body: bodyTokens,
      nameToken: nameTok,
    }
    if (ctx.macros.define(def, source) === 'redefined') {
      report(ctx, 'warning', `'${name}' macro redefined`, nameTok.start, nameTok.end)
    }
  }

  // Standard `...` is surfaced via the variadic flag; a GNU named variadic
  // parameter keeps its name in params.
  const displayParams =
    variadic && params[params.length - 1] === '__VA_ARGS__' ? params.slice(0, -1) : params
  return {
    type: 'DefineDirective',
    name,
    functionLike,
    params: displayParams,
    variadic,
    body: bodyText,
    start,
    end,
  }
}

function handleUndef(
  hash: Token,
  line: Token[],
  ctx: DirectiveContext,
  start: number,
  end: number,
): AST.UndefDirective {
  const nameTok = line[1]
  let name = ''
  if (nameTok === undefined) {
    report(ctx, 'error', 'macro name missing', hash.start, end)
  } else {
    const n = identSpellingOf(nameTok, ctx.source)
    if (n === null) {
      report(ctx, 'error', 'macro name must be an identifier', nameTok.start, nameTok.end)
    } else {
      name = n
      if (line.length > 2) {
        report(ctx, 'warning', 'extra tokens at end of #undef directive', line[2].start, end)
      }
      // #undef of an unknown name is silent, like GCC (real code has typos
      // in #undef cleanup blocks).
      ctx.macros.undef(name)
    }
  }
  return { type: 'UndefDirective', name, start, end }
}

/** Raw source text of a directive line's tokens from index i on. */
export function directiveTextFrom(line: Token[], i: number, source: string): string {
  return textFrom(line, i, source)
}
