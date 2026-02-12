import { TokenKind, Token, keywordFromString } from './token'

// Character code constants
const CH_0 = 0x30 // '0'
const CH_7 = 0x37 // '7'
const CH_9 = 0x39 // '9'
const CH_A = 0x41 // 'A'
const CH_B = 0x42
const CH_E = 0x45
const CH_F = 0x46
const CH_I = 0x49
const CH_J = 0x4a
const CH_L = 0x4c
const CH_P = 0x50
const CH_U = 0x55
const CH_X = 0x58
const CH_a = 0x61 // 'a'
const CH_b = 0x62
const CH_e = 0x65
const CH_f = 0x66
const CH_i = 0x69
const CH_j = 0x6a
const CH_l = 0x6c
const CH_n = 0x6e
const CH_p = 0x70
const CH_r = 0x72
const CH_t = 0x74
const CH_u = 0x75
const CH_v = 0x76
const CH_x = 0x78
const CH_DQUOTE = 0x22 // '"'
const CH_SQUOTE = 0x27 // "'"
const CH_BSLASH = 0x5c // '\'
const CH_UNDERSCORE = 0x5f // '_'
const CH_DOLLAR = 0x24 // '$'
const CH_DOT = 0x2e // '.'
const CH_HASH = 0x23 // '#'
const CH_SLASH = 0x2f // '/'
const CH_STAR = 0x2a // '*'
const CH_NEWLINE = 0x0a // '\n'
const CH_SPACE = 0x20 // ' '
const CH_PLUS = 0x2b
const CH_MINUS = 0x2d
const CH_LPAREN = 0x28
const CH_RPAREN = 0x29
const CH_LBRACE = 0x7b
const CH_RBRACE = 0x7d
const CH_LBRACKET = 0x5b
const CH_RBRACKET = 0x5d
const CH_SEMICOLON = 0x3b
const CH_COMMA = 0x2c
const CH_TILDE = 0x7e
const CH_QUESTION = 0x3f
const CH_COLON = 0x3a
const CH_PERCENT = 0x25
const CH_AMP = 0x26
const CH_PIPE = 0x7c
const CH_CARET = 0x5e
const CH_BANG = 0x21
const CH_EQUAL = 0x3d
const CH_LESS = 0x3c
const CH_GREATER = 0x3e

const MAX_SAFE = Number.MAX_SAFE_INTEGER

function isDigit(c: number): boolean {
  return c >= CH_0 && c <= CH_9
}

function isHexDigit(c: number): boolean {
  return (c >= CH_0 && c <= CH_9) || (c >= CH_a && c <= CH_f) || (c >= CH_A && c <= CH_F)
}

function isAlpha(c: number): boolean {
  return (c >= CH_a && c <= 0x7a) || (c >= CH_A && c <= 0x5a)
}

function isAlphanumeric(c: number): boolean {
  return isAlpha(c) || isDigit(c)
}

function isIdentStart(c: number): boolean {
  return c === CH_UNDERSCORE || c === CH_DOLLAR || isAlpha(c)
}

function isIdentContinue(c: number): boolean {
  return c === CH_UNDERSCORE || c === CH_DOLLAR || isAlphanumeric(c)
}

function isWhitespace(c: number): boolean {
  return c === CH_SPACE || c === 0x09 || c === CH_NEWLINE || c === 0x0d || c === 0x0c || c === 0x0b
}

function hexDigitVal(c: number): number {
  if (c >= CH_0 && c <= CH_9) return c - CH_0
  if (c >= CH_a && c <= CH_f) return c - CH_a + 10
  if (c >= CH_A && c <= CH_F) return c - CH_A + 10
  return 0
}

/**
 * C lexer that tokenizes source input with source locations.
 * Operates on the source string via charCodeAt() for performance.
 */
export class Scanner {
  private src: string
  private len: number
  private pos: number
  private gnuExtensions: boolean

  constructor(source: string, gnuExtensions: boolean = true) {
    this.src = source
    this.len = source.length
    this.pos = 0
    this.gnuExtensions = gnuExtensions
  }

  /**
   * Eagerly scan the entire source and return all tokens (including Eof).
   */
  scan(): Token[] {
    // Estimate ~1 token per 5 chars of source
    const tokens: Token[] = []
    for (;;) {
      const tok = this.nextToken()
      tokens.push(tok)
      if (tok.kind === TokenKind.Eof) {
        break
      }
    }
    return tokens
  }

  private ch(): number {
    return this.src.charCodeAt(this.pos)
  }

  private chAt(i: number): number {
    return this.src.charCodeAt(i)
  }

  private nextToken(): Token {
    this.skipWhitespaceAndComments()

    if (this.pos >= this.len) {
      return { kind: TokenKind.Eof, start: this.pos, end: this.pos }
    }

    const start = this.pos
    const c = this.ch()

    // Number literals
    if (
      isDigit(c) ||
      (c === CH_DOT && this.pos + 1 < this.len && isDigit(this.chAt(this.pos + 1)))
    ) {
      return this.lexNumber(start)
    }

    // String literals
    if (c === CH_DQUOTE) {
      return this.lexString(start)
    }

    // Character literals
    if (c === CH_SQUOTE) {
      return this.lexChar(start)
    }

    // Identifiers and keywords
    if (isIdentStart(c)) {
      return this.lexIdentifier(start)
    }

    // Punctuation and operators
    return this.lexPunctuation(start)
  }

