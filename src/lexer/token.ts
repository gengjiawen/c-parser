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
  BuiltinOffsetof = 68,
  Int128 = 69,
  UInt128 = 70,
  RealPart = 71,
  ImagPart = 72,
  AutoType = 73,
  GnuAlignof = 74,
  GnuLabel = 75,
  SegGs = 76,
  SegFs = 77,

  // Pragma tokens
  PragmaPackSet = 78,
  PragmaPackPush = 79,
  PragmaPackPushOnly = 80,
  PragmaPackPop = 81,
  PragmaPackReset = 82,
  PragmaVisibilityPush = 83,
  PragmaVisibilityPop = 84,

  // Punctuation
  LParen = 85,
  RParen = 86,
  LBrace = 87,
  RBrace = 88,
  LBracket = 89,
  RBracket = 90,
  Semicolon = 91,
  Comma = 92,
  Dot = 93,
  Arrow = 94,
  Ellipsis = 95,

  // Operators
  Plus = 96,
  Minus = 97,
  Star = 98,
  Slash = 99,
  Percent = 100,
  Amp = 101,
  Pipe = 102,
  Caret = 103,
  Tilde = 104,
  Bang = 105,
  Assign = 106,
  Less = 107,
  Greater = 108,
  Question = 109,
  Colon = 110,

  // Compound operators
  PlusPlus = 111,
  MinusMinus = 112,
  PlusAssign = 113,
  MinusAssign = 114,
  StarAssign = 115,
  SlashAssign = 116,
  PercentAssign = 117,
  AmpAssign = 118,
  PipeAssign = 119,
  CaretAssign = 120,
  LessLess = 121,
  GreaterGreater = 122,
  LessLessAssign = 123,
  GreaterGreaterAssign = 124,
  EqualEqual = 125,
  BangEqual = 126,
  LessEqual = 127,
  GreaterEqual = 128,
  AmpAmp = 129,
  PipePipe = 130,
  Hash = 131,
  HashHash = 132,

  // Special
  Eof = 133,
  /**
   * C11 6.4p1's last preprocessing-token category: "each non-white-space
   * character that cannot be one of the above" (`\`, `@`, a backtick, a
   * stray byte). It has no place in the C grammar, but it *is* a token, so
   * `#` must stringify its spelling (6.10.3.2p2) and `##` must refuse to
   * paste it. The spelling is always the single source character; read it
   * from the span. Numbered after Eof so the punctuation range that
   * tokenStaticSpelling() keys on stays contiguous.
   */
  Stray = 134,
}

/**
 * Per-token bit flags, used by the preprocessor.
 * Absent (undefined) flags read as 0.
 */
export const enum TokenFlags {
  /** First token on a (logical) line; a `#` with BOL starts a directive. */
  BOL = 1,
  /** Whitespace or a comment precedes this token (spacing for stringify). */
  SpaceBefore = 2,
  /** Token created by the preprocessor (e.g. `##` paste); spelling in value. */
  Synthetic = 4,
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
  /** TokenFlags bit set; absent means 0. */
  flags?: number
  /** Macro names this token must never expand as (preprocessor blue paint). */
  noExpand?: Set<string>
  /**
   * Exact source spelling, present only when it cannot be recovered
   * otherwise: macro-expansion clones carry the call-site span (not the
   * span of the text that spelled them), and `##`-pasted or stringified
   * tokens never had source text at all.
   */
  spelling?: string
}

/**
 * Human-readable display name for each token kind, for diagnostics.
 * TokenKind is a const enum (no runtime reverse mapping), so this table is
 * written by hand; `satisfies Record<TokenKind, string>` keeps it exhaustive.
 */
