// Core Parser class with token helpers and state management.
// Methods are added to the prototype by other modules (types.ts, statements.ts, etc.)

import { Token, TokenKind, Span, dummySpan } from '../lexer/token'
import * as AST from '../ast/nodes'

// GCC __attribute__((mode(...))) integer mode specifier.
export enum ModeKind {
  QI = 'QI', // 8-bit
  HI = 'HI', // 16-bit
  SI = 'SI', // 32-bit
  DI = 'DI', // 64-bit
  TI = 'TI', // 128-bit
}

export function applyModeKind(mode: ModeKind, ts: AST.TypeSpecifier): AST.TypeSpecifier {
  const isUnsigned =
    ts.type === 'UnsignedIntType' ||
    ts.type === 'UnsignedLongType' ||
    ts.type === 'UnsignedLongLongType' ||
    ts.type === 'UnsignedType' ||
    ts.type === 'UnsignedCharType' ||
    ts.type === 'UnsignedShortType'
  switch (mode) {
    case ModeKind.QI:
      return isUnsigned
        ? { type: 'UnsignedCharType', start: ts.start, end: ts.end }
        : { type: 'CharType', start: ts.start, end: ts.end }
    case ModeKind.HI:
      return isUnsigned
        ? { type: 'UnsignedShortType', start: ts.start, end: ts.end }
        : { type: 'ShortType', start: ts.start, end: ts.end }
    case ModeKind.SI:
      return isUnsigned
        ? { type: 'UnsignedIntType', start: ts.start, end: ts.end }
        : { type: 'IntType', start: ts.start, end: ts.end }
    case ModeKind.DI:
      return isUnsigned
        ? { type: 'UnsignedLongLongType', start: ts.start, end: ts.end }
        : { type: 'LongLongType', start: ts.start, end: ts.end }
    case ModeKind.TI:
      return isUnsigned
        ? { type: 'UnsignedInt128Type', start: ts.start, end: ts.end }
        : { type: 'Int128Type', start: ts.start, end: ts.end }
  }
}

// Result of parsing a parenthesized abstract declarator.
export type ParenAbstractDecl =
  | { kind: 'Simple'; ptrDepth: number; arrayDims: (AST.Expression | null)[] }
  | {
      kind: 'NestedFnPtr'
      outerPtrDepth: number
      innerPtrDepth: number
      innerParams: AST.ParamDeclaration[]
      innerVariadic: boolean
    }

// Parsed declaration attribute flags
export interface ParsedDeclAttrs {
  flags: number
  parsingAddressSpace: AST.AddressSpace
  parsingAliasTarget: string | null
  parsingVisibility: string | null
  parsingSection: string | null
  parsingCleanupFn: string | null
  parsingSymver: string | null
  parsingVectorSize: number | null
  parsingExtVectorNelem: number | null
  parsedAlignas: number | null
  parsedAlignasType: AST.TypeSpecifier | null
  parsedAlignmentSizeofType: AST.TypeSpecifier | null
}

// Bit masks for ParsedDeclAttrs.flags
export const ATTR_TYPEDEF = 1 << 0
export const ATTR_STATIC = 1 << 1
export const ATTR_EXTERN = 1 << 2
export const ATTR_THREAD_LOCAL = 1 << 3
export const ATTR_INLINE = 1 << 4
export const ATTR_CONST = 1 << 5
export const ATTR_VOLATILE = 1 << 6
export const ATTR_CONSTRUCTOR = 1 << 7
export const ATTR_DESTRUCTOR = 1 << 8
export const ATTR_WEAK = 1 << 9
export const ATTR_USED = 1 << 10
export const ATTR_GNU_INLINE = 1 << 11
export const ATTR_ALWAYS_INLINE = 1 << 12
export const ATTR_NOINLINE = 1 << 13
export const ATTR_NORETURN = 1 << 14
export const ATTR_ERROR_ATTR = 1 << 15
export const ATTR_TRANSPARENT_UNION = 1 << 16
export const ATTR_FASTCALL = 1 << 17
export const ATTR_NAKED = 1 << 18

