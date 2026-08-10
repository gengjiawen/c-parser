import { Scanner } from '../src/lexer/scanner'
import { TokenKind } from '../src/lexer/token'

function tokenize(source: string, gnuExtensions = true) {
  const scanner = new Scanner(source, gnuExtensions)
  return scanner.scan()
}

function tokenKinds(source: string, gnuExtensions = true) {
  return tokenize(source, gnuExtensions)
    .filter((t) => t.kind !== TokenKind.Eof)
    .map((t) => t.kind)
}

describe('Scanner', () => {
  describe('keywords', () => {
    it('tokenizes C keywords', () => {
      const tokens = tokenize('int char void struct union enum return if while for')
      const kinds = tokens.filter((t) => t.kind !== TokenKind.Eof).map((t) => t.kind)
      expect(kinds).toEqual([
        TokenKind.Int,
        TokenKind.Char,
        TokenKind.Void,
        TokenKind.Struct,
        TokenKind.Union,
        TokenKind.Enum,
        TokenKind.Return,
        TokenKind.If,
        TokenKind.While,
        TokenKind.For,
      ])
    })

    it('tokenizes storage class keywords', () => {
      const kinds = tokenKinds('static extern typedef const volatile')
      expect(kinds).toEqual([
        TokenKind.Static,
        TokenKind.Extern,
        TokenKind.Typedef,
        TokenKind.Const,
        TokenKind.Volatile,
      ])
    })

    it('tokenizes C11 keywords', () => {
      const kinds = tokenKinds('_Bool _Alignas _Alignof _Atomic _Noreturn _Static_assert')
      expect(kinds).toEqual([
        TokenKind.Bool,
        TokenKind.Alignas,
        TokenKind.Alignof,
        TokenKind.Atomic,
        TokenKind.Noreturn,
        TokenKind.StaticAssert,
      ])
    })

    it('tokenizes GCC extension keywords', () => {
      const kinds = tokenKinds('typeof __attribute__ __extension__ __asm__')
      expect(kinds).toEqual([
        TokenKind.Typeof,
        TokenKind.Attribute,
        TokenKind.Extension,
        TokenKind.Asm,
      ])
    })

    // 18 characters long — the keyword lookup's length pre-filter used to stop
    // at 17 and let it through as a plain identifier.
    it('tokenizes the __builtin_* keywords', () => {
      const kinds = tokenKinds('__builtin_va_arg __builtin_types_compatible_p __builtin_offsetof')
      expect(kinds).toEqual([
        TokenKind.BuiltinVaArg,
        TokenKind.BuiltinTypesCompatibleP,
        TokenKind.BuiltinOffsetof,
      ])
    })

    it('treats typeof as identifier without GNU extensions', () => {
      const tokens = tokenize('typeof', false)
      expect(tokens[0].kind).toBe(TokenKind.Identifier)
      expect(tokens[0].value).toBe('typeof')
    })

    it('always recognizes __typeof__ even without GNU extensions', () => {
      const tokens = tokenize('__typeof__', false)
      expect(tokens[0].kind).toBe(TokenKind.Typeof)
    })
  })

  describe('identifiers', () => {
    it('tokenizes simple identifiers', () => {
      const tokens = tokenize('foo bar baz')
      const idents = tokens.filter((t) => t.kind === TokenKind.Identifier)
      expect(idents.map((t) => t.value)).toEqual(['foo', 'bar', 'baz'])
    })

    it('tokenizes identifiers with underscores and digits', () => {
      const tokens = tokenize('_foo bar2 __baz_3')
      const idents = tokens.filter((t) => t.kind === TokenKind.Identifier)
      expect(idents.map((t) => t.value)).toEqual(['_foo', 'bar2', '__baz_3'])
    })

    it('tokenizes dollar-sign identifiers', () => {
      const tokens = tokenize('$foo bar$baz')
      const idents = tokens.filter((t) => t.kind === TokenKind.Identifier)
      expect(idents.map((t) => t.value)).toEqual(['$foo', 'bar$baz'])
    })
  })

  describe('integer literals', () => {
    it('tokenizes decimal integers', () => {
      const tokens = tokenize('0 42 12345')
      expect(tokens[0].kind).toBe(TokenKind.IntLiteral)
      expect(tokens[0].value).toBe(0)
      expect(tokens[1].kind).toBe(TokenKind.IntLiteral)
      expect(tokens[1].value).toBe(42)
      expect(tokens[2].kind).toBe(TokenKind.IntLiteral)
      expect(tokens[2].value).toBe(12345)
    })

    it('tokenizes hex integers', () => {
      const tokens = tokenize('0xFF 0x1A 0X0')
      expect(tokens[0].kind).toBe(TokenKind.IntLiteral)
      expect(tokens[0].value).toBe(0xff)
      expect(tokens[1].kind).toBe(TokenKind.IntLiteral)
      expect(tokens[1].value).toBe(0x1a)
    })

    it('tokenizes octal integers', () => {
      const tokens = tokenize('077 010')
      expect(tokens[0].kind).toBe(TokenKind.IntLiteral)
      expect(tokens[0].value).toBe(0o77)
      expect(tokens[1].kind).toBe(TokenKind.IntLiteral)
      expect(tokens[1].value).toBe(0o10)
    })

    it('tokenizes unsigned suffix', () => {
      const tokens = tokenize('42u 42U')
      expect(tokens[0].kind).toBe(TokenKind.UIntLiteral)
      expect(tokens[1].kind).toBe(TokenKind.UIntLiteral)
    })

    it('tokenizes long suffix', () => {
      const tokens = tokenize('42l 42L')
      expect(tokens[0].kind).toBe(TokenKind.LongLiteral)
      expect(tokens[1].kind).toBe(TokenKind.LongLiteral)
    })

    it('tokenizes unsigned long suffix', () => {
      const tokens = tokenize('42ul 42UL')
      expect(tokens[0].kind).toBe(TokenKind.ULongLiteral)
      expect(tokens[1].kind).toBe(TokenKind.ULongLiteral)
    })
  })

  describe('float literals', () => {
    it('tokenizes float with decimal point', () => {
      const tokens = tokenize('3.14 0.5 .25')
      expect(tokens[0].kind).toBe(TokenKind.FloatLiteral)
      expect(tokens[0].value).toBeCloseTo(3.14)
      expect(tokens[1].kind).toBe(TokenKind.FloatLiteral)
      expect(tokens[2].kind).toBe(TokenKind.FloatLiteral)
    })

    it('tokenizes float with exponent', () => {
      const tokens = tokenize('1e10 2.5E-3')
      expect(tokens[0].kind).toBe(TokenKind.FloatLiteral)
      expect(tokens[1].kind).toBe(TokenKind.FloatLiteral)
    })

    it('tokenizes float with f suffix', () => {
      const tokens = tokenize('3.14f 2.0F')
      expect(tokens[0].kind).toBe(TokenKind.FloatLiteralF32)
      expect(tokens[1].kind).toBe(TokenKind.FloatLiteralF32)
    })
  })

  describe('string literals', () => {
    it('tokenizes simple strings', () => {
      const tokens = tokenize('"hello" "world"')
      expect(tokens[0].kind).toBe(TokenKind.StringLiteral)
      expect(tokens[0].value).toBe('hello')
      expect(tokens[1].kind).toBe(TokenKind.StringLiteral)
      expect(tokens[1].value).toBe('world')
    })

    it('tokenizes strings with escape sequences', () => {
      const tokens = tokenize('"hello\\nworld" "tab\\there"')
      expect(tokens[0].value).toBe('hello\nworld')
      expect(tokens[1].value).toBe('tab\there')
    })

    it('tokenizes strings with hex escapes', () => {
      const tokens = tokenize('"\\x41\\x42"')
      expect(tokens[0].value).toBe('AB')
    })

    it('tokenizes empty string', () => {
      const tokens = tokenize('""')
      expect(tokens[0].kind).toBe(TokenKind.StringLiteral)
      expect(tokens[0].value).toBe('')
    })
  })

  describe('char literals', () => {
    it('tokenizes simple char literals', () => {
      const tokens = tokenize("'a' 'Z'")
      expect(tokens[0].kind).toBe(TokenKind.CharLiteral)
      expect(tokens[0].value).toBe('a')
      expect(tokens[1].kind).toBe(TokenKind.CharLiteral)
      expect(tokens[1].value).toBe('Z')
    })

    it('tokenizes escape char literals', () => {
      const tokens = tokenize("'\\n' '\\t' '\\0'")
      expect(tokens[0].value).toBe('\n')
      expect(tokens[1].value).toBe('\t')
      expect(tokens[2].value).toBe('\0')
    })
  })

  // A numeric escape is truncated to the width of the literal's element type
  // (C11 6.4.4.4p9), so the encoding prefix decides how much of it survives.
  // Expected values are gcc -std=gnu11 on x86-64 Linux, where wchar_t is a
  // signed 32-bit int, char16_t is unsigned 16-bit and char32_t unsigned
  // 32-bit.
  describe('escape width follows the literal prefix', () => {
    /** A prefixed char literal carries its integer value on the token. */
    function charValue(source: string): number {
      const token = tokenize(source)[0]
      return token.value as number
    }
    /** The elements of a string literal, one number per code point. */
    function elements(source: string): number[] {
      const value = tokenize(source)[0].value as string
      return Array.from(value).map((c) => c.codePointAt(0)!)
    }

    it('keeps narrow escapes at 8 bits', () => {
      expect(tokenize("'\\xff'")[0].value).toBe('\xff')
      expect(tokenize("'\\377'")[0].value).toBe('\xff')
      // gcc: '\x1ff' warns "hex escape sequence out of range" and keeps 0xff
      expect(tokenize("'\\x1ff'")[0].value).toBe('\xff')
      expect(elements('"\\xff\\377"')).toEqual([0xff, 0xff])
      expect(elements('u8"\\xff"')).toEqual([0xff])
    })

    it('widens L char escapes to 32-bit wchar_t', () => {
      expect(charValue("L'\\x1234'")).toBe(0x1234)
      expect(charValue("L'\\xffff'")).toBe(0xffff)
      expect(charValue("L'\\xFF12'")).toBe(0xff12)
      expect(charValue("L'\\x1F600'")).toBe(0x1f600)
      expect(charValue("L'\\777'")).toBe(0o777)
    })

    it('widens u char escapes to 16-bit char16_t', () => {
      expect(charValue("u'\\x1234'")).toBe(0x1234)
      expect(charValue("u'\\xffff'")).toBe(0xffff)
      // Out of range for char16_t: gcc warns and keeps the low 16 bits
      expect(charValue("u'\\x12345'")).toBe(0x2345)
      expect(charValue("u'\\777'")).toBe(0o777)
    })

    it('widens U char escapes to 32-bit char32_t', () => {
      expect(charValue("U'\\x1234'")).toBe(0x1234)
      expect(charValue("U'\\x1F600'")).toBe(0x1f600)
      expect(charValue("U'\\777'")).toBe(0o777)
    })

    it('keeps u8 char escapes at 8 bits', () => {
      expect(charValue("u8'\\xff'")).toBe(0xff)
      expect(charValue("u8'\\377'")).toBe(0xff)
    })

    it('sign-extends wchar_t but not char32_t', () => {
      // wchar_t is `int`, so the all-ones escape is -1; char32_t is unsigned
      expect(charValue("L'\\xffffffff'")).toBe(-1)
      expect(charValue("U'\\xffffffff'")).toBe(0xffffffff)
      // Beyond 32 bits only the low word survives, as in gcc
      expect(charValue("L'\\x123456789'")).toBe(0x23456789)
    })

    it('preserves the signedness of prefixed character types', () => {
      expect(tokenize("L'a'")[0].kind).toBe(TokenKind.IntLiteral)
      expect(tokenize("u'a'")[0].kind).toBe(TokenKind.UIntLiteral)
      expect(tokenize("U'a'")[0].kind).toBe(TokenKind.UIntLiteral)
      expect(tokenize("u8'a'")[0].kind).toBe(TokenKind.UIntLiteral)
    })

    it('widens escapes in prefixed strings', () => {
      expect(elements('L"\\xFF12"')).toEqual([0xff12])
      expect(elements('L"\\777"')).toEqual([0o777])
      expect(elements('u"\\x1234"')).toEqual([0x1234])
      expect(elements('u"\\x12345"')).toEqual([0x2345])
      expect(elements('U"\\x1F600"')).toEqual([0x1f600])
      expect(elements('L"\\x41\\x42"')).toEqual([0x41, 0x42])
    })

    it('leaves universal character names untruncated', () => {
      // A UCN names a code point, so the prefix does not narrow it
      expect(charValue("L'\\u1234'")).toBe(0x1234)
      expect(charValue("U'\\U0001F600'")).toBe(0x1f600)
      expect(elements('L"\\u1234"')).toEqual([0x1234])
      // ...but narrow literals still encode one as UTF-8 bytes
      expect(elements('"\\u1234"')).toEqual([0xe1, 0x88, 0xb4])
    })
  })

  describe('operators and punctuation', () => {
    it('tokenizes single-char operators', () => {
      const kinds = tokenKinds('+ - * / % & | ^ ~ ! = < >')
      expect(kinds).toEqual([
        TokenKind.Plus,
        TokenKind.Minus,
        TokenKind.Star,
        TokenKind.Slash,
        TokenKind.Percent,
        TokenKind.Amp,
        TokenKind.Pipe,
        TokenKind.Caret,
        TokenKind.Tilde,
        TokenKind.Bang,
        TokenKind.Assign,
        TokenKind.Less,
        TokenKind.Greater,
      ])
    })

    it('tokenizes compound operators', () => {
      const kinds = tokenKinds('+= -= *= /= %= &= |= ^= <<= >>=')
      expect(kinds).toEqual([
        TokenKind.PlusAssign,
        TokenKind.MinusAssign,
        TokenKind.StarAssign,
        TokenKind.SlashAssign,
        TokenKind.PercentAssign,
        TokenKind.AmpAssign,
        TokenKind.PipeAssign,
        TokenKind.CaretAssign,
        TokenKind.LessLessAssign,
        TokenKind.GreaterGreaterAssign,
      ])
    })

    it('tokenizes comparison operators', () => {
      const kinds = tokenKinds('== != <= >= < >')
      expect(kinds).toEqual([
        TokenKind.EqualEqual,
        TokenKind.BangEqual,
        TokenKind.LessEqual,
        TokenKind.GreaterEqual,
        TokenKind.Less,
        TokenKind.Greater,
      ])
    })

    it('tokenizes logical operators', () => {
      const kinds = tokenKinds('&& ||')
      expect(kinds).toEqual([TokenKind.AmpAmp, TokenKind.PipePipe])
    })

    it('tokenizes increment/decrement', () => {
      const kinds = tokenKinds('++ --')
      expect(kinds).toEqual([TokenKind.PlusPlus, TokenKind.MinusMinus])
    })

    it('tokenizes arrow operator', () => {
      const kinds = tokenKinds('->')
      expect(kinds).toEqual([TokenKind.Arrow])
    })

    it('tokenizes brackets and braces', () => {
      const kinds = tokenKinds('( ) { } [ ]')
      expect(kinds).toEqual([
        TokenKind.LParen,
        TokenKind.RParen,
        TokenKind.LBrace,
        TokenKind.RBrace,
        TokenKind.LBracket,
        TokenKind.RBracket,
      ])
    })

    it('tokenizes semicolon, comma, dot', () => {
      const kinds = tokenKinds('; , .')
      expect(kinds).toEqual([TokenKind.Semicolon, TokenKind.Comma, TokenKind.Dot])
    })

    it('tokenizes ellipsis', () => {
      const kinds = tokenKinds('...')
      expect(kinds).toEqual([TokenKind.Ellipsis])
    })

    it('tokenizes ternary operators', () => {
      const kinds = tokenKinds('? :')
      expect(kinds).toEqual([TokenKind.Question, TokenKind.Colon])
    })

    it('tokenizes shift operators', () => {
      const kinds = tokenKinds('<< >>')
      expect(kinds).toEqual([TokenKind.LessLess, TokenKind.GreaterGreater])
    })
  })

  describe('stray characters', () => {
    it('emits one silent preprocessing token per stray character', () => {
      const scanner = new Scanner('@@@')
      const tokens = scanner.scan()
      expect(tokens.map((t) => t.kind)).toEqual([
        TokenKind.Stray,
        TokenKind.Stray,
        TokenKind.Stray,
        TokenKind.Eof,
      ])
      expect(tokens.slice(0, 3).map((t) => [t.start, t.end])).toEqual([
        [0, 1],
        [1, 2],
        [2, 3],
      ])
      expect(scanner.diagnostics).toEqual([])
    })

    it('scans a long run of stray characters without overflowing the stack', () => {
      const n = 50000
      const scanner = new Scanner(`int x;${'@'.repeat(n)}int y;`)
      const tokens = scanner.scan()
      expect(tokens.slice(0, 3).map((t) => t.kind)).toEqual([
        TokenKind.Int,
        TokenKind.Identifier,
        TokenKind.Semicolon,
      ])
      expect(tokens.slice(3, 3 + n).every((t) => t.kind === TokenKind.Stray)).toBe(true)
      expect(tokens.slice(3 + n).map((t) => t.kind)).toEqual([
        TokenKind.Int,
        TokenKind.Identifier,
        TokenKind.Semicolon,
        TokenKind.Eof,
      ])
      expect(scanner.diagnostics).toEqual([])
    })
  })

  describe('comments', () => {
    it('skips line comments', () => {
      const tokens = tokenize('int // this is a comment\nx')
      const kinds = tokens.filter((t) => t.kind !== TokenKind.Eof).map((t) => t.kind)
      expect(kinds).toEqual([TokenKind.Int, TokenKind.Identifier])
    })

    it('skips block comments', () => {
      const tokens = tokenize('int /* block comment */ x')
      const kinds = tokens.filter((t) => t.kind !== TokenKind.Eof).map((t) => t.kind)
      expect(kinds).toEqual([TokenKind.Int, TokenKind.Identifier])
    })

    it('skips multi-line block comments', () => {
      const tokens = tokenize('int /* line1\nline2\nline3 */ x')
      const kinds = tokens.filter((t) => t.kind !== TokenKind.Eof).map((t) => t.kind)
      expect(kinds).toEqual([TokenKind.Int, TokenKind.Identifier])
    })

    // The skip loop used to stop at len - 1, leaving the last character of an
    // unterminated comment to be lexed as a token.
    it('skips an unterminated block comment to end of input', () => {
      expect(tokenKinds('int a; /*xy')).toEqual([
        TokenKind.Int,
        TokenKind.Identifier,
        TokenKind.Semicolon,
      ])
    })

    it('skips an unterminated block comment ending in a star', () => {
      expect(tokenKinds('int a; /*x*')).toEqual([
        TokenKind.Int,
        TokenKind.Identifier,
        TokenKind.Semicolon,
      ])
    })

    it('skips a block comment opener at end of input', () => {
      expect(tokenKinds('int a; /*')).toEqual([
        TokenKind.Int,
        TokenKind.Identifier,
        TokenKind.Semicolon,
      ])
      expect(tokenKinds('/*')).toEqual([])
    })

    it('skips an empty block comment at end of input', () => {
      expect(tokenKinds('/**/')).toEqual([])
      expect(tokenKinds('int a; /*x*/')).toEqual([
        TokenKind.Int,
        TokenKind.Identifier,
        TokenKind.Semicolon,
      ])
    })

    // A stray `/*` swallows the rest of the translation unit, so it has to be
    // diagnosed: it used to run to EOF with no diagnostic at all.
    it('diagnoses an unterminated block comment', () => {
      const scanner = new Scanner('int x; /* oops')
      const kinds = scanner
        .scan()
        .filter((t) => t.kind !== TokenKind.Eof)
        .map((t) => t.kind)
      expect(kinds).toEqual([TokenKind.Int, TokenKind.Identifier, TokenKind.Semicolon])
      expect(scanner.diagnostics).toEqual([
        {
          message: 'unterminated comment',
          start: 7,
          end: 14,
          phase: 'lexer',
          severity: 'error',
        },
      ])
    })

    it('diagnoses a block comment opener at end of input', () => {
      const scanner = new Scanner('int a; /*')
      scanner.scan()
      expect(scanner.diagnostics.map((d) => d.message)).toEqual(['unterminated comment'])
      expect(scanner.diagnostics[0].start).toBe(7)
    })

    it('does not diagnose terminated comments', () => {
      for (const src of ['int /* block */ x;', 'int /* a\nb\nc */ x;', '/**/', 'int x; // eol']) {
        const scanner = new Scanner(src)
        scanner.scan()
        expect(scanner.diagnostics).toEqual([])
      }
    })
  })

  describe('whitespace', () => {
    it('skips whitespace between tokens', () => {
      const tokens = tokenize('  int   x  ;  ')
      const kinds = tokens.filter((t) => t.kind !== TokenKind.Eof).map((t) => t.kind)
      expect(kinds).toEqual([TokenKind.Int, TokenKind.Identifier, TokenKind.Semicolon])
    })

    it('handles tabs and newlines', () => {
      const tokens = tokenize('int\n\tx\n;')
      const kinds = tokens.filter((t) => t.kind !== TokenKind.Eof).map((t) => t.kind)
      expect(kinds).toEqual([TokenKind.Int, TokenKind.Identifier, TokenKind.Semicolon])
    })
  })

  describe('source positions', () => {
    it('tracks start and end positions', () => {
      const tokens = tokenize('int x')
      expect(tokens[0].start).toBe(0)
      expect(tokens[0].end).toBe(3)
      expect(tokens[1].start).toBe(4)
      expect(tokens[1].end).toBe(5)
    })
  })

  describe('EOF', () => {
    it('produces EOF token at end', () => {
      const tokens = tokenize('')
      expect(tokens.length).toBe(1)
      expect(tokens[0].kind).toBe(TokenKind.Eof)
    })

    it('produces EOF after tokens', () => {
      const tokens = tokenize('x')
      expect(tokens[tokens.length - 1].kind).toBe(TokenKind.Eof)
    })
  })

  // C11 6.4.6p3 digraphs. Every expectation below was taken from
  // `gcc -std=gnu11`, which recognizes them by maximal munch in every
  // context (they are not gated on a -std= mode the way trigraphs are).
  describe('digraphs', () => {
    it('lexes the six digraphs as their primary token kinds', () => {
      expect(tokenKinds('<: :> <% %> %: %:%:')).toEqual([
        TokenKind.LBracket,
        TokenKind.RBracket,
        TokenKind.LBrace,
        TokenKind.RBrace,
        TokenKind.Hash,
        TokenKind.HashHash,
      ])
    })

    it('keeps the digraph source spelling on the token', () => {
      const spellings = tokenize('<: :> <% %> %: %:%:')
        .filter((t) => t.kind !== TokenKind.Eof)
        .map((t) => t.spelling)
      expect(spellings).toEqual(['<:', ':>', '<%', '%>', '%:', '%:%:'])
    })

    it('leaves the primary spellings without a spelling override', () => {
      const spellings = tokenize('[ ] { } # ##')
        .filter((t) => t.kind !== TokenKind.Eof)
        .map((t) => t.spelling)
      expect(spellings).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
    })

    it('spans the whole digraph', () => {
      const toks = tokenize('a %:%: b')
      expect(toks[1].start).toBe(2)
      expect(toks[1].end).toBe(6)
    })

    // gcc: `int a %:%:%: b;` -> stray '%:%:' then stray '%:'.
    it('prefers %:%: over %: and falls back when the run is odd', () => {
      expect(tokenKinds('%:%:%:')).toEqual([TokenKind.HashHash, TokenKind.Hash])
    })

    // gcc: `return a %:% b;` -> error: stray '%:' in program.
    it('reads %:% as %: followed by a bare %', () => {
      expect(tokenKinds('a %:% b')).toEqual([
        TokenKind.Identifier,
        TokenKind.Hash,
        TokenKind.Percent,
        TokenKind.Identifier,
      ])
    })

    // C++ exempts `<::` so that `vector<::T>` works; C has no such rule.
    // gcc on `return a<:::b;` -> error: expected expression before '::'
    // token, i.e. the `<:` was taken as `[`.
    it('takes <: even when a third colon follows', () => {
      expect(tokenKinds('a<:::b')).toEqual([
        TokenKind.Identifier,
        TokenKind.LBracket,
        TokenKind.Colon,
        TokenKind.Colon,
        TokenKind.Identifier,
      ])
    })

    // gcc on `int x<::>y = { 1, 2 };` -> error before 'y', i.e. `int x[] y`.
    it('reads <::> as [ ]', () => {
      expect(tokenKinds('x<::>y')).toEqual([
        TokenKind.Identifier,
        TokenKind.LBracket,
        TokenKind.RBracket,
        TokenKind.Identifier,
      ])
    })

    // gcc on `int c <:> d;` -> error: expected expression before '>' token.
    it('reads <:> as [ followed by >', () => {
      expect(tokenKinds('<:>')).toEqual([TokenKind.LBracket, TokenKind.Greater])
    })

    // gcc on `return a ? b :>c;` -> error: expected ':' before ']' token.
    // Digraphs are lexical: a ternary colon touching a '>' becomes ']'.
    it('takes :> as ] even where a ternary colon is expected', () => {
      expect(tokenKinds('a ? b :>c')).toEqual([
        TokenKind.Identifier,
        TokenKind.Question,
        TokenKind.Identifier,
        TokenKind.RBracket,
        TokenKind.Identifier,
      ])
    })

    // gcc on `return a <<: b;` -> error: expected expression before ':'.
    it('lets the longer << win over <:', () => {
      expect(tokenKinds('a <<: b')).toEqual([
        TokenKind.Identifier,
        TokenKind.LessLess,
        TokenKind.Colon,
        TokenKind.Identifier,
      ])
    })

    it('does not join the pieces across whitespace or a comment', () => {
      expect(tokenKinds('a % : b')).toEqual([
        TokenKind.Identifier,
        TokenKind.Percent,
        TokenKind.Colon,
        TokenKind.Identifier,
      ])
      expect(tokenKinds('a </*c*/: b')).toEqual([
        TokenKind.Identifier,
        TokenKind.Less,
        TokenKind.Colon,
        TokenKind.Identifier,
      ])
    })

    it('leaves the ordinary operators alone', () => {
      expect(tokenKinds('a % b, a < b, a > b, a <= b, a %= b, x ? y : z')).toEqual([
        TokenKind.Identifier,
        TokenKind.Percent,
        TokenKind.Identifier,
        TokenKind.Comma,
        TokenKind.Identifier,
        TokenKind.Less,
        TokenKind.Identifier,
        TokenKind.Comma,
        TokenKind.Identifier,
        TokenKind.Greater,
        TokenKind.Identifier,
        TokenKind.Comma,
        TokenKind.Identifier,
        TokenKind.LessEqual,
        TokenKind.Identifier,
        TokenKind.Comma,
        TokenKind.Identifier,
        TokenKind.PercentAssign,
        TokenKind.Identifier,
        TokenKind.Comma,
        TokenKind.Identifier,
        TokenKind.Question,
        TokenKind.Identifier,
        TokenKind.Colon,
        TokenKind.Identifier,
      ])
    })

    it('does not look for digraphs inside literals or comments', () => {
      expect(tokenKinds('"<%" \'>\' /* %:%: */ x')).toEqual([
        TokenKind.StringLiteral,
        TokenKind.CharLiteral,
        TokenKind.Identifier,
      ])
    })
  })
})
