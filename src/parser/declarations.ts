// Declaration parsing: external (top-level) and local (block-scope) declarations.
//
// External declarations handle both function definitions and variable/type
// declarations. The key challenge is disambiguating function definitions
// (which have a body) from declarations (which end with ';').
//
// K&R-style function parameters are also handled here, where parameter types
// are declared separately after the parameter name list.

import {
  Parser,
  defaultAttrs,
  ATTR_TYPEDEF,
  ATTR_STATIC,
  ATTR_EXTERN,
  ATTR_CONST,
  ATTR_VOLATILE,
  ATTR_INLINE,
  ATTR_NORETURN,
  ATTR_THREAD_LOCAL,
  ATTR_CONSTRUCTOR,
  ATTR_DESTRUCTOR,
  ATTR_WEAK,
  ATTR_USED,
  ATTR_GNU_INLINE,
  ATTR_ALWAYS_INLINE,
  ATTR_NOINLINE,
  ATTR_ERROR_ATTR,
  ATTR_TRANSPARENT_UNION,
  ATTR_FASTCALL,
  ATTR_NAKED,
  ModeKind,
  applyModeKind,
} from './parser'
import { TokenKind, Span } from '../lexer/token'
import * as AST from '../ast/nodes'

// --- DeclContext: groups per-declarator attributes ---
interface DeclContext {
  attrs: AST.DeclAttributes
  alignment: number | null
  alignasType: AST.TypeSpecifier | null
  alignmentSizeofType: AST.TypeSpecifier | null
  isCommon: boolean
}

// --- Module augmentation ---
declare module './parser' {
  interface Parser {
    parseExternalDecl(): AST.ExternalDeclaration | null
    parseFunctionDef(
      typeSpec: AST.TypeSpecifier,
      name: string | null,
      derived: AST.DerivedDeclarator[],
      startPos: Span,
      declAttrs: AST.DeclAttributes,
    ): AST.ExternalDeclaration | null
    buildReturnType(
      baseType: AST.TypeSpecifier,
      derived: AST.DerivedDeclarator[],
    ): AST.TypeSpecifier
    parseKrParams(paramNames: AST.ParamDeclaration[]): AST.ParamDeclaration[]
    applyKrDerivations(
      typeSpec: AST.TypeSpecifier,
      pderived: AST.DerivedDeclarator[],
    ): [AST.TypeSpecifier, AST.ParamDeclaration[] | null]
    parseDeclarationRest(
      typeSpec: AST.TypeSpecifier,
      name: string | null,
      derived: AST.DerivedDeclarator[],
      startPos: Span,
      ctx: DeclContext,
    ): AST.ExternalDeclaration | null
    parseLocalDeclaration(): AST.Declaration | null
    parseInitializer(): AST.Initializer
    parseStaticAssert(): Span
    consumePostTypeQualifiers(): void
    registerTypedefs(declarators: AST.InitDeclarator[]): void
  }
}

// Static methods on Parser (not on prototype)
export function evalConstIntExpr(expr: AST.Expression): number | null {
  return evalConstIntExprWithEnums(expr, null, null)
}

export function evalConstIntExprWithEnums(
  expr: AST.Expression,
  enums: Map<string, number> | null,
  tagAligns: Map<string, number> | null,
): number | null {
  switch (expr.type) {
    case 'IntLiteral':
      return expr.value
    case 'UIntLiteral':
      return expr.value
    case 'LongLiteral':
      return expr.value
    case 'ULongLiteral':
      return expr.value
    case 'LongLongLiteral':
      return Number(expr.value)
    case 'ULongLongLiteral':
      return Number(expr.value)
    case 'CharLiteral':
      return typeof expr.value === 'string' ? expr.value.charCodeAt(0) : 0
    case 'Identifier': {
      if (enums !== null) {
        const val = enums.get(expr.name)
        if (val !== undefined) return val
      }
      return null
    }
    case 'BinaryExpression': {
      const l = evalConstIntExprWithEnums(expr.left, enums, tagAligns)
      const r = evalConstIntExprWithEnums(expr.right, enums, tagAligns)
      if (l === null || r === null) return null
      return evalBinaryOp(expr.operator, l, r, expr.left, expr.right)
    }
    case 'UnaryExpression': {
      const inner = evalConstIntExprWithEnums(expr.operand, enums, tagAligns)
      if (inner === null) return null
      switch (expr.operator) {
        case 'Neg':
          return -inner | 0
        case 'BitNot': {
          const result = ~inner
          if (isUnsignedIntExpr(expr.operand)) {
            return (result & 0xffffffff) >>> 0
          }
          return result
        }
        case 'LogicalNot':
          return inner === 0 ? 1 : 0
        case 'Plus':
          return inner
        default:
          return null
      }
    }
    case 'ConditionalExpression': {
      const c = evalConstIntExprWithEnums(expr.condition, enums, tagAligns)
      if (c === null) return null
      if (c !== 0) {
        return evalConstIntExprWithEnums(expr.consequent, enums, tagAligns)
      } else {
        return evalConstIntExprWithEnums(expr.alternate, enums, tagAligns)
      }
    }
    case 'CastExpression': {
      const val = evalConstIntExprWithEnums(expr.operand, enums, tagAligns)
      if (val === null) return null
      const size = trySizeofTypeSpec(expr.typeSpec)
      if (size === null) return null
      const bits = size * 8
      if (bits >= 64 && isUnsignedTypeSpec(expr.typeSpec)) {
        return null
      }
      if (bits === 0 || bits >= 64) {
        return val
      }
      const mask = (1 << bits) - 1
      const truncated = val & mask
      if (isUnsignedTypeSpec(expr.typeSpec)) {
        return truncated >>> 0
      }
      const signBit = 1 << (bits - 1)
      if (truncated & signBit) {
        return truncated | ~mask
      }
      return truncated
    }
    case 'SizeofExpression': {
      if (expr.argument.kind === 'Type') {
        const s = trySizeofTypeSpec(expr.argument.typeSpec)
        if (s !== null) return s
      }
      return null
    }
    case 'AlignofExpression': {
      if (typeSpecHasTypedef(expr.typeSpec)) return null
      return alignofTypeSpec(expr.typeSpec, tagAligns)
    }
    case 'GnuAlignofExpression': {
      if (typeSpecHasTypedef(expr.typeSpec)) return null
      return preferredAlignofTypeSpec(expr.typeSpec, tagAligns)
    }
    case 'AlignofExprExpression':
    case 'GnuAlignofExprExpression':
      return null
    case 'CommaExpression': {
      evalConstIntExprWithEnums(expr.left, enums, tagAligns)
      return evalConstIntExprWithEnums(expr.right, enums, tagAligns)
    }
    default:
      return null
  }
}

