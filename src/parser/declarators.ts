// Declarator parsing: handles the C declarator syntax (the part after the type
// specifier that defines the name and type modifiers like pointers, arrays,
// and function parameters).
//
// C declarators follow an "inside-out" rule: int (*fp)(int) means fp is a
// pointer to a function returning int, read from the name outward.

import {
  Parser,
  AbstractDerivation,
  ParenAbstractDecl,
  ModeKind,
  ATTR_CONST,
  ATTR_NORETURN,
} from './parser'
import { TokenKind, Span } from '../lexer/token'
import * as AST from '../ast/nodes'

// --- Module augmentation ---
declare module './parser' {
  interface Parser {
    applyDeclaratorType(
      base: AST.TypeSpecifier,
      derived: AST.DerivedDeclarator[],
      end?: number,
    ): AST.TypeSpecifier
    adjustParameterType(
      type: AST.TypeSpecifier,
    ): Pick<AST.ParamDeclaration, 'typeSpec' | 'fptrParams' | 'fptrInnerPtrDepth' | 'vlaSizeExprs'>
    parseDeclarator(): [string | null, AST.DerivedDeclarator[]]
    parseDeclaratorWithAttrs(
      preferName?: boolean,
    ): [
      string | null,
      AST.DerivedDeclarator[],
      AST.SourceSpan | null,
      ModeKind | null,
      boolean,
      number | null,
      boolean,
    ]
    isParenDeclarator(): boolean
    combineDeclaratorParts(
      outerPointers: AST.DerivedDeclarator[],
      innerDerived: AST.DerivedDeclarator[],
      outerSuffixes: AST.DerivedDeclarator[],
    ): AST.DerivedDeclarator[]
    parseParamList(): [AST.ParamDeclaration[], boolean, boolean]
    parseKrIdentifierList(): [AST.ParamDeclaration[], boolean, boolean]
    parseParamDeclaratorFull(): [
      string | null,
      AST.SourceSpan | null,
      number,
      (AST.Expression | null)[],
      boolean,
      (AST.Expression | null)[],
      AST.ParamDeclaration[] | null,
      number,
    ]
    parseParenParamDeclarator(state: ParamDeclaratorState): [string | null, AST.SourceSpan | null]
    tryParseParenDeclaratorGroup(): ParenDeclaratorGroup | null
    extractParenDeclarator(): [
      string | null,
      AST.SourceSpan | null,
      number,
      AST.ParamDeclaration[] | null,
    ]
    tryParseParenAbstractDeclarator(): ParenAbstractDecl | null
    skipArrayDimensions(): void
  }
}

/**
 * A parameter declarator wrapped in redundant grouping parentheses, e.g. the
 * `(a[10])` of `void g(int (a[10]))`. The parentheses contribute nothing to
 * the type, so the pieces found inside them belong to the enclosing
 * declarator.
 */
interface ParenDeclaratorGroup {
  name: string | null
  nameSpan: AST.SourceSpan | null
  /** Array dimensions found inside the parens, in source order. */
  dims: (AST.Expression | null)[]
  /** Parameter list found inside the parens, as in `(a(void))`. */
  fnParams: AST.ParamDeclaration[] | null
}

/**
 * What a parameter's declarator has said so far. parseParamDeclaratorFull
 * creates it, parseParenParamDeclarator fills in the parts written inside
 * parentheses, and parseParamList turns it into a type.
 */
interface ParamDeclaratorState {
  pointerDepth: number
  arrayDims: (AST.Expression | null)[]
  isFuncPtr: boolean
  ptrToArrayDims: (AST.Expression | null)[]
  fptrParams: AST.ParamDeclaration[] | null
  fptrInnerPtrDepth: number
  /**
   * Token indices, in descending order, of the `)` that close grouping parens
   * removed by stripRedundantGroupParens. Suffix parsing steps over them with
   * skipStrippedCloses so that what is written outside such a paren continues
   * what is written inside it.
   */
  strippedCloses: number[]
}

function withTypeSpan<T extends { type: AST.TypeSpecifier['type'] }>(
  node: T,
  span: AST.SourceSpan,
): T & AST.SourceSpan {
  return { ...node, start: span.start, end: span.end }
}

function wrapPointerType(base: AST.TypeSpecifier): AST.PointerType {
  return withTypeSpan(
    { type: 'PointerType', base, addressSpace: 'Default' },
    { start: base.start, end: base.end },
  )
}

function wrapArrayType(element: AST.TypeSpecifier, size: AST.Expression | null): AST.ArrayType {
  const end = size !== null ? size.end : element.end
  return withTypeSpan({ type: 'ArrayType', element, size }, { start: element.start, end })
}

function makeIdentifierNode(
  name: string | null,
  span: AST.SourceSpan | null,
): AST.Identifier | null {
  if (name === null || span === null) return null
  return { type: 'Identifier', name, start: span.start, end: span.end }
}

/**
 * Parse a run of array declarator suffixes, appending one entry per dimension
 * to `out`. An omitted size (`[]`) and the C99 unspecified-VLA size (`[*]`)
 * both record `null`. Leading qualifiers and `static` (`[static const 3]`)
 * are skipped.
 */
