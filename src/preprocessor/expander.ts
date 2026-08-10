// Macro expansion engine: object- and function-like replacement with
// GCC-style blue paint, argument collection over a pushback source,
// lazy argument pre-expansion, # stringification, ## pasting (re-lexed
// through a one-shot Scanner), and the GNU `, ## __VA_ARGS__` comma swallow.

import { Scanner } from '../lexer/scanner'
import { Token, TokenKind, TokenFlags, tokenStaticSpelling } from '../lexer/token'
import type { BuiltinMacro, MacroDef } from './macro-table'
import { DirectiveContext, identSpellingOf, report, spellingOf } from './directives'

/**
 * Where the engine pulls tokens when its pushback stack runs dry. The
 * stream source executes directives inside pull() (so argument collection
 * that crosses a directive boundary processes it exactly once, in stream
 * order); the finite source used for argument pre-expansion just reports
 * exhaustion. Tokens on `stack` are re-examined — paint is what prevents
 * re-expansion, not provenance.
 */
export interface ExpandSource {
  pull(): Token
  stack: Token[]
  /** True while the engine is between the `(` and `)` of an invocation. */
  inArgs: boolean
}

// Sentinel for finite sources; kind is all the engine ever looks at.
const EOF_SENTINEL: Token = { kind: TokenKind.Eof, start: 0, end: 0 }

/**
 * Stack sentinel sitting under one macro's replacement list. Popping it
 * means that replacement list has been fully rescanned, so the macro
 * becomes expandable again — GCC pops the macro's context at exactly this
 * point. Markers never leave the engine: pop() is the only reader of the
 * stack and retires them in passing.
 */
interface EndMarker extends Token {
  endOfMacro: string
}

function endMarker(name: string): EndMarker {
  return { kind: TokenKind.Eof, start: 0, end: 0, endOfMacro: name }
}

function isEndMarker(t: Token): t is EndMarker {
  return (t as EndMarker).endOfMacro !== undefined
}

interface CallSpan {
  start: number
  end: number
}

// A replacement-list unit: either a run of tokens (body token, substituted
// argument, stringify result) or a ## marker between two units. A unit with
// no tokens is a placemarker (C11 6.10.3.3p2) — an operand of ## in its own
// right, not an absence.
interface Unit {
  paste: boolean
  /** GNU `, ## __VA_ARGS__`: swallow the comma instead of pasting. */
  gnuComma: boolean
  /** Whitespace before the body token this unit stands for; a placemarker
   * hands it to whatever takes its place. */
  spaceBefore: boolean
  tokens: Token[]
}

const MAX_EXPANSION_STEPS = 512

export class Expander {
  // Macros whose own replacement list is still being rescanned, by name.
  // Counted, not just flagged: argument pre-expansion runs before the
  // invoked macro is disabled, so the same name can legitimately nest.
  private disabled = new Map<string, number>()

  constructor(private ctx: DirectiveContext) {}

