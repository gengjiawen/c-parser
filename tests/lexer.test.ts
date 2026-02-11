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
})
