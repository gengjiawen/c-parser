// Type specifier parsing: handles all C type specifiers including struct/union/enum
// definitions, typedef names, and GNU extensions like typeof and _Complex.
//
// The main complexity here is that C allows type specifier tokens in any order
// (e.g., "long unsigned int" == "unsigned long int"), so we collect flags
// and resolve them at the end.

import {
  Parser,
  ModeKind,
  applyModeKind,
  ATTR_CONST,
  ATTR_VOLATILE,
  ATTR_STATIC,
  ATTR_EXTERN,
  ATTR_TYPEDEF,
  ATTR_THREAD_LOCAL,
  ATTR_INLINE,
  ATTR_NORETURN,
} from './parser'
import { TokenKind } from '../lexer/token'
import * as AST from '../ast/nodes'

// Internal type specifier flags for collecting arbitrary keyword ordering
interface TypeSpecFlags {
  hasVoid: boolean
  hasBool: boolean
  hasFloat: boolean
  hasDouble: boolean
  hasComplex: boolean
  hasChar: boolean
  hasShort: boolean
  hasInt: boolean
  hasUnsigned: boolean
  hasSigned: boolean
  hasStruct: boolean
  hasUnion: boolean
  hasEnum: boolean
  hasTypeof: boolean
  longCount: number
  typedefName: string | null
}

function defaultFlags(): TypeSpecFlags {
  return {
    hasVoid: false,
    hasBool: false,
    hasFloat: false,
    hasDouble: false,
    hasComplex: false,
    hasChar: false,
    hasShort: false,
    hasInt: false,
    hasUnsigned: false,
    hasSigned: false,
    hasStruct: false,
    hasUnion: false,
    hasEnum: false,
    hasTypeof: false,
    longCount: 0,
    typedefName: null,
  }
}

// Extend Parser prototype
declare module './parser' {
  interface Parser {
    parseTypeSpecifier(): AST.TypeSpecifier | null
    collectTrailingSpecifiers(flags: TypeSpecFlags, modeKind: { value: ModeKind | null }): void
    resolveTypeFlags(flags: TypeSpecFlags): AST.TypeSpecifier
    parseStructOrUnion(isStruct: boolean): AST.TypeSpecifier
    parseEnumSpecifier(): AST.TypeSpecifier
    parseTypeofSpecifier(): AST.TypeSpecifier
    consumeTrailingQualifiers(base: AST.TypeSpecifier): AST.TypeSpecifier
    parseStructFields(): AST.StructFieldDeclaration[]
    parseStructFieldDeclarators(
      typeSpec: AST.TypeSpecifier,
      fields: AST.StructFieldDeclaration[],
    ): void
    consumeStructFieldQualifiers(alignas: { value: number | null }): void
    foldSimpleDerived(
      base: AST.TypeSpecifier,
      derived: AST.DerivedDeclarator[],
    ): [AST.TypeSpecifier, AST.DerivedDeclarator[]]
    parseEnumVariants(): AST.EnumVariant[]
    registerEnumConstants(variants: AST.EnumVariant[]): void
    parseVaArgType(): AST.TypeSpecifier
    parseAbstractDeclaratorSuffix(resultType: AST.TypeSpecifier): AST.TypeSpecifier
  }
}

// === parseTypeSpecifier ===
// Parse a complete type specifier. Returns null if no type specifier found.
// Handles arbitrary ordering of type keywords, struct/union/enum definitions,
// typedef names, typeof expressions, and _Complex types.

