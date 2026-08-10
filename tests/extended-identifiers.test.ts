import { parse } from '../src/index'
import { Scanner } from '../src/lexer/scanner'
import { Token, TokenKind } from '../src/lexer/token'
import { preprocess } from '../src/preprocessor/preprocessor'
import { spellingOf } from '../src/preprocessor/directives'
import type { Diagnostic } from '../src/diagnostics'

/**
 * Extended identifiers: C11 6.4.2.1 universal character names, and the raw
 * extended characters GCC accepts in their place by default.
 *
 * Every expectation here was taken from `gcc -std=gnu11 -fsyntax-only`
 * (GCC 15.2) rather than from the standard alone, because the two differ:
 * GCC's identifier table is C11 Annex D, and the accept/reject calls below
 * were probed at both edges of every range.
 */

function tokenize(source: string): Token[] {
  return new Scanner(source).scan()
}

function idents(source: string): (string | number | undefined)[] {
  return tokenize(source)
    .filter((t) => t.kind === TokenKind.Identifier)
    .map((t) => t.value)
}

function lexDiags(source: string): Diagnostic[] {
  const scanner = new Scanner(source)
  scanner.scan()
  return scanner.diagnostics
}

/** Diagnostics the parser emits for `Stray` preprocessing tokens. */
function strayDiags(source: string): Diagnostic[] {
  return parse(source, { preprocess: false }).errors.filter((d) => d.message.startsWith('stray '))
}

/** The preprocessed stream as `gcc -E -P` would print it. */
function expandText(source: string): string {
  const pp = preprocess(source, tokenize(source), { gnuExtensions: true, profile: 'none' })
  return pp.tokens
    .filter((t) => t.kind !== TokenKind.Eof)
    .map((t) => spellingOf(t, source))
    .join(' ')
}

/** Identifier names left in the stream after preprocessing. */
function expandedIdents(source: string): (string | number | undefined)[] {
  const pp = preprocess(source, tokenize(source), { gnuExtensions: true, profile: 'none' })
  return pp.tokens.filter((t) => t.kind === TokenKind.Identifier).map((t) => t.value)
}

/** Names of the declarators the parser produced, in order. */
function declaredNames(source: string): string[] {
  const ast = parse(source)
  const out: string[] = []
  const walk = (n: unknown): void => {
    if (n === null || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const v of n) walk(v)
      return
    }
    const o = n as Record<string, unknown>
    if (o.type === 'InitDeclarator' && typeof o.name === 'string') out.push(o.name)
    for (const k in o) {
      if (k !== 'type') walk(o[k])
    }
  }
  walk(ast.decls)
  return out
}

function cleanParse(source: string) {
  const ast = parse(source)
  expect(ast.errors).toEqual([])
  return ast
}