function parseArrayDims(p: Parser, out: (AST.Expression | null)[]): void {
  while (p.peek() === TokenKind.LBracket) {
    p.advance()
    p.skipArrayQualifiers()
    if (p.peek() === TokenKind.RBracket) {
      out.push(null)
      p.advance()
    } else if (
      p.peek() === TokenKind.Star &&
      p.pos + 1 < p.tokens.length &&
      p.tokens[p.pos + 1].kind === TokenKind.RBracket
    ) {
      p.advance() // consume '*'
      out.push(null)
      p.advance() // consume ']'
    } else {
      out.push(p.parseExpr())
      p.expect(TokenKind.RBracket)
    }
  }
}

/**
 * Index of the token that closes the `(` or `[` at `open`, or -1 when the
 * nesting is unbalanced before the end of the token stream.
 */
function matchingClose(p: Parser, open: number): number {
  const stack: TokenKind[] = []
  for (let i = open; i < p.tokens.length; i++) {
    const kind = p.tokens[i].kind
    if (kind === TokenKind.LParen) {
      stack.push(TokenKind.RParen)
    } else if (kind === TokenKind.LBracket) {
      stack.push(TokenKind.RBracket)
    } else if (kind === TokenKind.RParen || kind === TokenKind.RBracket) {
      if (stack.pop() !== kind) return -1
      if (stack.length === 0) return i
    } else if (kind === TokenKind.Eof) {
      break
    }
  }
  return -1
}

/**
 * True when tokens `[from, to)` are a run of declarator suffixes — balanced
 * `[...]` and `(...)` groups and nothing else. An empty run counts.
 */
function isSuffixRun(p: Parser, from: number, to: number): boolean {
  let i = from
  while (i < to) {
    const kind = p.tokens[i].kind
    if (kind !== TokenKind.LBracket && kind !== TokenKind.LParen) return false
    const close = matchingClose(p, i)
    if (close < 0 || close >= to) return false
    i = close + 1
  }
  return i === to
}

/**
 * Remove grouping parens that wrap a parenthesized declarator, leaving the
 * inner one to stand for the group.
 *
 * `(D)` is the same declarator as `D`, so a paren whose contents are
 * `( ... )` followed by suffixes contributes nothing: `((*a))` is `(*a)`, and
 * `((*a)[2])[3]` is `(*a)[2][3]` because the suffixes written outside the
 * removed paren simply continue the ones written inside it. gcc agrees — it
 * accepts the two spellings of each pair as declarations of the same function.
 *
 * The caller has already consumed the `(` at `open`; each removed layer
 * consumes one more `(` here and returns the index of the `)` that used to
 * match it, for skipStrippedCloses to step over later.
 */
function stripRedundantGroupParens(p: Parser, open: number): number[] {
  const stripped: number[] = []
  let close = matchingClose(p, open)
  // isParenDeclarator keeps a parameter list out of this: the inner parens of
  // `int (())` and `int ((void))` are the function's, not a grouping layer.
  while (close >= 0 && p.peek() === TokenKind.LParen && p.isParenDeclarator()) {
    const innerClose = matchingClose(p, p.pos)
    if (innerClose < 0 || !isSuffixRun(p, innerClose + 1, close)) break
    stripped.push(close)
    close = innerClose
    p.advance() // this '(' takes the place of the redundant one
  }
  return stripped
}

/**
 * Step over the `)` of a grouping paren removed by stripRedundantGroupParens,
 * if the parser has just reached it. Returns whether anything was consumed.
 */
function skipStrippedCloses(p: Parser, stripped: number[]): boolean {
  let consumed = false
  while (stripped.length > 0 && p.pos === stripped[stripped.length - 1]) {
    p.advance()
    stripped.pop()
    consumed = true
  }
  return consumed
}

// ============================================================
// skipArrayDimensions
// ============================================================
Parser.prototype.skipArrayDimensions = function (this: Parser): void {
  while (this.peek() === TokenKind.LBracket) {
    this.advance()
    while (this.peek() !== TokenKind.RBracket && !this.atEof()) {
      this.advance()
    }
    this.consumeIf(TokenKind.RBracket)
  }
}

// ============================================================
// parseDeclarator
// ============================================================
Parser.prototype.parseDeclarator = function (
  this: Parser,
): [string | null, AST.DerivedDeclarator[]] {
  const [name, derived] = this.parseDeclaratorWithAttrs()
  return [name, derived]
}

// ============================================================
// parseDeclaratorWithAttrs
// ============================================================
// Declarators nest through parenthesized declarators (`int (((x)))`) and
// through parameter lists (`void f(void (*g)(void (*h)(...)))`), so this head
// counts a nesting level and yields an empty declarator once the guard trips.
Parser.prototype.parseDeclaratorWithAttrs = function (
  this: Parser,
  preferName: boolean = false,
): [
  string | null,
  AST.DerivedDeclarator[],
  AST.SourceSpan | null,
  ModeKind | null,
  boolean,
  number | null,
  boolean,
] {
  if (!this.enterNesting()) return [null, [], null, null, false, null, false]
  const result = parseDeclaratorWithAttrsInner.call(this, preferName)
  this.exitNesting()
  return result
}