Parser.prototype.parseTypeSpecifier = function (this: Parser): AST.TypeSpecifier | null {
  this.skipGccExtensions()

  const flags = defaultFlags()
  const modeKindRef: { value: ModeKind | null } = { value: null }
  let anyBaseSpecifier = false
  let anyStorageClass = false

  // Collect qualifiers, storage classes, and type specifiers
  loop: while (true) {
    switch (this.peek()) {
      // Qualifiers
      case TokenKind.Const:
        this.advance()
        this.setAttrFlag(ATTR_CONST, true)
        continue
      case TokenKind.Volatile:
        this.advance()
        this.setAttrFlag(ATTR_VOLATILE, true)
        continue
      case TokenKind.Restrict:
        this.advance()
        continue
      case TokenKind.Register:
      case TokenKind.Auto:
        this.advance()
        anyStorageClass = true
        continue
      case TokenKind.Noreturn:
        this.advance()
        this.setAttrFlag(ATTR_NORETURN, true)
        continue
      // GCC named address space qualifiers
      case TokenKind.SegGs:
        this.advance()
        this.attrs.parsingAddressSpace = 'SegGs'
        continue
      case TokenKind.SegFs:
        this.advance()
        this.attrs.parsingAddressSpace = 'SegFs'
        continue
      // __auto_type - GCC extension: type inferred from initializer
      case TokenKind.AutoType:
        this.advance()
        return { type: 'AutoTypeType' }
      case TokenKind.Inline:
        this.advance()
        this.setAttrFlag(ATTR_INLINE, true)
        continue
      // Storage classes
      case TokenKind.Static:
        this.advance()
        this.setAttrFlag(ATTR_STATIC, true)
        anyStorageClass = true
        continue
      case TokenKind.Extern:
        this.advance()
        this.setAttrFlag(ATTR_EXTERN, true)
        anyStorageClass = true
        continue
      case TokenKind.Typedef:
        this.advance()
        this.setAttrFlag(ATTR_TYPEDEF, true)
        anyStorageClass = true
        continue
      // Thread-local storage class
      case TokenKind.ThreadLocal:
        this.advance()
        this.setAttrFlag(ATTR_THREAD_LOCAL, true)
        anyStorageClass = true
        continue
      // _Complex modifier
      case TokenKind.Complex:
        this.advance()
        flags.hasComplex = true
        anyBaseSpecifier = true
        continue
      // GNU extensions
      case TokenKind.Attribute: {
        const [, aligned, mk] = this.parseGccAttributes()
        if (mk !== null) modeKindRef.value = mk
        if (aligned !== null) {
          this.attrs.parsedAlignas =
            this.attrs.parsedAlignas !== null
              ? Math.max(this.attrs.parsedAlignas, aligned)
              : aligned
        }
        continue
      }
      case TokenKind.Extension:
        this.advance()
        continue
      // _Atomic as type specifier: _Atomic(type-name)
      case TokenKind.Atomic: {
        this.advance()
        if (this.peek() === TokenKind.LParen) {
          const open = this.peekSpan()
          this.advance() // consume '('
          // Save and restore const qualifier across inner type parse
          const savedConst = this.getAttrFlag(ATTR_CONST)
          this.setAttrFlag(ATTR_CONST, false)
          const inner = this.parseTypeSpecifier()
          this.setAttrFlag(ATTR_CONST, savedConst)
          if (inner !== null) {
            const result = this.parseAbstractDeclaratorSuffix(inner)
            this.expectClosing(TokenKind.RParen, open)
            return result
          }
          // Fallback: if we can't parse a type, emit error and skip
          const errSpan = this.peekSpan()
          this.emitError('expected type name in _Atomic(...)', errSpan)
          while (this.peek() !== TokenKind.RParen && this.peek() !== TokenKind.Eof) {
            this.advance()
          }
          this.consumeIf(TokenKind.RParen)
          return { type: 'IntType' }
        }
        // _Atomic without parens is a type qualifier; falls through
        continue
      }
      // Alignas
      case TokenKind.Alignas: {
        this.advance()
        const align = this.parseAlignasArgument()
        if (align !== null) {
          this.attrs.parsedAlignas =
            this.attrs.parsedAlignas !== null ? Math.max(this.attrs.parsedAlignas, align) : align
        }
        continue
      }
      // Type specifier tokens
      case TokenKind.Void:
        this.advance()
        flags.hasVoid = true
        anyBaseSpecifier = true
        break loop // void can't combine with others
      case TokenKind.Char:
        this.advance()
        flags.hasChar = true
        anyBaseSpecifier = true
        break loop // char only combines with signed/unsigned
      case TokenKind.Short:
        this.advance()
        flags.hasShort = true
        anyBaseSpecifier = true
        continue
      case TokenKind.Int:
        this.advance()
        flags.hasInt = true
        anyBaseSpecifier = true
        continue
      case TokenKind.Long:
        this.advance()
        flags.longCount++
        anyBaseSpecifier = true
        continue
      case TokenKind.Float:
        this.advance()
        flags.hasFloat = true
        anyBaseSpecifier = true
        break loop
      case TokenKind.Double:
        this.advance()
        flags.hasDouble = true
        anyBaseSpecifier = true
        break loop
      case TokenKind.Bool:
        this.advance()
        flags.hasBool = true
        anyBaseSpecifier = true
        break loop
      case TokenKind.Signed:
        this.advance()
        flags.hasSigned = true
        anyBaseSpecifier = true
        continue
      case TokenKind.Unsigned:
        this.advance()
        flags.hasUnsigned = true
        anyBaseSpecifier = true
        continue
      // __int128 can combine with signed/unsigned
      case TokenKind.Int128: {
        const span = this.peekSpan()
        this.advance()
        if (Parser.targetIs32bit()) {
          this.emitError('__int128 is not supported on this target', span)
          return { type: 'IntType' }
        }
        if (flags.hasUnsigned) {
          return { type: 'UnsignedInt128Type' }
        }
        return { type: 'Int128Type' }
      }
      // __uint128_t is always unsigned
      case TokenKind.UInt128: {
        const span = this.peekSpan()
        this.advance()
        if (Parser.targetIs32bit()) {
          this.emitError('__uint128_t is not supported on this target', span)
          return { type: 'UnsignedIntType' }
        }
        return { type: 'UnsignedInt128Type' }
      }
      case TokenKind.Struct:
        this.advance()
        flags.hasStruct = true
        anyBaseSpecifier = true
        break loop
      case TokenKind.Union:
        this.advance()
        flags.hasUnion = true
        anyBaseSpecifier = true
        break loop
      case TokenKind.Enum:
        this.advance()
        flags.hasEnum = true
        anyBaseSpecifier = true
        break loop
      case TokenKind.Typeof:
        this.advance()
        flags.hasTypeof = true
        anyBaseSpecifier = true
        break loop
      case TokenKind.Builtin:
        if (!anyBaseSpecifier) {
          flags.typedefName = '__builtin_va_list'
          this.advance()
          anyBaseSpecifier = true
          break loop
        }
        break loop
      case TokenKind.Identifier: {
        const val = this.peekValue()
        if (typeof val === 'string' && this.typedefs.has(val) && !this.shadowedTypedefs.has(val)) {
          if (!anyBaseSpecifier) {
            flags.typedefName = val
            this.advance()
            anyBaseSpecifier = true
            break loop
          }
        }
        break loop
      }
      default:
        break loop
    }
  }

  // After the main loop, collect trailing specifiers
  this.collectTrailingSpecifiers(flags, modeKindRef)

  if (!anyBaseSpecifier) {
    // C89 implicit int: if a storage class specifier was consumed but no
    // type specifier was found, the type defaults to int.
    if (anyStorageClass) {
      return { type: 'IntType' }
    }
    return null
  }

  // Resolve collected flags into a TypeSpecifier
  let base = this.resolveTypeFlags(flags)

  // Handle trailing _Complex, qualifiers, and storage classes after the base type
  base = this.consumeTrailingQualifiers(base)

  // Apply __attribute__((mode(...))): transform type to the specified bit-width
  if (modeKindRef.value !== null) {
    base = applyModeKind(modeKindRef.value, base)
  }

  return base
}