const TOKEN_KIND_NAMES = {
  [TokenKind.IntLiteral]: 'integer literal',
  [TokenKind.UIntLiteral]: 'integer literal',
  [TokenKind.LongLiteral]: 'integer literal',
  [TokenKind.ULongLiteral]: 'integer literal',
  [TokenKind.LongLongLiteral]: 'integer literal',
  [TokenKind.ULongLongLiteral]: 'integer literal',
  [TokenKind.FloatLiteral]: 'floating literal',
  [TokenKind.FloatLiteralF32]: 'floating literal',
  [TokenKind.FloatLiteralLongDouble]: 'floating literal',
  [TokenKind.ImaginaryLiteral]: 'imaginary literal',
  [TokenKind.ImaginaryLiteralF32]: 'imaginary literal',
  [TokenKind.ImaginaryLiteralLongDouble]: 'imaginary literal',
  [TokenKind.StringLiteral]: 'string literal',
  [TokenKind.WideStringLiteral]: 'wide string literal',
  [TokenKind.Char16StringLiteral]: 'string literal',
  [TokenKind.CharLiteral]: 'character literal',
  [TokenKind.Identifier]: 'identifier',
  [TokenKind.Auto]: 'auto',
  [TokenKind.Break]: 'break',
  [TokenKind.Case]: 'case',
  [TokenKind.Char]: 'char',
  [TokenKind.Const]: 'const',
  [TokenKind.Continue]: 'continue',
  [TokenKind.Default]: 'default',
  [TokenKind.Do]: 'do',
  [TokenKind.Double]: 'double',
  [TokenKind.Else]: 'else',
  [TokenKind.Enum]: 'enum',
  [TokenKind.Extern]: 'extern',
  [TokenKind.Float]: 'float',
  [TokenKind.For]: 'for',
  [TokenKind.Goto]: 'goto',
  [TokenKind.If]: 'if',
  [TokenKind.Inline]: 'inline',
  [TokenKind.Int]: 'int',
  [TokenKind.Long]: 'long',
  [TokenKind.Register]: 'register',
  [TokenKind.Restrict]: 'restrict',
  [TokenKind.Return]: 'return',
  [TokenKind.Short]: 'short',
  [TokenKind.Signed]: 'signed',
  [TokenKind.Sizeof]: 'sizeof',
  [TokenKind.Static]: 'static',
  [TokenKind.Struct]: 'struct',
  [TokenKind.Switch]: 'switch',
  [TokenKind.Typedef]: 'typedef',
  [TokenKind.Union]: 'union',
  [TokenKind.Unsigned]: 'unsigned',
  [TokenKind.Void]: 'void',
  [TokenKind.Volatile]: 'volatile',
  [TokenKind.While]: 'while',
  [TokenKind.Alignas]: '_Alignas',
  [TokenKind.Alignof]: '_Alignof',
  [TokenKind.Atomic]: '_Atomic',
  [TokenKind.Bool]: '_Bool',
  [TokenKind.Complex]: '_Complex',
  [TokenKind.Generic]: '_Generic',
  [TokenKind.Imaginary]: '_Imaginary',
  [TokenKind.Noreturn]: '_Noreturn',
  [TokenKind.StaticAssert]: '_Static_assert',
  [TokenKind.ThreadLocal]: '_Thread_local',
  [TokenKind.Typeof]: 'typeof',
  [TokenKind.Asm]: 'asm',
  [TokenKind.Attribute]: '__attribute__',
  [TokenKind.Extension]: '__extension__',
  [TokenKind.Builtin]: '__builtin_va_list',
  [TokenKind.BuiltinVaArg]: '__builtin_va_arg',
  [TokenKind.BuiltinTypesCompatibleP]: '__builtin_types_compatible_p',
  [TokenKind.BuiltinOffsetof]: '__builtin_offsetof',
  [TokenKind.Int128]: '__int128',
  [TokenKind.UInt128]: '__uint128_t',
  [TokenKind.RealPart]: '__real__',
  [TokenKind.ImagPart]: '__imag__',
  [TokenKind.AutoType]: '__auto_type',
  [TokenKind.GnuAlignof]: '__alignof__',
  [TokenKind.GnuLabel]: '__label__',
  [TokenKind.SegGs]: '__seg_gs',
  [TokenKind.SegFs]: '__seg_fs',
  [TokenKind.PragmaPackSet]: '#pragma pack',
  [TokenKind.PragmaPackPush]: '#pragma pack(push)',
  [TokenKind.PragmaPackPushOnly]: '#pragma pack(push)',
  [TokenKind.PragmaPackPop]: '#pragma pack(pop)',
  [TokenKind.PragmaPackReset]: '#pragma pack()',
  [TokenKind.PragmaVisibilityPush]: '#pragma GCC visibility push',
  [TokenKind.PragmaVisibilityPop]: '#pragma GCC visibility pop',
  [TokenKind.LParen]: '(',
  [TokenKind.RParen]: ')',
  [TokenKind.LBrace]: '{',
  [TokenKind.RBrace]: '}',
  [TokenKind.LBracket]: '[',
  [TokenKind.RBracket]: ']',
  [TokenKind.Semicolon]: ';',
  [TokenKind.Comma]: ',',
  [TokenKind.Dot]: '.',
  [TokenKind.Arrow]: '->',
  [TokenKind.Ellipsis]: '...',
  [TokenKind.Plus]: '+',
  [TokenKind.Minus]: '-',
  [TokenKind.Star]: '*',
  [TokenKind.Slash]: '/',
  [TokenKind.Percent]: '%',
  [TokenKind.Amp]: '&',
  [TokenKind.Pipe]: '|',
  [TokenKind.Caret]: '^',
  [TokenKind.Tilde]: '~',
  [TokenKind.Bang]: '!',
  [TokenKind.Assign]: '=',
  [TokenKind.Less]: '<',
  [TokenKind.Greater]: '>',
  [TokenKind.Question]: '?',
  [TokenKind.Colon]: ':',
  [TokenKind.PlusPlus]: '++',
  [TokenKind.MinusMinus]: '--',
  [TokenKind.PlusAssign]: '+=',
  [TokenKind.MinusAssign]: '-=',
  [TokenKind.StarAssign]: '*=',
  [TokenKind.SlashAssign]: '/=',
  [TokenKind.PercentAssign]: '%=',
  [TokenKind.AmpAssign]: '&=',
  [TokenKind.PipeAssign]: '|=',
  [TokenKind.CaretAssign]: '^=',
  [TokenKind.LessLess]: '<<',
  [TokenKind.GreaterGreater]: '>>',
  [TokenKind.LessLessAssign]: '<<=',
  [TokenKind.GreaterGreaterAssign]: '>>=',
  [TokenKind.EqualEqual]: '==',
  [TokenKind.BangEqual]: '!=',
  [TokenKind.LessEqual]: '<=',
  [TokenKind.GreaterEqual]: '>=',
  [TokenKind.AmpAmp]: '&&',
  [TokenKind.PipePipe]: '||',
  [TokenKind.Hash]: '#',
  [TokenKind.HashHash]: '##',
  [TokenKind.Eof]: 'end of file',
  [TokenKind.Stray]: 'stray character',
} satisfies Record<TokenKind, string>