function parseDeclaratorWithAttrsInner(
  this: Parser,
  preferName: boolean,
): [
  string | null,
  AST.DerivedDeclarator[],
  AST.SourceSpan | null,
  ModeKind | null,
  boolean,
  number | null,
  boolean,
] {
  const derived: AST.DerivedDeclarator[] = []

  let preAligned: number | null = null
  let isPacked = false

  const [prePacked, preAlign] = this.parseGccAttributes()
  isPacked = isPacked || prePacked
  if (preAlign !== null) {
    preAligned = preAligned === null ? preAlign : Math.max(preAligned, preAlign)
  }

  // Parse pointer(s) with optional qualifiers and attributes
  while (this.consumeIf(TokenKind.Star)) {
    derived.push({ kind: 'Pointer' })
    this.skipCvQualifiers(true)
    this.skipGccExtensions()
  }

  // Parse the direct-declarator part
  let name: string | null = null
  let nameSpan: AST.SourceSpan | null = null
  let innerDerived: AST.DerivedDeclarator[] = []

  const peek = this.peek()
  if (peek === TokenKind.Identifier) {
    const span = this.peekSpan()
    name = this.peekValue() as string
    nameSpan = { start: span.start, end: span.end }
    this.advance()
  } else if (
    peek === TokenKind.LParen &&
    (this.isParenDeclarator() || (preferName && this.nextTokenIs(TokenKind.Identifier)))
  ) {
    const save = this.pos
    this.advance() // consume '('
    const [innerName, innerDer, innerNameSpan] = this.parseDeclaratorWithAttrs(preferName)
    if (!this.consumeIf(TokenKind.RParen)) {
      this.pos = save
      name = null
      innerDerived = []
    } else {
      name = innerName
      nameSpan = innerNameSpan
      innerDerived = innerDer
    }
  }

  // Parse outer suffixes: array dimensions and function params
  const outerSuffixes: AST.DerivedDeclarator[] = []
  for (;;) {
    const cur = this.peek()
    if (cur === TokenKind.LBracket) {
      const openSpan = this.peekSpan()
      this.advance()
      this.skipArrayQualifiers()
      let size: AST.Expression | null = null
      if (this.peek() === TokenKind.RBracket) {
        // empty dimension
      } else if (
        this.peek() === TokenKind.Star &&
        this.pos + 1 < this.tokens.length &&
        this.tokens[this.pos + 1].kind === TokenKind.RBracket
      ) {
        // C99 VLA star syntax: [*]
        this.advance() // consume '*'
      } else {
        size = this.parseExpr()
      }
      this.expectClosing(TokenKind.RBracket, openSpan)
      outerSuffixes.push({ kind: 'Array', size })
    } else if (cur === TokenKind.LParen) {
      const [params, variadic, hasPrototype] = this.parseParamList()
      outerSuffixes.push({ kind: 'Function', params, variadic, hasPrototype })
    } else {
      break
    }
  }

  // Combine using inside-out rule
  const combined = this.combineDeclaratorParts(derived, innerDerived, outerSuffixes)

  const [postPacked, postAligned, modeKind, hasCommon] = this.parseGccAttributes()
  isPacked = isPacked || postPacked
  let aligned: number | null = null
  if (preAligned !== null && postAligned !== null) {
    aligned = Math.max(preAligned, postAligned)
  } else if (preAligned !== null) {
    aligned = preAligned
  } else if (postAligned !== null) {
    aligned = postAligned
  }

  return [name, combined, nameSpan, modeKind, hasCommon, aligned, isPacked]
}

// ============================================================
// isParenDeclarator
// ============================================================
Parser.prototype.isParenDeclarator = function (this: Parser): boolean {
  if (this.pos + 1 >= this.tokens.length) {
    return false
  }
  const next = this.tokens[this.pos + 1]
  switch (next.kind) {
    case TokenKind.Star:
    case TokenKind.Caret:
    case TokenKind.LParen:
    case TokenKind.LBracket:
    case TokenKind.Attribute:
    case TokenKind.Extension:
      return true
    case TokenKind.Identifier: {
      const idName = next.value as string
      // Typedef name -> parameter list; regular name -> declarator
      return !this.typedefs.has(idName) || this.shadowedTypedefs.has(idName)
    }
    case TokenKind.RParen:
    case TokenKind.Ellipsis:
      return false
    case TokenKind.Void:
    case TokenKind.Char:
    case TokenKind.Short:
    case TokenKind.Int:
    case TokenKind.Long:
    case TokenKind.Float:
    case TokenKind.Double:
    case TokenKind.Signed:
    case TokenKind.Unsigned:
    case TokenKind.Struct:
    case TokenKind.Union:
    case TokenKind.Enum:
    case TokenKind.Const:
    case TokenKind.Volatile:
    case TokenKind.Static:
    case TokenKind.Extern:
    case TokenKind.Register:
    case TokenKind.Typedef:
    case TokenKind.Inline:
    case TokenKind.Bool:
    case TokenKind.Typeof:
    case TokenKind.Noreturn:
    case TokenKind.Restrict:
    case TokenKind.Complex:
    case TokenKind.Atomic:
    case TokenKind.Auto:
    case TokenKind.Alignas:
    case TokenKind.Builtin:
      return false
    default:
      return false
  }
}

// ============================================================
// combineDeclaratorParts
// ============================================================
Parser.prototype.combineDeclaratorParts = function (
  this: Parser,
  outerPointers: AST.DerivedDeclarator[],
  innerDerived: AST.DerivedDeclarator[],
  outerSuffixes: AST.DerivedDeclarator[],
): AST.DerivedDeclarator[] {
  // Compose in the order type constructors wrap the base type. The public
  // derived representation stores adjacent dimensions in source order and
  // encodes a function pointer as Pointer + FunctionPointer, so decode those
  // two conventions before composing the parenthesized declarator.
  const chain = [
    ...constructionOrder(outerPointers),
    ...constructionOrder(outerSuffixes),
    ...constructionOrder(innerDerived),
  ]
  return declaratorOrder(chain)
}