// === collectTrailingSpecifiers ===
// Collect additional type specifier tokens that follow the initial base type.
// E.g., "short" can be followed by "unsigned int", "double" by "long",
// "float" by "_Complex".

Parser.prototype.collectTrailingSpecifiers = function (
  this: Parser,
  flags: TypeSpecFlags,
  modeKind: { value: ModeKind | null },
): void {
  if (flags.hasChar || flags.hasShort || flags.hasInt || flags.longCount > 0) {
    while (true) {
      switch (this.peek()) {
        case TokenKind.Signed:
          this.advance()
          flags.hasSigned = true
          continue
        case TokenKind.Unsigned:
          this.advance()
          flags.hasUnsigned = true
          continue
        case TokenKind.Int:
          this.advance()
          flags.hasInt = true
          continue
        case TokenKind.Long:
          this.advance()
          flags.longCount++
          continue
        case TokenKind.Short:
          this.advance()
          flags.hasShort = true
          continue
        case TokenKind.Char:
          this.advance()
          flags.hasChar = true
          continue
        case TokenKind.Complex:
          this.advance()
          flags.hasComplex = true
          continue
        case TokenKind.Const:
        case TokenKind.Volatile:
        case TokenKind.Restrict:
          this.advance()
          continue
        case TokenKind.SegGs:
          this.advance()
          this.attrs.parsingAddressSpace = 'SegGs'
          continue
        case TokenKind.SegFs:
          this.advance()
          this.attrs.parsingAddressSpace = 'SegFs'
          continue
        case TokenKind.Static:
          this.advance()
          this.setAttrFlag(ATTR_STATIC, true)
          continue
        case TokenKind.Extern:
          this.advance()
          this.setAttrFlag(ATTR_EXTERN, true)
          continue
        case TokenKind.Auto:
        case TokenKind.Register:
          this.advance()
          continue
        case TokenKind.ThreadLocal:
          this.advance()
          this.setAttrFlag(ATTR_THREAD_LOCAL, true)
          continue
        case TokenKind.Noreturn:
          this.advance()
          this.setAttrFlag(ATTR_NORETURN, true)
          continue
        case TokenKind.Inline:
          this.advance()
          this.setAttrFlag(ATTR_INLINE, true)
          continue
        case TokenKind.Attribute: {
          const [, aligned, mk] = this.parseGccAttributes()
          if (mk !== null) modeKind.value = mk
          if (aligned !== null) {
            this.attrs.parsedAlignas =
              this.attrs.parsedAlignas !== null
                ? Math.max(this.attrs.parsedAlignas, aligned)
                : aligned
          }
          continue
        }
        case TokenKind.Extension:
          this.advance()
          continue
        default:
          return
      }
    }
  } else if (flags.hasFloat) {
    // "float" can be followed by "_Complex" and storage class / qualifiers
    while (true) {
      switch (this.peek()) {
        case TokenKind.Complex:
          this.advance()
          flags.hasComplex = true
          continue
        case TokenKind.Const:
        case TokenKind.Volatile:
        case TokenKind.Restrict:
          this.advance()
          continue
        case TokenKind.SegGs:
          this.advance()
          this.attrs.parsingAddressSpace = 'SegGs'
          continue
        case TokenKind.SegFs:
          this.advance()
          this.attrs.parsingAddressSpace = 'SegFs'
          continue
        case TokenKind.Static:
          this.advance()
          this.setAttrFlag(ATTR_STATIC, true)
          continue
        case TokenKind.Extern:
          this.advance()
          this.setAttrFlag(ATTR_EXTERN, true)
          continue
        case TokenKind.Auto:
        case TokenKind.Register:
          this.advance()
          continue
        case TokenKind.ThreadLocal:
          this.advance()
          this.setAttrFlag(ATTR_THREAD_LOCAL, true)
          continue
        case TokenKind.Noreturn:
          this.advance()
          this.setAttrFlag(ATTR_NORETURN, true)
          continue
        case TokenKind.Inline:
          this.advance()
          this.setAttrFlag(ATTR_INLINE, true)
          continue
        case TokenKind.Extension:
          this.advance()
          continue
        default:
          return
      }
    }
  } else if (flags.hasDouble) {
    // "double" can be followed by "long", "_Complex", and storage class / qualifiers
    while (true) {
      switch (this.peek()) {
        case TokenKind.Long:
          this.advance()
          flags.longCount++
          continue
        case TokenKind.Complex:
          this.advance()
          flags.hasComplex = true
          continue
        case TokenKind.Const:
        case TokenKind.Volatile:
        case TokenKind.Restrict:
          this.advance()
          continue
        case TokenKind.SegGs:
          this.advance()
          this.attrs.parsingAddressSpace = 'SegGs'
          continue
        case TokenKind.SegFs:
          this.advance()
          this.attrs.parsingAddressSpace = 'SegFs'
          continue
        case TokenKind.Static:
          this.advance()
          this.setAttrFlag(ATTR_STATIC, true)
          continue
        case TokenKind.Extern:
          this.advance()
          this.setAttrFlag(ATTR_EXTERN, true)
          continue
        case TokenKind.Auto:
        case TokenKind.Register:
          this.advance()
          continue
        case TokenKind.ThreadLocal:
          this.advance()
          this.setAttrFlag(ATTR_THREAD_LOCAL, true)
          continue
        case TokenKind.Noreturn:
          this.advance()
          this.setAttrFlag(ATTR_NORETURN, true)
          continue
        case TokenKind.Inline:
          this.advance()
          this.setAttrFlag(ATTR_INLINE, true)
          continue
        case TokenKind.Extension:
          this.advance()
          continue
        default:
          return
      }
    }
  }
}