  /**
   * The next fully-expanded token from `src` (Eof kind = exhausted).
   * Macro names replace in place and their output is pushed back for
   * rescanning; painted names, non-macros, and function-like names without
   * a following `(` come out as ordinary tokens.
   */
  next(src: ExpandSource): Token {
    let steps = 0
    for (;;) {
      const t = this.pop(src)
      if (t.kind === TokenKind.Eof) return t
      const name = identSpellingOf(t, this.ctx.source)
      if (name === null || (t.noExpand?.has(name) ?? false)) return t
      const def = this.ctx.macros.get(name)
      if (def === undefined) return t

      // C11 6.10.3.4p2 the way GCC implements it: a macro is off limits
      // only while its own replacement list is being rescanned, and a name
      // skipped for that reason is painted permanently. Once the expansion
      // is exhausted the macro is live again — that is what lets
      // `#define g(a) f(a)` re-enter f in `f(2)(9)`.
      if (this.disabled.has(name)) return paintSkipped(t, name)

      // Dynamic predefined macros (__LINE__ &c.) compute their single
      // replacement token here; nothing in it can need rescanning.
      if (def.builtin !== undefined) {
        const e = this.expandBuiltin(def.builtin, t)
        return e ?? t
      }

      if (!def.functionLike) {
        if (++steps > MAX_EXPANSION_STEPS) {
          this.tooDeep(t)
          return t
        }
        this.pushExpansion(src, def.name, this.substitute(def, t, t, null, false))
        continue
      }

      // Function-like: an invocation needs a `(`, which may sit on a later
      // line or across directives. Anything else (including Eof) goes back
      // on the stack and the name is just an identifier.
      const la = this.pop(src)
      if (la.kind !== TokenKind.LParen) {
        src.stack.push(la)
        return t
      }
      if (++steps > MAX_EXPANSION_STEPS) {
        this.tooDeep(t)
        src.stack.push(la)
        return t
      }
      const call = this.collectArgs(def, t, la, src)
      if (call.rparen === null) {
        // Unterminated: diagnosed; hand the consumed tokens back unexpanded.
        pushReversed(src.stack, call.raw)
        return t
      }
      const arity = this.checkArity(def, call.args, t)
      if (arity === null) {
        pushReversed(src.stack, call.raw)
        return t
      }
      this.pushExpansion(
        src,
        def.name,
        this.substitute(def, t, call.rparen, arity.args, arity.vaProvided),
      )
      continue
    }
  }

  /**
   * The next stack or source token, retiring expansion end markers along
   * the way. Every read of `src.stack` goes through here, so a marker can
   * never escape into the token stream.
   */
  private pop(src: ExpandSource): Token {
    for (;;) {
      const t = src.stack.pop()
      if (t === undefined) return src.pull()
      if (!isEndMarker(t)) return t
      const n = this.disabled.get(t.endOfMacro) ?? 0
      if (n <= 1) this.disabled.delete(t.endOfMacro)
      else this.disabled.set(t.endOfMacro, n - 1)
    }
  }

  /**
   * Push a replacement list for rescanning with its end marker underneath,
   * and disable the macro until that marker pops. Called after substitute()
   * so argument pre-expansion still sees the macro live, matching GCC.
   */
  private pushExpansion(src: ExpandSource, name: string, toks: Token[]): void {
    src.stack.push(endMarker(name))
    pushReversed(src.stack, toks)
    this.disabled.set(name, (this.disabled.get(name) ?? 0) + 1)
  }

  /** Completely macro-expand a finite token list (C11 6.10.3.1: arguments
   * expand as if they were the rest of the file, with nothing after). */
  expandTokenList(toks: Token[]): Token[] {
    const src: ExpandSource = {
      pull: () => EOF_SENTINEL,
      stack: toks.slice().reverse(),
      inArgs: false,
    }
    const out: Token[] = []
    for (;;) {
      const t = this.next(src)
      if (t.kind === TokenKind.Eof) break
      out.push(t)
    }
    return out
  }

  private tooDeep(t: Token): void {
    report(this.ctx, 'error', 'macro expansion too deep', t.start, t.end)
  }

  /**
   * The replacement token for a dynamic predefined macro at this use site
   * (span stays there too). __LINE__/__FILE__ follow #line adjustments;
   * __DATE__/__TIME__ are deterministic — parsing has no business reading
   * the clock. Null (identifier stays as-is) without driver-provided
   * builtin state.
   */
  private expandBuiltin(kind: BuiltinMacro, t: Token): Token | null {
    const b = this.ctx.builtins
    if (b === undefined) return null
    const flags = TokenFlags.Synthetic | ((t.flags ?? 0) & TokenFlags.SpaceBefore)
    switch (kind) {
      case 'line':
        return {
          kind: TokenKind.IntLiteral,
          start: t.start,
          end: t.end,
          value: b.lines.lineAt(t.start),
          flags,
        }
      case 'counter':
        return { kind: TokenKind.IntLiteral, start: t.start, end: t.end, value: b.counter++, flags }
      case 'file':
        return this.builtinString(b.lines.fileAt(t.start, b.fileName), t, flags)
      case 'date':
        return this.builtinString('Jan  1 1970', t, flags)
      case 'time':
        return this.builtinString('00:00:00', t, flags)
    }
  }

