// Declarator parsing: handles the C declarator syntax (the part after the type
// specifier that defines the name and type modifiers like pointers, arrays,
// and function parameters).
//
// C declarators follow an "inside-out" rule: int (*fp)(int) means fp is a
// pointer to a function returning int, read from the name outward.

import { Parser, ParenAbstractDecl, ModeKind, ATTR_CONST, ATTR_NORETURN } from './parser'
import { TokenKind, Span } from '../lexer/token'
import * as AST from '../ast/nodes'

// --- Module augmentation ---
declare module './parser' {
  interface Parser {
    parseDeclarator(): [string | null, AST.DerivedDeclarator[]]
    parseDeclaratorWithAttrs(): [
      string | null,
      AST.DerivedDeclarator[],
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
    parseParamList(): [AST.ParamDeclaration[], boolean]
    parseKrIdentifierList(): [AST.ParamDeclaration[], boolean]
    parseParamDeclaratorFull(): [
      string | null,
      number,
      (AST.Expression | null)[],
      boolean,
      (AST.Expression | null)[],
      AST.ParamDeclaration[] | null,
      number,
    ]
    parseParenParamDeclarator(state: {
      pointerDepth: number
      arrayDims: (AST.Expression | null)[]
      isFuncPtr: boolean
      ptrToArrayDims: (AST.Expression | null)[]
      fptrParams: AST.ParamDeclaration[] | null
      fptrInnerPtrDepth: number
    }): string | null
    extractParenName(): string | null
    tryParseParenAbstractDeclarator(): ParenAbstractDecl | null
    skipArrayDimensions(): void
  }
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
Parser.prototype.parseDeclaratorWithAttrs = function (
  this: Parser,
): [string | null, AST.DerivedDeclarator[], ModeKind | null, boolean, number | null, boolean] {
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
    this.skipCvQualifiers()
    this.skipGccExtensions()
  }

  // Parse the direct-declarator part
  let name: string | null = null
  let innerDerived: AST.DerivedDeclarator[] = []