// === resolveTypeFlags ===
// Resolve the collected type specifier flags into a concrete TypeSpecifier.

Parser.prototype.resolveTypeFlags = function (
  this: Parser,
  flags: TypeSpecFlags,
): AST.TypeSpecifier {
  if (flags.hasVoid) {
    return { type: 'VoidType' }
  }
  if (flags.hasBool) {
    return { type: 'BoolType' }
  }
  if (flags.hasFloat) {
    if (flags.hasComplex) return { type: 'ComplexFloatType' }
    return { type: 'FloatType' }
  }
  if (flags.hasDouble) {
    if (flags.hasComplex) {
      if (flags.longCount > 0) return { type: 'ComplexLongDoubleType' }
      return { type: 'ComplexDoubleType' }
    }
    if (flags.longCount > 0) return { type: 'LongDoubleType' }
    return { type: 'DoubleType' }
  }
  if (flags.hasComplex && !flags.hasStruct && !flags.hasUnion && !flags.hasEnum) {
    // standalone _Complex defaults to _Complex double
    return { type: 'ComplexDoubleType' }
  }
  if (flags.hasStruct) {
    return this.parseStructOrUnion(true)
  }
  if (flags.hasUnion) {
    return this.parseStructOrUnion(false)
  }
  if (flags.hasEnum) {
    return this.parseEnumSpecifier()
  }
  if (flags.hasTypeof) {
    return this.parseTypeofSpecifier()
  }
  if (flags.typedefName !== null) {
    return { type: 'TypedefNameType', name: flags.typedefName }
  }
  if (flags.hasChar) {
    if (flags.hasUnsigned) return { type: 'UnsignedCharType' }
    return { type: 'CharType' }
  }
  if (flags.hasShort) {
    if (flags.hasUnsigned) return { type: 'UnsignedShortType' }
    return { type: 'ShortType' }
  }
  if (flags.longCount >= 2) {
    if (flags.hasUnsigned) return { type: 'UnsignedLongLongType' }
    return { type: 'LongLongType' }
  }
  if (flags.longCount === 1) {
    if (flags.hasUnsigned) return { type: 'UnsignedLongType' }
    return { type: 'LongType' }
  }
  if (flags.hasUnsigned) {
    return { type: 'UnsignedIntType' }
  }
  // signed, int, or signed int
  return { type: 'IntType' }
}

// === parseStructOrUnion ===
// Parse a struct or union definition/reference.