// --- Helper: evaluate binary op ---
function evalBinaryOp(
  op: AST.BinOp,
  l: number,
  r: number,
  lhsExpr: AST.Expression,
  rhsExpr: AST.Expression,
): number | null {
  switch (op) {
    case 'Add':
      return (l + r) | 0
    case 'Sub':
      return (l - r) | 0
    case 'Mul':
      return Math.imul(l, r)
    case 'Div':
      return r !== 0 ? (l / r) | 0 : null
    case 'Mod':
      return r !== 0 ? (l % r) | 0 : null
    case 'Shl':
      return l << (r & 31)
    case 'Shr': {
      if (isUnsignedIntExpr(lhsExpr)) {
        return l >>> (r & 31)
      }
      return l >> (r & 31)
    }
    case 'BitAnd':
      return l & r
    case 'BitOr':
      return l | r
    case 'BitXor':
      return l ^ r
    case 'Eq':
      return l === r ? 1 : 0
    case 'Ne':
      return l !== r ? 1 : 0
    case 'Lt': {
      if (isUnsignedIntExpr(lhsExpr) || isUnsignedIntExpr(rhsExpr)) {
        return l >>> 0 < r >>> 0 ? 1 : 0
      }
      return l < r ? 1 : 0
    }
    case 'Le': {
      if (isUnsignedIntExpr(lhsExpr) || isUnsignedIntExpr(rhsExpr)) {
        return l >>> 0 <= r >>> 0 ? 1 : 0
      }
      return l <= r ? 1 : 0
    }
    case 'Gt': {
      if (isUnsignedIntExpr(lhsExpr) || isUnsignedIntExpr(rhsExpr)) {
        return l >>> 0 > r >>> 0 ? 1 : 0
      }
      return l > r ? 1 : 0
    }
    case 'Ge': {
      if (isUnsignedIntExpr(lhsExpr) || isUnsignedIntExpr(rhsExpr)) {
        return l >>> 0 >= r >>> 0 ? 1 : 0
      }
      return l >= r ? 1 : 0
    }
    case 'LogicalAnd':
      return l !== 0 && r !== 0 ? 1 : 0
    case 'LogicalOr':
      return l !== 0 || r !== 0 ? 1 : 0
    default:
      return null
  }
}

// --- Helper: check if expression is unsigned ---
function isUnsignedIntExpr(expr: AST.Expression): boolean {
  switch (expr.type) {
    case 'UIntLiteral':
    case 'ULongLiteral':
    case 'ULongLongLiteral':
      return true
    case 'CastExpression':
      return isUnsignedTypeSpec(expr.typeSpec)
    case 'UnaryExpression':
      if (expr.operator === 'Plus' || expr.operator === 'Neg') {
        return isUnsignedIntExpr(expr.operand)
      }
      return false
    case 'BinaryExpression':
      return isUnsignedIntExpr(expr.left) || isUnsignedIntExpr(expr.right)
    case 'SizeofExpression':
    case 'AlignofExpression':
    case 'GnuAlignofExpression':
    case 'AlignofExprExpression':
    case 'GnuAlignofExprExpression':
      return true
    default:
      return false
  }
}

// --- Helper: check if type spec is unsigned ---
function isUnsignedTypeSpec(ts: AST.TypeSpecifier): boolean {
  switch (ts.type) {
    case 'UnsignedCharType':
    case 'UnsignedShortType':
    case 'UnsignedIntType':
    case 'UnsignedType':
    case 'UnsignedLongType':
    case 'UnsignedLongLongType':
    case 'UnsignedInt128Type':
    case 'BoolType':
    case 'PointerType':
      return true
    default:
      return false
  }
}

// --- Helper: try sizeof for type spec ---
const PTR_SIZE: number = 8 // default 64-bit target

function trySizeofTypeSpec(ts: AST.TypeSpecifier): number | null {
  switch (ts.type) {
    case 'VoidType':
    case 'BoolType':
    case 'CharType':
    case 'UnsignedCharType':
      return 1
    case 'ShortType':
    case 'UnsignedShortType':
      return 2
    case 'IntType':
    case 'UnsignedIntType':
    case 'SignedType':
    case 'UnsignedType':
    case 'FloatType':
      return 4
    case 'LongType':
    case 'UnsignedLongType':
      return PTR_SIZE
    case 'LongLongType':
    case 'UnsignedLongLongType':
    case 'DoubleType':
      return 8
    case 'PointerType':
    case 'FunctionPointerType':
      return PTR_SIZE
    case 'Int128Type':
    case 'UnsignedInt128Type':
      return 16
    case 'LongDoubleType':
      return PTR_SIZE === 4 ? 12 : 16
    case 'ComplexFloatType':
      return 8
    case 'ComplexDoubleType':
      return 16
    case 'ComplexLongDoubleType':
      return PTR_SIZE === 4 ? 24 : 32
    case 'ArrayType': {
      if (ts.size === null) return 0
      const elemSize = trySizeofTypeSpec(ts.element)
      if (elemSize === null) return null
      const count = evalConstIntExpr(ts.size)
      if (count === null) return null
      return elemSize * count
    }
    default:
      return null
  }
}

// --- Helper: check if type spec has typedef ---
function typeSpecHasTypedef(ts: AST.TypeSpecifier): boolean {
  switch (ts.type) {
    case 'TypedefNameType':
      return true
    case 'PointerType':
      return typeSpecHasTypedef(ts.base)
    case 'ArrayType':
      return typeSpecHasTypedef(ts.element)
    default:
      return false
  }
}

// --- Helper: alignof for type spec ---
function alignofTypeSpec(ts: AST.TypeSpecifier, tagAligns: Map<string, number> | null): number {
  switch (ts.type) {
    case 'VoidType':
    case 'BoolType':
    case 'CharType':
    case 'UnsignedCharType':
      return 1
    case 'ShortType':
    case 'UnsignedShortType':
      return 2
    case 'IntType':
    case 'UnsignedIntType':
    case 'SignedType':
    case 'UnsignedType':
    case 'FloatType':
      return 4
    case 'LongType':
    case 'UnsignedLongType':
      return PTR_SIZE
    case 'LongLongType':
    case 'UnsignedLongLongType':
    case 'DoubleType':
      return PTR_SIZE === 4 ? 4 : 8
    case 'PointerType':
    case 'FunctionPointerType':
      return PTR_SIZE
    case 'Int128Type':
    case 'UnsignedInt128Type':
      return 16
    case 'LongDoubleType':
      return PTR_SIZE === 4 ? 4 : 16
    case 'ComplexFloatType':
      return 4
    case 'ComplexDoubleType':
      return PTR_SIZE === 4 ? 4 : 8
    case 'ComplexLongDoubleType':
      return PTR_SIZE === 4 ? 4 : 16
    case 'ArrayType':
      return alignofTypeSpec(ts.element, tagAligns)
    case 'StructType':
    case 'UnionType': {
      if (ts.isPacked) return 1
      let align = ts.structAligned ?? 0
      if (ts.fields) {
        for (const field of ts.fields) {
          const fa = field.alignment ?? alignofTypeSpec(field.typeSpec, tagAligns)
          align = Math.max(align, fa)
        }
      } else if (ts.name && tagAligns) {
        const stored = tagAligns.get(ts.name)
        if (stored !== undefined) return stored
      }
      return align === 0 ? PTR_SIZE : align
    }
    case 'EnumType':
      return 4
    case 'TypedefNameType':
      return PTR_SIZE
    default:
      return PTR_SIZE
  }
}

