// Preprocessor driver: consumes the scanner's token stream, executes
// directives in stream order (recording them as AST nodes), evaluates
// conditionals, and macro-expands what remains into the token stream the
// parser sees. The expansion engine itself lives in expander.ts.

import { Token, TokenKind, TokenFlags } from '../lexer/token'
import type { Diagnostic } from '../diagnostics'
import type * as AST from '../ast/nodes'
import { MacroTable } from './macro-table'
import {
  DirectiveContext,
  directiveTextFrom,
  handleDirectiveLine,
  identSpellingOf,
  isIntLiteralKind,
  pragmaControlToken,
  spellingOf,
} from './directives'
import { evalCondition } from './cond-eval'
import { ExpandSource, Expander } from './expander'
import { LineMap } from './line-map'
import {
  ProfileName,
  headerGroupsFor,
  seedBuiltinMacros,
  seedHeaderMacros,
  seedPredefinedMacros,
} from './profile'

export interface PreprocessOptions {
  gnuExtensions?: boolean
  // Predefined-macro profile. Default: 'gcc-linux-x64'.
  profile?: ProfileName
  // Extra macros, like -D: string = body, number = literal, true = '1',
  // false = force-undefine (masks the profile). 'NAME(a)' keys define
  // function-like macros.
  macros?: Record<string, string | number | boolean>
}

export interface PreprocessResult {
  tokens: Token[]
  directives: AST.PreprocessorDirective[]
  diagnostics: Diagnostic[]
}

/**
 * Token source with pushback, as seen by the macro expander (interface
 * frozen in M1). next()/peek() execute directives transparently, so macro
 * argument collection that looks across a directive boundary processes it
 * exactly once, in stream order — X-macro define/use/undef cycles depend on
 * this single-pass interleaving.
 */
export interface TokenProvider {
  next(): Token
  peek(): Token
  pushBack(toks: Token[]): void
}

export function preprocess(
  source: string,
  tokens: Token[],
  options: PreprocessOptions = {},
): PreprocessResult {
  return new Preprocessor(source, tokens, options).run()
}

// One entry per open #if/#ifdef/#ifndef. `parentActive` restores the state
// at #endif and marks whether this level is visible from active code (an
// invisible frame sits nested inside a skipped group: balance-only, no
// nodes, no evaluation). `pendingSkipNode` is the recorded directive that
// opened the current skipped region at this level, awaiting its
// skippedRange when the next boundary arrives.
interface CondFrame {
  tookBranch: boolean
  parentActive: boolean
  elseSeen: boolean
  pendingSkipNode: AST.IfDirective | AST.ElseDirective | null
  pendingSkipStart: number
}

class Preprocessor implements TokenProvider {
  private input: Token[]
  private i = 0
  private pushed: Token[] = []
  // Pack/visibility tokens from a #pragma met while collecting macro
  // arguments, waiting for the invocation to finish.
  private deferredPragmas: Token[] = []
  private macros = new MacroTable()
  private directives: AST.PreprocessorDirective[] = []
  private diagnostics: Diagnostic[] = []
  private condStack: CondFrame[] = []
  private active = true
  private ctx: DirectiveContext
  private expander: Expander
  // The expansion engine's view of this stream: pushback shares `pushed`,
  // pull() executes directives. inArgs marks argument collection so
  // handleDirective can flag the non-portable embedding.
  private streamSrc: ExpandSource
  private lines: LineMap
  private profileName: ProfileName
  // Names force-undefined via `NAME: false`; header activation skips them.
  private suppressed: ReadonlySet<string>
  private activatedHeaders = new Set<string>()

  constructor(source: string, input: Token[], options: PreprocessOptions) {
    this.input = input
    const gnuExtensions = options.gnuExtensions ?? true
    this.lines = new LineMap(source)
    this.profileName = options.profile ?? 'gcc-linux-x64'
    this.ctx = {
      source,
      gnuExtensions,
      diagnostics: this.diagnostics,
      macros: this.macros,
      builtins: { lines: this.lines, fileName: '<source>', counter: 0 },
    }
    this.expander = new Expander(this.ctx)
    this.streamSrc = {
      pull: () => this.lowNext(),
      stack: this.pushed,
      inArgs: false,
    }
    // Builtins first: an explicit -D of the same name silently overrides.
    seedBuiltinMacros(this.macros, gnuExtensions)
    this.suppressed = seedPredefinedMacros(
      this.macros,
      this.profileName,
      options.macros,
      gnuExtensions,
      this.diagnostics,
    )
  }