Parser.prototype.parseStructOrUnion = function (
  this: Parser,
  isStruct: boolean,
): AST.TypeSpecifier {
  let [isPacked, structAligned, ,] = this.parseGccAttributes()

  let name: string | null = null
  if (this.peek() === TokenKind.Identifier) {
    name = (this.peekValue() as string) ?? null
    this.advance()
  }

  const [packed2, aligned2, ,] = this.parseGccAttributes()
  isPacked = isPacked || packed2
  if (aligned2 !== null) structAligned = aligned2

  let fields: AST.StructFieldDeclaration[] | null = null
  if (this.peek() === TokenKind.LBrace) {
    // Save and restore parsing_const across struct field parsing.
    const savedConst = this.getAttrFlag(ATTR_CONST)
    fields = this.parseStructFields()
    this.setAttrFlag(ATTR_CONST, savedConst)
  }

  const [packed3, aligned3, ,] = this.parseGccAttributes()
  isPacked = isPacked || packed3
  if (aligned3 !== null) structAligned = aligned3

  // Apply current #pragma pack alignment to struct definition
  const maxFieldAlign = this.pragmaPackAlign

  const ts: AST.TypeSpecifier = isStruct
    ? { type: 'StructType', name, fields, isPacked, maxFieldAlign, structAligned }
    : { type: 'UnionType', name, fields, isPacked, maxFieldAlign, structAligned }

  // Record alignment for named struct/union definitions
  if (name !== null && fields !== null) {
    if (ts.type === 'StructType' || ts.type === 'UnionType') {
      const align = Parser.alignofTypeSpec(ts, null)
      this.structTagAlignments.set(name, align)
    }
  }

  return ts
}

// === parseEnumSpecifier ===
// Parse an enum definition/reference.

Parser.prototype.parseEnumSpecifier = function (this: Parser): AST.TypeSpecifier {
  let [isPacked, , ,] = this.parseGccAttributes()

  let name: string | null = null
  if (this.peek() === TokenKind.Identifier) {
    name = (this.peekValue() as string) ?? null
    this.advance()
  }

  const [packed2, , ,] = this.parseGccAttributes()
  isPacked = isPacked || packed2

  let variants: AST.EnumVariant[] | null = null
  if (this.peek() === TokenKind.LBrace) {
    variants = this.parseEnumVariants()
    // Register enum constant values so that later constant expressions can resolve them.
    this.registerEnumConstants(variants)
  }

  const [packed3, , ,] = this.parseGccAttributes()
  isPacked = isPacked || packed3

  return { type: 'EnumType', name, variants, isPacked }
}

// === parseTypeofSpecifier ===
// Parse typeof(expr) or typeof(type-name).

Parser.prototype.parseTypeofSpecifier = function (this: Parser): AST.TypeSpecifier {
  const open = this.peekSpan()
  this.expectContext(TokenKind.LParen, "after 'typeof'")
  // Save attrs.flags so that storage-class specifiers from declarations
  // inside a statement expression don't leak into the outer declaration.
  const savedFlags = this.saveAttrFlags()
  const save = this.pos

  // Try parsing as a type first
  if (this.isTypeSpecifier()) {
    const ts = this.parseTypeSpecifier()
    if (ts !== null) {
      const resultType = this.parseAbstractDeclaratorSuffix(ts)
      if (this.peek() === TokenKind.RParen) {
        this.advance()
        this.restoreAttrFlags(savedFlags)
        return { type: 'TypeofTypeType', typeSpec: resultType }
      }
    }
    // Didn't work as type, backtrack
    this.pos = save
    this.restoreAttrFlags(savedFlags)
    this.expectContext(TokenKind.LParen, "after 'typeof'")
  }

  // Parse as expression
  const expr = this.parseExpr()
  this.expectClosing(TokenKind.RParen, open)
  this.restoreAttrFlags(savedFlags)
  return { type: 'TypeofExprType', expr }
}

// === consumeTrailingQualifiers ===
// Consume trailing qualifiers and _Complex that may follow a resolved base type.
// C allows "int static x;" and "double _Complex".

Parser.prototype.consumeTrailingQualifiers = function (
  this: Parser,
  base: AST.TypeSpecifier,
): AST.TypeSpecifier {
  let result = base
  while (true) {
    switch (this.peek()) {
      case TokenKind.Complex: {
        this.advance()
        if (result.type === 'FloatType') result = { type: 'ComplexFloatType' }
        else if (result.type === 'DoubleType') result = { type: 'ComplexDoubleType' }
        else if (result.type === 'LongDoubleType') result = { type: 'ComplexLongDoubleType' }
        else result = { type: 'ComplexDoubleType' }
        continue
      }
      case TokenKind.Const:
      case TokenKind.Volatile:
      case TokenKind.Restrict:
        this.advance()
        continue
      case TokenKind.Static:
        this.advance()
        this.setAttrFlag(ATTR_STATIC, true)
        continue
      case TokenKind.Extern:
        this.advance()
        this.setAttrFlag(ATTR_EXTERN, true)
        continue
      case TokenKind.Auto:
      case TokenKind.Register:
        this.advance()
        continue
      case TokenKind.ThreadLocal:
        this.advance()
        this.setAttrFlag(ATTR_THREAD_LOCAL, true)
        continue
      case TokenKind.Noreturn:
        this.advance()
        this.setAttrFlag(ATTR_NORETURN, true)
        continue
      case TokenKind.Inline:
        this.advance()
        this.setAttrFlag(ATTR_INLINE, true)
        continue
      case TokenKind.Attribute: {
        const [, aligned] = this.parseGccAttributes()
        if (aligned !== null) {
          this.attrs.parsedAlignas =
            this.attrs.parsedAlignas !== null
              ? Math.max(this.attrs.parsedAlignas, aligned)
              : aligned
        }
        continue
      }
      case TokenKind.Extension:
        this.advance()
        continue
      case TokenKind.SegGs:
        this.advance()
        this.attrs.parsingAddressSpace = 'SegGs'
        continue
      case TokenKind.SegFs:
        this.advance()
        this.attrs.parsingAddressSpace = 'SegFs'
        continue
      default:
        return result
    }
  }
}