  // --- Whitespace and comment skipping ---
  private skipWhitespaceAndComments(): void {
    for (;;) {
      // Skip whitespace
      while (this.pos < this.len && isWhitespace(this.ch())) {
        this.pos++
      }

      if (this.pos >= this.len) return

      // Skip GCC-style line markers: # <number> "filename"
      if (this.ch() === CH_HASH && this.isLineMarker()) {
        while (this.pos < this.len && this.ch() !== CH_NEWLINE) {
          this.pos++
        }
        continue
      }

      // Skip line comments
      if (
        this.pos + 1 < this.len &&
        this.ch() === CH_SLASH &&
        this.chAt(this.pos + 1) === CH_SLASH
      ) {
        while (this.pos < this.len && this.ch() !== CH_NEWLINE) {
          this.pos++
        }
        continue
      }

      // Skip block comments
      if (
        this.pos + 1 < this.len &&
        this.ch() === CH_SLASH &&
        this.chAt(this.pos + 1) === CH_STAR
      ) {
        this.pos += 2
        while (this.pos + 1 < this.len) {
          if (this.ch() === CH_STAR && this.chAt(this.pos + 1) === CH_SLASH) {
            this.pos += 2
            break
          }
          this.pos++
        }
        continue
      }

      break
    }
  }

  private isLineMarker(): boolean {
    if (this.pos >= this.len || this.ch() !== CH_HASH) return false
    // '#' must be at the start of a line
    if (this.pos > 0 && this.chAt(this.pos - 1) !== CH_NEWLINE) return false
    // Next non-space char must be a digit
    let j = this.pos + 1
    while (j < this.len && this.chAt(j) === CH_SPACE) {
      j++
    }
    return j < this.len && isDigit(this.chAt(j))
  }

  // --- Number lexing ---
  private lexNumber(start: number): Token {
    // Hex: 0x / 0X
    if (
      this.pos + 1 < this.len &&
      this.ch() === CH_0 &&
      (this.chAt(this.pos + 1) === CH_x || this.chAt(this.pos + 1) === CH_X)
    ) {
      return this.lexHexNumber(start)
    }
    // Binary: 0b / 0B
    if (
      this.pos + 1 < this.len &&
      this.ch() === CH_0 &&
      (this.chAt(this.pos + 1) === CH_b || this.chAt(this.pos + 1) === CH_B)
    ) {
      return this.lexBinaryNumber(start)
    }
    // Octal: 0 followed by digit
    const octTok = this.lexOctalNumber(start)
    if (octTok !== null) {
      return octTok
    }
    // Decimal integer or float
    return this.lexDecimalNumber(start)
  }

  private lexHexNumber(start: number): Token {
    this.pos += 2 // skip 0x/0X
    const hexStart = this.pos
    while (this.pos < this.len && isHexDigit(this.ch())) {
      this.pos++
    }

    // Check for hex float: 0x<digits>.<digits>p<exp> or 0x<digits>p<exp>
    const hasDot = this.pos < this.len && this.ch() === CH_DOT
    let afterDotHasP = false
    if (hasDot) {
      let look = this.pos + 1
      while (look < this.len && isHexDigit(this.chAt(look))) {
        look++
      }
      afterDotHasP = look < this.len && (this.chAt(look) === CH_p || this.chAt(look) === CH_P)
    }
    const hasP = this.pos < this.len && (this.ch() === CH_p || this.ch() === CH_P)

    if ((hasDot && afterDotHasP) || hasP) {
      return this.lexHexFloat(start, hexStart, hasDot)
    }

    // Regular hex integer
    const hexStr = this.src.substring(hexStart, this.pos)
    const value = hexStr.length > 0 ? parseBigHex(hexStr) : 0n
    return this.finishIntLiteral(value, true, start)
  }

  private lexHexFloat(start: number, hexStart: number, hasDot: boolean): Token {
    const intHex = this.src.substring(hexStart, this.pos)

    let fracHex = ''
    if (hasDot) {
      this.pos++ // skip '.'
      const fracStart = this.pos
      while (this.pos < this.len && isHexDigit(this.ch())) {
        this.pos++
      }
      fracHex = this.src.substring(fracStart, this.pos)
    }

    // Parse 'p'/'P' exponent (mandatory for hex floats)
    let exp = 0
    if (this.pos < this.len && (this.ch() === CH_p || this.ch() === CH_P)) {
      this.pos++
      let expNeg = false
      if (this.pos < this.len && this.ch() === CH_MINUS) {
        this.pos++
        expNeg = true
      } else if (this.pos < this.len && this.ch() === CH_PLUS) {
        this.pos++
      }
      const expStart = this.pos
      while (this.pos < this.len && isDigit(this.ch())) {
        this.pos++
      }
      const expStr = this.src.substring(expStart, this.pos)
      const e = parseInt(expStr, 10) || 0
      exp = expNeg ? -e : e
    }

    // Convert hex float to f64: value = (int_part + frac_part) * 2^exp
    const intVal = intHex.length > 0 ? parseInt(intHex, 16) : 0
    let fracVal = 0
    if (fracHex.length > 0) {
      const fracInt = parseInt(fracHex, 16)
      fracVal = fracInt / Math.pow(16, fracHex.length)
    }
    const value = (intVal + fracVal) * Math.pow(2, exp)

    // Check float suffix
    const floatKind = this.parseSimpleFloatSuffix()
    if (floatKind === 1) {
      return { kind: TokenKind.FloatLiteralF32, start, end: this.pos, value }
    } else if (floatKind === 2) {
      // Long double: store as f64 approximation
      return { kind: TokenKind.FloatLiteralLongDouble, start, end: this.pos, value }
    }
    return { kind: TokenKind.FloatLiteral, start, end: this.pos, value }
  }