export function defaultAttrs(): ParsedDeclAttrs {
  return {
    flags: 0,
    parsingAddressSpace: 'Default',
    parsingAliasTarget: null,
    parsingVisibility: null,
    parsingSection: null,
    parsingCleanupFn: null,
    parsingSymver: null,
    parsingVectorSize: null,
    parsingExtVectorNelem: null,
    parsedAlignas: null,
    parsedAlignasType: null,
    parsedAlignmentSizeofType: null,
  }
}

function normalizeAttributeName(name: string): string {
  let normalized = name
  if (normalized.startsWith('__')) normalized = normalized.slice(2)
  if (normalized.endsWith('__')) normalized = normalized.slice(0, -2)
  return normalized.toLowerCase()
}

function tokenToAttributeName(token: Token): string | null {
  if (token.kind === TokenKind.Identifier && typeof token.value === 'string') {
    return token.value
  }
  if (token.kind === TokenKind.Noreturn) return 'noreturn'
  if (token.kind === TokenKind.Inline) return 'inline'
  return null
}

function firstStringArg(tokens: Token[]): string | null {
  for (const token of tokens) {
    if (
      (token.kind === TokenKind.StringLiteral ||
        token.kind === TokenKind.WideStringLiteral ||
        token.kind === TokenKind.Char16StringLiteral) &&
      typeof token.value === 'string'
    ) {
      return token.value
    }
  }
  return null
}

function firstIdentifierArg(tokens: Token[]): string | null {
  for (const token of tokens) {
    const name = tokenToAttributeName(token)
    if (name !== null) return name
  }
  return null
}

function firstIntegerArg(tokens: Token[]): number | null {
  for (const token of tokens) {
    if (
      token.kind === TokenKind.IntLiteral ||
      token.kind === TokenKind.UIntLiteral ||
      token.kind === TokenKind.LongLiteral ||
      token.kind === TokenKind.ULongLiteral ||
      token.kind === TokenKind.LongLongLiteral ||
      token.kind === TokenKind.ULongLongLiteral
    ) {
      if (typeof token.value === 'number') return token.value
      if (typeof token.bigValue === 'bigint') return Number(token.bigValue)
    }
  }
  return null
}

function parseModeKindFromArg(arg: string | null): ModeKind | null {
  if (arg === null) return null
  let mode = arg
  if (mode.startsWith('__')) mode = mode.slice(2)
  if (mode.endsWith('__')) mode = mode.slice(0, -2)
  switch (mode.toUpperCase()) {
    case 'QI':
      return ModeKind.QI
    case 'HI':
      return ModeKind.HI
    case 'SI':
      return ModeKind.SI
    case 'DI':
      return ModeKind.DI
    case 'TI':
      return ModeKind.TI
    default:
      return null
  }
}

export class Parser {
  tokens: Token[]
  pos: number
  typedefs: Set<string>
  shadowedTypedefs: Set<string>
  attrs: ParsedDeclAttrs
  pragmaPackStack: (number | null)[]
  pragmaPackAlign: number | null
  pragmaVisibilityStack: string[]
  pragmaDefaultVisibility: string | null
  errorCount: number
  enumConstants: Map<string, number>
  unevaluableEnumConstants: Set<string>
  structTagAlignments: Map<string, number>

  constructor(tokens: Token[]) {
    this.tokens = tokens
    this.pos = 0
    this.typedefs = Parser.builtinTypedefs()
    this.shadowedTypedefs = new Set()
    this.attrs = defaultAttrs()
    this.pragmaPackStack = []
    this.pragmaPackAlign = null
    this.pragmaVisibilityStack = []
    this.pragmaDefaultVisibility = null
    this.errorCount = 0
    this.enumConstants = new Map()
    this.unevaluableEnumConstants = new Set()
    this.structTagAlignments = new Map()
  }