// === parseStructFields ===
// Parse struct or union field declarations inside braces.

Parser.prototype.parseStructFields = function (this: Parser): AST.StructFieldDeclaration[] {
  const fields: AST.StructFieldDeclaration[] = []
  const open = this.peekSpan()
  this.expectContext(TokenKind.LBrace, 'for struct/union body')

  while (this.peek() !== TokenKind.RBrace && this.peek() !== TokenKind.Eof) {
    this.skipGccExtensions()

    if (this.peek() === TokenKind.Semicolon) {
      this.advance()
      continue
    }

    // C11 6.7.2.1: _Static_assert is allowed as a struct-declaration
    if (this.peek() === TokenKind.StaticAssert) {
      this.parseStaticAssert()
      continue
    }

    const typeSpec = this.parseTypeSpecifier()
    if (typeSpec !== null) {
      if (this.peek() === TokenKind.Semicolon) {
        // Anonymous field (e.g., anonymous struct/union)
        const alignment = this.attrs.parsedAlignas
        this.attrs.parsedAlignas = null
        fields.push({
          typeSpec,
          name: null,
          bitWidth: null,
          derived: [],
          alignment,
          isPacked: false,
        })
      } else {
        this.parseStructFieldDeclarators(typeSpec, fields)
      }
      this.skipGccExtensions()
      this.expectAfter(TokenKind.Semicolon, 'after struct field declaration')
    } else {
      this.advance() // skip unknown
    }
  }

  this.expectClosing(TokenKind.RBrace, open)
  return fields
}

// === parseStructFieldDeclarators ===
// Parse one or more declarators for a struct field.

Parser.prototype.parseStructFieldDeclarators = function (
  this: Parser,
  typeSpec: AST.TypeSpecifier,
  fields: AST.StructFieldDeclaration[],
): void {
  // Capture _Alignas value that was parsed during type specifier parsing
  let alignasFromType = this.attrs.parsedAlignas
  this.attrs.parsedAlignas = null

  // Consume post-type qualifiers between type and declarator
  const alignasRef = { value: alignasFromType }
  this.consumeStructFieldQualifiers(alignasRef)
  alignasFromType = alignasRef.value

  while (true) {
    // Handle unnamed bitfield: `: constant-expr`
    if (this.peek() === TokenKind.Colon) {
      this.advance()
      const bitWidth = this.parseAssignmentExpr()
      fields.push({
        typeSpec,
        name: null,
        bitWidth,
        derived: [],
        alignment: alignasFromType,
        isPacked: false,
      })
      if (!this.consumeIf(TokenKind.Comma)) break
      continue
    }

    // Use the general-purpose declarator parser
    const [name, derived, , , declAligned, declPacked] = this.parseDeclaratorWithAttrs()

    // Parse optional bitfield width
    let bitWidth: AST.Expression | null = null
    if (this.consumeIf(TokenKind.Colon)) {
      bitWidth = this.parseAssignmentExpr()
    }

    // Parse any additional trailing GCC __attribute__
    const [extraPacked, extraAligned] = this.parseGccAttributes()

    // Combine alignment sources
    const alignment = declAligned ?? extraAligned ?? alignasFromType
    const isPacked = declPacked || extraPacked

    // Fold simple derived declarators into type_spec
    const [fieldType, fieldDerived] = this.foldSimpleDerived(typeSpec, derived)

    fields.push({
      typeSpec: fieldType,
      name,
      bitWidth,
      derived: fieldDerived,
      alignment,
      isPacked,
    })

    if (!this.consumeIf(TokenKind.Comma)) break
  }
}

// === consumeStructFieldQualifiers ===
// Consume qualifiers that may appear between type specifier and declarator
// in struct field declarations. Handles _Alignas, const, volatile, etc.

Parser.prototype.consumeStructFieldQualifiers = function (
  this: Parser,
  alignas: { value: number | null },
): void {
  while (true) {
    switch (this.peek()) {
      case TokenKind.Const:
      case TokenKind.Volatile:
      case TokenKind.Restrict:
        this.advance()
        continue
      case TokenKind.SegGs:
        this.advance()
        this.attrs.parsingAddressSpace = 'SegGs'
        continue
      case TokenKind.SegFs:
        this.advance()
        this.attrs.parsingAddressSpace = 'SegFs'
        continue
      case TokenKind.Alignas: {
        this.advance()
        const align = this.parseAlignasArgument()
        if (align !== null) {
          alignas.value = alignas.value !== null ? Math.max(alignas.value, align) : align
        }
        continue
      }
      case TokenKind.Attribute: {
        const [, attrAligned] = this.parseGccAttributes()
        if (attrAligned !== null) {
          alignas.value = attrAligned
        }
        continue
      }
      case TokenKind.Extension:
        this.advance()
        continue
      default:
        return
    }
  }
}