function constructionOrder(derived: AST.DerivedDeclarator[]): AST.DerivedDeclarator[] {
  const chain: AST.DerivedDeclarator[] = []
  for (let i = 0; i < derived.length; i++) {
    const d = derived[i]
    if (d.kind === 'Array') {
      let end = i + 1
      while (derived[end]?.kind === 'Array') end++
      for (let j = end - 1; j >= i; j--) chain.push(derived[j])
      i = end - 1
    } else if (d.kind === 'Pointer' && derived[i + 1]?.kind === 'FunctionPointer') {
      const fn = derived[++i] as AST.FunctionPointerDeclarator
      chain.push({ ...fn, kind: 'Function' }, d)
    } else if (d.kind === 'FunctionPointer') {
      chain.push({ ...d, kind: 'Function' }, { kind: 'Pointer' })
    } else chain.push(d)
  }
  return chain
}

function declaratorOrder(chain: AST.DerivedDeclarator[]): AST.DerivedDeclarator[] {
  const derived: AST.DerivedDeclarator[] = []
  for (let i = 0; i < chain.length; i++) {
    const d = chain[i]
    if (d.kind === 'Array') {
      let end = i + 1
      while (chain[end]?.kind === 'Array') end++
      for (let j = end - 1; j >= i; j--) derived.push(chain[j])
      i = end - 1
    } else if (d.kind === 'Function' && chain[i + 1]?.kind === 'Pointer') {
      derived.push(chain[++i], { ...d, kind: 'FunctionPointer' })
    } else derived.push(d)
  }
  return derived
}

// ============================================================
// parseParamList
// ============================================================
// Parameter lists nest through function-pointer parameters
// (`void f(void (*g)(void (*h)(int)))`), a cycle that runs through
// parseParamDeclaratorFull rather than parseDeclaratorWithAttrs, so it needs
// its own nesting level.
Parser.prototype.parseParamList = function (
  this: Parser,
): [AST.ParamDeclaration[], boolean, boolean] {
  if (!this.enterNesting()) return [[], false, false]
  const result = parseParamListInner.call(this)
  this.exitNesting()
  return result
}

function parseParamListInner(this: Parser): [AST.ParamDeclaration[], boolean, boolean] {
  const open = this.peekSpan()
  this.expectContext(TokenKind.LParen, 'for parameter list')
  const params: AST.ParamDeclaration[] = []
  let variadic = false

  // GCC accepts a pragma inside the parameter list; it takes effect from
  // there on, which for pack/visibility means nothing until the next
  // declaration.
  while (this.handlePragmaPackToken() || this.handlePragmaVisibilityToken()) {
    /* consumed */
  }

  if (this.peek() === TokenKind.RParen) {
    this.advance()
    return [params, variadic, false]
  }

  // Handle (void)
  if (this.peek() === TokenKind.Void) {
    const save = this.pos
    this.advance()
    if (this.peek() === TokenKind.RParen) {
      this.advance()
      return [params, variadic, true]
    }
    this.pos = save
  }

  // Check for K&R-style identifier list
  if (this.peek() === TokenKind.Identifier) {
    const idName = this.peekValue() as string
    if (
      (!this.typedefs.has(idName) || this.shadowedTypedefs.has(idName)) &&
      !this.isTypeSpecifier()
    ) {
      return this.parseKrIdentifierList()
    }
  }

  for (;;) {
    if (this.peek() === TokenKind.Ellipsis) {
      this.advance()
      variadic = true
      break
    }

    // Save noreturn before skip_gcc_extensions() so that a noreturn attribute
    // on a function pointer parameter doesn't leak to the enclosing function.
    const savedNoreturn = this.getAttrFlag(ATTR_NORETURN)
    this.skipGccExtensions()
    // Save and reset parsing_const to detect if this parameter's base type is const.
    const savedConst = this.getAttrFlag(ATTR_CONST)
    this.setAttrFlag(ATTR_CONST, false)
    this.setAttrFlag(ATTR_NORETURN, savedNoreturn)

    const typeSpec = this.parseTypeSpecifier()
    if (typeSpec !== null) {
      const paramIsConst = this.getAttrFlag(ATTR_CONST)
      const [pName, derived, pNameSpan] = this.parseDeclaratorWithAttrs()
      this.skipGccExtensions()
      const parameter = this.adjustParameterType(this.applyDeclaratorType(typeSpec, derived))
      this.setAttrFlag(ATTR_CONST, savedConst)
      this.setAttrFlag(ATTR_NORETURN, savedNoreturn)
      params.push({
        ...parameter,
        name: pName,
        nameNode: makeIdentifierNode(pName, pNameSpan),
        isConst: paramIsConst,
      })
    } else {
      this.setAttrFlag(ATTR_CONST, savedConst)
      this.setAttrFlag(ATTR_NORETURN, savedNoreturn)
      break
    }

    if (!this.consumeIf(TokenKind.Comma)) {
      break
    }
  }

  this.expectClosing(TokenKind.RParen, open)
  return [params, variadic, true]
}

// ============================================================
// parseKrIdentifierList
// ============================================================
Parser.prototype.parseKrIdentifierList = function (
  this: Parser,
): [AST.ParamDeclaration[], boolean, boolean] {
  const params: AST.ParamDeclaration[] = []
  while (this.peek() === TokenKind.Identifier) {
    const span = this.peekSpan()
    const n = this.peekValue() as string
    this.advance()
    params.push({
      typeSpec: withTypeSpan({ type: 'IntType' }, { start: span.start, end: span.end }),
      name: n,
      nameNode: { type: 'Identifier', name: n, start: span.start, end: span.end },
      fptrParams: null,
      isConst: false,
      vlaSizeExprs: [],
      fptrInnerPtrDepth: 0,
    })
    if (!this.consumeIf(TokenKind.Comma)) {
      break
    }
  }
  this.expect(TokenKind.RParen)
  return [params, false, false]
}