// --- Helper: preferred alignof (GCC __alignof__) ---
function preferredAlignofTypeSpec(
  ts: AST.TypeSpecifier,
  tagAligns: Map<string, number> | null,
): number {
  if (PTR_SIZE !== 4) {
    return alignofTypeSpec(ts, tagAligns)
  }
  switch (ts.type) {
    case 'LongLongType':
    case 'UnsignedLongLongType':
    case 'DoubleType':
      return 8
    case 'ComplexDoubleType':
      return 8
    case 'ArrayType':
      return preferredAlignofTypeSpec(ts.element, tagAligns)
    default:
      return alignofTypeSpec(ts, tagAligns)
  }
}

// --- Helper: check non-const identifiers ---
function exprHasNonConstIdentifier(
  expr: AST.Expression,
  enumConsts: Map<string, number> | null,
  unevaluableConsts: Set<string> | null,
): boolean {
  switch (expr.type) {
    case 'Identifier': {
      const inEval = enumConsts !== null && enumConsts.has(expr.name)
      const inUneval = unevaluableConsts !== null && unevaluableConsts.has(expr.name)
      return !(inEval || inUneval)
    }
    case 'BinaryExpression':
      return (
        exprHasNonConstIdentifier(expr.left, enumConsts, unevaluableConsts) ||
        exprHasNonConstIdentifier(expr.right, enumConsts, unevaluableConsts)
      )
    case 'UnaryExpression':
      return exprHasNonConstIdentifier(expr.operand, enumConsts, unevaluableConsts)
    case 'ConditionalExpression':
      return (
        exprHasNonConstIdentifier(expr.condition, enumConsts, unevaluableConsts) ||
        exprHasNonConstIdentifier(expr.consequent, enumConsts, unevaluableConsts) ||
        exprHasNonConstIdentifier(expr.alternate, enumConsts, unevaluableConsts)
      )
    case 'CastExpression':
      return exprHasNonConstIdentifier(expr.operand, enumConsts, unevaluableConsts)
    case 'CommaExpression':
      return (
        exprHasNonConstIdentifier(expr.left, enumConsts, unevaluableConsts) ||
        exprHasNonConstIdentifier(expr.right, enumConsts, unevaluableConsts)
      )
    default:
      return false
  }
}

// --- Helper: expand range designators ---
function expandRangeDesignators(
  items: AST.InitializerItem[],
  enumConsts: Map<string, number> | null,
): AST.InitializerItem[] {
  const result: AST.InitializerItem[] = []
  for (const item of items) {
    const rangePos = item.designators.findIndex((d) => d.kind === 'Range')
    if (rangePos >= 0) {
      const rangeDesig = item.designators[rangePos]
      if (rangeDesig.kind === 'Range') {
        const lo = evalConstIntExprWithEnums(rangeDesig.low, enumConsts, null)
        const hi = evalConstIntExprWithEnums(rangeDesig.high, enumConsts, null)
        if (lo !== null && hi !== null) {
          const loc = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }
          for (let idx = lo; idx <= hi; idx++) {
            const newDesigs = [...item.designators]
            newDesigs[rangePos] = {
              kind: 'Index',
              index: { type: 'IntLiteral', value: idx, start: 0, end: 0, loc },
            }
            result.push({ designators: newDesigs, init: item.init })
          }
          continue
        }
      }
      result.push(item)
    } else {
      result.push(item)
    }
  }
  return result
}

// ============================================================
// Dummy loc for AST nodes
// ============================================================
const LOC: AST.SourceLocation = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }

function emptyDeclaration(span: Span | null = null): AST.Declaration {
  return {
    type: 'Declaration',
    typeSpec: { type: 'VoidType' },
    declarators: [],
    isStatic: false,
    isExtern: false,
    isTypedef: false,
    isConst: false,
    isVolatile: false,
    isCommon: false,
    isThreadLocal: false,
    isTransparentUnion: false,
    isInline: false,
    alignment: null,
    alignasType: null,
    alignmentSizeofType: null,
    addressSpace: 'Default',
    vectorSize: null,
    extVectorNelem: null,
    start: span?.start ?? 0,
    end: span?.end ?? 0,
    loc: LOC,
  }
}

