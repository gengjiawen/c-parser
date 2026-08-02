// #if / #elif condition evaluation (C11 6.10.1): `defined` replacement,
// then macro expansion (caller-supplied), then constant-expression
// evaluation in 64-bit two's-complement BigInt arithmetic with the usual
// signed/unsigned conversions. `&&`, `||` and `?:` short-circuit: dead
// operands are parsed but never evaluated, so `defined(X) && 10/X` must not
// report a division by zero.

import { Token, TokenKind, TokenFlags } from '../lexer/token'
import { DirectiveContext, identSpellingOf, report } from './directives'

// Thrown to abort evaluation after the first reported error; the condition
// then counts as false (the region is skipped), matching GCC.
const ABORT = Symbol('cond-eval-abort')

interface PPValue {
  v: bigint
  unsigned: boolean
}

function norm(v: bigint, unsigned: boolean): PPValue {
  return { v: unsigned ? BigInt.asUintN(64, v) : BigInt.asIntN(64, v), unsigned }
}

/**
 * Evaluate a condition line (tokens after the directive name). `expandLine`
 * performs macro expansion on everything that is not an operand of
 * `defined` — the M2 object-macro mini expander, swapped for the real
 * expander in M3.
 */
export function evalCondition(
  condTokens: Token[],
  ctx: DirectiveContext,
  expandLine: (toks: Token[]) => Token[],
  span: { start: number; end: number },
): boolean {
  try {
    // C11 6.10.1p4 ordering: `defined` first (its operand is protected from
    // expansion), then expansion, then any `defined` an expansion produced
    // (GCC evaluates those too, with a portability warning).
    const afterDefined = replaceDefined(condTokens, ctx, false)
    const expanded = expandLine(afterDefined)
    const finalToks = replaceDefined(expanded, ctx, true)
    const value = new CondEval(finalToks, ctx, span).parse()
    return value.v !== 0n
  } catch (e) {
    if (e === ABORT) return false
    throw e
  }
}

/** Replace `defined X` / `defined(X)` with an integer 0/1 token. */
function replaceDefined(toks: Token[], ctx: DirectiveContext, fromExpansion: boolean): Token[] {
  const out: Token[] = []
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (t.kind !== TokenKind.Identifier || t.value !== 'defined') {
      out.push(t)
      continue
    }
    if (fromExpansion) {
      report(ctx, 'warning', 'this use of "defined" may not be portable', t.start, t.end)
    }
    let j = i + 1
    let paren = false
    if (toks[j] !== undefined && toks[j].kind === TokenKind.LParen) {
      paren = true
      j++
    }
    const op = toks[j]
    const name = op !== undefined ? identSpellingOf(op, ctx.source) : null
    if (name === null) {
      report(ctx, 'error', 'operator "defined" requires an identifier', t.start, t.end)
      throw ABORT
    }
    j++
    if (paren) {
      if (toks[j] === undefined || toks[j].kind !== TokenKind.RParen) {
        report(ctx, 'error', `missing ')' after "defined"`, t.start, op.end)
        throw ABORT
      }
      j++
    }
    const flags = TokenFlags.Synthetic | ((t.flags ?? 0) & TokenFlags.SpaceBefore)
    out.push({
      kind: TokenKind.IntLiteral,
      start: t.start,
      end: toks[j - 1].end,
      value: ctx.macros.isDefined(name) ? 1 : 0,
      flags,
    })
    i = j - 1
  }
  return out
}

// Binary operator precedence; higher binds tighter. && and || are handled
// specially for short-circuiting but sit in the same climb.
function binaryPrec(kind: TokenKind): number {
  switch (kind) {
    case TokenKind.PipePipe:
      return 1
    case TokenKind.AmpAmp:
      return 2
    case TokenKind.Pipe:
      return 3
    case TokenKind.Caret:
      return 4
    case TokenKind.Amp:
      return 5
    case TokenKind.EqualEqual:
    case TokenKind.BangEqual:
      return 6
    case TokenKind.Less:
    case TokenKind.Greater:
    case TokenKind.LessEqual:
    case TokenKind.GreaterEqual:
      return 7
    case TokenKind.LessLess:
    case TokenKind.GreaterGreater:
      return 8
    case TokenKind.Plus:
    case TokenKind.Minus:
      return 9
    case TokenKind.Star:
    case TokenKind.Slash:
    case TokenKind.Percent:
      return 10
    default:
      return 0
  }
}