// ============================================================
// parseParamDeclaratorFull
// ============================================================
Parser.prototype.parseParamDeclaratorFull = function (
  this: Parser,
): [
  string | null,
  AST.SourceSpan | null,
  number,
  (AST.Expression | null)[],
  boolean,
  (AST.Expression | null)[],
  AST.ParamDeclaration[] | null,
  number,
] {
  let pointerDepth = 0
  while (this.consumeIf(TokenKind.Star)) {
    pointerDepth++
    this.skipCvQualifiers(true)
    this.skipGccExtensions()
  }
  const arrayDims: (AST.Expression | null)[] = []
  let isFuncPtr = false
  const ptrToArrayDims: (AST.Expression | null)[] = []
  let fptrParams: AST.ParamDeclaration[] | null = null
  let fptrInnerPtrDepth = 0

  const state: ParamDeclaratorState = {
    pointerDepth,
    arrayDims,
    isFuncPtr,
    ptrToArrayDims,
    fptrParams,
    fptrInnerPtrDepth,
    strippedCloses: [],
  }

  let name: string | null = null
  let nameSpan: AST.SourceSpan | null = null
  if (this.peek() === TokenKind.LParen && this.isParenDeclarator()) {
    const parenResult = this.parseParenParamDeclarator(state)
    name = parenResult[0]
    nameSpan = parenResult[1]
  } else if (this.peek() === TokenKind.Identifier) {
    const span = this.peekSpan()
    name = this.peekValue() as string
    nameSpan = { start: span.start, end: span.end }
    this.advance()
  }

  // Parse trailing array dimensions. Any dimensions that came from inside
  // grouping parens are already in `state.arrayDims`, and these follow them in
  // source order, which is also the order they apply in. A removed grouping
  // paren's ')' can sit in the middle of the run, as in `((a[2])[3])[4]`.
  parseArrayDims(this, state.arrayDims)
  while (skipStrippedCloses(this, state.strippedCloses)) {
    parseArrayDims(this, state.arrayDims)
  }

  // Trailing function parameter list means function type decay
  if (this.peek() === TokenKind.LParen) {
    state.isFuncPtr = true
    const [fpParams] = this.parseParamList()
    state.fptrParams = fpParams
  }
  skipStrippedCloses(this, state.strippedCloses)

  return [
    name,
    nameSpan,
    state.pointerDepth,
    state.arrayDims,
    state.isFuncPtr,
    state.ptrToArrayDims,
    state.fptrParams,
    state.fptrInnerPtrDepth,
  ]
}