  /** Parse a simple float suffix (f/F -> 1, l/L -> 2, else 0). No imaginary handling. */
  private parseSimpleFloatSuffix(): number {
    if (this.pos < this.len && (this.ch() === CH_f || this.ch() === CH_F)) {
      this.pos++
      return 1
    }
    if (this.pos < this.len && (this.ch() === CH_l || this.ch() === CH_L)) {
      this.pos++
      return 2
    }
    return 0
  }

  private lexBinaryNumber(start: number): Token {
    this.pos += 2 // skip 0b/0B
    const binStart = this.pos
    while (this.pos < this.len && (this.ch() === CH_0 || this.ch() === 0x31) /* '1' */) {
      this.pos++
    }
    const binStr = this.src.substring(binStart, this.pos)
    const value = binStr.length > 0 ? parseBigBin(binStr) : 0n
    return this.finishIntLiteral(value, true, start)
  }

  private lexOctalNumber(start: number): Token | null {
    if (this.ch() !== CH_0) return null
    if (this.pos + 1 >= this.len || !isDigit(this.chAt(this.pos + 1))) return null

    const savedPos = this.pos
    this.pos++ // skip leading '0'
    const octStart = this.pos
    while (this.pos < this.len && this.ch() >= CH_0 && this.ch() <= CH_7) {
      this.pos++
    }

    // Float indicator or non-octal digit -> backtrack to decimal.
    // But '.' followed by '..' is ellipsis, not a decimal point -- keep the octal.
    if (this.pos < this.len) {
      const c = this.ch()
      if (c === CH_DOT || c === CH_e || c === CH_E || c === 0x38 /* '8' */ || c === CH_9) {
        const isEllipsis =
          c === CH_DOT &&
          this.pos + 2 < this.len &&
          this.chAt(this.pos + 1) === CH_DOT &&
          this.chAt(this.pos + 2) === CH_DOT
        if (!isEllipsis) {
          this.pos = savedPos
          return null
        }
      }
    }

    const octStr = this.src.substring(octStart, this.pos)
    const value = octStr.length > 0 ? parseBigOct(octStr) : 0n
    return this.finishIntLiteral(value, true, start)
  }

  private lexDecimalNumber(start: number): Token {
    let isFloat = false
    while (this.pos < this.len && isDigit(this.ch())) {
      this.pos++
    }

    // Check for decimal point, but NOT if it's the start of '...' (ellipsis).
    if (
      this.pos < this.len &&
      this.ch() === CH_DOT &&
      !(
        this.pos + 2 < this.len &&
        this.chAt(this.pos + 1) === CH_DOT &&
        this.chAt(this.pos + 2) === CH_DOT
      )
    ) {
      isFloat = true
      this.pos++
      while (this.pos < this.len && isDigit(this.ch())) {
        this.pos++
      }
    }

    // Exponent
    if (this.pos < this.len && (this.ch() === CH_e || this.ch() === CH_E)) {
      isFloat = true
      this.pos++
      if (this.pos < this.len && (this.ch() === CH_PLUS || this.ch() === CH_MINUS)) {
        this.pos++
      }
      while (this.pos < this.len && isDigit(this.ch())) {
        this.pos++
      }
    }

    const numEnd = this.pos

    if (isFloat) {
      const { floatKind, isImaginary } = this.parseFloatSuffix()
      const text = this.src.substring(start, numEnd)
      return this.makeFloatToken(text, floatKind, isImaginary, start)
    }

    // Integer
    const text = this.src.substring(start, numEnd)
    const uvalue = parseBigDec(text)
    return this.finishIntLiteral(uvalue, false, start)
  }

  /**
   * Parse float suffix with imaginary support (GCC extension).
   * Returns { floatKind, isImaginary } where floatKind: 0=double, 1=float, 2=long double.
   */
  private parseFloatSuffix(): { floatKind: number; isImaginary: boolean } {
    let isImaginary = false
    let floatKind: number

    if (this.pos < this.len && (this.ch() === CH_f || this.ch() === CH_F)) {
      this.pos++
      if (this.pos < this.len && (this.ch() === CH_i || this.ch() === CH_I)) {
        this.pos++
        isImaginary = true
      }
      floatKind = 1
    } else if (this.pos < this.len && (this.ch() === CH_l || this.ch() === CH_L)) {
      this.pos++
      if (this.pos < this.len && (this.ch() === CH_i || this.ch() === CH_I)) {
        this.pos++
        isImaginary = true
      }
      floatKind = 2
    } else if (this.pos < this.len && (this.ch() === CH_i || this.ch() === CH_I)) {
      this.pos++
      isImaginary = true
      if (this.pos < this.len && (this.ch() === CH_f || this.ch() === CH_F)) {
        this.pos++
        floatKind = 1
      } else if (this.pos < this.len && (this.ch() === CH_l || this.ch() === CH_L)) {
        this.pos++
        floatKind = 2
      } else {
        floatKind = 0
      }
    } else {
      floatKind = 0
    }

    // Also consume trailing 'j'/'J' suffix (C99/GCC alternative for imaginary)
    if (!isImaginary && this.pos < this.len && (this.ch() === CH_j || this.ch() === CH_J)) {
      this.pos++
      isImaginary = true
    }

    return { floatKind, isImaginary }
  }