// ---------------------------------------------------------------------------
// Raw extended characters
// ---------------------------------------------------------------------------
describe('extended identifiers spelled literally', () => {
  it('takes a Latin-1 letter in the middle of an identifier', () => {
    // gcc -std=gnu11 -fsyntax-only: rc=0. Before this was supported the `é`
    // was dropped with a warning and the declarator silently became `caf`.
    cleanParse('int café = 1;')
    expect(declaredNames('int café = 1;')).toEqual(['café'])
  })

  it('takes a Latin-1 letter as the first character', () => {
    cleanParse('int été = 2;')
    expect(declaredNames('int été = 2;')).toEqual(['été'])
  })

  it('takes a CJK character as a whole identifier', () => {
    cleanParse('int 中 = 1;')
    expect(declaredNames('int 中 = 1;')).toEqual(['中'])
  })

  it('joins a surrogate pair into one astral code point', () => {
    // U+1F600 is in Annex D.1's 10000-1FFFD, and gcc accepts it in both
    // positions. In a UTF-16 source string it arrives as two code units.
    cleanParse('int a\u{1F600} = 1;')
    expect(declaredNames('int a\u{1F600}\u{1F600}b = 1;')).toEqual(['a\u{1F600}\u{1F600}b'])
    expect(idents('a\u{1F600}')).toEqual(['a\u{1F600}'])
  })

  it('accepts an astral code point as the first character', () => {
    cleanParse('int \u{1F600}a = 1;')
    expect(declaredNames('int \u{1F600}a = 1;')).toEqual(['\u{1F600}a'])
  })

  it('takes a combining mark in a continuation position but not initially', () => {
    // Annex D.2, enforced by gcc: `int à = 1;` (a + U+0300) is rc=0, but
    // `int ̀a = 1;` is "error: extended character ̀ is not valid at the
    // start of an identifier".
    cleanParse('int à = 1;')
    expect(declaredNames('int à = 1;')).toEqual(['à'])

    const diags = lexDiags('int ̀a = 1;')
    expect(diags).toHaveLength(1)
    expect(diags[0].severity).toBe('error')
    expect(diags[0].message).toBe('extended character ̀ is not valid at the start of an identifier')
    // GCC still forms the identifier and reports once, so recovery is sane.
    expect(idents('int ̀a = 1;')).toEqual(['̀a'])
  })

  it('rejects a character no identifier may contain, and keeps scanning', () => {
    // U+2603 SNOWMAN is outside Annex D.1; gcc: "error: stray '\342' in
    // program" then "expected '=' ... before 'b'". One diagnostic per
    // character, and the identifiers either side survive.
    const diags = strayDiags('int a☃b = 1;')
    expect(diags).toHaveLength(1)
    expect(diags[0].severity).toBe('error')
    expect(diags[0].message).toBe("stray '☃' in program")
    expect(idents('int a☃b = 1;')).toEqual(['a', 'b'])
  })

  it('honours the exact Annex D.1 boundaries GCC uses', () => {
    // Probed against gcc at both edges of each range.
    const accepted = [
      0x00a8, 0x00aa, 0x00ad, 0x00af, 0x00b2, 0x00b5, 0x00b7, 0x00ba, 0x00bc, 0x00be, 0x00c0,
      0x00d6, 0x00d8, 0x00f6, 0x00f8, 0x00ff, 0x0100, 0x167f, 0x1681, 0x180d, 0x180f, 0x1fff,
      0x200b, 0x200d, 0x202a, 0x202e, 0x203f, 0x2040, 0x2054, 0x2060, 0x218f, 0x2460, 0x24ff,
      0x2776, 0x2793, 0x2c00, 0x2dff, 0x2e80, 0x2fff, 0x3004, 0x3007, 0x3021, 0x302f, 0x3031,
      0xd7ff, 0xf900, 0xfdcf, 0xfdf0, 0xfe44, 0xfe47, 0xfffd, 0x10000, 0x1fffd, 0xe0000, 0xefffd,
    ]
    const rejected = [
      0x00a7, 0x00a9, 0x00ab, 0x00ac, 0x00ae, 0x00b0, 0x00b1, 0x00b6, 0x00bb, 0x00bf, 0x00d7,
      0x00f7, 0x1680, 0x180e, 0x2000, 0x200a, 0x200e, 0x2029, 0x202f, 0x203e, 0x2041, 0x2053,
      0x2055, 0x205f, 0x2190, 0x245f, 0x2500, 0x2775, 0x2794, 0x2bff, 0x2e00, 0x2e7f, 0x3000,
      0x3003, 0x3008, 0x3020, 0x3030, 0xf8ff, 0xfdd0, 0xfdef, 0xfe45, 0xfe46, 0xfffe, 0x1fffe,
      0xf0000, 0x10fffd,
    ]
    const bad: string[] = []
    for (const cp of accepted) {
      if (idents('a' + String.fromCodePoint(cp))[0] !== 'a' + String.fromCodePoint(cp)) {
        bad.push('should accept U+' + cp.toString(16))
      }
    }
    for (const cp of rejected) {
      if (idents('a' + String.fromCodePoint(cp))[0] !== 'a') {
        bad.push('should reject U+' + cp.toString(16))
      }
    }
    expect(bad).toEqual([])
  })

  it('keeps the combining-mark ranges out of the initial position only', () => {
    for (const cp of [0x0300, 0x036f, 0x1dc0, 0x1dff, 0x20d0, 0x20ff, 0xfe20, 0xfe2f]) {
      const c = String.fromCodePoint(cp)
      // Continues an identifier without a word.
      expect(lexDiags('int a' + c + ';')).toEqual([])
      // Opens one only with a diagnostic.
      expect(lexDiags('int ' + c + 'a;')).toHaveLength(1)
    }
    // The code points just outside each range open one freely.
    for (const cp of [0x02ff, 0x0370, 0x1dbf, 0x1e00, 0x20cf, 0x2100, 0xfe1f, 0xfe30]) {
      expect(lexDiags('int ' + String.fromCodePoint(cp) + 'a;')).toEqual([])
    }
  })

  it('diagnoses an unpaired surrogate without crashing or truncating', () => {
    // No UTF-8 decoder produces this, but a caller can hand us any string.
    const diags = strayDiags('int a\ud800b = 1;')
    expect(diags).toHaveLength(1)
    expect(diags[0].severity).toBe('error')
    // The parser renders the token directly from the source spelling.
    expect(diags[0].message).toBe(`stray '${String.fromCharCode(0xd800)}' in program`)
    expect(idents('int a\ud800b = 1;')).toEqual(['a', 'b'])
  })

  it('does not recurse per character on a long run of rejected ones', () => {
    // The old stray path recursed once per character, so a wall of non-ASCII
    // outside a literal overflowed the stack.
    const src = 'int ' + '☃'.repeat(40000) + ' x;'
    const diags = strayDiags(src)
    expect(diags).toHaveLength(40000)
    expect(idents(src)).toEqual(['x'])
  })
})