  run(): PreprocessResult {
    // Fresh output array (never splice the input); the original Eof token
    // ends the stream — the parser relies on it.
    const output: Token[] = []
    // Runaway fuse: macro expansion cannot legitimately blow the stream up
    // 20-fold (plus slack for tiny inputs).
    const maxOutput = this.input.length * 20 + 4096
    for (;;) {
      const tok = this.next()
      output.push(tok)
      if (tok.kind === TokenKind.Eof) break
      if (output.length > maxOutput) {
        this.error('macro expansion produced too many tokens; giving up', tok.start, tok.end)
        output.push(this.input[this.input.length - 1])
        break
      }
    }
    if (this.condStack.length > 0) {
      const eof = output[output.length - 1]
      this.error('unterminated conditional directive', eof.start, eof.end)
    }
    return { tokens: output, directives: this.directives, diagnostics: this.diagnostics }
  }

  next(): Token {
    for (;;) {
      const t = this.expander.next(this.streamSrc)
      if (
        t.kind === TokenKind.Identifier &&
        t.value === '_Pragma' &&
        this.consumePragmaOperator(t)
      ) {
        continue
      }
      return t
    }
  }

  /**
   * C11 6.10.9 _Pragma operator: the string operand is destringized and
   * processed like a #pragma line (recorded as a directive node, dropped
   * from the parser stream). Sits above the expander, so macro-produced
   * operators (the DO_PRAGMA idiom) are caught after rescanning. On a
   * malformed operand: diagnose, push the lookahead back, and return false
   * so `_Pragma` flows through as an ordinary identifier.
   */
  private consumePragmaOperator(name: Token): boolean {
    const lp = this.expander.next(this.streamSrc)
    if (lp.kind !== TokenKind.LParen) {
      // Eof is sticky in lowNext and must never sit on the pushback stack.
      if (lp.kind !== TokenKind.Eof) this.pushBack([lp])
      this.error('_Pragma takes a parenthesized string literal', name.start, name.end)
      return false
    }
    const str = this.expander.next(this.streamSrc)
    if (str.kind !== TokenKind.StringLiteral && str.kind !== TokenKind.WideStringLiteral) {
      this.pushBack(str.kind === TokenKind.Eof ? [lp] : [lp, str])
      this.error('_Pragma takes a parenthesized string literal', name.start, name.end)
      return false
    }
    const rp = this.expander.next(this.streamSrc)
    if (rp.kind !== TokenKind.RParen) {
      this.pushBack(rp.kind === TokenKind.Eof ? [lp, str] : [lp, str, rp])
      this.error("expected ')' after the _Pragma operand", name.start, str.end)
      return false
    }
    // The scanner already processed escapes, so `value` is the destringized
    // text (6.10.9p1).
    const text = String(str.value ?? '')
    this.directives.push({
      type: 'PragmaDirective',
      text,
      start: name.start,
      end: rp.end,
    })
    // A pack/visibility pragma still has to reach the parser. Pushing it back
    // rather than returning it keeps the caller's loop shape: `next()`
    // continues, and the expander pops the stack before pulling.
    const ctl = pragmaControlToken(text, name.start, rp.end)
    if (ctl !== null) this.pushBack([ctl])
    return true
  }

  /**
   * The next token below the expander: directives execute here (in stream
   * order, exactly once — even when the expander looks ahead for `(` or
   * collects arguments across lines), and skipped-group tokens never
   * surface. Pushed-back tokens don't pass through here; they are popped
   * directly off the shared stack by the expander.
   */
  private lowNext(): Token {
    for (;;) {
      if (this.deferredPragmas.length > 0 && !this.streamSrc.inArgs) {
        return this.deferredPragmas.shift() as Token
      }
      const tok = this.input[this.i]
      if (tok.kind === TokenKind.Eof) return tok
      if (tok.kind === TokenKind.Hash && ((tok.flags ?? 0) & TokenFlags.BOL) !== 0) {
        // #pragma pack/visibility is the one directive that leaves a token
        // behind; it has to be returned here, not pushed, or it would land
        // after whatever this pull goes on to produce. Mid-argument it
        // cannot be returned either — it would become part of the argument
        // — so GCC hoists it out of the invocation and so do we.
        const emit = this.handleDirective(tok)
        if (emit === null) continue
        if (!this.streamSrc.inArgs) return emit
        this.deferredPragmas.push(emit)
        continue
      }
      this.i++
      // Tokens inside a skipped conditional group never reach the parser.
      if (!this.active) continue
      return tok
    }
  }

  peek(): Token {
    const tok = this.next()
    this.pushed.push(tok)
    return tok
  }

  pushBack(toks: Token[]): void {
    for (let k = toks.length - 1; k >= 0; k--) this.pushed.push(toks[k])
  }