  private makeFloatToken(
    text: string,
    floatKind: number,
    isImaginary: boolean,
    start: number,
  ): Token {
    const value = parseFloat(text) || 0.0
    if (isImaginary) {
      if (floatKind === 1) {
        return { kind: TokenKind.ImaginaryLiteralF32, start, end: this.pos, value }
      } else if (floatKind === 2) {
        return { kind: TokenKind.ImaginaryLiteralLongDouble, start, end: this.pos, value }
      }
      return { kind: TokenKind.ImaginaryLiteral, start, end: this.pos, value }
    }
    if (floatKind === 1) {
      return { kind: TokenKind.FloatLiteralF32, start, end: this.pos, value }
    } else if (floatKind === 2) {
      return { kind: TokenKind.FloatLiteralLongDouble, start, end: this.pos, value }
    }
    return { kind: TokenKind.FloatLiteral, start, end: this.pos, value }
  }

  /**
   * Parse integer suffix: (is_unsigned, is_long, is_long_long, is_imaginary).
   */
  private parseIntSuffix(): {
    isUnsigned: boolean
    isLong: boolean
    isLongLong: boolean
    isImaginary: boolean
  } {
    let isImaginary = false

    // First check for standalone 'i'/'I' imaginary suffix (GCC extension: 5i, 5I)
    if (this.pos < this.len && (this.ch() === CH_i || this.ch() === CH_I)) {
      const next = this.pos + 1 < this.len ? this.chAt(this.pos + 1) : 0
      if (!isAlphanumeric(next) && next !== CH_UNDERSCORE) {
        this.pos++
        return { isUnsigned: false, isLong: false, isLongLong: false, isImaginary: true }
      }
    }

    let isUnsigned = false
    let isLong = false
    let isLongLong = false

    for (;;) {
      if (this.pos < this.len && (this.ch() === CH_u || this.ch() === CH_U)) {
        isUnsigned = true
        this.pos++
      } else if (this.pos < this.len && (this.ch() === CH_l || this.ch() === CH_L)) {
        this.pos++
        if (this.pos < this.len && (this.ch() === CH_l || this.ch() === CH_L)) {
          isLongLong = true
          this.pos++
        } else {
          isLong = true
        }
      } else {
        break
      }
    }

    // Consume trailing 'i'/'I'/'j'/'J' for GCC imaginary suffix
    if (
      this.pos < this.len &&
      (this.ch() === CH_i || this.ch() === CH_I || this.ch() === CH_j || this.ch() === CH_J)
    ) {
      const next = this.pos + 1 < this.len ? this.chAt(this.pos + 1) : 0
      if (!isAlphanumeric(next) && next !== CH_UNDERSCORE) {
        this.pos++
        isImaginary = true
      }
    }

    return { isUnsigned, isLong, isLongLong, isImaginary }
  }

  /** Common integer literal finish: parse suffix, return token. */
  private finishIntLiteral(value: bigint, isHexOrOctal: boolean, start: number): Token {
    const { isUnsigned, isLong, isLongLong, isImaginary } = this.parseIntSuffix()
    if (isImaginary) {
      return this.makeToken(TokenKind.ImaginaryLiteral, start, Number(value))
    }
    return this.makeIntToken(value, isUnsigned, isLong, isLongLong, isHexOrOctal, start)
  }