// ============================================================
// parseExternalDecl
// ============================================================
Parser.prototype.parseExternalDecl = function (this: Parser): AST.ExternalDeclaration | null {
  // Reset all declaration-level flags
  this.attrs = defaultAttrs()

  this.skipGccExtensions()

  // Handle #pragma pack directives
  while (this.handlePragmaPackToken()) {
    this.consumeIf(TokenKind.Semicolon)
  }

  // Handle #pragma GCC visibility push/pop
  while (this.handlePragmaVisibilityToken()) {
    this.consumeIf(TokenKind.Semicolon)
  }

  if (this.atEof()) {
    return null
  }

  // Handle top-level asm("..."); directives
  if (this.peek() === TokenKind.Asm) {
    this.advance()
    this.consumeIf(TokenKind.Volatile)
    if (this.peek() === TokenKind.LParen) {
      this.advance() // consume (
      let asmStr = ''
      for (;;) {
        const kind = this.peek()
        if (kind === TokenKind.StringLiteral) {
          asmStr += this.peekValue() as string
          this.advance()
        } else if (kind === TokenKind.RParen || kind === TokenKind.Eof) {
          break
        } else {
          this.advance()
        }
      }
      if (this.peek() === TokenKind.RParen) {
        this.advance()
      }
      this.consumeIf(TokenKind.Semicolon)
      if (asmStr.length > 0) {
        const span = this.peekSpan()
        return {
          type: 'TopLevelAsm',
          asm: asmStr,
          start: span.start,
          end: span.end,
          loc: LOC,
        }
      }
      return emptyDeclaration()
    }
    this.consumeIf(TokenKind.Semicolon)
    return emptyDeclaration()
  }

  // Handle _Static_assert at file scope
  if (this.peek() === TokenKind.StaticAssert) {
    const span = this.parseStaticAssert()
    return emptyDeclaration(span)
  }

  const start = this.peekSpan()
  let typeSpec = this.parseTypeSpecifier()
  if (typeSpec === null) {
    // C89 implicit int: identifier followed by '('
    if (
      this.peek() === TokenKind.Identifier &&
      this.pos + 1 < this.tokens.length &&
      this.tokens[this.pos + 1].kind === TokenKind.LParen
    ) {
      typeSpec = { type: 'IntType' }
    } else {
      return null
    }
  }

  // Capture constructor/destructor from type-level attributes
  const typeLevelCtor = this.getAttrFlag(ATTR_CONSTRUCTOR)
  const typeLevelDtor = this.getAttrFlag(ATTR_DESTRUCTOR)

  // Bare type with no declarator (e.g., struct definition)
  if (this.atEof() || this.peek() === TokenKind.Semicolon) {
    const declEnd =
      this.peek() === TokenKind.Semicolon
        ? this.expectAfter(TokenKind.Semicolon, 'after declaration')
        : start
    const d: AST.Declaration = {
      type: 'Declaration',
      typeSpec,
      declarators: [],
      isStatic: this.getAttrFlag(ATTR_STATIC),
      isExtern: this.getAttrFlag(ATTR_EXTERN),
      isTypedef: this.getAttrFlag(ATTR_TYPEDEF),
      isConst: this.getAttrFlag(ATTR_CONST),
      isVolatile: this.getAttrFlag(ATTR_VOLATILE),
      isCommon: false,
      isThreadLocal: this.getAttrFlag(ATTR_THREAD_LOCAL),
      isTransparentUnion: false,
      isInline: false,
      alignment: null,
      alignasType: null,
      alignmentSizeofType: null,
      addressSpace: this.attrs.parsingAddressSpace,
      vectorSize: this.attrs.parsingVectorSize,
      extVectorNelem: this.attrs.parsingExtVectorNelem,
      start: start.start,
      end: declEnd.end,
      loc: LOC,
    }
    return d
  }

  // Handle post-type storage class specifiers
  this.consumePostTypeQualifiers()

  const [name, derived, declMode, declCommon, declAligned, _isPacked] =
    this.parseDeclaratorWithAttrs()

  // Parse asm("register") and post-declarator __attribute__
  let firstAsmReg: string | null = null
  if (this.peek() === TokenKind.Asm) {
    this.advance()
    if (this.peek() === TokenKind.LParen) {
      const asmOpen = this.peekSpan()
      this.advance()
      if (this.peek() === TokenKind.StringLiteral) {
        firstAsmReg = (this.peekValue() as string) ?? null
        this.advance()
      }
      this.expectClosing(TokenKind.RParen, asmOpen)
    }
  }
  const [postPacked, postAligned, postMode, postTransparentUnion] = this.parseGccAttributes()
  const modeKind = declMode ?? postMode
  let isCommon = declCommon

  // Merge alignment
  let mergedAlignment = this.attrs.parsedAlignas
  const alignasType = this.attrs.parsedAlignasType
  const alignmentSizeofType = this.attrs.parsedAlignmentSizeofType
  for (const a of [declAligned, postAligned]) {
    if (a !== null && a !== undefined) {
      mergedAlignment = mergedAlignment === null ? a : Math.max(mergedAlignment!, a)
    }
  }

  // Merge constructor/destructor
  const isConstructor = typeLevelCtor || this.getAttrFlag(ATTR_CONSTRUCTOR)
  const isDestructor = typeLevelDtor || this.getAttrFlag(ATTR_DESTRUCTOR)
  const isWeak = this.getAttrFlag(ATTR_WEAK)
  const aliasTarget = this.attrs.parsingAliasTarget
  const visibility = this.attrs.parsingVisibility ?? this.pragmaDefaultVisibility ?? null
  const section = this.attrs.parsingSection
  const isErrorAttr = this.getAttrFlag(ATTR_ERROR_ATTR)
  const isNoreturn = this.getAttrFlag(ATTR_NORETURN)
  const cleanupFn = this.attrs.parsingCleanupFn
  const symver = this.attrs.parsingSymver
  const isUsed = this.getAttrFlag(ATTR_USED)
  const isFastcall = this.getAttrFlag(ATTR_FASTCALL)
  const isNaked = this.getAttrFlag(ATTR_NAKED)

  // Build per-declarator attributes
  const declAttrs: AST.DeclAttributes = {
    isConstructor,
    isDestructor,
    isWeak,
    isErrorAttr,
    isNoreturn,
    isUsed,
    isFastcall,
    isNaked,
    aliasTarget,
    visibility,
    section,
    asmRegister: firstAsmReg,
    cleanupFn,
    symver,
  }

  // Apply __attribute__((mode(...)))
  if (modeKind !== null && modeKind !== undefined) {
    typeSpec = applyModeKind(modeKind, typeSpec)
  }

  // Determine if this is a function definition
  const isFuncdef =
    derived.length > 0 &&
    derived[derived.length - 1].kind === 'Function' &&
    (this.peek() === TokenKind.LBrace || this.isTypeSpecifier())

  if (isFuncdef) {
    return this.parseFunctionDef(typeSpec, name, derived, start, declAttrs)
  } else {
    const ctx: DeclContext = {
      attrs: declAttrs,
      alignment: mergedAlignment,
      alignasType,
      alignmentSizeofType,
      isCommon,
    }
    return this.parseDeclarationRest(typeSpec, name, derived, start, ctx)
  }
}

// ============================================================
// parseFunctionDef
// ============================================================
Parser.prototype.parseFunctionDef = function (
  this: Parser,
  typeSpec: AST.TypeSpecifier,
  name: string | null,
  derived: AST.DerivedDeclarator[],
  startPos: Span,
  declAttrs: AST.DeclAttributes,
): AST.ExternalDeclaration | null {
  this.setAttrFlag(ATTR_TYPEDEF, false)
  let params: AST.ParamDeclaration[] = []
  let variadic = false
  const last = derived[derived.length - 1]
  if (last.kind === 'Function') {
    params = [...last.params]
    variadic = last.variadic
  }

  // Handle K&R-style parameter declarations
  const isKrStyle = this.peek() !== TokenKind.LBrace
  const finalParams = isKrStyle ? this.parseKrParams(params) : params

  const isStatic = this.getAttrFlag(ATTR_STATIC)
  const isInline = this.getAttrFlag(ATTR_INLINE)
  const isExtern = this.getAttrFlag(ATTR_EXTERN)
  const isGnuInline = this.getAttrFlag(ATTR_GNU_INLINE)
  const isAlwaysInline = this.getAttrFlag(ATTR_ALWAYS_INLINE)
  const isNoinline = this.getAttrFlag(ATTR_NOINLINE)

  // Build return type from derived declarators
  const returnType = this.buildReturnType(typeSpec, derived)

  // Shadow typedef names used as parameter names
  const savedShadowed = new Set(this.shadowedTypedefs)
  for (const param of finalParams) {
    if (
      param.name !== null &&
      this.typedefs.has(param.name) &&
      !this.shadowedTypedefs.has(param.name)
    ) {
      this.shadowedTypedefs.add(param.name)
    }
  }

  this.setAttrFlag(ATTR_NORETURN, false)
  const body = this.parseCompoundStmt()
  this.shadowedTypedefs = savedShadowed

  const funcAttrs: AST.FunctionAttributes = {
    isStatic,
    isInline,
    isExtern,
    isGnuInline,
    isAlwaysInline,
    isNoinline,
    isConstructor: declAttrs.isConstructor,
    isDestructor: declAttrs.isDestructor,
    isWeak: declAttrs.isWeak,
    isUsed: declAttrs.isUsed,
    isFastcall: declAttrs.isFastcall,
    isNaked: declAttrs.isNaked,
    isNoreturn: declAttrs.isNoreturn,
    section: declAttrs.section,
    visibility: declAttrs.visibility,
    symver: declAttrs.symver,
  }

  return {
    type: 'FunctionDefinition',
    returnType,
    name: name ?? '',
    params: finalParams,
    variadic,
    body,
    attrs: funcAttrs,
    isKr: isKrStyle,
    start: startPos.start,
    end: startPos.end,
    loc: LOC,
  }
}