  static builtinTypedefs(): Set<string> {
    return new Set([
      'size_t',
      'ssize_t',
      'ptrdiff_t',
      'wchar_t',
      'wint_t',
      'int8_t',
      'int16_t',
      'int32_t',
      'int64_t',
      'uint8_t',
      'uint16_t',
      'uint32_t',
      'uint64_t',
      'intptr_t',
      'uintptr_t',
      'intmax_t',
      'uintmax_t',
      'int_least8_t',
      'int_least16_t',
      'int_least32_t',
      'int_least64_t',
      'uint_least8_t',
      'uint_least16_t',
      'uint_least32_t',
      'uint_least64_t',
      'int_fast8_t',
      'int_fast16_t',
      'int_fast32_t',
      'int_fast64_t',
      'uint_fast8_t',
      'uint_fast16_t',
      'uint_fast32_t',
      'uint_fast64_t',
      'FILE',
      'fpos_t',
      'sig_atomic_t',
      'time_t',
      'clock_t',
      'timer_t',
      'clockid_t',
      'off_t',
      'pid_t',
      'uid_t',
      'gid_t',
      'mode_t',
      'dev_t',
      'ino_t',
      'nlink_t',
      'blksize_t',
      'blkcnt_t',
      'ulong',
      'ushort',
      'uint',
      '__u8',
      '__u16',
      '__u32',
      '__u64',
      '__s8',
      '__s16',
      '__s32',
      '__s64',
      'va_list',
      '__builtin_va_list',
      '__gnuc_va_list',
      'locale_t',
      'pthread_t',
      'pthread_mutex_t',
      'pthread_cond_t',
      'pthread_key_t',
      'pthread_attr_t',
      'pthread_once_t',
      'pthread_mutexattr_t',
      'pthread_condattr_t',
      'jmp_buf',
      'sigjmp_buf',
      'DIR',
      '__Float32x4_t',
      '__Float64x2_t',
      '__SVFloat32_t',
      '__SVFloat64_t',
      '__SVBool_t',
      '__SVInt8_t',
      '__SVInt16_t',
      '__SVInt32_t',
      '__SVInt64_t',
      '__SVUint8_t',
      '__SVUint16_t',
      '__SVUint32_t',
      '__SVUint64_t',
      '__SVFloat16_t',
    ])
  }

  // --- Attr flag helpers ---
  getAttrFlag(mask: number): boolean {
    return (this.attrs.flags & mask) !== 0
  }
  setAttrFlag(mask: number, v: boolean): void {
    if (v) {
      this.attrs.flags |= mask
    } else {
      this.attrs.flags &= ~mask
    }
  }

  saveAttrFlags(): number {
    return this.attrs.flags
  }
  restoreAttrFlags(saved: number): void {
    this.attrs.flags = saved
  }

  // --- Token access helpers ---
  atEof(): boolean {
    return this.pos >= this.tokens.length || this.tokens[this.pos].kind === TokenKind.Eof
  }

  peek(): TokenKind {
    if (this.pos < this.tokens.length) {
      return this.tokens[this.pos].kind
    }
    return TokenKind.Eof
  }

  peekToken(): Token {
    if (this.pos < this.tokens.length) {
      return this.tokens[this.pos]
    }
    return { kind: TokenKind.Eof, start: 0, end: 0 }
  }