// ============================================================
// parseParenParamDeclarator
// ============================================================
Parser.prototype.parseParenParamDeclarator = function (
  this: Parser,
  state: ParamDeclaratorState,
): [string | null, AST.SourceSpan | null] {
  const save = this.pos
  this.advance() // consume '('

  // Skip __attribute__ / __extension__ before pointer declarator
  this.skipGccExtensions()

  // Redundant grouping parens around the whole declarator: (a), (a[10]),
  // ([10]), ((a[2])[3]), (a(void)). These parens have no effect on the type,
  // so whatever is inside them belongs to this declarator directly and the
  // dimensions inside precede any that follow the ')'.
  const group = this.tryParseParenDeclaratorGroup()
  if (group !== null) {
    state.arrayDims.push(...group.dims)
    if (group.fnParams !== null) {
      state.isFuncPtr = true
      state.fptrParams = group.fnParams
    }
    return [group.name, group.nameSpan]
  }

  // Not plain grouping, but the parens may still nest a parenthesized
  // declarator that means the same thing without them: `((*a))` is `(*a)`.
  // Remove those layers so the shapes below see the canonical spelling.
  state.strippedCloses = stripRedundantGroupParens(this, save)

  if (this.peek() === TokenKind.Star) {
    // Function pointer or pointer-to-array: (*name)(params) or (*name)[N]
    let innerPtrDepth = 0
    while (this.consumeIf(TokenKind.Star)) {
      innerPtrDepth++
      this.skipCvQualifiers(true)
      this.skipGccExtensions()
    }
    let name: string | null = null
    let nameSpan: AST.SourceSpan | null = null
    let innerFunctionParams: AST.ParamDeclaration[] | null = null
    // Array dimensions inside the parens: (*a[]) or (*a[N])
    const innerArrayDims: (AST.Expression | null)[] = []
    if (this.peek() === TokenKind.Identifier) {
      const span = this.peekSpan()
      name = this.peekValue() as string
      nameSpan = { start: span.start, end: span.end }
      this.advance()
    } else if (this.peek() === TokenKind.LParen) {
      // Grouping parens around the name, as in `(*(a[10]))`: they contribute
      // nothing, so their contents belong to this pointer declarator and any
      // dimensions inside come before the ones written after the ')'.
      // The recursive pointer extractor cannot close such a group once it
      // holds an array suffix.
      const innerSave = this.pos
      const savedDiagnostics = this.diagnostics.length
      const savedErrorCount = this.errorCount
      this.advance() // consume the grouping '('
      const innerGroup = this.tryParseParenDeclaratorGroup()
      if (innerGroup !== null && innerGroup.fnParams === null) {
        name = innerGroup.name
        nameSpan = innerGroup.nameSpan
        innerArrayDims.push(...innerGroup.dims)
      } else {
        this.pos = innerSave
        this.diagnostics.length = savedDiagnostics
        this.errorCount = savedErrorCount
        const extracted = this.extractParenDeclarator()
        name = extracted[0]
        nameSpan = extracted[1]
        innerPtrDepth += extracted[2]
        innerFunctionParams = extracted[3]
      }
    }

    while (this.peek() === TokenKind.LBracket) {
      this.advance()
      this.skipArrayQualifiers()
      if (this.peek() === TokenKind.RBracket) {
        innerArrayDims.push(null)
        this.advance()
      } else {
        const dimExpr = this.parseExpr()
        innerArrayDims.push(dimExpr)
        this.expect(TokenKind.RBracket)
      }
    }
    if (this.peek() === TokenKind.LParen) {
      const [fpParams] = this.parseParamList()
      innerFunctionParams = fpParams
    }
    this.expect(TokenKind.RParen)
    skipStrippedCloses(this, state.strippedCloses)

    if (innerFunctionParams !== null) {
      // `(*f(void))` is a grouped spelling of `*f(void)`: the function
      // suffix binds to `f` before this level's pointer(s), so those pointers
      // belong to the function's return type rather than to a function-pointer
      // declarator. Parameter function types subsequently decay to a pointer.
      state.pointerDepth += innerPtrDepth
      state.isFuncPtr = true
      state.fptrParams = innerFunctionParams
      state.fptrInnerPtrDepth = 0
    } else {
      // One pointer is represented either by the adjustment below or by the
      // function-pointer/pointer-to-array shape. All remaining levels belong
      // directly on the parameter's base type.
      state.pointerDepth += Math.max(0, innerPtrDepth - 1)
      if (innerArrayDims.length > 0 && this.peek() !== TokenKind.LParen) {
        // Array of pointers
        state.pointerDepth += 1
        state.arrayDims.length = 0
        state.arrayDims.push(...innerArrayDims)
      } else if (this.peek() === TokenKind.LParen) {
        // Function pointer: (*fp)(params)
        state.isFuncPtr = true
        state.fptrInnerPtrDepth = innerPtrDepth
        const [fpParams] = this.parseParamList()
        state.fptrParams = fpParams
        skipStrippedCloses(this, state.strippedCloses)
      } else if (this.peek() === TokenKind.LBracket) {
        // Pointer-to-array: (*p)[N]
        while (this.peek() === TokenKind.LBracket) {
          this.advance()
          this.skipArrayQualifiers()
          if (this.peek() === TokenKind.RBracket) {
            state.ptrToArrayDims.push(null)
            this.advance()
          } else {
            const dimExpr = this.parseExpr()
            state.ptrToArrayDims.push(dimExpr)
            this.expect(TokenKind.RBracket)
          }
          // A removed grouping paren's ')' can sit between two dimensions of
          // one run, as in `((*a)[2])[3]`.
          skipStrippedCloses(this, state.strippedCloses)
        }
      } else {
        state.pointerDepth += 1
      }
    }
    return [name, nameSpan]
  }

  if (this.consumeIf(TokenKind.Caret)) {
    // Block pointer (Apple extension)
    let name: string | null = null
    let nameSpan: AST.SourceSpan | null = null
    if (this.peek() === TokenKind.Identifier) {
      const span = this.peekSpan()
      name = this.peekValue() as string
      nameSpan = { start: span.start, end: span.end }
      this.advance()
    }
    this.expect(TokenKind.RParen)
    skipStrippedCloses(this, state.strippedCloses)
    if (this.peek() === TokenKind.LParen) {
      this.skipBalancedParens()
    }
    return [name, nameSpan]
  }

  if (this.peek() === TokenKind.LParen) {
    // Nested parens that are not plain grouping: ((*name)) or ((type)).
    const innerSave = this.pos
    const [name, nameSpan, pointerDepth, innerFunctionParams] = this.extractParenDeclarator()
    state.pointerDepth += pointerDepth
    if (name !== null) {
      this.skipArrayDimensions()
      if (innerFunctionParams !== null) {
        state.isFuncPtr = true
        state.fptrParams = innerFunctionParams
      } else if (this.peek() === TokenKind.LParen) {
        state.isFuncPtr = true
        const [fpParams] = this.parseParamList()
        state.fptrParams = fpParams
      }
    } else {
      this.pos = innerSave
      this.skipBalancedParens()
    }
    this.expect(TokenKind.RParen)
    this.skipArrayDimensions()
    if (this.peek() === TokenKind.LParen) {
      state.isFuncPtr = true
      const [fpParams] = this.parseParamList()
      state.fptrParams = fpParams
    }
    return [name, nameSpan]
  }

  this.pos = save
  state.strippedCloses.length = 0
  return [null, null]
}

// ============================================================
// tryParseParenDeclaratorGroup
// ============================================================
/**
 * Parse the body of a redundant grouping paren in a parameter declarator,
 * starting just after the '(' and consuming the matching ')'.
 *
 * Handles `(a)`, `(a[10])`, `([10])`, `((a[2])[3])` and `(a(void))`. The
 * parens are pure grouping, so the dimensions inside them apply before any
 * that follow the ')': gcc agrees that `int ((a[2])[3])[4]` and
 * `int a[2][3][4]` declare the same parameter.
 *
 * Returns null (restoring the position and any diagnostics) when the parens
 * are not plain grouping — a pointer, block pointer or type name inside means
 * one of the other declarator shapes, which the caller handles.
 */