  /**
   * Create the appropriate token kind based on integer value, suffix, and base info.
   * Matches the Rust type promotion rules (LP64 model: int=32, long=64).
   */
  private makeIntToken(
    value: bigint,
    isUnsigned: boolean,
    isLong: boolean,
    isLongLong: boolean,
    isHexOrOctal: boolean,
    start: number,
  ): Token {
    const I32_MAX = 0x7fffffffn
    const U32_MAX = 0xffffffffn
    const I64_MAX = 0x7fffffffffffffffn

    if (isUnsigned && isLongLong) {
      return this.makeIntOrBigToken(TokenKind.ULongLongLiteral, start, value)
    }
    if (isUnsigned && isLong) {
      return this.makeIntOrBigToken(TokenKind.ULongLiteral, start, value)
    }
    if (isUnsigned) {
      if (value > U32_MAX) {
        return this.makeIntOrBigToken(TokenKind.ULongLiteral, start, value)
      }
      return this.makeIntOrBigToken(TokenKind.UIntLiteral, start, value)
    }
    if (isLongLong) {
      if (isHexOrOctal && value > I64_MAX) {
        return this.makeIntOrBigToken(TokenKind.ULongLongLiteral, start, value)
      }
      return this.makeIntOrBigToken(TokenKind.LongLongLiteral, start, value)
    }
    if (isLong) {
      // LP64: long is 64-bit
      if (isHexOrOctal && value > I64_MAX) {
        return this.makeIntOrBigToken(TokenKind.ULongLiteral, start, value)
      }
      return this.makeIntOrBigToken(TokenKind.LongLiteral, start, value)
    }
    if (isHexOrOctal) {
      // Hex/octal: int -> unsigned int -> long -> unsigned long
      if (value <= I32_MAX) {
        return this.makeIntOrBigToken(TokenKind.IntLiteral, start, value)
      }
      if (value <= U32_MAX) {
        return this.makeIntOrBigToken(TokenKind.UIntLiteral, start, value)
      }
      if (value <= I64_MAX) {
        return this.makeIntOrBigToken(TokenKind.LongLiteral, start, value)
      }
      return this.makeIntOrBigToken(TokenKind.ULongLiteral, start, value)
    }
    // Decimal with no suffix: int -> long -> long long (LP64)
    if (value > I64_MAX) {
      return this.makeIntOrBigToken(TokenKind.ULongLiteral, start, value)
    }
    if (value <= I32_MAX) {
      return this.makeIntOrBigToken(TokenKind.IntLiteral, start, value)
    }
    // Doesn't fit in int, promote to long (LP64: long is 64-bit)
    return this.makeIntOrBigToken(TokenKind.LongLiteral, start, value)
  }

  /** Create a token, using bigValue if value exceeds MAX_SAFE_INTEGER. */
  private makeIntOrBigToken(kind: TokenKind, start: number, value: bigint): Token {
    if (value <= BigInt(MAX_SAFE)) {
      return { kind, start, end: this.pos, value: Number(value) }
    }
    return { kind, start, end: this.pos, bigValue: value }
  }

  private makeToken(kind: TokenKind, start: number, value?: string | number): Token {
    if (value !== undefined) {
      return { kind, start, end: this.pos, value }
    }
    return { kind, start, end: this.pos }
  }

  // --- String lexing ---
  private lexString(start: number): Token {
    this.pos++ // skip opening "
    let s = ''
    while (this.pos < this.len && this.ch() !== CH_DQUOTE) {
      if (this.ch() === CH_BSLASH) {
        this.pos++
        if (this.pos < this.len) {
          const ch = this.lexEscapeChar()
          // C narrow strings: Unicode escapes (\u, \U) must be UTF-8 encoded
          if (ch.codePointAt(0)! > 0xff) {
            for (let i = 0; i < ch.length; i++) {
              const cp = ch.codePointAt(i)!
              // Encode the code point as UTF-8 bytes stored as individual chars
              if (cp < 0x80) {
                s += String.fromCharCode(cp)
              } else if (cp < 0x800) {
                s += String.fromCharCode(0xc0 | (cp >> 6))
                s += String.fromCharCode(0x80 | (cp & 0x3f))
              } else if (cp < 0x10000) {
                s += String.fromCharCode(0xe0 | (cp >> 12))
                s += String.fromCharCode(0x80 | ((cp >> 6) & 0x3f))
                s += String.fromCharCode(0x80 | (cp & 0x3f))
              } else {
                s += String.fromCharCode(0xf0 | (cp >> 18))
                s += String.fromCharCode(0x80 | ((cp >> 12) & 0x3f))
                s += String.fromCharCode(0x80 | ((cp >> 6) & 0x3f))
                s += String.fromCharCode(0x80 | (cp & 0x3f))
              }
              // Skip surrogate pair second half if present
              if (cp > 0xffff) i++
            }
          } else {
            s += ch
          }
        }
      } else {
        s += this.src[this.pos]
        this.pos++
      }
    }
    if (this.pos < this.len) {
      this.pos++ // skip closing "
    }
    return { kind: TokenKind.StringLiteral, start, end: this.pos, value: s }
  }

  private lexWideString(start: number): Token {
    this.pos++ // skip opening "
    let s = ''
    while (this.pos < this.len && this.ch() !== CH_DQUOTE) {
      if (this.ch() === CH_BSLASH) {
        this.pos++
        if (this.pos < this.len) {
          s += this.lexEscapeChar()
        }
      } else {
        s += this.src[this.pos]
        this.pos++
      }
    }
    if (this.pos < this.len) {
      this.pos++ // skip closing "
    }
    return { kind: TokenKind.WideStringLiteral, start, end: this.pos, value: s }
  }

  private lexChar16String(start: number): Token {
    this.pos++ // skip opening "
    let s = ''
    while (this.pos < this.len && this.ch() !== CH_DQUOTE) {
      if (this.ch() === CH_BSLASH) {
        this.pos++
        if (this.pos < this.len) {
          s += this.lexEscapeChar()
        }
      } else {
        s += this.src[this.pos]
        this.pos++
      }
    }
    if (this.pos < this.len) {
      this.pos++ // skip closing "
    }
    return { kind: TokenKind.Char16StringLiteral, start, end: this.pos, value: s }
  }