  private builtinString(text: string, t: Token, flags: number): Token {
    return {
      kind: TokenKind.StringLiteral,
      start: t.start,
      end: t.end,
      value: text,
      spelling: '"' + text.replace(/[\\"]/g, (m) => '\\' + m) + '"',
      flags,
    }
  }

  /**
   * Collect the arguments of a function-like invocation whose `(` has been
   * consumed. Only parentheses protect commas (C11 6.10.3p11). For variadic
   * macros the trailing arguments keep their separating commas in one
   * bucket. rparen === null means Eof arrived first (diagnosed here).
   */
  private collectArgs(
    def: MacroDef,
    nameTok: Token,
    lparen: Token,
    src: ExpandSource,
  ): { args: Token[][]; raw: Token[]; rparen: Token | null } {
    const maxSplits = def.variadic ? def.params.length - 1 : Infinity
    const raw: Token[] = [lparen]
    const args: Token[][] = [[]]
    let depth = 1
    let splits = 0
    const outerInArgs = src.inArgs
    src.inArgs = true
    try {
      for (;;) {
        const t = this.pop(src)
        if (t.kind === TokenKind.Eof) {
          report(
            this.ctx,
            'error',
            `unterminated argument list invoking macro "${def.name}"`,
            nameTok.start,
            nameTok.end,
          )
          return { args, raw, rparen: null }
        }
        if (t.kind === TokenKind.RParen) {
          depth--
          if (depth === 0) {
            raw.push(t)
            return { args, raw, rparen: t }
          }
        } else if (t.kind === TokenKind.LParen) {
          depth++
        } else if (t.kind === TokenKind.Comma && depth === 1 && splits < maxSplits) {
          splits++
          raw.push(t)
          args.push([])
          continue
        }
        raw.push(t)
        args[args.length - 1].push(t)
      }
    } finally {
      src.inArgs = outerInArgs
    }
  }

  /** Arity check; returns buckets normalized to def.params.length plus
   * whether the variadic part was explicitly provided at the call — an
   * omitted `Q(fmt)` and an explicit empty `Q(fmt,)` are different worlds
   * for `, ## __VA_ARGS__`. Null after diagnosing a mismatch (the
   * invocation is then left unexpanded). */
  private checkArity(
    def: MacroDef,
    buckets: Token[][],
    nameTok: Token,
  ): { args: Token[][]; vaProvided: boolean } | null {
    const named = def.variadic ? def.params.length - 1 : def.params.length
    let count = buckets.length
    // `F()` for a non-variadic zero-parameter macro is zero arguments. For
    // `F(...)`, the same spelling supplies one explicitly empty variadic
    // argument (C11 6.10.3p4), so it must remain count === 1.
    if (count === 1 && buckets[0].length === 0 && named === 0 && !def.variadic) count = 0
    const fail = (msg: string): null => {
      report(this.ctx, 'error', msg, nameTok.start, nameTok.end)
      return null
    }
    if (def.variadic) {
      if (count < named) {
        return fail(
          `macro "${def.name}" requires at least ${named} argument${named === 1 ? '' : 's'}, but only ${count} given`,
        )
      }
      // Before C23, omitting the argument corresponding to `...` is a GNU
      // extension. An explicit empty argument (`Q(x,)`) remains valid ISO C.
      if (count === named && !this.ctx.gnuExtensions) {
        return fail(`ISO C requires an argument for the '...' in macro "${def.name}"`)
      }
    } else {
      if (count < named) {
        return fail(
          `macro "${def.name}" requires ${named} argument${named === 1 ? '' : 's'}, but only ${count} given`,
        )
      }
      if (count > named) {
        return fail(`macro "${def.name}" passed ${count} arguments, but takes just ${named}`)
      }
    }
    const out = buckets.slice()
    while (out.length < def.params.length) out.push([])
    // A lone empty argument to a variadic macro with *no named parameters* is
    // GCC's omitted case, not an explicit empty one: `LOG()` for
    // `#define LOG(...)` swallows the `, ## __VA_ARGS__` comma (libcpp
    // collect_args: `argc == 1 && args[0].count == 0 && !CPP_OPTION (pfile,
    // std)`). There is no other spelling of an omission here — the same
    // `LOG()` is the only way to call it with nothing. Strict ISO mode keeps
    // the comma, as `gcc -std=c11` does.
    const loneEmptyVa =
      named === 0 && count === 1 && buckets[0].length === 0 && this.ctx.gnuExtensions
    return { args: out, vaProvided: def.variadic && count === def.params.length && !loneEmptyVa }
  }

  /**
   * Replace one invocation: build the replacement list from the stored
   * definition body (# stringify, parameter substitution with lazy
   * pre-expansion, ## pasting), then hand back tokens that all carry the
   * call-site span. `args` is null for object-like macros (## still
   * applies; # is an ordinary token there). No paint is applied here:
   * tokens are painted where they are skipped, in next().
   */
  private substitute(
    def: MacroDef,
    nameTok: Token,
    endTok: Token,
    args: Token[][] | null,
    vaProvided: boolean,
  ): Token[] {
    const span: CallSpan = { start: nameTok.start, end: endTok.end }
    const expandedArgs: (Token[] | null)[] = args !== null ? args.map(() => null) : []
    const vaIndex = def.variadic ? def.params.length - 1 : -1

    const paramIndexOf = (t: Token): number => {
      if (args === null) return -1
      const n = identSpellingOf(t, this.ctx.source)
      return n === null ? -1 : def.params.indexOf(n)
    }

    // Pass 1: units. Stored body tokens have trustworthy spellings (their
    // spans point at the definition, or they carry `spelling`), so clones
    // capture the spelling before the span is remapped to the call site.
    const units: Unit[] = []
    const body = def.body
    const spacedBody = (t: Token): boolean => ((t.flags ?? 0) & TokenFlags.SpaceBefore) !== 0
    for (let i = 0; i < body.length; i++) {
      const t = body[i]
      if (t.kind === TokenKind.HashHash) {
        // Definition-time validation guarantees a unit on both sides.
        const prev = units[units.length - 1]
        const gnuComma =
          args !== null &&
          prev !== undefined &&
          !prev.paste &&
          prev.tokens.length === 1 &&
          prev.tokens[prev.tokens.length - 1].kind === TokenKind.Comma &&
          i + 1 < body.length &&
          paramIndexOf(body[i + 1]) === vaIndex &&
          vaIndex >= 0
        units.push({ paste: true, gnuComma, spaceBefore: false, tokens: [] })
        continue
      }
      if (args !== null && t.kind === TokenKind.Hash) {
        // Function-like only; validated to be followed by a parameter.
        const idx = paramIndexOf(body[i + 1])
        units.push({
          paste: false,
          gnuComma: false,
          spaceBefore: spacedBody(t),
          tokens: [this.stringify(args[idx], t, span)],
        })
        i++
        continue
      }
      const idx = paramIndexOf(t)
      if (idx >= 0) {
        const nextIsPaste = i + 1 < body.length && body[i + 1].kind === TokenKind.HashHash
        const prevIsPaste = units.length > 0 && units[units.length - 1].paste
        const use =
          nextIsPaste || prevIsPaste
            ? (args as Token[][])[idx] // raw for ## operands
            : (expandedArgs[idx] ??= this.expandTokenList((args as Token[][])[idx]))
        // After ## the first argument token keeps its call-site spacing:
        // gcc prints Q(0,1) as `f(0 ,1)`, not `f(0 , 1)`. (Real pastes are
        // unaffected — paste() takes the left operand's flags.)
        const tokens = use.map((a, k) =>
          this.cloneForExpansion(a, span, k === 0 && !prevIsPaste ? t : undefined),
        )
        units.push({ paste: false, gnuComma: false, spaceBefore: spacedBody(t), tokens })
        continue
      }
      units.push({
        paste: false,
        gnuComma: false,
        spaceBefore: spacedBody(t),
        tokens: [this.cloneForExpansion(t, span, undefined)],
      })
    }

    // Pass 2: resolve pastes left to right. An operand that substituted to
    // nothing is a placemarker (C11 6.10.3.3p2): PM ## X = X, X ## PM = X,
    // PM ## PM = PM. A placemarker is an operand, not an absence, so it also
    // shields the tokens before it — in `#define P(a,b) x a##b`, `P(,r)` is
    // `x r`, never `xr`.
    const out: Token[] = []
    // Tokens the operand ## would take its left side from contributed to
    // `out`; 0 says that operand is a placemarker.
    let held = 0
    // Spacing a placemarker passes on to whatever ends up standing for it.
    let heldSpace = false
    for (let i = 0; i < units.length; i++) {
      const u = units[i]
      if (!u.paste) {
        out.push(...u.tokens)
        held = u.tokens.length
        heldSpace = u.spaceBefore
        continue
      }
      const r = units[++i] // validated: ## is never last
      if (u.gnuComma) {
        // `, ## __VA_ARGS__`: the comma disappears only when the variadic
        // arguments were OMITTED at the call; an explicit empty argument
        // keeps it, and no pasting ever happens (gcc 15: Q(0) -> f(0),
        // Q(0,) -> f(0 ,); for a variadic-only LOG(...), LOG() is itself
        // the omitted case -> log("ctx"), while LOG(,) -> log("ctx" ,,)).
        // In ISO mode an omitted variadic argument was rejected by
        // checkArity(), so this extension is unreachable there.
        if (!vaProvided) {
          out.pop()
          held = 0
        } else {
          out.push(...r.tokens)
          held = 1 + r.tokens.length
        }
        continue
      }
      if (held === 0) {
        // Placemarker ## X: X, keeping the placemarker's own spacing.
        if (r.tokens.length > 0 && heldSpace) setSpaceBefore(r.tokens[0])
        out.push(...r.tokens)
        held = r.tokens.length
        continue
      }
      if (r.tokens.length === 0) continue // X ## placemarker: X
      const left = out.pop() as Token
      const pasted = this.paste(left, r.tokens[0], span)
      if (pasted === null) {
        out.push(left, r.tokens[0])
        held += r.tokens.length
      } else {
        out.push(pasted)
        held += r.tokens.length - 1
      }
      out.push(...r.tokens.slice(1))
    }
    return out
  }

  /** C11 6.10.3.2: the raw argument tokens as a string literal — one space
   * where the source had whitespace between tokens, `\` and `"` escaped
   * inside string and character literals. */
  private stringify(arg: Token[], hashTok: Token, span: CallSpan): Token {
    let text = ''
    let quoted = ''
    for (let i = 0; i < arg.length; i++) {
      const t = arg[i]
      const sp = spellingOf(t, this.ctx.source)
      const sep = i > 0 && ((t.flags ?? 0) & TokenFlags.SpaceBefore) !== 0 ? ' ' : ''
      text += sep + sp
      quoted += sep + (isStringOrChar(t.kind) ? sp.replace(/[\\"]/g, (m) => '\\' + m) : sp)
    }
    const tok: Token = {
      kind: TokenKind.StringLiteral,
      start: span.start,
      end: span.end,
      value: text,
      spelling: '"' + quoted + '"',
      flags: TokenFlags.Synthetic | ((hashTok.flags ?? 0) & TokenFlags.SpaceBefore),
    }
    return tok
  }

  /** Paste two tokens: concatenate their spellings and re-lex; the result
   * must be exactly one token covering the whole text, else GCC's
   * diagnostic and both operands stay separate (null return). */
  private paste(l: Token, r: Token, span: CallSpan): Token | null {
    const text = spellingOf(l, this.ctx.source) + spellingOf(r, this.ctx.source)
    const scanner = new Scanner(text, this.ctx.gnuExtensions)
    const scanned = scanner.scan()
    const one = scanned[0]
    if (
      scanned.length !== 2 ||
      scanner.diagnostics.length > 0 ||
      one.start !== 0 ||
      one.end !== text.length
    ) {
      report(
        this.ctx,
        'error',
        `pasting "${spellingOf(l, this.ctx.source)}" and "${spellingOf(r, this.ctx.source)}" does not give a valid preprocessing token`,
        span.start,
        span.end,
      )
      return null
    }
    const tok: Token = {
      kind: one.kind,
      start: span.start,
      end: span.end,
      spelling: text,
      flags: TokenFlags.Synthetic | ((l.flags ?? 0) & TokenFlags.SpaceBefore),
    }
    if (one.value !== undefined) tok.value = one.value
    if (one.bigValue !== undefined) tok.bigValue = one.bigValue
    const merged = mergePaint(l.noExpand, r.noExpand)
    if (merged !== undefined) tok.noExpand = merged
    return tok
  }

  /**
   * Clone a token into an expansion: call-site span (AST spans must land in
   * user source), spelling captured first if the span was its only record,
   * BOL dropped (expansion output is mid-line), and whatever paint the
   * token already carries (an argument painted during pre-expansion keeps
   * it). `positionTok` is the body token this clone stands in for — the
   * first token of a substituted argument takes the parameter's spacing.
   */
  private cloneForExpansion(t: Token, span: CallSpan, positionTok: Token | undefined): Token {
    const clone: Token = { kind: t.kind, start: span.start, end: span.end }
    if (t.value !== undefined) clone.value = t.value
    if (t.bigValue !== undefined) clone.bigValue = t.bigValue
    const spelling = spellingFor(t, this.ctx.source)
    if (spelling !== undefined) clone.spelling = spelling
    const spaceSrc = positionTok ?? t
    const flags =
      ((spaceSrc.flags ?? 0) & TokenFlags.SpaceBefore) | ((t.flags ?? 0) & TokenFlags.Synthetic)
    if (flags !== 0) clone.flags = flags
    if (t.noExpand !== undefined) clone.noExpand = t.noExpand
    return clone
  }
}

/**
 * Paint a name that was skipped because its macro is mid-expansion (GCC's
 * NO_EXPAND): the token can never expand again, anywhere. Returns a copy —
 * paint sets are shared between clones, so mutating one in place would
 * paint unrelated tokens, and the original may be a scanner token.
 */
function paintSkipped(t: Token, name: string): Token {
  const painted = new Set(t.noExpand ?? [])
  painted.add(name)
  return { ...t, noExpand: painted }
}

/** The spelling a clone must carry, or undefined when it stays recoverable
 * after the span remap (identifiers keep `value`; keywords and punctuation
 * have static text; Synthetic tokens already read from value/bigValue). */
function spellingFor(t: Token, source: string): string | undefined {
  if (t.spelling !== undefined) return t.spelling
  if (t.kind === TokenKind.Identifier) return undefined
  if (tokenStaticSpelling(t.kind) !== undefined) return undefined
  if (((t.flags ?? 0) & TokenFlags.Synthetic) !== 0) return undefined
  return source.slice(t.start, t.end)
}

/** Give a token the spacing of the placemarker it replaces, so the stream
 * still prints the way gcc prints it (`x r`, not `xr`). Safe to mutate:
 * every token in a unit was freshly cloned for this expansion. */
function setSpaceBefore(t: Token): void {
  t.flags = (t.flags ?? 0) | TokenFlags.SpaceBefore
}

function isStringOrChar(kind: TokenKind): boolean {
  return kind >= TokenKind.StringLiteral && kind <= TokenKind.CharLiteral
}

function mergePaint(
  a: Set<string> | undefined,
  b: Set<string> | undefined,
): Set<string> | undefined {
  if (a === undefined || a.size === 0) return b !== undefined && b.size > 0 ? b : undefined
  if (b === undefined || b.size === 0) return a
  const merged = new Set(a)
  for (const n of b) merged.add(n)
  return merged
}

function pushReversed(stack: Token[], toks: Token[]): void {
  for (let k = toks.length - 1; k >= 0; k--) stack.push(toks[k])
}