// ============================================================
// buildReturnType
// ============================================================
Parser.prototype.buildReturnType = function (
  this: Parser,
  baseType: AST.TypeSpecifier,
  derived: AST.DerivedDeclarator[],
): AST.TypeSpecifier {
  let returnType = baseType
  const funcPos = derived.findIndex((d) => d.kind === 'Function')

  if (funcPos >= 0) {
    // Apply post-Function derivations (Array/Pointer)
    for (let i = funcPos + 1; i < derived.length; i++) {
      const d = derived[i]
      if (d.kind === 'Array') {
        returnType = { type: 'ArrayType', element: returnType, size: d.size }
      } else if (d.kind === 'Pointer') {
        returnType = { type: 'PointerType', base: returnType, addressSpace: 'Default' }
      }
    }
    // Apply pre-Function derivations
    for (let i = 0; i < funcPos; i++) {
      const d = derived[i]
      if (d.kind === 'Pointer') {
        returnType = { type: 'PointerType', base: returnType, addressSpace: 'Default' }
      } else if (d.kind === 'Array') {
        returnType = { type: 'ArrayType', element: returnType, size: d.size }
      }
    }
  } else {
    // No Function in derived - just apply pointer derivations
    for (const d of derived) {
      if (d.kind === 'Pointer') {
        returnType = { type: 'PointerType', base: returnType, addressSpace: 'Default' }
      } else {
        break
      }
    }
  }
  return returnType
}

// ============================================================
// parseKrParams
// ============================================================
Parser.prototype.parseKrParams = function (
  this: Parser,
  krParams: AST.ParamDeclaration[],
): AST.ParamDeclaration[] {
  const result = [...krParams]
  while (this.isTypeSpecifier() && this.peek() !== TokenKind.LBrace) {
    const ts = this.parseTypeSpecifier()
    if (ts === null) break
    for (;;) {
      const [pname, pderived] = this.parseDeclaratorWithAttrs()
      if (pname !== null) {
        const [fullType, fptrParams] = this.applyKrDerivations(ts, pderived)
        let innerDepth = 0
        if (fptrParams !== null) {
          let foundFptr = false
          let ptrsAfter = 0
          for (const d of pderived) {
            if (d.kind === 'FunctionPointer' || d.kind === 'Function') {
              foundFptr = true
            } else if (d.kind === 'Pointer' && foundFptr) {
              ptrsAfter++
            }
          }
          innerDepth = 1 + ptrsAfter
        }
        for (const param of result) {
          if (param.name === pname) {
            param.typeSpec = fullType
            param.fptrParams = fptrParams
            param.fptrInnerPtrDepth = innerDepth
            break
          }
        }
      }
      if (!this.consumeIf(TokenKind.Comma)) break
    }
    this.expectAfter(TokenKind.Semicolon, 'after parameter declaration')
  }
  return result
}

// ============================================================
// applyKrDerivations
// ============================================================
Parser.prototype.applyKrDerivations = function (
  this: Parser,
  typeSpec: AST.TypeSpecifier,
  pderived: AST.DerivedDeclarator[],
): [AST.TypeSpecifier, AST.ParamDeclaration[] | null] {
  let fullType = typeSpec

  // Check for function pointer parameter
  const fptrInfo = pderived.find((d) => d.kind === 'FunctionPointer')
  if (fptrInfo && fptrInfo.kind === 'FunctionPointer') {
    const ptrCount = pderived.filter((d) => d.kind === 'Pointer').length
    for (let i = 0; i < Math.max(0, ptrCount - 1); i++) {
      fullType = { type: 'PointerType', base: fullType, addressSpace: 'Default' }
    }
    fullType = { type: 'PointerType', base: fullType, addressSpace: 'Default' }
    return [fullType, fptrInfo.params]
  }

  // Not a function pointer - apply all derivations normally
  for (const d of pderived) {
    if (d.kind === 'Pointer') {
      fullType = { type: 'PointerType', base: fullType, addressSpace: 'Default' }
    }
  }

  // Collect array dimensions
  const arrayDims = pderived
    .filter((d): d is AST.ArrayDeclarator => d.kind === 'Array')
    .map((d) => d.size)

  if (arrayDims.length > 0) {
    for (let i = arrayDims.length - 1; i >= 1; i--) {
      fullType = { type: 'ArrayType', element: fullType, size: arrayDims[i] }
    }
    fullType = { type: 'PointerType', base: fullType, addressSpace: 'Default' }
  }

  // Function params (bare function names) decay to pointers
  for (const d of pderived) {
    if (d.kind === 'Function') {
      fullType = { type: 'PointerType', base: fullType, addressSpace: 'Default' }
    }
  }

  return [fullType, null]
}