  // --- Char lexing ---
  private lexChar(start: number): Token {
    this.pos++ // skip opening '
    let value = 0
    let charCount = 0
    while (this.pos < this.len && this.ch() !== CH_SQUOTE) {
      let ch: string
      if (this.ch() === CH_BSLASH) {
        this.pos++
        ch = this.lexEscapeChar()
      } else {
        ch = this.src[this.pos]
        this.pos++
      }
      const cp = ch.codePointAt(0)!
      // C narrow char literals encode Unicode escapes as UTF-8 bytes
      if (cp > 0xff) {
        // Encode as UTF-8 bytes combined into multi-byte int value
        const buf: number[] = []
        if (cp < 0x800) {
          buf.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
        } else if (cp < 0x10000) {
          buf.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
        } else {
          buf.push(
            0xf0 | (cp >> 18),
            0x80 | ((cp >> 12) & 0x3f),
            0x80 | ((cp >> 6) & 0x3f),
            0x80 | (cp & 0x3f),
          )
        }
        for (const byte of buf) {
          value = (value << 8) | byte
          charCount++
        }
      } else {
        value = (value << 8) | (cp & 0xff)
        charCount++
      }
    }
    if (this.pos < this.len && this.ch() === CH_SQUOTE) {
      this.pos++ // skip closing '
    }
    if (charCount <= 1) {
      const ch = value === 0 ? '\0' : String.fromCharCode(value & 0xff)
      return { kind: TokenKind.CharLiteral, start, end: this.pos, value: ch }
    }
    // Multi-character constant: produce IntLiteral
    return { kind: TokenKind.IntLiteral, start, end: this.pos, value }
  }

  private lexWideChar(start: number): Token {
    this.pos++ // skip opening '
    let value = 0
    if (this.pos < this.len && this.ch() !== CH_SQUOTE) {
      if (this.ch() === CH_BSLASH) {
        this.pos++
        const ch = this.lexEscapeChar()
        value = ch.codePointAt(0)!
      } else {
        value = this.src.codePointAt(this.pos)!
        this.pos += value > 0xffff ? 2 : 1
      }
    }
    // Skip any remaining chars until closing quote
    while (this.pos < this.len && this.ch() !== CH_SQUOTE) {
      this.pos++
    }
    if (this.pos < this.len && this.ch() === CH_SQUOTE) {
      this.pos++ // skip closing '
    }
    // Wide char literals have type int (wchar_t)
    return { kind: TokenKind.IntLiteral, start, end: this.pos, value }
  }

  // --- Escape sequences ---
  private lexEscapeChar(): string {
    if (this.pos >= this.len) return '\0'
    const c = this.ch()
    this.pos++
    switch (c) {
      case CH_n:
        return '\n'
      case CH_t:
        return '\t'
      case CH_r:
        return '\r'
      case CH_BSLASH:
        return '\\'
      case CH_SQUOTE:
        return "'"
      case CH_DQUOTE:
        return '"'
      case 0x61:
        return '\x07' // \a - bell
      case CH_b:
        return '\x08' // \b - backspace
      case CH_e:
      case CH_E:
        return '\x1b' // \e - ESC (GNU extension)
      case CH_f:
        return '\x0c' // \f - form feed
      case CH_v:
        return '\x0b' // \v - vertical tab
      case CH_x: {
        // Hex escape: \xNN - consumes all hex digits, value truncated to byte
        let val = 0
        while (this.pos < this.len && isHexDigit(this.ch())) {
          val = val * 16 + hexDigitVal(this.ch())
          this.pos++
        }
        return String.fromCharCode(val & 0xff)
      }
      case CH_u: {
        // Universal character name: \uNNNN (exactly 4 hex digits)
        return this.lexUnicodeEscape(4)
      }
      case CH_U: {
        // Universal character name: \UNNNNNNNN (exactly 8 hex digits)
        return this.lexUnicodeEscape(8)
      }
      default: {
        // Octal escape: \0 through \377 (1-3 octal digits)
        if (c >= CH_0 && c <= CH_7) {
          let val = c - CH_0
          for (let i = 0; i < 2; i++) {
            if (this.pos < this.len && this.ch() >= CH_0 && this.ch() <= CH_7) {
              val = val * 8 + (this.ch() - CH_0)
              this.pos++
            } else {
              break
            }
          }
          return String.fromCharCode(val & 0xff)
        }
        return String.fromCharCode(c)
      }
    }
  }

  private lexUnicodeEscape(numDigits: number): string {
    let val = 0
    for (let i = 0; i < numDigits; i++) {
      if (this.pos < this.len && isHexDigit(this.ch())) {
        val = val * 16 + hexDigitVal(this.ch())
        this.pos++
      } else {
        break
      }
    }
    // Return the Unicode character, or replacement char for invalid code points
    try {
      return String.fromCodePoint(val)
    } catch {
      return '\uFFFD'
    }
  }