function isIntLiteralKind(kind: TokenKind): boolean {
  return kind >= TokenKind.IntLiteral && kind <= TokenKind.ULongLongLiteral
}

function isUnsignedLiteralKind(kind: TokenKind): boolean {
  return (
    kind === TokenKind.UIntLiteral ||
    kind === TokenKind.ULongLiteral ||
    kind === TokenKind.ULongLongLiteral
  )
}

function isFloatLiteralKind(kind: TokenKind): boolean {
  return kind >= TokenKind.FloatLiteral && kind <= TokenKind.ImaginaryLiteralLongDouble
}

function isStringLiteralKind(kind: TokenKind): boolean {
  return kind >= TokenKind.StringLiteral && kind <= TokenKind.Char16StringLiteral
}

class CondEval {
  private toks: Token[]
  private pos = 0
  private ctx: DirectiveContext
  private span: { start: number; end: number }

  constructor(toks: Token[], ctx: DirectiveContext, span: { start: number; end: number }) {
    this.toks = toks
    this.ctx = ctx
    this.span = span
  }

  parse(): PPValue {
    const v = this.conditional(true)
    const rest = this.toks[this.pos]
    if (rest !== undefined) {
      this.fail('extra tokens at end of #if expression', rest)
    }
    return v
  }

  private fail(message: string, at?: Token): never {
    const start = at !== undefined ? at.start : this.span.start
    const end = at !== undefined ? at.end : this.span.end
    report(this.ctx, 'error', message, start, end)
    throw ABORT
  }

  private conditional(live: boolean): PPValue {
    const cond = this.binary(1, live)
    const q = this.toks[this.pos]
    if (q === undefined || q.kind !== TokenKind.Question) return cond
    this.pos++
    const taken = cond.v !== 0n
    const a = this.conditional(live && taken)
    const colon = this.toks[this.pos]
    if (colon === undefined || colon.kind !== TokenKind.Colon) {
      this.fail("expected ':' in conditional expression", colon)
    }
    this.pos++
    const b = this.conditional(live && !taken)
    // Usual arithmetic conversions apply to the result type even though
    // only one arm was evaluated.
    return norm(taken ? a.v : b.v, a.unsigned || b.unsigned)
  }

  private binary(minPrec: number, live: boolean): PPValue {
    let left = this.unary(live)
    for (;;) {
      const op = this.toks[this.pos]
      const prec = op !== undefined ? binaryPrec(op.kind) : 0
      if (prec === 0 || prec < minPrec) return left
      this.pos++
      if (op.kind === TokenKind.PipePipe) {
        const l = left.v !== 0n
        const right = this.binary(prec + 1, live && !l)
        left = { v: l || right.v !== 0n ? 1n : 0n, unsigned: false }
      } else if (op.kind === TokenKind.AmpAmp) {
        const l = left.v !== 0n
        const right = this.binary(prec + 1, live && l)
        left = { v: l && right.v !== 0n ? 1n : 0n, unsigned: false }
      } else {
        const right = this.binary(prec + 1, live)
        left = this.apply(op, left, right, live)
      }
    }
  }