Parser.prototype.tryParseParenDeclaratorGroup = function (
  this: Parser,
): ParenDeclaratorGroup | null {
  const save = this.pos
  const savedDiagnostics = this.diagnostics.length
  const savedErrorCount = this.errorCount
  const bail = (): null => {
    this.pos = save
    this.diagnostics.length = savedDiagnostics
    this.errorCount = savedErrorCount
    return null
  }

  let name: string | null = null
  let nameSpan: AST.SourceSpan | null = null
  const dims: (AST.Expression | null)[] = []
  let fnParams: AST.ParamDeclaration[] | null = null

  const first = this.peek()
  if (first === TokenKind.LParen) {
    this.advance() // consume the nested '('
    const inner = this.tryParseParenDeclaratorGroup()
    if (inner === null) {
      return bail()
    }
    name = inner.name
    nameSpan = inner.nameSpan
    dims.push(...inner.dims)
    fnParams = inner.fnParams
  } else if (first === TokenKind.Identifier) {
    const span = this.peekSpan()
    name = this.peekValue() as string
    nameSpan = { start: span.start, end: span.end }
    this.advance()
  } else if (first !== TokenKind.LBracket) {
    // '*', '^', a type name, or an empty '()' — not a grouping paren.
    return bail()
  }

  parseArrayDims(this, dims)

  // A parameter list inside the group, as in `(a(void))`: the parameter is a
  // function, which decays to a function pointer exactly like `(a)(void)`.
  if (fnParams === null && this.peek() === TokenKind.LParen) {
    const [fpParams] = this.parseParamList()
    fnParams = fpParams
  }

  if (!this.consumeIf(TokenKind.RParen)) {
    return bail()
  }
  return { name, nameSpan, dims, fnParams }
}

// ============================================================
// extractParenDeclarator
// ============================================================
// Self-recursive on nested pointer groups inside a parameter declarator. In
// addition to the name, preserve every `*` and an inner function suffix so a
// caller never has to flatten a nested declarator to just its identifier.
Parser.prototype.extractParenDeclarator = function (
  this: Parser,
): [string | null, AST.SourceSpan | null, number, AST.ParamDeclaration[] | null] {
  if (!this.enterNesting()) return [null, null, 0, null]
  const result = extractParenDeclaratorInner.call(this)
  this.exitNesting()
  return result
}

function extractParenDeclaratorInner(
  this: Parser,
): [string | null, AST.SourceSpan | null, number, AST.ParamDeclaration[] | null] {
  if (this.peek() !== TokenKind.LParen) {
    if (this.peek() === TokenKind.Identifier) {
      const span = this.peekSpan()
      const n = this.peekValue() as string
      this.advance()
      return [n, { start: span.start, end: span.end }, 0, null]
    }
    return [null, null, 0, null]
  }
  this.advance() // consume '('
  let pointerDepth = 0
  while (this.consumeIf(TokenKind.Star)) {
    pointerDepth++
    this.skipCvQualifiers(true)
    this.skipGccExtensions()
  }
  let name: string | null
  let nameSpan: AST.SourceSpan | null = null
  let functionParams: AST.ParamDeclaration[] | null = null
  if (this.peek() === TokenKind.LParen) {
    const extracted = this.extractParenDeclarator()
    name = extracted[0]
    nameSpan = extracted[1]
    pointerDepth += extracted[2]
    functionParams = extracted[3]
  } else if (this.peek() === TokenKind.Identifier) {
    const span = this.peekSpan()
    name = this.peekValue() as string
    nameSpan = { start: span.start, end: span.end }
    this.advance()
  } else {
    name = null
  }
  if (functionParams === null && this.peek() === TokenKind.LParen) {
    const [params] = this.parseParamList()
    functionParams = params
  }
  this.consumeIf(TokenKind.RParen)
  return [name, nameSpan, pointerDepth, functionParams]
}

// ============================================================
// tryParseParenAbstractDeclarator
// ============================================================
/**
 * Parse a parenthesized abstract declarator group into an ordered list of
 * derivations (see `AbstractDerivation`).
 *
 * Inside one group `( *… ‹nested-group› […]… )` the derivations apply in this
 * order, innermost first:
 *
 *   1. this level's `*`s      — they wrap whatever the caller hands in;
 *   2. this level's `[…]`s    — right-to-left, the rightmost being innermost;
 *   3. the nested group's own derivations.
 *
 * Step 3 coming last is what makes `(*(*)[2])` mean "pointer to array 2 of …"
 * instead of "array 2 of pointer to …": the outer `*` of the group belongs to
 * the caller's type, and the nested `(*)`'s pointer sits outside the `[2]`.
 *
 * This method is self-recursive on nested groups (`int (((*)))`); `null` is
 * the existing "not a parenthesized abstract declarator" answer, so callers
 * already backtrack on it.
 */
Parser.prototype.tryParseParenAbstractDeclarator = function (
  this: Parser,
): ParenAbstractDecl | null {
  if (!this.enterNesting()) return null
  const result = tryParseParenAbstractDeclaratorInner.call(this)
  this.exitNesting()
  return result
}