  // --- Identifier lexing ---
  private lexIdentifier(start: number): Token {
    while (this.pos < this.len && isIdentContinue(this.ch())) {
      this.pos++
    }

    // Check for wide/unicode char/string prefixes: L'x', L"...", u'x', u"...", U'x', U"...", u8"..."
    if (this.pos < this.len) {
      const textLen = this.pos - start
      const next = this.ch()
      if (next === CH_SQUOTE || next === CH_DQUOTE) {
        let isWidePrefix = false
        if (textLen === 1) {
          const prefix = this.chAt(start)
          isWidePrefix = prefix === CH_L || prefix === CH_u || prefix === CH_U
        } else if (textLen === 2) {
          isWidePrefix = this.chAt(start) === CH_u && this.chAt(start + 1) === 0x38 /* '8' */
        }
        if (isWidePrefix) {
          if (next === CH_SQUOTE) {
            return this.lexWideChar(start)
          }
          // String literal
          const prefix0 = this.chAt(start)
          if (textLen === 1 && (prefix0 === CH_L || prefix0 === CH_U)) {
            return this.lexWideString(start)
          } else if (textLen === 1 && prefix0 === CH_u) {
            return this.lexChar16String(start)
          } else {
            // u8"..." - UTF-8 string, same as narrow string
            return this.lexString(start)
          }
        }
      }
    }

    const text = this.src.substring(start, this.pos)

    // Check for synthetic pragma pack directives
    const packTok = Scanner.tryPragmaPackToken(text)
    if (packTok !== null) {
      return { kind: packTok.kind, start, end: this.pos, value: packTok.value }
    }

    // Check for synthetic pragma visibility directives
    const visTok = Scanner.tryPragmaVisibilityToken(text)
    if (visTok !== null) {
      return { kind: visTok.kind, start, end: this.pos, value: visTok.value }
    }

    const kw = keywordFromString(text, this.gnuExtensions)
    if (kw !== undefined) {
      return { kind: kw, start, end: this.pos }
    }
    return { kind: TokenKind.Identifier, start, end: this.pos, value: text }
  }

  // --- Pragma helpers ---
  private static tryPragmaPackToken(text: string): { kind: TokenKind; value?: number } | null {
    if (!text.startsWith('__ccc_pack_')) return null
    const rest = text.substring(11) // length of "__ccc_pack_"
    if (rest === 'pop') return { kind: TokenKind.PragmaPackPop }
    if (rest === 'reset') return { kind: TokenKind.PragmaPackReset }
    if (rest === 'push_only') return { kind: TokenKind.PragmaPackPushOnly }
    if (rest.startsWith('set_')) {
      const n = parseInt(rest.substring(4), 10)
      if (!isNaN(n)) return { kind: TokenKind.PragmaPackSet, value: n }
    }
    if (rest.startsWith('push_')) {
      const n = parseInt(rest.substring(5), 10)
      if (!isNaN(n)) return { kind: TokenKind.PragmaPackPush, value: n }
    }
    return null
  }

  private static tryPragmaVisibilityToken(
    text: string,
  ): { kind: TokenKind; value?: string } | null {
    if (!text.startsWith('__ccc_visibility_')) return null
    const rest = text.substring(17) // length of "__ccc_visibility_"
    if (rest === 'pop') return { kind: TokenKind.PragmaVisibilityPop }
    if (rest.startsWith('push_')) {
      const vis = rest.substring(5)
      if (vis === 'hidden' || vis === 'default' || vis === 'protected' || vis === 'internal') {
        return { kind: TokenKind.PragmaVisibilityPush, value: vis }
      }
    }
    return null
  }