  private apply(op: Token, l: PPValue, r: PPValue, live: boolean): PPValue {
    // Shifts take the left operand's type; everything else converts both
    // sides (unsigned wins — the source of the classic `-1 > 0U`).
    if (op.kind === TokenKind.LessLess || op.kind === TokenKind.GreaterGreater) {
      if (r.v < 0n) {
        if (live) this.fail('shift count is negative', op)
        return norm(0n, l.unsigned)
      }
      // Counts past the width behave as full shift-out; cap to keep BigInt
      // allocations bounded.
      const count = r.v > 64n ? 64n : r.v
      const shifted = op.kind === TokenKind.LessLess ? l.v << count : l.v >> count
      return norm(shifted, l.unsigned)
    }

    const unsigned = l.unsigned || r.unsigned
    const a = unsigned ? BigInt.asUintN(64, l.v) : l.v
    const b = unsigned ? BigInt.asUintN(64, r.v) : r.v
    switch (op.kind) {
      case TokenKind.Star:
        return norm(a * b, unsigned)
      case TokenKind.Slash:
      case TokenKind.Percent:
        if (b === 0n) {
          if (live) this.fail('division by zero in #if', op)
          return norm(0n, unsigned)
        }
        return norm(op.kind === TokenKind.Slash ? a / b : a % b, unsigned)
      case TokenKind.Plus:
        return norm(a + b, unsigned)
      case TokenKind.Minus:
        return norm(a - b, unsigned)
      case TokenKind.Less:
        return { v: a < b ? 1n : 0n, unsigned: false }
      case TokenKind.Greater:
        return { v: a > b ? 1n : 0n, unsigned: false }
      case TokenKind.LessEqual:
        return { v: a <= b ? 1n : 0n, unsigned: false }
      case TokenKind.GreaterEqual:
        return { v: a >= b ? 1n : 0n, unsigned: false }
      case TokenKind.EqualEqual:
        return { v: a === b ? 1n : 0n, unsigned: false }
      case TokenKind.BangEqual:
        return { v: a !== b ? 1n : 0n, unsigned: false }
      case TokenKind.Amp:
        return norm(a & b, unsigned)
      case TokenKind.Caret:
        return norm(a ^ b, unsigned)
      case TokenKind.Pipe:
        return norm(a | b, unsigned)
      default:
        this.fail('invalid operator in #if expression', op)
    }
  }

  private unary(live: boolean): PPValue {
    const t = this.toks[this.pos]
    if (t === undefined) this.fail('expression expected in #if')
    switch (t.kind) {
      case TokenKind.Plus:
        this.pos++
        return this.unary(live)
      case TokenKind.Minus: {
        this.pos++
        const v = this.unary(live)
        return norm(-v.v, v.unsigned)
      }
      case TokenKind.Tilde: {
        this.pos++
        const v = this.unary(live)
        return norm(~v.v, v.unsigned)
      }
      case TokenKind.Bang: {
        this.pos++
        const v = this.unary(live)
        return { v: v.v === 0n ? 1n : 0n, unsigned: false }
      }
      case TokenKind.LParen: {
        this.pos++
        const v = this.conditional(live)
        const rp = this.toks[this.pos]
        if (rp === undefined || rp.kind !== TokenKind.RParen) {
          this.fail("missing ')' in #if expression", rp)
        }
        this.pos++
        return v
      }
      default:
        return this.primary()
    }
  }

  private primary(): PPValue {
    const t = this.toks[this.pos]
    if (t === undefined) this.fail('expression expected in #if')
    if (isIntLiteralKind(t.kind)) {
      this.pos++
      const raw = t.bigValue ?? BigInt(t.value as number)
      // Unsuffixed constants that only fit an unsigned 64-bit type behave
      // as unsigned (hex literals like 0xffffffffffffffff).
      const unsigned = isUnsignedLiteralKind(t.kind) || raw >= 2n ** 63n
      return norm(raw, unsigned)
    }
    if (t.kind === TokenKind.CharLiteral) {
      this.pos++
      // A single-character constant has type int, holding the value of a
      // plain `char` — signed on every target this parser profiles, so
      // '\xff' is -1 unless the profile says __CHAR_UNSIGNED__. (Multi-
      // character constants and L'...' already arrive as signed ints.)
      if (typeof t.value !== 'string') return { v: BigInt(t.value ?? 0), unsigned: false }
      let v = BigInt(t.value.charCodeAt(0) & 0xff)
      if (v >= 0x80n && !this.ctx.macros.isDefined('__CHAR_UNSIGNED__')) v -= 0x100n
      return { v, unsigned: false }
    }
    if (isFloatLiteralKind(t.kind)) {
      this.fail('floating constant in preprocessor expression', t)
    }
    if (isStringLiteralKind(t.kind)) {
      this.fail('string literals are not valid in preprocessor expressions', t)
    }
    // C11 6.10.1p4: identifiers (and keywords — they are ordinary pp-tokens
    // here) remaining after expansion become 0.
    if (identSpellingOf(t, this.ctx.source) !== null) {
      this.pos++
      return { v: 0n, unsigned: false }
    }
    this.fail('token is not valid in a preprocessor expression', t)
  }
}