// ---------------------------------------------------------------------------
// Universal character names
// ---------------------------------------------------------------------------
describe('extended identifiers spelled as universal character names', () => {
  it('takes a \\u escape in the middle of an identifier', () => {
    cleanParse('int caf\\u00e9 = 1;')
    expect(declaredNames('int caf\\u00e9 = 1;')).toEqual(['café'])
  })

  it('takes a \\U escape in the middle of an identifier', () => {
    cleanParse('int x\\U000000e9 = 1;')
    expect(declaredNames('int x\\U000000e9 = 1;')).toEqual(['xé'])
  })

  it('takes a UCN as the first character', () => {
    cleanParse('int \\u00e9t\\u00e9 = 2;')
    expect(declaredNames('int \\u00e9t\\u00e9 = 2;')).toEqual(['été'])
  })

  it('accepts uppercase hex digits', () => {
    expect(idents('caf\\u00E9')).toEqual(['café'])
    // The *character*'s case still distinguishes two identifiers.
    expect(idents('caf\\u00C9 caf\\u00e9')).toEqual(['cafÉ', 'café'])
  })

  it('rejects a UCN naming a basic-character-set member (C11 6.4.3p2)', () => {
    // gcc: "error: universal character A is not valid in an identifier".
    const diags = lexDiags('int \\u0041BC = 1;')
    expect(diags).toHaveLength(1)
    expect(diags[0].severity).toBe('error')
    expect(diags[0].message).toBe('universal character \\u0041 is not valid in an identifier')
    // Reported once, then lexed as the identifier it spells — like GCC.
    expect(idents('int \\u0041BC = 1;')).toEqual(['ABC'])
  })

  it('echoes the UCN as written in the diagnostic', () => {
    expect(lexDiags('int a\\u00D7 = 1;')[0].message).toBe(
      'universal character \\u00D7 is not valid in an identifier',
    )
    expect(lexDiags('int a\\U00000041 = 1;')[0].message).toBe(
      'universal character \\U00000041 is not valid in an identifier',
    )
    expect(lexDiags('int a\\U00110000 = 1;')[0].message).toBe(
      'universal character \\U00110000 is not valid in an identifier',
    )
  })

  it('rejects a UCN naming a surrogate with GCC wording', () => {
    const diags = lexDiags('int a\\ud800 = 1;')
    expect(diags).toHaveLength(1)
    expect(diags[0].severity).toBe('error')
    expect(diags[0].message).toBe('\\ud800 is not a valid universal character')
    // The name stays a well-formed string rather than carrying a lone
    // surrogate into the AST.
    expect(idents('int a\\ud800 = 1;')).toEqual(['a�'])
  })

  it('rejects a UCN outside Annex D but allows \\u0024 for $', () => {
    // gcc rejects @ and ` and _ but takes $, because $
    // is a GNU identifier character.
    for (const ucn of ['\\u0040', '\\u0060', '\\u005f', '\\u0030', '\\u00a0']) {
      const diags = lexDiags('int a' + ucn + ' = 1;')
      expect(diags.map((d) => d.severity)).toEqual(['error'])
    }
    expect(lexDiags('int a\\u0024b = 1;')).toEqual([])
    expect(lexDiags('int \\u0024ab = 1;')).toEqual([])
    // ... and it is the same identifier as the one spelled with `$`.
    expect(idents('a\\u0024b a$b')).toEqual(['a$b', 'a$b'])
  })

  it('applies the initial-position restriction to UCNs too', () => {
    const diags = lexDiags('int \\u0300a = 1;')
    expect(diags).toHaveLength(1)
    expect(diags[0].severity).toBe('error')
    expect(diags[0].message).toBe(
      'universal character \\u0300 is not valid at the start of an identifier',
    )
    expect(lexDiags('int a\\u0300 = 1;')).toEqual([])
  })

  it('leaves an incomplete UCN as a stray backslash', () => {
    // gcc lexes `\u00` as a stray `\` followed by the identifier `u00`, so an
    // incomplete escape must not swallow anything.
    expect(idents('int a\\u00 = 1;')).toEqual(['a', 'u00'])
    expect(strayDiags('int a\\u00 = 1;').map((d) => d.message)).toEqual(["stray '\\' in program"])
    expect(idents('int a\\U0000e9 = 1;')).toEqual(['a', 'U0000e9'])
    // A *complete* one, by contrast, is absorbed silently.
    expect(idents('int a\\u00e9 = 1;')).toEqual(['aé'])
  })

  it('produces the keyword a basic-letter UCN spells, as GCC does', () => {
    // `if` is two constraint violations, and gcc still hands the
    // parser the keyword `if` ("expected identifier or '(' before 'if'").
    const toks = tokenize('\\u0069\\u0066').filter((t) => t.kind !== TokenKind.Eof)
    expect(toks.map((t) => t.kind)).toEqual([TokenKind.If])
    expect(lexDiags('\\u0069\\u0066')).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// The two spellings name one identifier
// ---------------------------------------------------------------------------
describe('UCN and literal spellings are the same identifier', () => {
  it('gives both spellings one canonical name', () => {
    // gcc proves they are one identifier: `int café = 1; int café = 2;`
    // is "error: redefinition of 'café'".
    expect(idents('café caf\\u00e9 caf\\U000000e9')).toEqual(['café', 'café', 'café'])
  })

  it('resolves a typedef declared one way and used the other', () => {
    // The parser tracks typedefs by name, so the two spellings have to agree
    // or `été v` parses as two declarators instead of a declaration.
    const ast = cleanParse('typedef int \\u00e9t\\u00e9;\nété v = 1;')
    expect(ast.decls).toHaveLength(2)
    expect(declaredNames('typedef int \\u00e9t\\u00e9;\nété v = 1;')).toEqual(['été', 'v'])
  })

  it('finds a macro defined one way and invoked the other', () => {
    expect(expandText('#define café 42\nint x = caf\\u00e9;')).toBe('int x = 42 ;')
    expect(expandText('#define caf\\u00e9 42\nint x = café;')).toBe('int x = 42 ;')
  })

  it('sees both spellings through defined() and #ifdef', () => {
    expect(expandText('#define caf\\u00e9 1\n#ifdef café\nint ok;\n#endif')).toBe('int ok ;')
    expect(expandText('#define café 1\n#if defined caf\\u00e9\nint ok;\n#endif')).toBe('int ok ;')
  })

  it('matches a macro parameter across spellings', () => {
    expect(expandText('#define M(caf\\u00e9) ((café)+1)\nint x = M(2);')).toBe(
      'int x = ( ( 2 ) + 1 ) ;',
    )
    expect(expandText('#define M(é) ((\\u00e9)+1)\nint x = M(2);')).toBe('int x = ( ( 2 ) + 1 ) ;')
  })

  it('pastes a UCN onto an identifier with ##', () => {
    // gcc -E turns `P(caf,é)` into one identifier, printed back as a UCN
    // (`caf\U000000e9`). What has to hold is the identity: the pasted token
    // is the same name the literal spelling produces.
    expect(expandedIdents('#define P(a,b) a##b\nint P(caf,\\u00e9) = 1;')).toEqual(['café'])
    expect(expandedIdents('#define P(a,b) a##b\nint P(caf,é) = 1;')).toEqual(['café'])
    expect(declaredNames('#define P(a,b) a##b\nint P(caf,\\u00e9) = 1;\nint y = café;')).toEqual([
      'café',
      'y',
    ])
  })
})

// ---------------------------------------------------------------------------
// Stringification keeps the spelling (C11 6.10.3.2p2)
// ---------------------------------------------------------------------------
describe('# stringification of extended identifiers', () => {
  it('reproduces a UCN-spelled argument as its UCN', () => {
    // gcc -E: `S(café)` -> "café", even when café is a macro.
    expect(expandText('#define S(x) #x\nconst char *s = S(caf\\u00e9);')).toBe(
      'const char * s = "caf\\u00e9" ;',
    )
    expect(expandText('#define S(x) #x\n#define café 1\nconst char *s = S(caf\\u00e9);')).toBe(
      'const char * s = "caf\\u00e9" ;',
    )
  })

  it('reproduces a literally-spelled argument as the literal character', () => {
    // gcc -E: `S(café)` -> "café".
    expect(expandText('#define S(x) #x\nconst char *s = S(café);')).toBe(
      'const char * s = "café" ;',
    )
  })

  it('preserves non-identifier extended characters for stringification', () => {
    // These are `Stray` preprocessing tokens rather than identifiers, but
    // they remain valid macro arguments and disappear inside the resulting
    // string literal before the parser sees them.
    expect(expandText('#define S(x) #x\nconst char *a = S(☃);')).toBe('const char * a = "☃" ;')
    expect(expandText('#define S(x) #x\nconst char *b = S(©);')).toBe('const char * b = "©" ;')
    cleanParse('#define S(x) #x\nconst char *a = S(☃);\nconst char *b = S(©);')
  })

  it('records the source spelling on the token only when it differs', () => {
    const ucn = tokenize('caf\\u00e9')[0]
    expect(ucn.value).toBe('café')
    expect(ucn.spelling).toBe('caf\\u00e9')
    const literal = tokenize('café')[0]
    expect(literal.value).toBe('café')
    expect(literal.spelling).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Nothing outside identifier position changes
// ---------------------------------------------------------------------------
describe('extended characters outside identifier position', () => {
  it('leaves literals and comments alone', () => {
    // These already worked; assert them next to a case that did not, so the
    // classification cannot leak out of identifier position unnoticed.
    cleanParse('const char *s = "café";')
    cleanParse('const char *s = "caf\\u00e9";')
    cleanParse("char c = 'é';")
    cleanParse('/* café ☃ \\u00e9 */\nint x = 1;')
    cleanParse('// café ☃\nint y = 1;')
    // A snowman is legal in a literal and an error in an identifier.
    cleanParse('const char *s = "a☃b";')
    expect(strayDiags('int a☃b;').map((d) => d.severity)).toEqual(['error'])
  })

  it('keeps a UCN escape in a string literal as a character escape', () => {
    const ast = cleanParse('const char *s = "caf\\u00e9";')
    expect(JSON.stringify(ast.decls)).toContain('café')
    // In identifier position the same escape names the declarator instead.
    expect(declaredNames('int caf\\u00e9;')).toEqual(['café'])
  })

  it('does not treat an extended character as a number or punctuation', () => {
    // U+0660 ARABIC-INDIC DIGIT ZERO is an Annex D identifier character, not
    // a digit: gcc takes it in both positions of an identifier.
    expect(idents('a٠ ٠a')).toEqual(['a٠', '٠a'])
    expect(tokenize('٠a')[0].kind).toBe(TokenKind.Identifier)
  })
})