  const peek = this.peek()
  if (peek === TokenKind.Identifier) {
    name = this.peekValue() as string
    this.advance()
  } else if (peek === TokenKind.LParen && this.isParenDeclarator()) {
    const save = this.pos
    this.advance() // consume '('
    const [innerName, innerDer] = this.parseDeclarator()
    if (!this.consumeIf(TokenKind.RParen)) {
      this.pos = save
      name = null
      innerDerived = []
    } else {
      name = innerName
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
      const [params, variadic] = this.parseParamList()
      outerSuffixes.push({ kind: 'Function', params, variadic })
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

  return [name, combined, modeKind, hasCommon, aligned, isPacked]
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
  if (innerDerived.length === 0 && outerSuffixes.length === 0) {
    return outerPointers
  }

  if (innerDerived.length === 0) {
    return [...outerPointers, ...outerSuffixes]
  }

  // Check if inner contains only Pointer and Array
  const innerOnlyPtrAndArray = innerDerived.every((d) => d.kind === 'Pointer' || d.kind === 'Array')
  const innerHasPointer = innerDerived.some((d) => d.kind === 'Pointer')
  const outerStartsWithFunction = outerSuffixes.length > 0 && outerSuffixes[0].kind === 'Function'

  // Function pointer case: inner has Pointer(s), outer starts with Function
  if (
    innerOnlyPtrAndArray &&
    innerHasPointer &&
    outerStartsWithFunction &&
    outerSuffixes.length === 1
  ) {
    const result = [...outerPointers]

    const innerPtrCount = innerDerived.filter((d) => d.kind === 'Pointer').length
    const extraIndirectionPtrs = innerPtrCount > 0 ? innerPtrCount - 1 : 0

    // Emit the function pointer syntax marker + FunctionPointer
    result.push({ kind: 'Pointer' })
    const funcSuffix = outerSuffixes[0]
    if (funcSuffix.kind === 'Function') {
      result.push({
        kind: 'FunctionPointer',
        params: funcSuffix.params,
        variadic: funcSuffix.variadic,
      })
    }

    // Emit extra indirection Pointers
    for (let i = 0; i < extraIndirectionPtrs; i++) {
      result.push({ kind: 'Pointer' })
    }

    // Emit inner arrays
    for (const d of innerDerived) {
      if (d.kind === 'Array') {
        result.push({ ...d })
      }
    }

    return result
  }

  // Pointer-to-array case
  const outerOnlyArrays = outerSuffixes.every((d) => d.kind === 'Array')
  if (innerOnlyPtrAndArray && innerHasPointer && outerOnlyArrays) {
    const lastPtrIdx = findLastIndex(innerDerived, (d) => d.kind === 'Pointer')
    const result = [...outerPointers]

    // Arrays from inner before the last pointer
    for (let i = 0; i < lastPtrIdx; i++) {
      if (innerDerived[i].kind === 'Array') {
        result.push({ ...innerDerived[i] })
      }
    }
    // Outer array suffixes
    result.push(...outerSuffixes)
    // Pointer(s) up to and including lastPtrIdx
    for (let i = 0; i <= lastPtrIdx; i++) {
      if (innerDerived[i].kind === 'Pointer') {
        result.push({ ...innerDerived[i] })
      }
    }
    // Arrays from inner after the last pointer
    for (let i = lastPtrIdx + 1; i < innerDerived.length; i++) {
      result.push({ ...innerDerived[i] })
    }

    return result
  }

  // Nested function pointer case
  const innerStartsWithPointer = innerDerived.length > 0 && innerDerived[0].kind === 'Pointer'
  const innerHasFptr = innerDerived.some((d) => d.kind === 'FunctionPointer')
  if (innerStartsWithPointer && innerHasFptr && outerStartsWithFunction) {
    const result = [...outerPointers, ...innerDerived]
    for (const suffix of outerSuffixes) {
      if (suffix.kind === 'Function') {
        result.push({ kind: 'Pointer' })
        result.push({
          kind: 'FunctionPointer',
          params: suffix.params,
          variadic: suffix.variadic,
        })
      } else {
        result.push(suffix)
      }
    }
    return result
  }

  // General case
  return [...outerPointers, ...outerSuffixes, ...innerDerived]
}

/** Find the last index matching a predicate. */
function findLastIndex<T>(arr: T[], pred: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return i
  }
  return -1
}

// ============================================================
// parseParamList
// ============================================================
Parser.prototype.parseParamList = function (this: Parser): [AST.ParamDeclaration[], boolean] {
  const open = this.peekSpan()
  this.expectContext(TokenKind.LParen, 'for parameter list')
  const params: AST.ParamDeclaration[] = []
  let variadic = false

  if (this.peek() === TokenKind.RParen) {
    this.advance()
    return [params, variadic]
  }

  // Handle (void)
  if (this.peek() === TokenKind.Void) {
    const save = this.pos
    this.advance()
    if (this.peek() === TokenKind.RParen) {
      this.advance()
      return [params, variadic]
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
      const [
        pName,
        pointerDepth,
        arrayDims,
        isFuncPtr,
        ptrToArrayDims,
        fptrParamDecls,
        innerPtrDepth,
      ] = this.parseParamDeclaratorFull()
      this.skipGccExtensions()

      let ts: AST.TypeSpecifier = typeSpec

      // Apply pointer levels
      for (let i = 0; i < pointerDepth; i++) {
        ts = { type: 'PointerType', base: ts, addressSpace: 'Default' }
      }

      // Pointer-to-array: int (*p)[N][M]
      if (ptrToArrayDims.length > 0) {
        for (let i = ptrToArrayDims.length - 1; i >= 0; i--) {
          ts = { type: 'ArrayType', element: ts, size: ptrToArrayDims[i] }
        }
        ts = { type: 'PointerType', base: ts, addressSpace: 'Default' }
      }

      // Array params: outermost dimension decays to pointer
      const vlaSizeExprs: AST.Expression[] = []
      if (arrayDims.length > 0) {
        if (arrayDims[0] !== null) {
          vlaSizeExprs.push(arrayDims[0])
        }
        for (let i = arrayDims.length - 1; i >= 1; i--) {
          ts = { type: 'ArrayType', element: ts, size: arrayDims[i] }
        }
        ts = { type: 'PointerType', base: ts, addressSpace: 'Default' }
      }

      // Function pointers decay to pointer
      if (isFuncPtr) {
        ts = { type: 'PointerType', base: ts, addressSpace: 'Default' }
      }

      this.setAttrFlag(ATTR_CONST, savedConst)
      this.setAttrFlag(ATTR_NORETURN, savedNoreturn)
      params.push({
        typeSpec: ts,
        name: pName,
        fptrParams: fptrParamDecls,
        isConst: paramIsConst,
        vlaSizeExprs,
        fptrInnerPtrDepth: innerPtrDepth,
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
  return [params, variadic]
}

// ============================================================
// parseKrIdentifierList
// ============================================================
Parser.prototype.parseKrIdentifierList = function (
  this: Parser,
): [AST.ParamDeclaration[], boolean] {
  const params: AST.ParamDeclaration[] = []
  while (this.peek() === TokenKind.Identifier) {
    const n = this.peekValue() as string
    this.advance()
    params.push({
      typeSpec: { type: 'IntType' },
      name: n,
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
  return [params, false]
}

// ============================================================
// parseParamDeclaratorFull
// ============================================================
Parser.prototype.parseParamDeclaratorFull = function (
  this: Parser,
): [
  string | null,
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
    this.skipCvQualifiers()
    this.skipGccExtensions()
  }
  const arrayDims: (AST.Expression | null)[] = []
  let isFuncPtr = false
  const ptrToArrayDims: (AST.Expression | null)[] = []
  let fptrParams: AST.ParamDeclaration[] | null = null
  let fptrInnerPtrDepth = 0

  const state: {
    pointerDepth: number
    arrayDims: (AST.Expression | null)[]
    isFuncPtr: boolean
    ptrToArrayDims: (AST.Expression | null)[]
    fptrParams: AST.ParamDeclaration[] | null
    fptrInnerPtrDepth: number
  } = {
    pointerDepth,
    arrayDims,
    isFuncPtr,
    ptrToArrayDims,
    fptrParams,
    fptrInnerPtrDepth,
  }

  let name: string | null = null
  if (this.peek() === TokenKind.LParen && this.isParenDeclarator()) {
    name = this.parseParenParamDeclarator(state)
  } else if (this.peek() === TokenKind.Identifier) {
    name = this.peekValue() as string
    this.advance()
  }

  // Parse trailing array dimensions
  while (this.peek() === TokenKind.LBracket) {
    this.advance()
    this.skipArrayQualifiers()
    if (this.peek() === TokenKind.RBracket) {
      state.arrayDims.push(null)
      this.advance()
    } else if (
      this.peek() === TokenKind.Star &&
      this.pos + 1 < this.tokens.length &&
      this.tokens[this.pos + 1].kind === TokenKind.RBracket
    ) {
      this.advance() // consume '*'
      state.arrayDims.push(null)
      this.advance() // consume ']'
    } else {
      const dimExpr = this.parseExpr()
      state.arrayDims.push(dimExpr)
      this.expect(TokenKind.RBracket)
    }
  }

  // Trailing function parameter list means function type decay
  if (this.peek() === TokenKind.LParen) {
    state.isFuncPtr = true
    const [fpParams] = this.parseParamList()
    state.fptrParams = fpParams
  }

  return [
    name,
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
  state: {
    pointerDepth: number
    arrayDims: (AST.Expression | null)[]
    isFuncPtr: boolean
    ptrToArrayDims: (AST.Expression | null)[]
    fptrParams: AST.ParamDeclaration[] | null
    fptrInnerPtrDepth: number
  },
): string | null {
  const save = this.pos
  this.advance() // consume '('

  // Skip __attribute__ / __extension__ before pointer declarator
  this.skipGccExtensions()

  if (this.peek() === TokenKind.LBracket) {
    // Abstract array declarator in parens: ([4]) or ([])
    while (this.peek() === TokenKind.LBracket) {
      this.advance()
      this.skipArrayQualifiers()
      if (this.peek() === TokenKind.RBracket) {
        state.arrayDims.push(null)
        this.advance()
      } else {
        const dimExpr = this.parseExpr()
        state.arrayDims.push(dimExpr)
        this.expect(TokenKind.RBracket)
      }
    }
    this.expect(TokenKind.RParen)
    return null
  }

  if (this.peek() === TokenKind.Star) {
    // Function pointer or pointer-to-array: (*name)(params) or (*name)[N]
    let innerPtrDepth = 0
    while (this.consumeIf(TokenKind.Star)) {
      innerPtrDepth++
      this.skipCvQualifiers()
      this.skipGccExtensions()
    }
    let name: string | null = null
    if (this.peek() === TokenKind.Identifier) {
      name = this.peekValue() as string
      this.advance()
    } else if (this.peek() === TokenKind.LParen) {
      name = this.extractParenName()
    }
    state.pointerDepth += Math.max(0, innerPtrDepth - 1)

    // Parse array dimensions inside parens: (*a[]) or (*a[N])
    const innerArrayDims: (AST.Expression | null)[] = []
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
    this.expect(TokenKind.RParen)

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
      }
    } else {
      state.pointerDepth += 1
    }
    return name
  }

  if (this.consumeIf(TokenKind.Caret)) {
    // Block pointer (Apple extension)
    let name: string | null = null
    if (this.peek() === TokenKind.Identifier) {
      name = this.peekValue() as string
      this.advance()
    }
    this.expect(TokenKind.RParen)
    if (this.peek() === TokenKind.LParen) {
      this.skipBalancedParens()
    }
    return name
  }

  if (this.peek() === TokenKind.Identifier) {
    // Parenthesized name: (name), (name)(params), or (name(params))
    const name = this.peekValue() as string
    this.advance()

    // Check for function parameter list INSIDE the outer parens
    if (this.peek() === TokenKind.LParen) {
      state.isFuncPtr = true
      const [fpParams] = this.parseParamList()
      state.fptrParams = fpParams
    }
    this.expect(TokenKind.RParen)
    this.skipArrayDimensions()
    // Trailing (params) outside the parens
    if (!state.isFuncPtr && this.peek() === TokenKind.LParen) {
      state.isFuncPtr = true
      const [fpParams] = this.parseParamList()
      state.fptrParams = fpParams
    }
    return name
  }

  if (this.peek() === TokenKind.LParen) {
    // Nested parens: ((name)), ((*name)), ((name)(params)), or ((type))
    const innerSave = this.pos
    const name = this.extractParenName()
    if (name !== null) {
      this.skipArrayDimensions()
      if (this.peek() === TokenKind.LParen) {
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
    return name
  }

  this.pos = save
  return null
}

// ============================================================
// extractParenName
// ============================================================
Parser.prototype.extractParenName = function (this: Parser): string | null {
  if (this.peek() !== TokenKind.LParen) {
    if (this.peek() === TokenKind.Identifier) {
      const n = this.peekValue() as string
      this.advance()
      return n
    }
    return null
  }
  this.advance() // consume '('
  if (this.peek() === TokenKind.Star) {
    this.advance()
    this.skipCvQualifiers()
  }
  let name: string | null
  if (this.peek() === TokenKind.LParen) {
    name = this.extractParenName()
  } else if (this.peek() === TokenKind.Identifier) {
    name = this.peekValue() as string
    this.advance()
  } else {
    name = null
  }
  this.consumeIf(TokenKind.RParen)
  return name
}

// ============================================================
// tryParseParenAbstractDeclarator
// ============================================================
Parser.prototype.tryParseParenAbstractDeclarator = function (
  this: Parser,
): ParenAbstractDecl | null {
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
    this.skipCvQualifiers()
    this.skipGccExtensions()
  }

  // Check for nested: (* (...))
  if (this.peek() === TokenKind.LParen) {
    const inner = this.tryParseParenAbstractDeclarator()
    if (inner !== null) {
      if (inner.kind === 'Simple') {
        const innerPtrs = inner.ptrDepth
        const innerDims = inner.arrayDims

        // After inner (*), check if a parameter list follows
        if (this.peek() === TokenKind.LParen) {
          const [params, variadic] = this.parseParamList()
          if (this.consumeIf(TokenKind.RParen)) {
            return {
              kind: 'NestedFnPtr',
              outerPtrDepth: totalPtrs,
              innerPtrDepth: innerPtrs,
              innerParams: params,
              innerVariadic: variadic,
            }
          } else {
            this.pos = save
            return null
          }
        }

        // Simple nested grouping
        const combinedPtrs = totalPtrs + innerPtrs
        const arrayDims = [...innerDims]
        while (this.peek() === TokenKind.LBracket) {
          this.advance()
          let size: AST.Expression | null = null
          if (this.peek() !== TokenKind.RBracket) {
            size = this.parseExpr()
          }
          this.expect(TokenKind.RBracket)
          arrayDims.push(size)
        }
        if (this.consumeIf(TokenKind.RParen)) {
          return { kind: 'Simple', ptrDepth: combinedPtrs, arrayDims }
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
  const arrayDims: (AST.Expression | null)[] = []
  while (this.peek() === TokenKind.LBracket) {
    this.advance()
    let size: AST.Expression | null = null
    if (this.peek() !== TokenKind.RBracket) {
      size = this.parseExpr()
    }
    this.expect(TokenKind.RBracket)
    arrayDims.push(size)
  }

  if (this.consumeIf(TokenKind.RParen)) {
    if (totalPtrs > 0 || arrayDims.length > 0) {
      return { kind: 'Simple', ptrDepth: totalPtrs, arrayDims }
    } else {
      this.pos = save
      return null
    }
  } else {
    this.pos = save
    return null
  }
}