  /** Executes one directive line; returns the token it leaves in the stream. */
  private handleDirective(hash: Token): Token | null {
    // Directive extent: everything up to (excluding) the next line-initial
    // token. Backslash continuations never set BOL, so multi-line defines
    // arrive here already joined; Eof always carries BOL.
    let j = this.i + 1
    while (
      this.input[j].kind !== TokenKind.Eof &&
      ((this.input[j].flags ?? 0) & TokenFlags.BOL) === 0
    ) {
      j++
    }
    const line = this.input.slice(this.i + 1, j)
    this.i = j
    const start = hash.start
    const end = line.length > 0 ? line[line.length - 1].end : hash.end

    // C11 6.10.3p11 leaves a directive inside a macro invocation's argument
    // list undefined; process it in stream order like GCC, with GCC's
    // warning.
    if (this.streamSrc.inArgs && this.active) {
      this.warning('embedding a directive within macro arguments is not portable', start, end)
    }

    // The conditional family is processed in every region — it is what
    // delimits skipped groups. Everything else only exists in active code.
    const name = line.length > 0 ? identSpellingOf(line[0], this.ctx.source) : null
    switch (name) {
      case 'if':
      case 'ifdef':
      case 'ifndef':
        this.handleIf(name, line, start, end)
        return null
      case 'elif':
        this.handleElif(line, start, end)
        return null
      case 'else':
        this.handleElse(line, start, end)
        return null
      case 'endif':
        this.handleEndif(line, start, end)
        return null
    }
    // C11 6.10p4: within a skipped group, non-conditional directives have
    // no effect — no macro-table changes, no #error, no nodes, and no
    // "invalid directive" noise.
    if (!this.active) return null
    const node = handleDirectiveLine(hash, line, this.ctx)
    if (node === null) return null
    this.directives.push(node)
    if (node.type === 'IncludeDirective') {
      this.activateHeaderMacros(node.path)
    } else if (node.type === 'LineDirective') {
      this.applyLineDirective(line, end)
    } else if (node.type === 'PragmaDirective') {
      return pragmaControlToken(node.text, start, end)
    }
    return null
  }

  /**
   * #include is never resolved, but including a known system header
   * activates the profile's macros for it — `bool`, `INT_MAX`, `va_arg`
   * only exist once the source asked for them, like a real compile. User
   * -D definitions and force-undefs always win over activation.
   */
  private activateHeaderMacros(path: string): void {
    for (const group of headerGroupsFor(this.profileName, path)) {
      if (this.activatedHeaders.has(group)) continue
      this.activatedHeaders.add(group)
      seedHeaderMacros(
        this.macros,
        group,
        this.ctx.gnuExtensions,
        this.diagnostics,
        this.suppressed,
      )
    }
  }

  /**
   * Apply `#line N ["file"]` to the presumed-line map (C11 6.10.4). The
   * arguments are macro-expanded when not already a digit sequence (p5); a
   * GCC line marker (`# N "file"` with indentation) arrives without the
   * `line` keyword.
   */
  private applyLineDirective(line: Token[], end: number): void {
    let args = line
    if (args.length > 0 && identSpellingOf(args[0], this.ctx.source) === 'line') {
      args = args.slice(1)
    }
    if (args.length === 0 || !isIntLiteralKind(args[0].kind)) {
      args = this.expander.expandTokenList(args)
    }
    // 6.10.4p3 asks for a *digit sequence*, not an integer constant: `0777`
    // is line 777 and `0x10`/`10L` are not line numbers at all, so read the
    // spelling rather than the value the scanner computed.
    const numTok = args[0]
    const digits = numTok === undefined ? '' : spellingOf(numTok, this.ctx.source)
    const num = /^[0-9]+$/.test(digits) ? Number(digits) : NaN
    if (!(num >= 1 && num <= 0x7fffffff)) {
      const at = numTok ?? line[0]
      this.error(
        `#line requires a digit sequence between 1 and 2147483647${digits === '' ? '' : `, not '${digits}'`}`,
        at.start,
        at.end,
      )
      return
    }
    const fileTok = args[1]
    const file =
      fileTok !== undefined && fileTok.kind === TokenKind.StringLiteral
        ? String(fileTok.value ?? '')
        : null
    this.lines.addOverride(end, num, file)
  }