// === foldSimpleDerived ===
// For simple derived declarators (just pointers and/or arrays), fold them
// into the TypeSpecifier directly. For complex cases (function pointers),
// return the derived list for downstream processing.

Parser.prototype.foldSimpleDerived = function (
  this: Parser,
  base: AST.TypeSpecifier,
  derived: AST.DerivedDeclarator[],
): [AST.TypeSpecifier, AST.DerivedDeclarator[]] {
  // If derived contains any function-related declarators, pass it through
  const hasFunction = derived.some((d) => d.kind === 'Function' || d.kind === 'FunctionPointer')

  if (hasFunction) {
    return [base, [...derived]]
  }

  if (derived.length === 0) {
    return [base, []]
  }

  // Simple case: only Pointer and Array declarators. Fold into type_spec.
  let result: AST.TypeSpecifier = base
  let i = 0
  while (i < derived.length) {
    const d = derived[i]
    if (d.kind === 'Pointer') {
      result = { type: 'PointerType', base: result, addressSpace: 'Default' }
      i++
    } else if (d.kind === 'Array') {
      // Collect consecutive array dims, apply in reverse (innermost first)
      const start = i
      while (i < derived.length && derived[i].kind === 'Array') {
        i++
      }
      for (let j = i - 1; j >= start; j--) {
        const arrDecl = derived[j] as AST.ArrayDeclarator
        result = { type: 'ArrayType', element: result, size: arrDecl.size }
      }
    } else {
      i++
    }
  }
  return [result, []]
}

// === parseEnumVariants ===
// Parse enum variant declarations inside braces.

Parser.prototype.parseEnumVariants = function (this: Parser): AST.EnumVariant[] {
  const variants: AST.EnumVariant[] = []
  const open = this.peekSpan()
  this.expectContext(TokenKind.LBrace, 'for enum body')

  while (this.peek() !== TokenKind.RBrace && this.peek() !== TokenKind.Eof) {
    if (this.peek() === TokenKind.Identifier) {
      const name = (this.peekValue() as string) ?? ''
      this.advance()
      let value: AST.Expression | null = null
      if (this.consumeIf(TokenKind.Assign)) {
        value = this.parseAssignmentExpr()
      }
      variants.push({ name, value })
      this.consumeIf(TokenKind.Comma)
    } else {
      this.advance()
    }
  }

  this.expectClosing(TokenKind.RBrace, open)
  return variants
}

// === registerEnumConstants ===
// Register enum constant values from parsed variants into the parser's
// enumConstants map.

Parser.prototype.registerEnumConstants = function (
  this: Parser,
  variants: AST.EnumVariant[],
): void {
  let nextValue: number | null = 0
  for (const variant of variants) {
    let evaluated: number | null
    if (variant.value !== null) {
      const tagAligns = this.structTagAlignments.size > 0 ? this.structTagAlignments : null
      evaluated = Parser.evalConstIntExprWithEnums(variant.value, this.enumConstants, tagAligns)
    } else {
      evaluated = nextValue
    }
    if (evaluated !== null) {
      this.enumConstants.set(variant.name, evaluated)
      nextValue = evaluated + 1
    } else {
      // Value not evaluable at parse time
      this.unevaluableEnumConstants.add(variant.name)
      nextValue = null
    }
  }
}

// === parseVaArgType ===
// Parse a type-name for __builtin_va_arg: type-specifier + abstract declarator.

Parser.prototype.parseVaArgType = function (this: Parser): AST.TypeSpecifier {
  const typeSpec = this.parseTypeSpecifier()
  if (typeSpec !== null) {
    let resultType: AST.TypeSpecifier = typeSpec

    // Parse pointer declarators
    while (this.consumeIf(TokenKind.Star)) {
      resultType = { type: 'PointerType', base: resultType, addressSpace: 'Default' }
      this.skipCvQualifiers()
    }

    // Handle function pointer: type (*)(args)
    if (this.peek() === TokenKind.LParen) {
      const save2 = this.pos
      this.advance()
      if (this.consumeIf(TokenKind.Star)) {
        while (this.peek() !== TokenKind.RParen && this.peek() !== TokenKind.Eof) {
          this.advance()
        }
        this.consumeIf(TokenKind.RParen)
        if (this.peek() === TokenKind.LParen) {
          this.skipBalancedParens()
        }
        resultType = { type: 'PointerType', base: resultType, addressSpace: 'Default' }
      } else {
        this.pos = save2
      }
    }

    // Parse array dimensions
    while (this.peek() === TokenKind.LBracket) {
      const open = this.peekSpan()
      this.advance()
      let size: AST.Expression | null = null
      if (this.peek() !== TokenKind.RBracket) {
        size = this.parseExpr()
      }
      this.expectClosing(TokenKind.RBracket, open)
      resultType = { type: 'ArrayType', element: resultType, size }
    }

    return resultType
  }

  const span = this.peekSpan()
  this.emitError('expected type in __builtin_va_arg', span)
  return { type: 'IntType' }
}