  peekSpan(): Span {
    if (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos]
      return { start: t.start, end: t.end }
    }
    return dummySpan()
  }

  peekValue(): string | number | bigint | undefined {
    if (this.pos < this.tokens.length) {
      return this.tokens[this.pos].value
    }
    return undefined
  }

  spanFromTokenRange(startPos: number, endPosExclusive: number): Span {
    if (this.tokens.length === 0) return dummySpan()
    if (startPos >= endPosExclusive) {
      if (startPos >= 0 && startPos < this.tokens.length) {
        const tok = this.tokens[startPos]
        return { start: tok.start, end: tok.end }
      }
      return dummySpan()
    }
    const startIdx = Math.max(0, Math.min(startPos, this.tokens.length - 1))
    const endIdx = Math.max(startIdx, Math.min(endPosExclusive - 1, this.tokens.length - 1))
    return { start: this.tokens[startIdx].start, end: this.tokens[endIdx].end }
  }

  advance(): Token {
    if (this.pos < this.tokens.length) {
      const tok = this.tokens[this.pos]
      this.pos++
      return tok
    }
    return this.tokens[this.tokens.length - 1]
  }

  consumeIf(kind: TokenKind): boolean {
    if (this.peek() === kind) {
      this.advance()
      return true
    }
    return false
  }

  expect(expected: TokenKind): Span {
    if (this.peek() === expected) {
      const span = this.peekSpan()
      this.advance()
      return span
    }
    const span = this.peekSpan()
    this.emitError(`expected '${expected}' before '${this.peek()}'`, span)
    return span
  }

  expectAfter(expected: TokenKind, context: string): Span {
    if (this.peek() === expected) {
      const span = this.peekSpan()
      this.advance()
      return span
    }
    const span = this.peekSpan()
    this.emitError(`expected '${expected}' ${context} before '${this.peek()}'`, span)
    return span
  }

  expectContext(expected: TokenKind, context: string): Span {
    return this.expectAfter(expected, context)
  }

  expectClosing(expected: TokenKind, _openSpan: Span): Span {
    if (this.peek() === expected) {
      const span = this.peekSpan()
      this.advance()
      return span
    }
    const span = this.peekSpan()
    this.emitError(`expected '${expected}' before '${this.peek()}'`, span)
    return span
  }

  emitError(message: string, _span: Span): void {
    this.errorCount++
    // In a full implementation, this would use a DiagnosticEngine
  }

  // --- Placeholder methods that other modules will override ---
  // These are declared here so TypeScript knows about them; actual
  // implementations are added via prototype extension in other files.

  skipGccExtensions(): void {
    while (this.peek() === TokenKind.Extension) {
      this.advance()
    }
  }

  skipCvQualifiers(): void {
    while (
      this.peek() === TokenKind.Const ||
      this.peek() === TokenKind.Volatile ||
      this.peek() === TokenKind.Restrict ||
      this.peek() === TokenKind.SegGs ||
      this.peek() === TokenKind.SegFs ||
      this.peek() === TokenKind.Attribute ||
      this.peek() === TokenKind.Extension
    ) {
      if (this.peek() === TokenKind.SegGs) {
        this.advance()
        this.attrs.parsingAddressSpace = 'SegGs'
      } else if (this.peek() === TokenKind.SegFs) {
        this.advance()
        this.attrs.parsingAddressSpace = 'SegFs'
      } else if (this.peek() === TokenKind.Attribute) {
        this.parseGccAttributes()
      } else {
        this.advance()
      }
    }
  }

  skipArrayQualifiers(): void {
    while (
      this.peek() === TokenKind.Const ||
      this.peek() === TokenKind.Volatile ||
      this.peek() === TokenKind.Restrict ||
      this.peek() === TokenKind.Static
    ) {
      this.advance()
    }
  }

  skipLabelAttributes(): void {
    while (this.peek() === TokenKind.Attribute) {
      this.parseGccAttributes()
    }
    this.consumeIf(TokenKind.Semicolon)
  }

  skipBalancedParens(): void {
    if (this.peek() !== TokenKind.LParen) return
    this.advance()
    let depth = 1
    while (depth > 0 && !this.atEof()) {
      if (this.peek() === TokenKind.LParen) depth++
      else if (this.peek() === TokenKind.RParen) depth--
      if (depth > 0) this.advance()
    }
    this.consumeIf(TokenKind.RParen)
  }

  // Stub: parseGccAttributes returns (isPacked, aligned, modeKind, isTransparentUnion)
  parseGccAttributes(): [boolean, number | null, ModeKind | null, boolean] {
    if (this.peek() !== TokenKind.Attribute) return [false, null, null, false]

    let isPacked = false
    let aligned: number | null = null
    let modeKind: ModeKind | null = null
    let hasCommon = false

    const setAligned = (value: number): void => {
      aligned = aligned === null ? value : Math.max(aligned, value)
    }

    const parseAttributeArgs = (): Token[] => {
      if (!this.consumeIf(TokenKind.LParen)) return []
      const tokens: Token[] = []
      let depth = 1
      while (depth > 0 && !this.atEof()) {
        const token = this.advance()
        if (token.kind === TokenKind.LParen) {
          depth++
          tokens.push(token)
          continue
        }
        if (token.kind === TokenKind.RParen) {
          depth--
          if (depth > 0) tokens.push(token)
          continue
        }
        tokens.push(token)
      }
      return tokens
    }

    while (this.peek() === TokenKind.Attribute) {
      this.advance() // consume __attribute__

      if (!this.consumeIf(TokenKind.LParen)) {
        continue
      }
      if (!this.consumeIf(TokenKind.LParen)) {
        // Malformed/single-paren variant: skip until matching ')'.
        let depth = 1
        while (depth > 0 && !this.atEof()) {
          const token = this.advance()
          if (token.kind === TokenKind.LParen) depth++
          else if (token.kind === TokenKind.RParen) depth--
        }
        continue
      }

      while (!this.atEof()) {
        if (this.peek() === TokenKind.RParen) {
          this.advance() // end of inner ((...))
          break
        }
        if (this.peek() === TokenKind.Comma) {
          this.advance()
          continue
        }

        const rawName = tokenToAttributeName(this.peekToken())
        if (rawName === null) {
          this.advance()
          continue
        }
        this.advance()
        const attrName = normalizeAttributeName(rawName)
        const args = this.peek() === TokenKind.LParen ? parseAttributeArgs() : []

        switch (attrName) {
          case 'packed':
            isPacked = true
            break
          case 'aligned': {
            const value = firstIntegerArg(args)
            if (value !== null) setAligned(value)
            break
          }
          case 'mode':
          case 'vector_size': {
            if (attrName === 'mode') {
              const parsedMode = parseModeKindFromArg(firstIdentifierArg(args))
              if (parsedMode !== null) modeKind = parsedMode
            } else {
              const value = firstIntegerArg(args)
              if (value !== null) this.attrs.parsingVectorSize = value
            }
            break
          }
          case 'ext_vector_type': {
            const value = firstIntegerArg(args)
            if (value !== null) this.attrs.parsingExtVectorNelem = value
            break
          }
          case 'common':
            hasCommon = true
            break
          case 'transparent_union':
            this.setAttrFlag(ATTR_TRANSPARENT_UNION, true)
            break
          case 'constructor':
            this.setAttrFlag(ATTR_CONSTRUCTOR, true)
            break
          case 'destructor':
            this.setAttrFlag(ATTR_DESTRUCTOR, true)
            break
          case 'weak':
            this.setAttrFlag(ATTR_WEAK, true)
            break
          case 'used':
            this.setAttrFlag(ATTR_USED, true)
            break
          case 'gnu_inline':
            this.setAttrFlag(ATTR_GNU_INLINE, true)
            break
          case 'always_inline':
            this.setAttrFlag(ATTR_ALWAYS_INLINE, true)
            break
          case 'noinline':
            this.setAttrFlag(ATTR_NOINLINE, true)
            break
          case 'noreturn':
            this.setAttrFlag(ATTR_NORETURN, true)
            break
          case 'error':
            this.setAttrFlag(ATTR_ERROR_ATTR, true)
            break
          case 'fastcall':
            this.setAttrFlag(ATTR_FASTCALL, true)
            break
          case 'naked':
            this.setAttrFlag(ATTR_NAKED, true)
            break
          case 'alias': {
            const target = firstStringArg(args)
            if (target !== null) this.attrs.parsingAliasTarget = target
            break
          }
          case 'visibility': {
            const value = firstStringArg(args)
            if (value !== null) this.attrs.parsingVisibility = value
            break
          }
          case 'section': {
            const value = firstStringArg(args)
            if (value !== null) this.attrs.parsingSection = value
            break
          }
          case 'cleanup': {
            const fnName = firstIdentifierArg(args)
            if (fnName !== null) this.attrs.parsingCleanupFn = fnName
            break
          }
          case 'symver': {
            const value = firstStringArg(args)
            if (value !== null) this.attrs.parsingSymver = value
            break
          }
          default:
            break
        }
      }

      // Consume outer ')' in __attribute__((...))
      this.consumeIf(TokenKind.RParen)
    }

    return [isPacked, aligned, modeKind, hasCommon]
  }

  // Stub: parseAlignasArgument
  parseAlignasArgument(): number | null {
    if (this.peek() !== TokenKind.LParen) return null
    const open = this.peekSpan()
    this.advance()
    // Try to parse a constant expression
    if (this.peek() === TokenKind.RParen) {
      this.advance()
      return null
    }
    // Skip to closing paren
    let depth = 1
    while (depth > 0 && !this.atEof()) {
      if (this.peek() === TokenKind.LParen) depth++
      else if (this.peek() === TokenKind.RParen) depth--
      if (depth > 0) this.advance()
    }
    this.consumeIf(TokenKind.RParen)
    return null
  }

  // Stub: isTypeSpecifier - checks if current token starts a type specifier
  isTypeSpecifier(): boolean {
    const kind = this.peek()
    switch (kind) {
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
      case TokenKind.Typeof:
      case TokenKind.Bool:
      case TokenKind.Complex:
      case TokenKind.Atomic:
      case TokenKind.AutoType:
      case TokenKind.Int128:
      case TokenKind.UInt128:
      case TokenKind.Builtin:
      case TokenKind.Const:
      case TokenKind.Volatile:
      case TokenKind.Restrict:
      case TokenKind.Static:
      case TokenKind.Extern:
      case TokenKind.Typedef:
      case TokenKind.Register:
      case TokenKind.Auto:
      case TokenKind.Inline:
      case TokenKind.Noreturn:
      case TokenKind.ThreadLocal:
      case TokenKind.Attribute:
      case TokenKind.Extension:
      case TokenKind.Alignas:
      case TokenKind.SegGs:
      case TokenKind.SegFs:
        return true
      case TokenKind.Identifier: {
        const val = this.peekValue()
        if (typeof val === 'string') {
          return this.typedefs.has(val) && !this.shadowedTypedefs.has(val)
        }
        return false
      }
      default:
        return false
    }
  }

  // Stub: isTypedefLabel - check if identifier is followed by colon (label, not typedef)
  isTypedefLabel(): boolean {
    if (this.peek() !== TokenKind.Identifier) return false
    if (this.pos + 1 < this.tokens.length && this.tokens[this.pos + 1].kind === TokenKind.Colon) {
      return true
    }
    return false
  }

  // Stub: handlePragmaPackToken
  handlePragmaPackToken(): boolean {
    const kind = this.peek()
    if (
      kind === TokenKind.PragmaPackSet ||
      kind === TokenKind.PragmaPackPush ||
      kind === TokenKind.PragmaPackPushOnly ||
      kind === TokenKind.PragmaPackPop ||
      kind === TokenKind.PragmaPackReset
    ) {
      this.advance()
      return true
    }
    return false
  }

  // Stub: handlePragmaVisibilityToken
  handlePragmaVisibilityToken(): boolean {
    const kind = this.peek()
    if (kind === TokenKind.PragmaVisibilityPush || kind === TokenKind.PragmaVisibilityPop) {
      this.advance()
      return true
    }
    return false
  }

  // Stub: parseStaticAssert
  parseStaticAssert(): Span {
    const begin = this.peekSpan()
    this.advance() // consume _Static_assert
    let end = begin.end
    if (this.peek() === TokenKind.LParen) {
      const open = this.peekSpan()
      this.skipBalancedParens()
      end = open.end
    }
    if (this.peek() === TokenKind.Semicolon) {
      const semi = this.peekSpan()
      this.advance()
      end = semi.end
    }
    return { start: begin.start, end }
  }

  // Stub: parseLocalDeclaration
  parseLocalDeclaration(): AST.Declaration | null {
    // This would be implemented in declarations.ts
    // For now, skip to semicolon
    while (this.peek() !== TokenKind.Semicolon && !this.atEof()) {
      this.advance()
    }
    this.consumeIf(TokenKind.Semicolon)
    return null
  }

  // Stub: parseExpr
  parseExpr(): AST.Expression {
    return this.parseAssignmentExpr()
  }

  // Stub: parseAssignmentExpr
  parseAssignmentExpr(): AST.Expression {
    // Minimal implementation - just parse a primary
    return this.parsePrimaryExpr()
  }

  // Stub: parsePrimaryExpr
  parsePrimaryExpr(): AST.Expression {
    const span = this.peekSpan()
    const tok = this.advance()
    const loc = { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }
    switch (tok.kind) {
      case TokenKind.IntLiteral:
        return {
          type: 'IntLiteral',
          value: (tok.value as number) ?? 0,
          start: span.start,
          end: span.end,
          loc,
        }
      case TokenKind.Identifier:
        return {
          type: 'Identifier',
          name: (tok.value as string) ?? '',
          start: span.start,
          end: span.end,
          loc,
        }
      case TokenKind.StringLiteral:
        return {
          type: 'StringLiteral',
          value: (tok.value as string) ?? '',
          start: span.start,
          end: span.end,
          loc,
        }
      default:
        return { type: 'IntLiteral', value: 0, start: span.start, end: span.end, loc }
    }
  }

  // Stub: parseParamList
  parseParamList(): [AST.ParamDeclaration[], boolean] {
    const params: AST.ParamDeclaration[] = []
    let variadic = false
    if (this.peek() !== TokenKind.LParen) return [params, variadic]
    this.advance()
    while (this.peek() !== TokenKind.RParen && !this.atEof()) {
      if (this.peek() === TokenKind.Ellipsis) {
        this.advance()
        variadic = true
        break
      }
      // Skip parameter
      while (this.peek() !== TokenKind.Comma && this.peek() !== TokenKind.RParen && !this.atEof()) {
        this.advance()
      }
      this.consumeIf(TokenKind.Comma)
    }
    this.consumeIf(TokenKind.RParen)
    return [params, variadic]
  }

  // Stub: parseDeclaratorWithAttrs
  parseDeclaratorWithAttrs(): [
    string | null,
    AST.DerivedDeclarator[],
    AST.SourceSpan | null,
    ModeKind | null,
    boolean,
    number | null,
    boolean,
  ] {
    let name: string | null = null
    const derived: AST.DerivedDeclarator[] = []
    while (this.consumeIf(TokenKind.Star)) {
      derived.push({ kind: 'Pointer' })
      this.skipCvQualifiers()
    }
    if (this.peek() === TokenKind.Identifier) {
      name = (this.peekValue() as string) ?? null
      this.advance()
    }
    this.parseGccAttributes()
    return [name, derived, null, null, false, null, false]
  }

  // Stub: tryParseParenAbstractDeclarator
  tryParseParenAbstractDeclarator(): ParenAbstractDecl | null {
    // Simplified: look for (*) pattern
    const save = this.pos
    this.advance() // consume '('
    let ptrDepth = 0
    while (this.peek() === TokenKind.Star) {
      this.advance()
      ptrDepth++
    }
    if (ptrDepth === 0) {
      this.pos = save
      return null
    }
    const arrayDims: (AST.Expression | null)[] = []
    while (this.peek() === TokenKind.LBracket) {
      this.advance()
      if (this.peek() === TokenKind.RBracket) {
        arrayDims.push(null)
      } else {
        arrayDims.push(this.parseExpr())
      }
      this.consumeIf(TokenKind.RBracket)
    }
    if (this.peek() === TokenKind.LParen) {
      // Nested function pointer
      const innerSave = this.pos
      this.advance()
      let innerPtrDepth = 0
      while (this.peek() === TokenKind.Star) {
        this.advance()
        innerPtrDepth++
      }
      if (innerPtrDepth > 0 && this.peek() === TokenKind.RParen) {
        this.advance()
        if (this.peek() === TokenKind.LParen) {
          const [innerParams, innerVariadic] = this.parseParamList()
          this.consumeIf(TokenKind.RParen)
          return {
            kind: 'NestedFnPtr',
            outerPtrDepth: ptrDepth,
            innerPtrDepth,
            innerParams,
            innerVariadic,
          }
        }
      }
      this.pos = innerSave
    }
    this.consumeIf(TokenKind.RParen)
    return { kind: 'Simple', ptrDepth, arrayDims }
  }

  // Stub: isParenDeclarator
  isParenDeclarator(): boolean {
    if (this.pos + 1 >= this.tokens.length) return false
    const next = this.tokens[this.pos + 1].kind
    return (
      next === TokenKind.Star ||
      next === TokenKind.Identifier ||
      next === TokenKind.LParen ||
      next === TokenKind.Caret
    )
  }

  // Stub: alignofTypeSpec
  static alignofTypeSpec(_ts: AST.TypeSpecifier, _tagAligns: Map<string, number> | null): number {
    return 4 // Default alignment
  }

  // Stub: evalConstIntExprWithEnums
  static evalConstIntExprWithEnums(
    _expr: AST.Expression,
    _enumConsts: Map<string, number> | null,
    _tagAligns: Map<string, number> | null,
  ): number | null {
    return null
  }

  // Stub: targetIs32bit
  static targetIs32bit(): boolean {
    return false
  }
}