  private handleIf(
    kind: 'if' | 'ifdef' | 'ifndef',
    line: Token[],
    start: number,
    end: number,
  ): void {
    const parentActive = this.active
    let took = false
    let condition = ''
    if (parentActive) {
      if (kind === 'if') {
        condition = directiveTextFrom(line, 1, this.ctx.source)
        if (line.length < 2) {
          this.error(`#${kind} with no expression`, start, end)
        } else {
          took = this.evalIf(line.slice(1), start, end)
        }
      } else {
        const nameTok = line[1]
        const n = nameTok !== undefined ? identSpellingOf(nameTok, this.ctx.source) : null
        if (n === null) {
          this.error(`no macro name given in #${kind} directive`, start, end)
        } else {
          condition = n
          if (line.length > 2) {
            this.warning(`extra tokens at end of #${kind} directive`, line[2].start, end)
          }
          const defined = this.macros.isDefined(n)
          took = kind === 'ifdef' ? defined : !defined
        }
      }
    }
    // In a skipped group the condition is neither expanded nor evaluated;
    // the frame only tracks nesting.
    const frame: CondFrame = {
      tookBranch: took,
      parentActive,
      elseSeen: false,
      pendingSkipNode: null,
      pendingSkipStart: 0,
    }
    this.condStack.push(frame)
    this.active = parentActive && took
    if (parentActive) {
      const node: AST.IfDirective = {
        type: 'IfDirective',
        kind,
        condition,
        active: this.active,
        start,
        end,
      }
      this.directives.push(node)
      if (!this.active) {
        frame.pendingSkipNode = node
        frame.pendingSkipStart = end
      }
    }
  }

  private handleElif(line: Token[], start: number, end: number): void {
    const frame = this.condStack[this.condStack.length - 1]
    if (frame === undefined) {
      this.error('#elif without #if', start, end)
      return
    }
    if (!frame.parentActive) return // nested in a skipped group: balance only
    this.closePendingSkip(frame, start)
    if (frame.elseSeen) this.error('#elif after #else', start, end)
    const condition = directiveTextFrom(line, 1, this.ctx.source)
    let took = false
    if (!frame.elseSeen && !frame.tookBranch) {
      // Only evaluated while no branch has been taken: conditions after the
      // taken branch may reference macros that are garbage in this world.
      if (line.length < 2) {
        this.error('#elif with no expression', start, end)
      } else {
        took = this.evalIf(line.slice(1), start, end)
      }
      if (took) frame.tookBranch = true
    }
    this.active = frame.parentActive && took
    const node: AST.IfDirective = {
      type: 'IfDirective',
      kind: 'elif',
      condition,
      active: this.active,
      start,
      end,
    }
    this.directives.push(node)
    if (!this.active) {
      frame.pendingSkipNode = node
      frame.pendingSkipStart = end
    }
  }

  private handleElse(line: Token[], start: number, end: number): void {
    const frame = this.condStack[this.condStack.length - 1]
    if (frame === undefined) {
      this.error('#else without #if', start, end)
      return
    }
    if (!frame.parentActive) {
      frame.elseSeen = true
      return
    }
    this.closePendingSkip(frame, start)
    if (frame.elseSeen) this.error('#else after #else', start, end)
    if (line.length > 1) {
      this.warning('extra tokens at end of #else directive', line[1].start, end)
    }
    const took = !frame.elseSeen && !frame.tookBranch
    frame.elseSeen = true
    frame.tookBranch = true
    this.active = frame.parentActive && took
    const node: AST.ElseDirective = { type: 'ElseDirective', active: this.active, start, end }
    this.directives.push(node)
    if (!this.active) {
      frame.pendingSkipNode = node
      frame.pendingSkipStart = end
    }
  }

  private handleEndif(line: Token[], start: number, end: number): void {
    const frame = this.condStack.pop()
    if (frame === undefined) {
      this.error('#endif without #if', start, end)
      return
    }
    this.active = frame.parentActive
    if (frame.parentActive) {
      this.closePendingSkip(frame, start)
      if (line.length > 1) {
        this.warning('extra tokens at end of #endif directive', line[1].start, end)
      }
      this.directives.push({ type: 'EndifDirective', start, end })
    }
  }

  private closePendingSkip(frame: CondFrame, boundaryStart: number): void {
    if (frame.pendingSkipNode !== null) {
      frame.pendingSkipNode.skippedRange = { start: frame.pendingSkipStart, end: boundaryStart }
      frame.pendingSkipNode = null
    }
  }

  private evalIf(condTokens: Token[], start: number, end: number): boolean {
    // Full expansion, function-like macros included (C11 6.10.1p4); the
    // list-bounded source means an invocation left open in the condition
    // simply stays unexpanded.
    return evalCondition(condTokens, this.ctx, (toks) => this.expander.expandTokenList(toks), {
      start,
      end,
    })
  }

  private error(message: string, start: number, end: number): void {
    this.diagnostics.push({ message, start, end, phase: 'preprocessor', severity: 'error' })
  }

  private warning(message: string, start: number, end: number): void {
    this.diagnostics.push({ message, start, end, phase: 'preprocessor', severity: 'warning' })
  }
}