// ============================================================
// parseDeclarationRest
// ============================================================
Parser.prototype.parseDeclarationRest = function (
  this: Parser,
  typeSpec: AST.TypeSpecifier,
  name: string | null,
  derived: AST.DerivedDeclarator[],
  startPos: Span,
  ctx: DeclContext,
): AST.ExternalDeclaration | null {
  const declarators: AST.InitDeclarator[] = []
  const init = this.consumeIf(TokenKind.Assign) ? this.parseInitializer() : null
  const sectionFromFirst = ctx.attrs.section
  declarators.push({
    type: 'InitDeclarator',
    name: name ?? '',
    derived,
    init,
    attrs: { ...ctx.attrs },
    start: startPos.start,
    end: startPos.end,
    loc: LOC,
  })

  // Parse asm("register") and post-declarator __attribute__
  let extraAsmReg: string | null = null
  if (this.peek() === TokenKind.Asm) {
    this.advance()
    if (this.peek() === TokenKind.LParen) {
      const asmOpen = this.peekSpan()
      this.advance()
      if (this.peek() === TokenKind.StringLiteral) {
        extraAsmReg = (this.peekValue() as string) ?? null
        this.advance()
      }
      this.expectClosing(TokenKind.RParen, asmOpen)
    }
  }
  const [extraPacked, extraAligned, extraMode, extraTransparentUnion] = this.parseGccAttributes()

  // Merge post-declarator attributes into the most recently pushed declarator
  const lastDecl = declarators[declarators.length - 1]
  if (extraAsmReg !== null) lastDecl.attrs.asmRegister = extraAsmReg
  if (this.getAttrFlag(ATTR_CONSTRUCTOR)) lastDecl.attrs.isConstructor = true
  if (this.getAttrFlag(ATTR_DESTRUCTOR)) lastDecl.attrs.isDestructor = true
  if (this.getAttrFlag(ATTR_WEAK)) lastDecl.attrs.isWeak = true
  if (this.attrs.parsingAliasTarget) lastDecl.attrs.aliasTarget = this.attrs.parsingAliasTarget
  if (this.attrs.parsingVisibility) lastDecl.attrs.visibility = this.attrs.parsingVisibility
  if (this.attrs.parsingSection) lastDecl.attrs.section = this.attrs.parsingSection
  if (this.attrs.parsingCleanupFn) lastDecl.attrs.cleanupFn = this.attrs.parsingCleanupFn
  if (this.getAttrFlag(ATTR_USED)) lastDecl.attrs.isUsed = true
  if (this.getAttrFlag(ATTR_NORETURN)) lastDecl.attrs.isNoreturn = true
  if (this.getAttrFlag(ATTR_FASTCALL)) lastDecl.attrs.isFastcall = true
  if (this.getAttrFlag(ATTR_NAKED)) lastDecl.attrs.isNaked = true
  if (this.getAttrFlag(ATTR_ERROR_ATTR)) lastDecl.attrs.isErrorAttr = true

  // Reset consumed attributes
  this.setAttrFlag(ATTR_WEAK, false)
  this.attrs.parsingAliasTarget = null
  this.attrs.parsingVisibility = null
  this.attrs.parsingSection = null
  this.setAttrFlag(ATTR_ERROR_ATTR, false)
  this.setAttrFlag(ATTR_NORETURN, false)
  this.attrs.parsingCleanupFn = null
  this.setAttrFlag(ATTR_USED, false)
  this.setAttrFlag(ATTR_FASTCALL, false)
  this.setAttrFlag(ATTR_NAKED, false)

  if (extraAligned !== null && extraAligned !== undefined) {
    ctx.alignment = ctx.alignment === null ? extraAligned : Math.max(ctx.alignment!, extraAligned)
  }

  // Parse additional declarators separated by commas
  while (this.consumeIf(TokenKind.Comma)) {
    const [dname, dderived] = this.parseDeclaratorWithAttrs()
    // Parse asm("register") and __attribute__ for this declarator
    let dAsmReg: string | null = null
    if (this.peek() === TokenKind.Asm) {
      this.advance()
      if (this.peek() === TokenKind.LParen) {
        const asmOpen2 = this.peekSpan()
        this.advance()
        if (this.peek() === TokenKind.StringLiteral) {
          dAsmReg = (this.peekValue() as string) ?? null
          this.advance()
        }
        this.expectClosing(TokenKind.RParen, asmOpen2)
      }
    }
    this.parseGccAttributes()

    const dWeak = this.getAttrFlag(ATTR_WEAK)
    const dAlias = this.attrs.parsingAliasTarget ?? null
    const dVis = this.attrs.parsingVisibility ?? this.pragmaDefaultVisibility ?? null
    const dSection = this.attrs.parsingSection ?? sectionFromFirst ?? null
    const dCleanupFn = this.attrs.parsingCleanupFn ?? null
    const dUsed = this.getAttrFlag(ATTR_USED)
    const dNoreturn = this.getAttrFlag(ATTR_NORETURN)
    const dErrorAttr = this.getAttrFlag(ATTR_ERROR_ATTR)
    this.setAttrFlag(ATTR_WEAK, false)
    this.setAttrFlag(ATTR_USED, false)
    this.setAttrFlag(ATTR_FASTCALL, false)
    this.setAttrFlag(ATTR_NAKED, false)
    this.setAttrFlag(ATTR_NORETURN, false)
    this.setAttrFlag(ATTR_ERROR_ATTR, false)

    const dinit = this.consumeIf(TokenKind.Assign) ? this.parseInitializer() : null
    const dFastcall = this.getAttrFlag(ATTR_FASTCALL)

    declarators.push({
      type: 'InitDeclarator',
      name: dname ?? '',
      derived: dderived,
      init: dinit,
      attrs: {
        isConstructor: this.getAttrFlag(ATTR_CONSTRUCTOR),
        isDestructor: this.getAttrFlag(ATTR_DESTRUCTOR),
        isWeak: dWeak,
        isErrorAttr: dErrorAttr,
        isNoreturn: dNoreturn,
        isUsed: dUsed,
        isFastcall: dFastcall,
        isNaked: false,
        aliasTarget: dAlias,
        visibility: dVis,
        section: dSection,
        asmRegister: dAsmReg,
        cleanupFn: dCleanupFn,
        symver: null,
      },
      start: startPos.start,
      end: startPos.end,
      loc: LOC,
    })

    // Skip trailing asm/attributes after the declarator
    if (this.peek() === TokenKind.Asm) {
      this.advance()
      if (this.peek() === TokenKind.LParen) {
        const asmOpen3 = this.peekSpan()
        this.advance()
        if (this.peek() === TokenKind.StringLiteral) {
          declarators[declarators.length - 1].attrs.asmRegister =
            (this.peekValue() as string) ?? null
          this.advance()
        }
        this.expectClosing(TokenKind.RParen, asmOpen3)
      }
    }
    const [, skipAligned2] = this.parseGccAttributes()
    if (skipAligned2 !== null && skipAligned2 !== undefined) {
      ctx.alignment = ctx.alignment === null ? skipAligned2 : Math.max(ctx.alignment!, skipAligned2)
    }
  }

  // Register typedef names
  const isTypedef = this.getAttrFlag(ATTR_TYPEDEF)
  const isTransparentUnion = this.getAttrFlag(ATTR_TRANSPARENT_UNION)
  this.setAttrFlag(ATTR_TRANSPARENT_UNION, false)
  this.registerTypedefs(declarators)

  const declEnd = this.expectAfter(TokenKind.Semicolon, 'after declaration')
  const d: AST.Declaration = {
    type: 'Declaration',
    typeSpec,
    declarators,
    isStatic: this.getAttrFlag(ATTR_STATIC),
    isExtern: this.getAttrFlag(ATTR_EXTERN),
    isTypedef,
    isConst: this.getAttrFlag(ATTR_CONST),
    isVolatile: this.getAttrFlag(ATTR_VOLATILE),
    isCommon: ctx.isCommon,
    isThreadLocal: this.getAttrFlag(ATTR_THREAD_LOCAL),
    isTransparentUnion,
    isInline: this.getAttrFlag(ATTR_INLINE),
    alignment: ctx.alignment,
    alignasType: ctx.alignasType,
    alignmentSizeofType: ctx.alignmentSizeofType,
    addressSpace: this.attrs.parsingAddressSpace,
    vectorSize: this.attrs.parsingVectorSize,
    extVectorNelem: this.attrs.parsingExtVectorNelem,
    start: startPos.start,
    end: declEnd.end,
    loc: LOC,
  }
  return d
}

