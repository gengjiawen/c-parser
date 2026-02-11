/**
 * Token kinds recognized by the C lexer.
 * Uses a numeric const enum for fast comparison (inlined at compile time).
 */
export const enum TokenKind {
  // Literals
  IntLiteral = 0,
  UIntLiteral = 1,
  LongLiteral = 2,
  ULongLiteral = 3,
  LongLongLiteral = 4,
  ULongLongLiteral = 5,
  FloatLiteral = 6,
  FloatLiteralF32 = 7,
  FloatLiteralLongDouble = 8,
  ImaginaryLiteral = 9,
  ImaginaryLiteralF32 = 10,
  ImaginaryLiteralLongDouble = 11,
  StringLiteral = 12,
  WideStringLiteral = 13,
  Char16StringLiteral = 14,
  CharLiteral = 15,

  // Identifiers
  Identifier = 16,

  // Keywords
  Auto = 17,
  Break = 18,
  Case = 19,
  Char = 20,
  Const = 21,
  Continue = 22,
  Default = 23,
  Do = 24,
  Double = 25,
  Else = 26,
  Enum = 27,
  Extern = 28,
  Float = 29,
  For = 30,
  Goto = 31,
  If = 32,
  Inline = 33,
  Int = 34,
  Long = 35,
  Register = 36,
  Restrict = 37,
  Return = 38,
  Short = 39,
  Signed = 40,
  Sizeof = 41,
  Static = 42,
  Struct = 43,
  Switch = 44,
  Typedef = 45,
  Union = 46,
  Unsigned = 47,
  Void = 48,
  Volatile = 49,
  While = 50,

  // C11 keywords
  Alignas = 51,
  Alignof = 52,
  Atomic = 53,
  Bool = 54,
  Complex = 55,
  Generic = 56,
  Imaginary = 57,
  Noreturn = 58,
  StaticAssert = 59,
  ThreadLocal = 60,

  // GCC extensions
  Typeof = 61,
  Asm = 62,
  Attribute = 63,
  Extension = 64,
  Builtin = 65,
  BuiltinVaArg = 66,
  BuiltinTypesCompatibleP = 67,
  Int128 = 68,
  UInt128 = 69,
  RealPart = 70,
  ImagPart = 71,
  AutoType = 72,
  GnuAlignof = 73,
  GnuLabel = 74,
  SegGs = 75,
  SegFs = 76,

  // Pragma tokens
  PragmaPackSet = 77,
  PragmaPackPush = 78,
  PragmaPackPushOnly = 79,
  PragmaPackPop = 80,
  PragmaPackReset = 81,
  PragmaVisibilityPush = 82,
  PragmaVisibilityPop = 83,

  // Punctuation
  LParen = 84,
  RParen = 85,
  LBrace = 86,
  RBrace = 87,
  LBracket = 88,
  RBracket = 89,
  Semicolon = 90,
  Comma = 91,
  Dot = 92,
  Arrow = 93,
  Ellipsis = 94,

  // Operators
  Plus = 95,
  Minus = 96,
  Star = 97,
  Slash = 98,
  Percent = 99,
  Amp = 100,
  Pipe = 101,
  Caret = 102,
  Tilde = 103,
  Bang = 104,
  Assign = 105,
  Less = 106,
  Greater = 107,
  Question = 108,
  Colon = 109,

  // Compound operators
  PlusPlus = 110,
  MinusMinus = 111,
  PlusAssign = 112,
  MinusAssign = 113,
  StarAssign = 114,
  SlashAssign = 115,
  PercentAssign = 116,
  AmpAssign = 117,
  PipeAssign = 118,
  CaretAssign = 119,
  LessLess = 120,
  GreaterGreater = 121,
  LessLessAssign = 122,
  GreaterGreaterAssign = 123,
  EqualEqual = 124,
  BangEqual = 125,
  LessEqual = 126,
  GreaterEqual = 127,
  AmpAmp = 128,
  PipePipe = 129,
  Hash = 130,
  HashHash = 131,

  // Special
  Eof = 132,
}

/**
 * Source span (byte offsets into the source string).
 */
export interface Span {
  start: number
  end: number
}

export function dummySpan(): Span {
  return { start: 0, end: 0 }
}

/**
 * A token with its kind and source location.
 * Tokens that carry values (literals, identifiers) use the value/bigValue fields.
 */
export interface Token {
  kind: TokenKind
  start: number
  end: number
  value?: string | number
  bigValue?: bigint
}

/**
 * Convert a keyword string to its token kind.
 * When `gnuExtensions` is false (strict C standard mode, e.g. -std=c99),
 * bare GNU keywords like `typeof` and `asm` are treated as identifiers.
 * The double-underscore forms (`__typeof__`, `__asm__`) are always keywords.
 *
 * Uses a two-stage filter to quickly reject non-keywords:
 * Stage 1: reject by length (keywords are 2-17 or 28 chars).
 * Stage 2: reject by first character (only 16 possible first chars).
 */