function tryParseParenAbstractDeclaratorInner(this: Parser): ParenAbstractDecl | null {
  if (this.peek() !== TokenKind.LParen) {
    return null
  }
  const save = this.pos
  this.advance() // consume '('

  let totalPtrs = 0

  // Skip __attribute__ / __extension__ before pointer declarator
  this.skipGccExtensions()

  while (this.consumeIf(TokenKind.Star)) {
    totalPtrs++
    this.skipCvQualifiers(true)
    this.skipGccExtensions()
  }

  // Check for nested: (* (...))
  if (this.peek() === TokenKind.LParen) {
    const inner = this.tryParseParenAbstractDeclarator()
    if (inner !== null) {
      if (inner.kind === 'Simple') {
        // After inner (*), check if a parameter list follows
        if (this.peek() === TokenKind.LParen) {
          const [params, variadic] = this.parseParamList()
          if (this.consumeIf(TokenKind.RParen)) {
            return {
              kind: 'NestedFnPtr',
              outerPtrDepth: totalPtrs,
              innerPtrDepth: inner.derived.filter((d) => d.kind === 'Pointer').length,
              innerParams: params,
              innerVariadic: variadic,
            }
          } else {
            this.pos = save
            return null
          }
        }

        // Simple nested grouping: this level's pointers and dimensions apply
        // before the nested group's derivations.
        const derived = parseLevelDerivations(this, totalPtrs)
        derived.push(...inner.derived)
        if (this.consumeIf(TokenKind.RParen)) {
          return { kind: 'Simple', derived }
        } else {
          this.pos = save
          return null
        }
      } else {
        // NestedFnPtr: just close the outer group
        if (this.consumeIf(TokenKind.RParen)) {
          return inner
        } else {
          this.pos = save
          return null
        }
      }
    } else {
      this.pos = save
      return null
    }
  }

  // Parse array dimensions after pointer(s): (*[3][4])
  const derived = parseLevelDerivations(this, totalPtrs)

  if (this.consumeIf(TokenKind.RParen)) {
    if (derived.length > 0) {
      return { kind: 'Simple', derived }
    } else {
      this.pos = save
      return null
    }
  } else {
    this.pos = save
    return null
  }
}

/**
 * Build the derivations contributed by one abstract-declarator level: its
 * already-counted `*`s, then the run of `[…]` dimensions that follows.
 *
 * The dimensions land right-to-left because `[2][3]` is "array 2 of array 3
 * of", so `[3]` is the one that wraps the element type first.
 */
function parseLevelDerivations(p: Parser, ptrCount: number): AbstractDerivation[] {
  const derived: AbstractDerivation[] = []
  for (let i = 0; i < ptrCount; i++) {
    derived.push({ kind: 'Pointer' })
  }
  const sizes: (AST.Expression | null)[] = []
  while (p.peek() === TokenKind.LBracket) {
    p.advance()
    let size: AST.Expression | null = null
    if (p.peek() !== TokenKind.RBracket) {
      size = p.parseExpr()
    }
    p.expect(TokenKind.RBracket)
    sizes.push(size)
  }
  for (let i = sizes.length - 1; i >= 0; i--) {
    derived.push({ kind: 'Array', size: sizes[i] })
  }
  return derived
}

// All declarator contexts share the same ordered constructors. Keep complete
// function types here; parameter adjustment is a separate, outermost operation.
Parser.prototype.applyDeclaratorType = function (
  this: Parser,
  base: AST.TypeSpecifier,
  derived: AST.DerivedDeclarator[],
  end?: number,
): AST.TypeSpecifier {
  let type = base
  for (const d of constructionOrder(derived)) {
    const span = {
      start: base.start,
      end: end ?? (d.kind === 'Array' ? (d.size?.end ?? type.end) : type.end),
    }
    if (d.kind === 'Array') type = { type: 'ArrayType', element: type, size: d.size, ...span }
    else if (d.kind === 'Pointer') {
      type =
        type.type === 'BareFunctionType'
          ? { ...type, type: 'FunctionPointerType', ...span }
          : { type: 'PointerType', base: type, addressSpace: 'Default', ...span }
    } else if (d.kind === 'Function')
      type = {
        type: 'BareFunctionType',
        returnType: type,
        params: d.params,
        variadic: d.variadic,
        hasPrototype: d.hasPrototype ?? true,
        ...span,
      }
  }
  return type
}

Parser.prototype.adjustParameterType = function (this: Parser, declared: AST.TypeSpecifier) {
  const vlaSizeExprs: AST.Expression[] = []
  let type: AST.TypeSpecifier = declared
  if (type.type === 'ArrayType') {
    if (type.size) vlaSizeExprs.push(type.size)
    type = wrapPointerType(type.element)
  } else if (type.type === 'BareFunctionType') type = { ...type, type: 'FunctionPointerType' }

  // Preserve the existing parameter API for an outer function pointer. The
  // return type itself may contain further function pointers and arrays.
  const pointers: AST.PointerType[] = []
  let inner: AST.TypeSpecifier = type
  while (inner.type === 'PointerType') {
    pointers.push(inner)
    inner = inner.base
  }
  let fptrParams: AST.ParamDeclaration[] | null = null
  let fptrInnerPtrDepth = 0
  let fptrHasPrototype: boolean | undefined
  if (inner.type === 'FunctionPointerType') {
    fptrParams = inner.params
    fptrHasPrototype = inner.hasPrototype ?? true
    fptrInnerPtrDepth = pointers.length + 1
    let projected: AST.TypeSpecifier = wrapPointerType(inner.returnType)
    for (let i = pointers.length - 1; i >= 0; i--) projected = { ...pointers[i], base: projected }
    type = projected
  }
  return { typeSpec: type, fptrParams, fptrInnerPtrDepth, fptrHasPrototype, vlaSizeExprs }
}