// ============================================================
// parseLocalDeclaration
// ============================================================
Parser.prototype.parseLocalDeclaration = function (this: Parser): AST.Declaration | null {
  // Save and selectively reset flags for block-scope declarations
  const savedFlags = this.saveAttrFlags()
  this.setAttrFlag(ATTR_STATIC, false)
  this.setAttrFlag(ATTR_EXTERN, false)
  this.setAttrFlag(ATTR_TYPEDEF, false)
  this.setAttrFlag(ATTR_INLINE, false)
  this.setAttrFlag(ATTR_THREAD_LOCAL, false)
  this.setAttrFlag(ATTR_CONST, false)
  this.setAttrFlag(ATTR_VOLATILE, false)
  this.attrs.parsingAddressSpace = 'Default'

  this.skipGccExtensions()

  // Handle _Static_assert in block scope
  if (this.peek() === TokenKind.StaticAssert) {
    const span = this.parseStaticAssert()
    this.restoreAttrFlags(savedFlags)
    return emptyDeclaration(span)
  }

  const start = this.peekSpan()
  let typeSpec = this.parseTypeSpecifier()
  if (typeSpec === null) {
    this.restoreAttrFlags(savedFlags)
    return null
  }

  // Bare type with no declarator
  if (this.peek() === TokenKind.Semicolon) {
    const declEnd = this.peekSpan()
    this.advance()
    const isStatic = this.getAttrFlag(ATTR_STATIC)
    const isExtern = this.getAttrFlag(ATTR_EXTERN)
    const isTypedef = this.getAttrFlag(ATTR_TYPEDEF)
    const isConst = this.getAttrFlag(ATTR_CONST)
    const isVolatile = this.getAttrFlag(ATTR_VOLATILE)
    const isThreadLocal = this.getAttrFlag(ATTR_THREAD_LOCAL)
    this.restoreAttrFlags(savedFlags)
    return {
      type: 'Declaration',
      typeSpec,
      declarators: [],
      isStatic,
      isExtern,
      isTypedef,
      isConst,
      isVolatile,
      isCommon: false,
      isThreadLocal,
      isTransparentUnion: false,
      isInline: false,
      alignment: null,
      alignasType: null,
      alignmentSizeofType: null,
      addressSpace: 'Default',
      vectorSize: null,
      extVectorNelem: null,
      start: start.start,
      end: declEnd.end,
      loc: LOC,
    }
  }

  this.consumePostTypeQualifiers()

  const isStatic = this.getAttrFlag(ATTR_STATIC)
  const isExtern = this.getAttrFlag(ATTR_EXTERN)

  const declarators: AST.InitDeclarator[] = []
  let alignment: number | null = this.attrs.parsedAlignas ?? null
  let modeKind: ModeKind | null = null

  for (;;) {
    const [dname, dderived, dMode, _dCommon, dAligned, _dPacked] = this.parseDeclaratorWithAttrs()

    // Parse asm("register") and __attribute__ after declarator
    let dAsmReg: string | null = null
    if (this.peek() === TokenKind.Asm) {
      this.advance()
      if (this.peek() === TokenKind.LParen) {
        const asmOpen = this.peekSpan()
        this.advance()
        if (this.peek() === TokenKind.StringLiteral) {
          dAsmReg = (this.peekValue() as string) ?? null
          this.advance()
        }
        this.expectClosing(TokenKind.RParen, asmOpen)
      }
    }
    const [_skipPacked, skipAligned, skipMode] = this.parseGccAttributes()
    const localCleanupFn = this.attrs.parsingCleanupFn
    this.attrs.parsingCleanupFn = null
    const localSection = this.attrs.parsingSection
    this.attrs.parsingSection = null
    modeKind = modeKind ?? dMode ?? skipMode

    if (dAligned !== null && dAligned !== undefined) {
      alignment = alignment === null ? dAligned : Math.max(alignment!, dAligned)
    }
    if (skipAligned !== null && skipAligned !== undefined) {
      alignment = alignment === null ? skipAligned : Math.max(alignment!, skipAligned)
    }

    const dinit = this.consumeIf(TokenKind.Assign) ? this.parseInitializer() : null

    const dAttrs: AST.DeclAttributes = {
      isConstructor: this.getAttrFlag(ATTR_CONSTRUCTOR),
      isDestructor: this.getAttrFlag(ATTR_DESTRUCTOR),
      isWeak: this.getAttrFlag(ATTR_WEAK),
      isErrorAttr: this.getAttrFlag(ATTR_ERROR_ATTR),
      isNoreturn: this.getAttrFlag(ATTR_NORETURN),
      isUsed: this.getAttrFlag(ATTR_USED),
      isFastcall: this.getAttrFlag(ATTR_FASTCALL),
      isNaked: this.getAttrFlag(ATTR_NAKED),
      aliasTarget: this.attrs.parsingAliasTarget ?? null,
      visibility: this.attrs.parsingVisibility ?? this.pragmaDefaultVisibility ?? null,
      section: localSection ?? null,
      asmRegister: dAsmReg,
      cleanupFn: localCleanupFn ?? null,
      symver: this.attrs.parsingSymver ?? null,
    }

    declarators.push({
      type: 'InitDeclarator',
      name: dname ?? '',
      derived: dderived,
      init: dinit,
      attrs: dAttrs,
      start: start.start,
      end: start.end,
      loc: LOC,
    })

    // Skip trailing asm/attributes after init
    if (this.peek() === TokenKind.Asm) {
      this.advance()
      if (this.peek() === TokenKind.LParen) {
        const asmOpen2 = this.peekSpan()
        this.advance()
        if (this.peek() === TokenKind.StringLiteral) {
          this.advance()
        }
        this.expectClosing(TokenKind.RParen, asmOpen2)
      }
    }
    const [, postInitAligned] = this.parseGccAttributes()
    if (postInitAligned !== null && postInitAligned !== undefined) {
      alignment = alignment === null ? postInitAligned : Math.max(alignment!, postInitAligned)
    }

    if (!this.consumeIf(TokenKind.Comma)) break
  }

  // Apply __attribute__((mode(...)))
  if (modeKind !== null) {
    typeSpec = applyModeKind(modeKind, typeSpec)
  }

  // Register typedef names or shadow them
  const isTypedef = this.getAttrFlag(ATTR_TYPEDEF)
  if (isTypedef) {
    for (const decl of declarators) {
      if (decl.name && decl.name.length > 0) {
        this.typedefs.add(decl.name)
        this.shadowedTypedefs.delete(decl.name)
      }
    }
    this.setAttrFlag(ATTR_TYPEDEF, false)
  } else {
    for (const decl of declarators) {
      if (decl.name && decl.name.length > 0 && this.typedefs.has(decl.name)) {
        this.shadowedTypedefs.add(decl.name)
      }
    }
  }

  const declEnd = this.expectAfter(TokenKind.Semicolon, 'after declaration')

  // Merge alignment from _Alignas
  if (this.attrs.parsedAlignas !== null) {
    const a = this.attrs.parsedAlignas
    alignment = alignment === null ? a : Math.max(alignment!, a)
    this.attrs.parsedAlignas = null
  }
  const alignasType = this.attrs.parsedAlignasType
  this.attrs.parsedAlignasType = null
  const alignmentSizeofType = this.attrs.parsedAlignmentSizeofType
  this.attrs.parsedAlignmentSizeofType = null
  const isTransparentUnion = this.getAttrFlag(ATTR_TRANSPARENT_UNION)
  this.setAttrFlag(ATTR_TRANSPARENT_UNION, false)

  const d: AST.Declaration = {
    type: 'Declaration',
    typeSpec,
    declarators,
    isStatic,
    isExtern,
    isTypedef,
    isConst: this.getAttrFlag(ATTR_CONST),
    isVolatile: this.getAttrFlag(ATTR_VOLATILE),
    isCommon: false,
    isThreadLocal: this.getAttrFlag(ATTR_THREAD_LOCAL),
    isTransparentUnion,
    isInline: false,
    alignment,
    alignasType: alignasType ?? null,
    alignmentSizeofType: alignmentSizeofType ?? null,
    addressSpace: this.attrs.parsingAddressSpace,
    vectorSize: this.attrs.parsingVectorSize,
    extVectorNelem: this.attrs.parsingExtVectorNelem,
    start: start.start,
    end: declEnd.end,
    loc: LOC,
  }

  this.restoreAttrFlags(savedFlags)
  return d
}