export function tokenKindName(kind: TokenKind): string {
  return (TOKEN_KIND_NAMES as Record<number, string>)[kind] ?? `token#${kind}`
}

/**
 * The fixed source spelling for kinds whose spelling never varies (keywords,
 * punctuation, operators). Returns undefined for kinds whose spelling depends
 * on the token instance (literals, identifiers, pragma tokens, Eof) — read
 * those from the token's value or source span instead.
 */
export function tokenStaticSpelling(kind: TokenKind): string | undefined {
  if (
    (kind >= TokenKind.Auto && kind <= TokenKind.SegFs) ||
    (kind >= TokenKind.LParen && kind <= TokenKind.HashHash)
  ) {
    return (TOKEN_KIND_NAMES as Record<number, string>)[kind]
  }
  return undefined
}

/**
 * Convert a keyword string to its token kind.
 * When `gnuExtensions` is false (strict C standard mode, e.g. -std=c99),
 * bare GNU keywords like `typeof` and `asm` are treated as identifiers.
 * The double-underscore forms (`__typeof__`, `__asm__`) are always keywords.
 *
 * Uses a two-stage filter to quickly reject non-keywords:
 * Stage 1: reject by length (keywords are 2-18 or 28 chars).
 * Stage 2: reject by first character (only 16 possible first chars).
 */
export function keywordFromString(s: string, gnuExtensions: boolean): TokenKind | undefined {
  const len = s.length
  if (len < 2 || (len > 18 && len !== 28)) {
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
    case '__builtin_offsetof':
      return TokenKind.BuiltinOffsetof
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