export function keywordFromString(s: string, gnuExtensions: boolean): TokenKind | undefined {
  const len = s.length
  if (len < 2 || (len > 17 && len !== 28)) {
    return undefined
  }

  const first = s.charCodeAt(0)
  // Fast reject: keywords only start with _ a b c d e f g i l r s t u v w
  if (
    first !== 0x5f /* _ */ &&
    first !== 0x61 /* a */ &&
    first !== 0x62 /* b */ &&
    first !== 0x63 /* c */ &&
    first !== 0x64 /* d */ &&
    first !== 0x65 /* e */ &&
    first !== 0x66 /* f */ &&
    first !== 0x67 /* g */ &&
    first !== 0x69 /* i */ &&
    first !== 0x6c /* l */ &&
    first !== 0x72 /* r */ &&
    first !== 0x73 /* s */ &&
    first !== 0x74 /* t */ &&
    first !== 0x75 /* u */ &&
    first !== 0x76 /* v */ &&
    first !== 0x77 /* w */
  ) {
    return undefined
  }

  switch (s) {
    case 'auto':
      return TokenKind.Auto
    case 'break':
      return TokenKind.Break
    case 'case':
      return TokenKind.Case
    case 'char':
      return TokenKind.Char
    case 'const':
      return TokenKind.Const
    case 'continue':
      return TokenKind.Continue
    case 'default':
      return TokenKind.Default
    case 'do':
      return TokenKind.Do
    case 'double':
      return TokenKind.Double
    case 'else':
      return TokenKind.Else
    case 'enum':
      return TokenKind.Enum
    case 'extern':
      return TokenKind.Extern
    case 'float':
      return TokenKind.Float
    case 'for':
      return TokenKind.For
    case 'goto':
      return TokenKind.Goto
    case 'if':
      return TokenKind.If
    case 'inline':
      return TokenKind.Inline
    case 'int':
      return TokenKind.Int
    case 'long':
      return TokenKind.Long
    case 'register':
      return TokenKind.Register
    case 'restrict':
      return TokenKind.Restrict
    case 'return':
      return TokenKind.Return
    case 'short':
      return TokenKind.Short
    case 'signed':
      return TokenKind.Signed
    case 'sizeof':
      return TokenKind.Sizeof
    case 'static':
      return TokenKind.Static
    case 'struct':
      return TokenKind.Struct
    case 'switch':
      return TokenKind.Switch
    case 'typedef':
      return TokenKind.Typedef
    case 'union':
      return TokenKind.Union
    case 'unsigned':
      return TokenKind.Unsigned
    case 'void':
      return TokenKind.Void
    case 'volatile':
    case '__volatile__':
    case '__volatile':
      return TokenKind.Volatile
    case '__const':
    case '__const__':
      return TokenKind.Const
    case '__inline':
    case '__inline__':
      return TokenKind.Inline
    case '__restrict':
    case '__restrict__':
      return TokenKind.Restrict
    case '__signed__':
      return TokenKind.Signed
    case 'while':
      return TokenKind.While
    case '_Alignas':
      return TokenKind.Alignas
    case '_Alignof':
      return TokenKind.Alignof
    case '_Atomic':
      return TokenKind.Atomic
    case '_Bool':
      return TokenKind.Bool
    case '_Complex':
    case '__complex__':
    case '__complex':
      return TokenKind.Complex
    case '_Generic':
      return TokenKind.Generic
    case '_Imaginary':
      return TokenKind.Imaginary
    case '_Noreturn':
    case '__noreturn__':
      return TokenKind.Noreturn
    case '_Static_assert':
    case 'static_assert':
      return TokenKind.StaticAssert
    case '_Thread_local':
    case '__thread':
      return TokenKind.ThreadLocal
    case 'typeof':
      return gnuExtensions ? TokenKind.Typeof : undefined
    case '__typeof__':
    case '__typeof':
      return TokenKind.Typeof
    case 'asm':
      return gnuExtensions ? TokenKind.Asm : undefined
    case '__asm__':
    case '__asm':
      return TokenKind.Asm
    case '__attribute__':
    case '__attribute':
      return TokenKind.Attribute
    case '__extension__':
      return TokenKind.Extension
    case '__builtin_va_list':
      return TokenKind.Builtin
    case '__builtin_va_arg':
      return TokenKind.BuiltinVaArg
    case '__builtin_types_compatible_p':
      return TokenKind.BuiltinTypesCompatibleP
    case '__int128':
    case '__int128_t':
      return TokenKind.Int128
    case '__uint128_t':
      return TokenKind.UInt128
    case '__real__':
    case '__real':
      return TokenKind.RealPart
    case '__imag__':
    case '__imag':
      return TokenKind.ImagPart
    case '__auto_type':
      return TokenKind.AutoType
    case '__alignof':
    case '__alignof__':
      return TokenKind.GnuAlignof
    case '__label__':
      return TokenKind.GnuLabel
    case '__seg_gs':
      return TokenKind.SegGs
    case '__seg_fs':
      return TokenKind.SegFs
    default:
      return undefined
  }
}