// ============================================================
// parseInitializer
// ============================================================
Parser.prototype.parseInitializer = function (this: Parser): AST.Initializer {
  if (this.peek() !== TokenKind.LBrace) {
    const expr = this.parseAssignmentExpr()
    return { kind: 'Expr', expr }
  }

  // Braced initializer list
  const open = this.peekSpan()
  this.advance() // consume '{'
  const items: AST.InitializerItem[] = []

  while (this.peek() !== TokenKind.RBrace && !this.atEof()) {
    const designators: AST.Designator[] = []

    // Parse designators: [expr], [lo ... hi], .field
    while (this.peek() === TokenKind.LBracket || this.peek() === TokenKind.Dot) {
      if (this.peek() === TokenKind.LBracket) {
        const bracketOpen = this.peekSpan()
        this.advance() // consume '['
        const indexExpr = this.parseAssignmentExpr()

        // Check for GCC range designator: [lo ... hi]
        if (this.peek() === TokenKind.Ellipsis) {
          this.advance() // consume '...'
          const hiExpr = this.parseAssignmentExpr()
          this.expectClosing(TokenKind.RBracket, bracketOpen)
          designators.push({ kind: 'Range', low: indexExpr, high: hiExpr })
        } else {
          this.expectClosing(TokenKind.RBracket, bracketOpen)
          designators.push({ kind: 'Index', index: indexExpr })
        }
      } else {
        // .field
        this.advance() // consume '.'
        if (this.peek() === TokenKind.Identifier) {
          const fieldName = this.peekValue() as string
          this.advance()
          designators.push({ kind: 'Field', name: fieldName })
        } else {
          // Error recovery: skip
          this.advance()
        }
      }
    }

    // GNU old-style designator: field: value
    if (designators.length === 0) {
      if (
        this.peek() === TokenKind.Identifier &&
        this.pos + 1 < this.tokens.length &&
        this.tokens[this.pos + 1].kind === TokenKind.Colon
      ) {
        const fieldName = this.peekValue() as string
        this.advance() // consume identifier
        this.advance() // consume colon
        designators.push({ kind: 'Field', name: fieldName })
      }
    }

    if (designators.length > 0) {
      this.consumeIf(TokenKind.Assign)
    }

    const init = this.parseInitializer()
    items.push({ designators, init })

    if (!this.consumeIf(TokenKind.Comma)) {
      break
    }
  }

  this.expectClosing(TokenKind.RBrace, open)

  // Expand GCC range designators
  const enumConsts = this.enumConstants.size > 0 ? this.enumConstants : null
  const expanded = expandRangeDesignators(items, enumConsts)

  return { kind: 'List', items: expanded }
}

// ============================================================
// parseStaticAssert
// ============================================================
Parser.prototype.parseStaticAssert = function (this: Parser): Span {
  const begin = this.peekSpan()
  this.advance() // consume _Static_assert
  const open = this.peekSpan()
  this.expectContext(TokenKind.LParen, "after '_Static_assert'")

  const condExpr = this.parseAssignmentExpr()

  // C23 allows _Static_assert with just one argument (no message)
  let message: string | null = null
  if (this.consumeIf(TokenKind.Comma)) {
    // Parse the string message (may be concatenated string literals)
    let msg = ''
    while (this.peek() === TokenKind.StringLiteral) {
      msg += this.peekValue() as string
      this.advance()
    }
    message = msg
  }

  const close = this.expectClosing(TokenKind.RParen, open)
  let end = close.end
  if (this.peek() === TokenKind.Semicolon) {
    const semi = this.peekSpan()
    this.advance()
    end = semi.end
  }

  // Evaluate the constant expression
  const enumConsts = this.enumConstants.size > 0 ? this.enumConstants : null
  const tagAligns = this.structTagAlignments.size > 0 ? this.structTagAlignments : null
  const val = evalConstIntExprWithEnums(condExpr, enumConsts, tagAligns)

  if (val !== null && val === 0) {
    const errSpan: Span = { start: condExpr.start, end: condExpr.end }
    const errMsg =
      message !== null ? `static assertion failed: "${message}"` : 'static assertion failed'
    this.emitError(errMsg, errSpan)
  }

  return { start: begin.start, end }
}

// ============================================================
// consumePostTypeQualifiers
// ============================================================
Parser.prototype.consumePostTypeQualifiers = function (this: Parser): void {
  for (;;) {
    const kind = this.peek()
    switch (kind) {
      case TokenKind.Static:
        this.setAttrFlag(ATTR_STATIC, true)
        this.advance()
        break
      case TokenKind.Extern:
        this.setAttrFlag(ATTR_EXTERN, true)
        this.advance()
        break
      case TokenKind.Typedef:
        this.setAttrFlag(ATTR_TYPEDEF, true)
        this.advance()
        break
      case TokenKind.Inline:
        this.setAttrFlag(ATTR_INLINE, true)
        this.advance()
        break
      case TokenKind.ThreadLocal:
        this.setAttrFlag(ATTR_THREAD_LOCAL, true)
        this.advance()
        break
      case TokenKind.Const:
        this.setAttrFlag(ATTR_CONST, true)
        this.advance()
        break
      case TokenKind.Volatile:
        this.setAttrFlag(ATTR_VOLATILE, true)
        this.advance()
        break
      case TokenKind.Register:
        this.advance()
        break
      case TokenKind.Restrict:
        this.advance()
        break
      case TokenKind.Noreturn:
        this.setAttrFlag(ATTR_NORETURN, true)
        this.advance()
        break
      case TokenKind.Attribute:
      case TokenKind.Extension:
        this.skipGccExtensions()
        break
      default:
        return
    }
  }
}

// ============================================================
// registerTypedefs
// ============================================================
Parser.prototype.registerTypedefs = function (
  this: Parser,
  declarators: AST.InitDeclarator[],
): void {
  if (!this.getAttrFlag(ATTR_TYPEDEF)) return
  for (const decl of declarators) {
    if (decl.name && decl.name.length > 0) {
      this.typedefs.add(decl.name)
      this.shadowedTypedefs.delete(decl.name)
    }
  }
}