  // --- Punctuation and operators ---
  private lexPunctuation(start: number): Token {
    const c = this.ch()
    this.pos++

    switch (c) {
      case CH_LPAREN:
        return { kind: TokenKind.LParen, start, end: this.pos }
      case CH_RPAREN:
        return { kind: TokenKind.RParen, start, end: this.pos }
      case CH_LBRACE:
        return { kind: TokenKind.LBrace, start, end: this.pos }
      case CH_RBRACE:
        return { kind: TokenKind.RBrace, start, end: this.pos }
      case CH_LBRACKET:
        return { kind: TokenKind.LBracket, start, end: this.pos }
      case CH_RBRACKET:
        return { kind: TokenKind.RBracket, start, end: this.pos }
      case CH_SEMICOLON:
        return { kind: TokenKind.Semicolon, start, end: this.pos }
      case CH_COMMA:
        return { kind: TokenKind.Comma, start, end: this.pos }
      case CH_TILDE:
        return { kind: TokenKind.Tilde, start, end: this.pos }
      case CH_QUESTION:
        return { kind: TokenKind.Question, start, end: this.pos }
      case CH_COLON:
        return { kind: TokenKind.Colon, start, end: this.pos }
      case CH_HASH:
        if (this.pos < this.len && this.ch() === CH_HASH) {
          this.pos++
          return { kind: TokenKind.HashHash, start, end: this.pos }
        }
        return { kind: TokenKind.Hash, start, end: this.pos }
      case CH_DOT:
        if (this.pos + 1 < this.len && this.ch() === CH_DOT && this.chAt(this.pos + 1) === CH_DOT) {
          this.pos += 2
          return { kind: TokenKind.Ellipsis, start, end: this.pos }
        }
        return { kind: TokenKind.Dot, start, end: this.pos }
      case CH_PLUS:
        if (this.pos < this.len) {
          if (this.ch() === CH_PLUS) {
            this.pos++
            return { kind: TokenKind.PlusPlus, start, end: this.pos }
          }
          if (this.ch() === CH_EQUAL) {
            this.pos++
            return { kind: TokenKind.PlusAssign, start, end: this.pos }
          }
        }
        return { kind: TokenKind.Plus, start, end: this.pos }
      case CH_MINUS:
        if (this.pos < this.len) {
          if (this.ch() === CH_MINUS) {
            this.pos++
            return { kind: TokenKind.MinusMinus, start, end: this.pos }
          }
          if (this.ch() === CH_EQUAL) {
            this.pos++
            return { kind: TokenKind.MinusAssign, start, end: this.pos }
          }
          if (this.ch() === CH_GREATER) {
            this.pos++
            return { kind: TokenKind.Arrow, start, end: this.pos }
          }
        }
        return { kind: TokenKind.Minus, start, end: this.pos }
      case CH_STAR:
        if (this.pos < this.len && this.ch() === CH_EQUAL) {
          this.pos++
          return { kind: TokenKind.StarAssign, start, end: this.pos }
        }
        return { kind: TokenKind.Star, start, end: this.pos }
      case CH_SLASH:
        if (this.pos < this.len && this.ch() === CH_EQUAL) {
          this.pos++
          return { kind: TokenKind.SlashAssign, start, end: this.pos }
        }
        return { kind: TokenKind.Slash, start, end: this.pos }
      case CH_PERCENT:
        if (this.pos < this.len && this.ch() === CH_EQUAL) {
          this.pos++
          return { kind: TokenKind.PercentAssign, start, end: this.pos }
        }
        return { kind: TokenKind.Percent, start, end: this.pos }
      case CH_AMP:
        if (this.pos < this.len) {
          if (this.ch() === CH_AMP) {
            this.pos++
            return { kind: TokenKind.AmpAmp, start, end: this.pos }
          }
          if (this.ch() === CH_EQUAL) {
            this.pos++
            return { kind: TokenKind.AmpAssign, start, end: this.pos }
          }
        }
        return { kind: TokenKind.Amp, start, end: this.pos }
      case CH_PIPE:
        if (this.pos < this.len) {
          if (this.ch() === CH_PIPE) {
            this.pos++
            return { kind: TokenKind.PipePipe, start, end: this.pos }
          }
          if (this.ch() === CH_EQUAL) {
            this.pos++
            return { kind: TokenKind.PipeAssign, start, end: this.pos }
          }
        }
        return { kind: TokenKind.Pipe, start, end: this.pos }
      case CH_CARET:
        if (this.pos < this.len && this.ch() === CH_EQUAL) {
          this.pos++
          return { kind: TokenKind.CaretAssign, start, end: this.pos }
        }
        return { kind: TokenKind.Caret, start, end: this.pos }
      case CH_BANG:
        if (this.pos < this.len && this.ch() === CH_EQUAL) {
          this.pos++
          return { kind: TokenKind.BangEqual, start, end: this.pos }
        }
        return { kind: TokenKind.Bang, start, end: this.pos }
      case CH_EQUAL:
        if (this.pos < this.len && this.ch() === CH_EQUAL) {
          this.pos++
          return { kind: TokenKind.EqualEqual, start, end: this.pos }
        }
        return { kind: TokenKind.Assign, start, end: this.pos }
      case CH_LESS:
        if (this.pos < this.len) {
          if (this.ch() === CH_LESS) {
            this.pos++
            if (this.pos < this.len && this.ch() === CH_EQUAL) {
              this.pos++
              return { kind: TokenKind.LessLessAssign, start, end: this.pos }
            }
            return { kind: TokenKind.LessLess, start, end: this.pos }
          }
          if (this.ch() === CH_EQUAL) {
            this.pos++
            return { kind: TokenKind.LessEqual, start, end: this.pos }
          }
        }
        return { kind: TokenKind.Less, start, end: this.pos }
      case CH_GREATER:
        if (this.pos < this.len) {
          if (this.ch() === CH_GREATER) {
            this.pos++
            if (this.pos < this.len && this.ch() === CH_EQUAL) {
              this.pos++
              return { kind: TokenKind.GreaterGreaterAssign, start, end: this.pos }
            }
            return { kind: TokenKind.GreaterGreater, start, end: this.pos }
          }
          if (this.ch() === CH_EQUAL) {
            this.pos++
            return { kind: TokenKind.GreaterEqual, start, end: this.pos }
          }
        }
        return { kind: TokenKind.Greater, start, end: this.pos }
      default:
        // Unknown character: skip and continue
        return this.nextToken()
    }
  }
}

// --- BigInt parsing helpers ---
function parseBigHex(s: string): bigint {
  if (s.length === 0) return 0n
  try {
    return BigInt('0x' + s)
  } catch {
    return 0n
  }
}

function parseBigBin(s: string): bigint {
  if (s.length === 0) return 0n
  try {
    return BigInt('0b' + s)
  } catch {
    return 0n
  }
}

function parseBigOct(s: string): bigint {
  if (s.length === 0) return 0n
  try {
    return BigInt('0o' + s)
  } catch {
    return 0n
  }
}

function parseBigDec(s: string): bigint {
  if (s.length === 0) return 0n
  try {
    return BigInt(s)
  } catch {
    return 0n
  }
}