// === parseAbstractDeclaratorSuffix ===
// Parse an abstract declarator suffix: pointer(s), parenthesized pointer groups,
// and array dimensions after a type name. Used by cast expressions, sizeof,
// typeof, and _Alignof.

Parser.prototype.parseAbstractDeclaratorSuffix = function (
  this: Parser,
  resultType: AST.TypeSpecifier,
): AST.TypeSpecifier {
  let result = resultType

  // Consume address space qualifiers that appear before the first '*'
  this.skipCvQualifiers()

  // Parse leading pointer(s)
  while (this.consumeIf(TokenKind.Star)) {
    const addrSpace = this.attrs.parsingAddressSpace
    this.attrs.parsingAddressSpace = 'Default'
    result = { type: 'PointerType', base: result, addressSpace: addrSpace }
    this.skipCvQualifiers()
  }

  // Handle parenthesized abstract declarators: (*), (*)(params), (*)[N], (*[3][4])
  if (this.peek() === TokenKind.LParen) {
    const save = this.pos
    const parenDecl = this.tryParseParenAbstractDeclarator()
    if (parenDecl !== null) {
      if (parenDecl.kind === 'Simple') {
        const { ptrDepth, arrayDims: innerArrayDims } = parenDecl

        if (this.peek() === TokenKind.LParen) {
          // Function pointer cast: (*)(params) or (**)(params)
          const [params, variadic] = this.parseParamList()
          result = {
            type: 'FunctionPointerType',
            returnType: result,
            params,
            variadic,
          }
          // Extra pointer levels for multi-indirection
          for (let k = 0; k < ptrDepth - 1; k++) {
            result = { type: 'PointerType', base: result, addressSpace: 'Default' }
          }
          // Wrap with inner array dims (for array of function pointers)
          for (let k = innerArrayDims.length - 1; k >= 0; k--) {
            result = { type: 'ArrayType', element: result, size: innerArrayDims[k] }
          }
        } else if (this.peek() === TokenKind.LBracket || innerArrayDims.length > 0) {
          // Pointer to array: (*)[N] or (*[3][4])[2]
          const outerDims: (AST.Expression | null)[] = []
          while (this.peek() === TokenKind.LBracket) {
            const openBracket = this.peekSpan()
            this.advance()
            let size: AST.Expression | null = null
            if (this.peek() !== TokenKind.RBracket) {
              size = this.parseExpr()
            }
            this.expectClosing(TokenKind.RBracket, openBracket)
            outerDims.push(size)
          }
          for (let k = outerDims.length - 1; k >= 0; k--) {
            result = { type: 'ArrayType', element: result, size: outerDims[k] }
          }
          for (let k = 0; k < ptrDepth; k++) {
            result = { type: 'PointerType', base: result, addressSpace: 'Default' }
          }
          for (let k = innerArrayDims.length - 1; k >= 0; k--) {
            result = { type: 'ArrayType', element: result, size: innerArrayDims[k] }
          }
        } else {
          for (let k = 0; k < ptrDepth; k++) {
            result = { type: 'PointerType', base: result, addressSpace: 'Default' }
          }
        }
      } else {
        // NestedFnPtr
        const { outerPtrDepth, innerPtrDepth, innerParams, innerVariadic } = parenDecl

        if (this.peek() === TokenKind.LParen) {
          const [outerParams, outerVariadic] = this.parseParamList()
          // Build the return type: function pointer returning base type
          for (let k = 0; k < innerPtrDepth - 1; k++) {
            result = { type: 'PointerType', base: result, addressSpace: 'Default' }
          }
          const returnFnType: AST.TypeSpecifier = {
            type: 'FunctionPointerType',
            returnType: result,
            params: outerParams,
            variadic: outerVariadic,
          }
          // Build the outer function: takes innerParams, returns returnFnType
          result = {
            type: 'FunctionPointerType',
            returnType: returnFnType,
            params: innerParams,
            variadic: innerVariadic,
          }
          // Apply extra outer pointer levels
          for (let k = 0; k < outerPtrDepth - 1; k++) {
            result = { type: 'PointerType', base: result, addressSpace: 'Default' }
          }
        } else {
          // No outer params - treat as simple pointer
          const total = outerPtrDepth + innerPtrDepth
          for (let k = 0; k < total; k++) {
            result = { type: 'PointerType', base: result, addressSpace: 'Default' }
          }
        }
      }
    } else {
      this.pos = save
    }
  }

  // Parse trailing array dimensions, collecting them first so we can
  // apply in reverse order.
  const arrayDims: (AST.Expression | null)[] = []
  while (this.peek() === TokenKind.LBracket) {
    const open = this.peekSpan()
    this.advance()
    let size: AST.Expression | null = null
    if (this.peek() !== TokenKind.RBracket) {
      size = this.parseExpr()
    }
    this.expectClosing(TokenKind.RBracket, open)
    arrayDims.push(size)
  }
  // Apply in reverse: innermost (rightmost) dimension wraps first
  for (let k = arrayDims.length - 1; k >= 0; k--) {
    result = { type: 'ArrayType', element: result, size: arrayDims[k] }
  }

  return result
}
