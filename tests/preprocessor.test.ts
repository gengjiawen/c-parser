import { parse } from '../src/index'
import { Scanner } from '../src/lexer/scanner'
import { Token, TokenKind, TokenFlags } from '../src/lexer/token'
import { MacroTable, MacroDef } from '../src/preprocessor/macro-table'
import { preprocess } from '../src/preprocessor/preprocessor'
import { spellingOf } from '../src/preprocessor/directives'
import type * as AST from '../src/ast/nodes'

function tokenize(source: string): Token[] {
  return new Scanner(source).scan()
}

/**
 * The preprocessed token stream as text, the way `gcc -E -P` prints it — the
 * only way to assert on an expansion whose result is not valid C.
 */
function expandText(source: string): string {
  const pp = preprocess(source, tokenize(source), { gnuExtensions: true, profile: 'none' })
  return pp.tokens
    .filter((t) => t.kind !== TokenKind.Eof)
    .map((t) => spellingOf(t, source))
    .join(' ')
}

function hasBOL(t: Token): boolean {
  return ((t.flags ?? 0) & TokenFlags.BOL) !== 0
}

function hasSpaceBefore(t: Token): boolean {
  return ((t.flags ?? 0) & TokenFlags.SpaceBefore) !== 0
}

function dirAt<T extends AST.PreprocessorDirective['type']>(
  ast: AST.TranslationUnit,
  i: number,
  type: T,
): Extract<AST.PreprocessorDirective, { type: T }> {
  const d = ast.directives[i]
  expect(d.type).toBe(type)
  return d as Extract<AST.PreprocessorDirective, { type: T }>
}

// ---------------------------------------------------------------------------
// Group A: scanner flags, line splicing, literal hardening
// ---------------------------------------------------------------------------
describe('scanner token flags', () => {
  it('marks the first token and tokens after newlines as BOL', () => {
    const toks = tokenize('a b\nc')
    expect(hasBOL(toks[0])).toBe(true) // a
    expect(hasBOL(toks[1])).toBe(false) // b (same line)
    expect(hasSpaceBefore(toks[1])).toBe(true)
    expect(hasBOL(toks[2])).toBe(true) // c (after newline)
  })

  it('marks a leading-whitespace first token as BOL', () => {
    const toks = tokenize('  #if')
    expect(hasBOL(toks[0])).toBe(true) // '#'
    expect(hasSpaceBefore(toks[0])).toBe(true)
  })

  it('always marks Eof as BOL', () => {
    const toks = tokenize('a')
    expect(toks[1].kind).toBe(TokenKind.Eof)
    expect(hasBOL(toks[1])).toBe(true)
  })

  it('treats backslash-newline as a splice, not a line break', () => {
    const toks = tokenize('a \\\n b')
    expect(toks[1].value).toBe('b')
    expect(hasBOL(toks[1])).toBe(false)
    expect(hasSpaceBefore(toks[1])).toBe(true)
  })

  it('splices backslash + trailing spaces + newline with a warning', () => {
    const scanner = new Scanner('a \\ \t\n b')
    const toks = scanner.scan()
    expect(toks[1].value).toBe('b')
    expect(hasBOL(toks[1])).toBe(false)
    expect(scanner.diagnostics).toHaveLength(1)
    expect(scanner.diagnostics[0].severity).toBe('warning')
    expect(scanner.diagnostics[0].message).toContain('backslash and newline')
  })

  it('sets BOL after line comments but not inside block comments', () => {
    const line = tokenize('a // c\nb')
    expect(hasBOL(line[1])).toBe(true) // b starts a fresh line

    // A block comment reads as a single space: newlines inside it do not
    // terminate the logical line.
    const block = tokenize('a /* x\ny */ b')
    expect(block[1].value).toBe('b')
    expect(hasBOL(block[1])).toBe(false)
    expect(hasSpaceBefore(block[1])).toBe(true)
  })

  it('extends a line comment across a backslash-newline splice', () => {
    const toks = tokenize('a // c \\\nstill comment\nb')
    expect(toks[1].value).toBe('b')
    expect(hasBOL(toks[1])).toBe(true)
  })

  it('terminates a string literal at a raw newline with a diagnostic', () => {
    const scanner = new Scanner('"abc\ndef"')
    const toks = scanner.scan()
    expect(toks[0].kind).toBe(TokenKind.StringLiteral)
    expect(toks[0].value).toBe('abc')
    // Two diagnostics, like GCC: the newline-terminated string, then the
    // reopened `"` at the tail running to EOF.
    expect(scanner.diagnostics).toHaveLength(2)
    expect(scanner.diagnostics[0].severity).toBe('error')
    expect(scanner.diagnostics[0].message).toContain('missing terminating')
    expect(scanner.diagnostics[1].message).toContain('missing terminating')
    // The newline is not consumed: the next token still begins a line.
    expect(toks[1].value).toBe('def')
    expect(hasBOL(toks[1])).toBe(true)
  })

  it('terminates a char literal at a raw newline with a diagnostic', () => {
    const scanner = new Scanner("'x\ny")
    const toks = scanner.scan()
    expect(toks[0].kind).toBe(TokenKind.CharLiteral)
    expect(toks[0].value).toBe('x')
    expect(scanner.diagnostics).toHaveLength(1)
    expect(hasBOL(toks[1])).toBe(true)
  })

  it('splices backslash-newline inside a string literal', () => {
    const scanner = new Scanner('"ab\\\ncd"')
    const toks = scanner.scan()
    expect(toks[0].kind).toBe(TokenKind.StringLiteral)
    expect(toks[0].value).toBe('abcd')
    expect(scanner.diagnostics).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Group B: directive recognition, extent, AST nodes
// ---------------------------------------------------------------------------
describe('preprocessor directives', () => {
  it('consumes a #define and keeps its tokens out of the parser', () => {
    const ast = parse('#define X 1\nint a;')
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(1)
    const d = dirAt(ast, 0, 'DefineDirective')
    expect(d.name).toBe('X')
    expect(d.functionLike).toBe(false)
    expect(d.body).toBe('1')
  })

  it('recognizes indented and internally spaced directives', () => {
    const ast = parse('   #   define X 1\nint a;')
    expect(ast.errors).toHaveLength(0)
    expect(dirAt(ast, 0, 'DefineDirective').name).toBe('X')
  })

  it('matches keyword directive names by token kind', () => {
    // `if` and `else` lex as keywords, not identifiers
    const ast = parse('#if 1\nint a;\n#else\nint b;\n#endif\n')
    expect(ast.directives).toHaveLength(3)
    const ifDir = dirAt(ast, 0, 'IfDirective')
    expect(ifDir.kind).toBe('if')
    expect(ifDir.condition).toBe('1')
    expect(ifDir.active).toBe(true)
    const elseDir = dirAt(ast, 1, 'ElseDirective')
    expect(elseDir.active).toBe(false)
    dirAt(ast, 2, 'EndifDirective')
    // Only the taken branch reaches the parser
    expect(ast.decls).toHaveLength(1)
    expect(ast.decls[0].start).toBe('#if 1\n'.length) // the `int a;` branch
  })

  it('accepts a keyword token as a macro name', () => {
    const ast = parse('#define _Atomic\nint a;')
    expect(dirAt(ast, 0, 'DefineDirective').name).toBe('_Atomic')
    expect(ast.errors).toHaveLength(0)
  })

  it('joins backslash-continued lines into one directive', () => {
    const ast = parse('#define ADD(a, b) \\\n  ((a) + \\\n   (b))\nint x;')
    expect(ast.directives).toHaveLength(1)
    const d = dirAt(ast, 0, 'DefineDirective')
    expect(d.functionLike).toBe(true)
    expect(d.params).toEqual(['a', 'b'])
    expect(d.body).toContain('(a)')
    expect(d.body).toContain('(b)')
    expect(ast.decls).toHaveLength(1)
    expect(ast.errors).toHaveLength(0)
  })

  it('distinguishes function-like from object-like by ( adjacency', () => {
    const ast = parse('#define F(x) x\n#define G (x)\nint a;')
    const f = dirAt(ast, 0, 'DefineDirective')
    expect(f.functionLike).toBe(true)
    expect(f.params).toEqual(['x'])
    const g = dirAt(ast, 1, 'DefineDirective')
    expect(g.functionLike).toBe(false)
    expect(g.params).toEqual([])
    expect(g.body).toBe('(x)')
  })

  it('parses variadic parameter lists', () => {
    const ast = parse('#define P(fmt, ...) x\n#define Q(args...) y\nint a;')
    const p = dirAt(ast, 0, 'DefineDirective')
    expect(p.variadic).toBe(true)
    expect(p.params).toEqual(['fmt']) // standard ... reported via the flag
    const q = dirAt(ast, 1, 'DefineDirective')
    expect(q.variadic).toBe(true)
    expect(q.params).toEqual(['args']) // GNU named variadic keeps its name
    expect(ast.errors).toHaveLength(0)
  })

  it('diagnoses unmatched conditional directives', () => {
    const lone = parse('#endif\nint a;')
    expect(lone.errors.some((d) => d.message.includes('#endif without #if'))).toBe(true)
    expect(lone.decls).toHaveLength(1)

    const open = parse('#if 1\nint a;')
    expect(open.errors.some((d) => d.message.includes('unterminated conditional'))).toBe(true)
  })

  it('warns on unknown directives and ignores the null directive', () => {
    const unknown = parse('#frobnicate 1\nint a;')
    expect(dirAt(unknown, 0, 'UnknownDirective').name).toBe('frobnicate')
    expect(unknown.errors.some((d) => d.message.includes('invalid preprocessing directive'))).toBe(
      true,
    )

    const nullDir = parse('#\nint a;')
    expect(nullDir.directives).toHaveLength(0)
    expect(nullDir.errors).toHaveLength(0)
    expect(nullDir.decls).toHaveLength(1)
  })

  it('records include, pragma, error, and undef directives', () => {
    const ast = parse(
      '#include <stdio.h>\n#include "foo.h"\n#pragma GCC diagnostic push\n#error nope\n#undef X\nint a;',
    )
    const sys = dirAt(ast, 0, 'IncludeDirective')
    expect(sys.path).toBe('<stdio.h>')
    expect(sys.system).toBe(true)
    const local = dirAt(ast, 1, 'IncludeDirective')
    expect(local.path).toBe('"foo.h"')
    expect(local.system).toBe(false)
    expect(dirAt(ast, 2, 'PragmaDirective').text).toBe('GCC diagnostic push')
    const err = dirAt(ast, 3, 'ErrorDirective')
    expect(err.kind).toBe('error')
    expect(err.text).toBe('nope')
    expect(dirAt(ast, 4, 'UndefDirective').name).toBe('X')
    // #error in an active region reports the line text
    expect(ast.errors).toHaveLength(1)
    expect(ast.errors[0].message).toBe('#error nope')
    expect(ast.errors[0].severity).toBe('error')
    expect(ast.decls).toHaveLength(1)
  })

  it('keeps surrounding declarations intact', () => {
    const ast = parse('int a;\n#define B 2\nint c = 3;')
    expect(ast.decls).toHaveLength(2)
    expect(ast.errors).toHaveLength(0)
  })

  it('gives directive nodes spans covering # through the last token', () => {
    const src = '#define X 1\nint a;'
    const ast = parse(src)
    const d = ast.directives[0]
    expect(d.start).toBe(0)
    expect(d.end).toBe('#define X 1'.length)
  })
})

// ---------------------------------------------------------------------------
// Group C: macro table semantics
// ---------------------------------------------------------------------------
describe('macro table', () => {
  function bodyTokens(source: string): Token[] {
    return tokenize(source).filter((t) => t.kind !== TokenKind.Eof)
  }

  function objectDef(name: string, body: Token[]): MacroDef {
    const nameToken: Token = { kind: TokenKind.Identifier, start: 0, end: 0, value: name }
    return { name, functionLike: false, params: [], variadic: false, body, nameToken }
  }

  it('defines, looks up, and undefines macros', () => {
    const src = '1 + 2'
    const table = new MacroTable()
    const def = objectDef('A', bodyTokens(src))
    expect(table.define(def, src)).toBe('defined')
    expect(table.isDefined('A')).toBe(true)
    expect(table.get('A')).toBe(def)
    expect(table.define(objectDef('A', bodyTokens(src)), src)).toBe('same')
    expect(table.undef('A')).toBe(true)
    expect(table.undef('A')).toBe(false)
    expect(table.isDefined('A')).toBe(false)
  })

  it('treats identical redefinition as silent and different as a warning', () => {
    const same = parse('#define A (1 + 2)\n#define A (1  +  2)\nint x;')
    expect(same.errors).toHaveLength(0) // all whitespace separations are equal

    const diff = parse('#define A (1 + 2)\n#define A (1+2)\nint x;')
    const warnings = diff.errors.filter((d) => d.severity === 'warning')
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toContain('macro redefined')

    const undefFirst = parse('#define A 1\n#undef A\n#define A 2\nint x;')
    expect(undefFirst.errors).toHaveLength(0)
  })

  it('flags a function/object kind change as a redefinition', () => {
    const ast = parse('#define A 1\n#define A(x) 1\nint y;')
    const warnings = ast.errors.filter((d) => d.severity === 'warning')
    expect(warnings).toHaveLength(1)
  })

  it('compares keyword-token bodies by spelling', () => {
    const ast = parse('#define K if (x)\n#define K if (x)\nint y;')
    expect(ast.errors).toHaveLength(0)
  })

  it('is silent on #undef of an unknown name', () => {
    const ast = parse('#undef NEVER_DEFINED\nint x;')
    expect(ast.errors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Group G: conditional evaluation
// ---------------------------------------------------------------------------
describe('conditional evaluation', () => {
  it('includes only the taken branch', () => {
    const ast = parse('#if 0\nint a;\n#endif\n#if 1\nint b;\n#endif\n')
    expect(ast.decls).toHaveLength(1)
    expect(ast.errors).toHaveLength(0)
    expect(dirAt(ast, 0, 'IfDirective').active).toBe(false)
    expect(dirAt(ast, 2, 'IfDirective').active).toBe(true)
  })

  it('evaluates #ifdef and #ifndef against the macro table', () => {
    const ast = parse('#define X 1\n#ifdef X\nint a;\n#endif\n#ifndef X\nint b;\n#endif\n')
    expect(ast.decls).toHaveLength(1)
    expect(ast.decls[0].start).toBe('#define X 1\n#ifdef X\n'.length)
    const undef = parse('#define X 1\n#undef X\n#ifdef X\nint a;\n#endif\nint c;')
    expect(undef.decls).toHaveLength(1)
  })

  it('takes the first true #elif and skips later ones unevaluated', () => {
    // The 1/0 in the third branch must not report: conditions after the
    // taken branch are skipped without evaluation.
    const ast = parse('#if 0\nint a;\n#elif 1\nint b;\n#elif 1/0\nint c;\n#else\nint d;\n#endif\n')
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(1)
    expect(ast.decls[0].start).toBe('#if 0\nint a;\n#elif 1\n'.length)
    expect(dirAt(ast, 1, 'IfDirective').active).toBe(true)
    expect(dirAt(ast, 2, 'IfDirective').active).toBe(false)
    expect(dirAt(ast, 3, 'ElseDirective').active).toBe(false)
  })

  it('short-circuits && and || without evaluating dead operands', () => {
    const ast = parse('#if defined(X) && 10 / X\nint a;\n#endif\nint keep;')
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(1)
    const or = parse('#if 1 || 1/0\nint a;\n#endif\n')
    expect(or.errors).toHaveLength(0)
    expect(or.decls).toHaveLength(1)
  })

  it('does not evaluate the dead arm of ?:', () => {
    const ast = parse('#if 1 ? 1 : 1/0\nint a;\n#endif\n')
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(1)
  })

  it('reports live division by zero and skips the region', () => {
    const ast = parse('#if 1/0\nint a;\n#endif\nint keep;')
    expect(ast.errors.some((d) => d.message.includes('division by zero'))).toBe(true)
    expect(ast.decls).toHaveLength(1) // only `keep`
  })

  it('applies the usual arithmetic conversions (-1 > 0U)', () => {
    const ast = parse('#if -1 > 0U\nint wrapped;\n#endif\n')
    expect(ast.decls).toHaveLength(1) // -1 converts to UINT64_MAX
    expect(ast.errors).toHaveLength(0)
  })

  it('evaluates 64-bit values exactly', () => {
    const ast = parse('#if 9223372036854775807 > 9223372036854775806\nint a;\n#endif\n')
    expect(ast.decls).toHaveLength(1)
    expect(ast.errors).toHaveLength(0)
  })

  it('handles precedence, shifts, bit ops, and unary operators', () => {
    const src =
      '#if 2 + 3 * 4 == 14 && (1 << 10) == 1024 && (7 & 3) == 3 && ~0 == -1 && !0 && (5 | 2) == 7 && (5 ^ 1) == 4 && (7 >> 1) == 3 && 7 % 4 == 3\nint a;\n#endif\n'
    const ast = parse(src)
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(1)
  })

  it('evaluates character literals', () => {
    const ast = parse("#if 'A' == 65\nint a;\n#endif\n")
    expect(ast.decls).toHaveLength(1)
    expect(ast.errors).toHaveLength(0)
  })

  it('treats undefined identifiers as 0', () => {
    const ast = parse('#if NEVER_SEEN\nint a;\n#endif\n#if NEVER_SEEN == 0\nint b;\n#endif\n')
    expect(ast.decls).toHaveLength(1)
    expect(ast.errors).toHaveLength(0)
  })

  it('supports both defined forms', () => {
    const ast = parse(
      '#define Y 1\n#if defined Y && defined(Y) && !defined(NOPE)\nint a;\n#endif\n',
    )
    expect(ast.decls).toHaveLength(1)
    expect(ast.errors).toHaveLength(0)
    const kw = parse('#define _Atomic\n#if defined(_Atomic)\nint a;\n#endif\n')
    expect(kw.decls).toHaveLength(1)
  })

  it('expands object macros in conditions, with blue paint', () => {
    const chain = parse('#define A B\n#define B 4\n#if A == 4\nint a;\n#endif\n')
    expect(chain.decls).toHaveLength(1)
    expect(chain.errors).toHaveLength(0)
    // Self-referential macro terminates and evaluates as an identifier (0)
    const self = parse('#define R R\n#if R\nint a;\n#endif\nint keep;')
    expect(self.decls).toHaveLength(1)
    expect(self.errors).toHaveLength(0)
  })

  it('ignores everything inside a skipped group', () => {
    const src = [
      '#if 0',
      '#define D 1',
      '#error boom',
      '#include <nope.h>',
      // Prose, not code (the whole source is scanned eagerly, so it must
      // still lex — but the parser never sees these tokens).
      'random prose that is not valid C',
      '#endif',
      '#ifdef D',
      'int d;',
      '#endif',
      'int keep;',
    ].join('\n')
    const ast = parse(src)
    expect(ast.decls).toHaveLength(1) // only `keep` — D was never defined
    expect(ast.errors.filter((d) => d.severity === 'error')).toHaveLength(0)
    // Only boundary directives at active levels are recorded
    expect(ast.directives.map((d) => d.type)).toEqual([
      'IfDirective',
      'EndifDirective',
      'IfDirective',
      'EndifDirective',
    ])
  })

  it('balances nested conditionals inside skipped groups', () => {
    const ast = parse('#if 0\n#if 1\nint a;\n#else\nint b;\n#endif\n#endif\nint keep;')
    expect(ast.decls).toHaveLength(1)
    expect(ast.errors).toHaveLength(0)
    expect(ast.directives).toHaveLength(2) // outer #if/#endif only
  })

  it('records skippedRange on the directive that opened the dead region', () => {
    const src = '#if 0\nint a;\n#else\nint b;\n#endif\n'
    const ast = parse(src)
    const ifDir = dirAt(ast, 0, 'IfDirective')
    expect(ifDir.active).toBe(false)
    expect(ifDir.skippedRange).toEqual({
      start: '#if 0'.length,
      end: src.indexOf('#else'),
    })
    const elseDir = dirAt(ast, 1, 'ElseDirective')
    expect(elseDir.active).toBe(true)
    expect(elseDir.skippedRange).toBeUndefined()
  })

  it('diagnoses #elif and #else after #else', () => {
    const elifAfter = parse('#if 1\n#else\n#elif 1\n#endif\nint a;')
    expect(elifAfter.errors.some((d) => d.message.includes('#elif after #else'))).toBe(true)
    const doubleElse = parse('#if 1\n#else\n#else\n#endif\nint a;')
    expect(doubleElse.errors.some((d) => d.message.includes('#else after #else'))).toBe(true)
  })

  it('rejects floating constants in conditions', () => {
    const flt = parse('#if 1.5\nint a;\n#endif\nint keep;')
    expect(flt.errors.some((d) => d.message.includes('floating constant'))).toBe(true)
    expect(flt.decls).toHaveLength(1) // condition errors skip the region
  })

  it('expands function-like macros in conditions', () => {
    const fn = parse('#define F(x) ((x) + 1)\n#if F(1) == 2\nint a;\n#endif\n')
    expect(fn.errors).toHaveLength(0)
    expect(fn.decls).toHaveLength(1)
    // An invocation left open in the condition stays unexpanded: F alone
    // evaluates as an identifier (0) and the stray tail is diagnosed.
    const open = parse('#define F(x) x\n#if F\nint a;\n#endif\nint keep;')
    expect(open.errors).toHaveLength(0)
    expect(open.decls).toHaveLength(1)
  })

  it('reports #error only in active regions', () => {
    const ast = parse('#if 0\n#error dead\n#endif\n#if 1\n#error alive\n#endif\nint a;')
    const errs = ast.errors.filter((d) => d.message.startsWith('#error'))
    expect(errs).toHaveLength(1)
    expect(errs[0].message).toBe('#error alive')
  })
})

// ---------------------------------------------------------------------------
// Group D: object-macro expansion in the output stream
// ---------------------------------------------------------------------------
describe('object-macro stream expansion', () => {
  it('replaces object macros in code', () => {
    const ast = parse('#define N 10\nint a[N];')
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(1)
    expect(JSON.stringify(ast.decls)).toContain('10')
  })

  it('expands chains and stops at painted tokens', () => {
    const chain = parse('#define A B\n#define B C\n#define C 42\nint x = A;')
    expect(chain.errors).toHaveLength(0)
    expect(JSON.stringify(chain.decls)).toContain('42')

    const self = parse('#define stderr stderr\nint x = stderr;')
    expect(self.errors).toHaveLength(0)
    expect(JSON.stringify(self.decls)).toContain('stderr')
  })

  it('expands empty macros to nothing', () => {
    const ast = parse('#define __exception\n__exception int f(void);')
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(1)
  })

  it('leaves function-like macro names alone without arguments', () => {
    const ast = parse('#define F(x) x\nint a = F;')
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(1)
  })

  it('gives expansion output the call-site span', () => {
    const src = '#define N 10\nint a[N];'
    const ast = parse(src)
    const json = JSON.stringify(ast.decls)
    // No node may point outside the user source (macro bodies live in the
    // directive line; the expanded literal must carry the N call site).
    expect(ast.decls[0].start).toBe(src.indexOf('int a[N];'))
    expect(ast.decls[0].end).toBe(src.length)
    expect(json).not.toContain(`"start":${src.indexOf('10')}`)
  })
})

describe('preprocessed token budget', () => {
  const body = Array.from({ length: 100 }, () => '1').join(' + ')
  const calls = Array.from({ length: 100 }, (_, i) => `int a${i} = M;`).join('\n')
  const source = `#define M ${body}\n${calls}\n`

  it('does not reject legitimate output merely because it grows over 20-fold', () => {
    const ast = parse(source)
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(100)
  })

  it('keeps the absolute resource budget configurable', () => {
    const ast = parse(source, { maxPreprocessedTokens: 1_000 })
    expect(ast.errors.some((d) => d.message.includes('preprocessed token limit'))).toBe(true)
    expect(ast.decls.length).toBeLessThan(100)
  })

  it('rejects invalid resource budgets', () => {
    for (const maxPreprocessedTokens of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => parse('int x;', { maxPreprocessedTokens })).toThrow(RangeError)
    }
  })
})

// ---------------------------------------------------------------------------
// Group H: predefined-macro profile and the macros option
// ---------------------------------------------------------------------------
describe('predefined macro profile', () => {
  it('defines the gcc-linux-x64 world by default', () => {
    const ast = parse(
      '#ifdef __GNUC__\nint gcc;\n#endif\n#ifdef _WIN32\nint win;\n#endif\n#ifndef _MSC_VER\nint notmsvc;\n#endif\n',
    )
    expect(ast.decls).toHaveLength(2) // gcc, notmsvc
    expect(ast.errors).toHaveLength(0)
  })

  it('evaluates the quickjs GCC version ladder', () => {
    const src =
      '#if (__GNUC__ << 16) + __GNUC_MINOR__ < ((4) << 16) + 9\nint old_gcc;\n#else\nint new_gcc;\n#endif\n'
    const ast = parse(src)
    expect(ast.decls).toHaveLength(1)
    expect(ast.decls[0].start).toBe(src.indexOf('int new_gcc'))
  })

  it('compares INTPTR_MAX == INT64_MAX exactly', () => {
    const ast = parse(
      '#include <stdint.h>\n#if INTPTR_MAX == INT64_MAX\nint lp64;\n#endif\n' +
        '#if INT32_MAX == INT64_MAX\nint bogus;\n#endif\n',
    )
    // The second #if proves the comparison is non-vacuous (both sides
    // undefined would also compare equal, as 0 == 0).
    expect(ast.decls).toHaveLength(1)
    expect(ast.errors).toHaveLength(0)
  })

  it('provides stdbool and stdarg shims once included', () => {
    const ast = parse(
      '#include <stdbool.h>\n#include <stdarg.h>\nbool flag = true;\n#ifdef va_arg\nint has_va;\n#endif\n',
    )
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(2) // bool → _Bool, true → 1
  })

  it("profile 'none' predefines nothing", () => {
    const ast = parse('#ifdef __GNUC__\nint gcc;\n#endif\nint keep;', { profile: 'none' })
    expect(ast.decls).toHaveLength(1)
  })

  it('accepts user macros like -D', () => {
    const ast = parse('#if FOO == 42 && BAZ\nint a = BAR;\n#endif\n', {
      macros: { FOO: 42, BAR: 'x + 1', BAZ: true },
    })
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(1)
    expect(JSON.stringify(ast.decls)).toContain('"x"')
  })

  it('force-undefines with false and overrides silently', () => {
    const off = parse('#ifdef __linux__\nint a;\n#endif\nint keep;', {
      macros: { __linux__: false },
    })
    expect(off.decls).toHaveLength(1)

    const override = parse('#if __GNUC__ == 99\nint a;\n#endif\n', { macros: { __GNUC__: 99 } })
    expect(override.errors).toHaveLength(0) // no 'macro redefined' noise
    expect(override.decls).toHaveLength(1)
  })

  it('defines function-like user macros via parenthesized keys', () => {
    const ast = parse('#ifdef DOUBLE\nint has;\n#endif\n', { macros: { 'DOUBLE(a)': 'a * 2' } })
    expect(ast.decls).toHaveLength(1)
    expect(ast.errors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Group E: function-like macro expansion
// ---------------------------------------------------------------------------
describe('function-like macro expansion', () => {
  const json = (ast: unknown): string =>
    JSON.stringify(ast, (k, v) => (typeof v === 'bigint' ? v.toString() : v))

  it('expands a basic invocation', () => {
    const ast = parse('#define SQR(x) ((x) * (x))\nint a = SQR(3);')
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(1)
    expect(json(ast.decls)).toContain('"value":3')
  })

  it('protects commas inside nested parentheses', () => {
    const ast = parse('#define ADD(a, b) ((a) + (b))\nint x = ADD(f(1, 2), 3);')
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(1)
  })

  it('collects arguments across lines', () => {
    const ast = parse('#define F(a) a\nint y = F(\n  42\n);')
    expect(ast.errors).toHaveLength(0)
    expect(json(ast.decls)).toContain('"value":42')
  })

  it('pre-expands arguments and rescans the result', () => {
    const chain = parse('#define A(x) B(x)\n#define B(x) ((x) * 2)\n#define ONE 1\nint r = A(ONE);')
    expect(chain.errors).toHaveLength(0)
    expect(json(chain.decls)).toContain('"value":1')
  })

  it('expands invocations produced by object macros', () => {
    const ast = parse('#define SQ(x) ((x) * (x))\n#define CALL SQ(2)\nint t = CALL;')
    expect(ast.errors).toHaveLength(0)
    expect(json(ast.decls)).toContain('"value":2')
  })

  it('terminates on self-referential invocations', () => {
    const ast = parse('#define F(x) F(x)\nint g(int);\nint s = F(1);')
    // F(1) expands once, the inner F is painted, and the parser sees a
    // plain call expression.
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(2)
  })

  it('accepts empty and zero arguments', () => {
    const empty = parse('#define D(x) x + 1\nint z = D();')
    expect(empty.errors).toHaveLength(0) // z = +1
    const zero = parse('#define NIL() 0\nint n = NIL();')
    expect(zero.errors).toHaveLength(0)
  })

  it('diagnoses arity mismatches and leaves the invocation alone', () => {
    const few = parse('#define T(a, b) a\nint x = T(1);')
    expect(
      few.errors.some((d) => d.message === 'macro "T" requires 2 arguments, but only 1 given'),
    ).toBe(true)
    const many = parse('#define T(a, b) a\nint x = T(1, 2, 3);')
    expect(
      many.errors.some((d) => d.message === 'macro "T" passed 3 arguments, but takes just 2'),
    ).toBe(true)
  })

  it('diagnoses an unterminated argument list', () => {
    const ast = parse('#define U(x) x\nint u = U(1')
    expect(
      ast.errors.some((d) => d.message === 'unterminated argument list invoking macro "U"'),
    ).toBe(true)
  })

  it('expands statement-shaped macros like list_for_each', () => {
    const src = [
      '#define list_for_each(el, head) for (el = (head)->next; el != (head); el = el->next)',
      'struct list { struct list *next; };',
      'void f(struct list *h) {',
      '  struct list *el;',
      '  list_for_each(el, h) { }',
      '}',
    ].join('\n')
    const ast = parse(src)
    expect(ast.errors).toHaveLength(0)
  })

  it('processes directives inside argument lists, with the GCC warning', () => {
    const ast = parse('#define G(x) x\nint v = G(\n#define H 7\nH);')
    expect(ast.errors.filter((d) => d.severity === 'error')).toHaveLength(0)
    expect(
      ast.errors.some(
        (d) => d.message === 'embedding a directive within macro arguments is not portable',
      ),
    ).toBe(true)
    expect(json(ast.decls)).toContain('"value":7')
  })

  it('keeps expansion spans at the call site', () => {
    const src = '#define SQR(x) ((x) * (x))\nint a = SQR(3);'
    const ast = parse(src)
    const decl = json(ast.decls)
    // No node may reference the macro definition line.
    expect(ast.decls[0].start).toBe(src.indexOf('int a'))
    expect(ast.decls[0].end).toBe(src.length)
    expect(decl).not.toContain(`"start":${src.indexOf('((x)')}`)
  })
})

// ---------------------------------------------------------------------------
// Group F: # stringify, ## paste, variadics
// ---------------------------------------------------------------------------
describe('stringify, paste, and variadics', () => {
  const json = (ast: unknown): string =>
    JSON.stringify(ast, (k, v) => (typeof v === 'bigint' ? v.toString() : v))

  it('stringifies raw argument tokens', () => {
    const ast = parse('#define S(x) #x\nconst char *p = S(hello world);')
    expect(ast.errors).toHaveLength(0)
    expect(json(ast.decls)).toContain('hello world')
  })

  it('normalizes interior whitespace to one space', () => {
    const ast = parse('#define S(x) #x\nconst char *p = S(a    +   b);')
    expect(ast.errors).toHaveLength(0)
    expect(json(ast.decls)).toContain('"a + b"')
  })

  it('escapes quotes and backslashes in nested literals', () => {
    const ast = parse('#define S(x) #x\nconst char *p = S("q\\n");')
    expect(ast.errors).toHaveLength(0)
    // The result string's characters are exactly the argument's spelling.
    expect(json(ast.decls)).toContain(JSON.stringify('"q\\n"'))
  })

  it('stringifies expanded macros only through a second level', () => {
    const src =
      '#define STR(x) #x\n#define XSTR(x) STR(x)\n#define VER 12\nconst char *a = STR(VER);\nconst char *b = XSTR(VER);'
    const ast = parse(src)
    expect(ast.errors).toHaveLength(0)
    const j = json(ast.decls)
    expect(j).toContain('"VER"') // direct: raw argument
    expect(j).toContain('"12"') // indirect: argument pre-expanded
  })

  it('pastes identifiers, keywords, and numbers', () => {
    const ids = parse('#define CAT(a, b) a ## b\nint CAT(foo, bar) = 1;')
    expect(ids.errors).toHaveLength(0)
    expect(json(ids.decls)).toContain('foobar')
    const kw = parse('#define CAT(a, b) a ## b\nCAT(in, t) x = 2;')
    expect(kw.errors).toHaveLength(0) // in ## t re-lexes as the keyword int
    const num = parse('#define CAT(a, b) a ## b\nint n = CAT(1, 2);')
    expect(num.errors).toHaveLength(0)
    expect(json(num.decls)).toContain('"value":12')
  })

  it('pastes in object-like macro bodies too', () => {
    const ast = parse('#define GLUE a ## b\nint GLUE = 1;')
    expect(ast.errors).toHaveLength(0)
    expect(json(ast.decls)).toContain('"ab"')
  })

  it('reports invalid pastes and keeps both operands', () => {
    const ast = parse('#define CAT(a, b) a ## b\nint x = CAT(1, +) 2;')
    expect(
      ast.errors.some(
        (d) => d.message === 'pasting "1" and "+" does not give a valid preprocessing token',
      ),
    ).toBe(true)
    // Operands fall back to `1 + 2`, which parses.
    expect(ast.errors.filter((d) => d.phase === 'parser')).toHaveLength(0)
  })

  it('treats empty ## operands as placemarkers', () => {
    const pre = parse('#define J(a, b) a ## b\nint J(pre, ) = 3;')
    expect(pre.errors).toHaveLength(0)
    expect(json(pre.decls)).toContain('"pre"')
    const post = parse('#define J(a, b) a ## b\nint J(, post) = 3;')
    expect(post.errors).toHaveLength(0)
    expect(json(post.decls)).toContain('"post"')
  })

  it('pastes chains left to right', () => {
    const ast = parse('#define TRI(a, b, c) a ## b ## c\nint TRI(x, y, z) = 4;')
    expect(ast.errors).toHaveLength(0)
    expect(json(ast.decls)).toContain('"xyz"')
  })

  // C11 6.10.3.3p2: a placemarker is an operand, not an absence. It has to
  // shield whatever precedes it in the replacement list from being taken as
  // the left operand — gcc 15 gives `x r y` for all of these, never `xr y`.
  it('does not paste across a placemarker into the preceding token', () => {
    expect(expandText('#define P(a, b) x a##b y\nP(,r)\n')).toBe('x r y')
    expect(expandText('#define P(a, b, c) a b##c\nP(x,,z)\n')).toBe('x z')
    expect(expandText('#define P(a, b) "s" a##b\nP(,r)\n')).toBe('"s" r')
    expect(expandText('#define V(a, ...) w a##__VA_ARGS__\nV(,y)\n')).toBe('w y')
  })

  it('carries placemarkers through a chain of pastes', () => {
    const q = '#define Q(a, b, c) w a##b##c\n'
    expect(expandText(q + 'Q(,,z)\n')).toBe('w z')
    expect(expandText(q + 'Q(,y,z)\n')).toBe('w yz')
    expect(expandText(q + 'Q(x,,z)\n')).toBe('w xz')
    expect(expandText(q + 'Q(,,)\n')).toBe('w')
  })

  it('hands the placemarker its spacing so the stream still prints as gcc does', () => {
    const src = '#define P(a, b) x a##b\nP(,r)\n'
    const pp = preprocess(src, tokenize(src), { gnuExtensions: true, profile: 'none' })
    const toks = pp.tokens.filter((t) => t.kind !== TokenKind.Eof)
    expect(toks.map((t) => spellingOf(t, src))).toEqual(['x', 'r'])
    expect(hasSpaceBefore(toks[1])).toBe(true) // `x r`, which re-lexes the same
    // ...and no space is invented where the body had none.
    const tight = '#define F(a, b) f(a##b)\nF(,r)\n'
    const ppTight = preprocess(tight, tokenize(tight), { gnuExtensions: true, profile: 'none' })
    const rTok = ppTight.tokens.filter((t) => t.kind !== TokenKind.Eof)[2]
    expect(spellingOf(rTok, tight)).toBe('r')
    expect(hasSpaceBefore(rTok)).toBe(false) // `f(r)`
  })

  it('keeps a declaration intact when the paste prefix is empty', () => {
    const ast = parse('#define DECL(pfx, name) int pfx##name(void);\nDECL(,alpha)\nDECL(pre_,beta)')
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(2)
    const j = json(ast.decls)
    expect(j).toContain('"alpha"')
    expect(j).toContain('"pre_beta"')
    expect(j).not.toContain('intalpha')
  })

  it('expands a placemarker that arrives through another macro', () => {
    const src = '#define EMPTY\n#define P(a, b) x a##b\n#define R(a, b) P(a, b)\n'
    expect(expandText(src + 'R(EMPTY,z)\n')).toBe('x z')
    expect(expandText(src + 'R(,z)\n')).toBe('x z')
  })

  it('does not report a paste that a placemarker cancelled', () => {
    // The `##` operands here are `b` (empty) and `c`; the stringify result
    // before them is not an operand at all.
    const str = parse('#define P(a, b, c) const char *s = #a; int b##c;\nP(q,,z)')
    expect(str.errors).toHaveLength(0)
    expect(json(str.decls)).toContain('"q"')
    expect(json(str.decls)).toContain('"z"')
    // Same for a punctuator sitting in front of the placemarker.
    expect(expandText('#define P(a, b) f(a##b, 1)\nP(,x)\n')).toBe('f ( x , 1 )')
  })

  it('still reports a genuinely invalid paste after a placemarker', () => {
    const ast = parse('#define Q(a, b, c) w a##b##c\nQ(,+,-)')
    // gcc 15 reports exactly one paste error here, on `+` and `-`.
    const pastes = ast.errors.filter((d) => d.message.startsWith('pasting '))
    expect(pastes.map((d) => d.message)).toEqual([
      'pasting "+" and "-" does not give a valid preprocessing token',
    ])
    expect(expandText('#define Q(a, b, c) w a##b##c\nQ(,+,-)\n')).toBe('w + -')
  })

  it('substitutes __VA_ARGS__ with commas intact', () => {
    const src =
      '#define P(fmt, ...) printf(fmt, __VA_ARGS__)\nint printf(const char *, ...);\nvoid f(void) { P("%d%d", 1, 2); }'
    const ast = parse(src)
    expect(ast.errors).toHaveLength(0)
    expect(json(ast.decls)).toContain('"value":2')
  })

  it('swallows the comma for empty GNU `, ## __VA_ARGS__`', () => {
    const src = [
      '#define Q(fmt, ...) printf(fmt, ## __VA_ARGS__)',
      'int printf(const char *, ...);',
      'void g(void) { Q("hi"); Q("%d", 5); }',
    ].join('\n')
    const ast = parse(src)
    expect(ast.errors).toHaveLength(0)
    expect(json(ast.decls)).toContain('"value":5')
  })

  it('stringifies __VA_ARGS__ with separators', () => {
    const ast = parse('#define SA(...) #__VA_ARGS__\nconst char *s = SA(a, b);')
    expect(ast.errors).toHaveLength(0)
    expect(json(ast.decls)).toContain('"a, b"')
  })

  it('pastes literal suffixes via the INT64_C profile macro', () => {
    const ast = parse('#include <stdint.h>\nlong long big = INT64_C(9223372036854775807);')
    expect(ast.errors).toHaveLength(0)
    expect(json(ast.decls)).toContain('9223372036854775807')
    // Really expanded: an ungated INT64_C would parse as a call expression.
    expect(json(ast.decls)).not.toContain('CallExpression')
  })

  it('rejects ## at the ends and lone # at definition time', () => {
    const lead = parse('#define BAD ## x\nint a;')
    expect(lead.errors.some((d) => d.message.includes("'##' cannot appear at either end"))).toBe(
      true,
    )
    const hash = parse('#define H(x) # 1\nint a;')
    expect(
      hash.errors.some((d) => d.message.includes("'#' is not followed by a macro parameter")),
    ).toBe(true)
    const va = parse('#define V __VA_ARGS__\nint a;')
    expect(va.errors.some((d) => d.message.includes('__VA_ARGS__ can only appear'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Group F2: stray preprocessing tokens (C11 6.4p1's "each non-white-space
// character that cannot be one of the above"). Every expectation below is
// the literal output of `gcc -std=gnu11 -E -P`. String.raw keeps the
// backslash counts readable — the whole point here is spelling fidelity.
// ---------------------------------------------------------------------------
describe('stray preprocessing tokens', () => {
  // The stringified form of one macro argument, as `gcc -E` would print it.
  const S = (arg: string): string => expandText(`#define S(x) #x\nS(${arg})`)
  const warnings = (src: string): string[] =>
    parse(src)
      .errors.filter((d) => d.severity === 'warning')
      .map((d) => d.message)

  it('preserves a stray backslash mixed with other tokens', () => {
    expect(S(String.raw`a\b`)).toBe(String.raw`"a\b"`)
    expect(S(String.raw`a\b\c`)).toBe(String.raw`"a\b\c"`)
    expect(S(String.raw`\@`)).toBe(String.raw`"\@"`)
  })

  it('preserves an even run of stray backslashes verbatim', () => {
    expect(S(String.raw`\\`)).toBe(String.raw`"\\"`)
    expect(S(String.raw`\\\\`)).toBe(String.raw`"\\\\"`)
    // GCC counts backslash *tokens*, not characters, so a space between them
    // does not break the run and no final backslash is dropped.
    expect(S(String.raw`\ \ `)).toBe(String.raw`"\ \"`)
  })

  it('drops the final backslash of an odd trailing run, with a warning', () => {
    // 6.10.3.2p2 leaves an invalid string literal undefined; GCC emits
    // `"a"` rather than `"a\"`. (Quoted strings, not String.raw: a template
    // literal cannot end in a backslash.)
    expect(S('\\')).toBe('""') //          S(\)    -> ""
    expect(S('a\\')).toBe('"a"') //        S(a\)   -> "a"
    expect(S('\\\\\\')).toBe('"\\\\"') //  S(\\\)  -> "\\"
    expect(S('@\\')).toBe('"@"') //        S(@\)   -> "@"
    expect(warnings(`#define S(x) #x\nconst char *s = S(a\\);`)).toEqual([
      String.raw`invalid string literal, ignoring final '\'`,
    ])
    // An even run is valid, so it must stay quiet.
    expect(warnings(`#define S(x) #x\nconst char *s = S(a\\\\);`)).toEqual([])
  })

  it('preserves stray characters that are not backslashes', () => {
    expect(S('@')).toBe('"@"')
    expect(S('a@b')).toBe('"a@b"')
    expect(S('1@2')).toBe('"1@2"')
    expect(S('@@')).toBe('"@@"')
    expect(S('`')).toBe('"`"')
    expect(S('a`b')).toBe('"a`b"')
    // `$` is an identifier character (GCC's -fdollars-in-identifiers default),
    // so it was never a stray token and already round-tripped.
    expect(S('$')).toBe('"$"')
    expect(S('x $ y')).toBe('"x $ y"')
  })

  it('keeps a stray token through macro expansion into a nested stringify', () => {
    const src =
      '#define STR(x) #x\n#define XSTR(x) STR(x)\n#define OBJ @\nconst char *s = XSTR(OBJ);'
    expect(expandText(src)).toContain('"@"')
  })

  it('leaves stringified strays out of the diagnostics entirely', () => {
    // GCC's cpp says nothing here and the compiler never sees the `\`.
    const ast = parse('#define S(x) #x\nconst char *s = S(a\\b);')
    expect(ast.errors).toHaveLength(0)
  })

  it('reports one error per stray token reaching the program, then recovers', () => {
    const ast = parse('int a \\ \\ = 1;\nint b @ = 2;\nint c ` = 3;')
    expect(ast.errors.map((d) => `${d.severity}: ${d.message}`)).toEqual([
      String.raw`error: stray '\' in program`,
      String.raw`error: stray '\' in program`,
      "error: stray '@' in program",
      "error: stray '`' in program",
    ])
    // GCC recovers the same way: the token is dropped and parsing continues.
    expect(ast.decls).toHaveLength(3)
  })

  it('says nothing about a stray inside a skipped conditional group', () => {
    const ast = parse('#if 0\nint a @ = 1;\n#endif\nint keep;')
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(1)
  })

  it('emits one token per stray character without recursing', () => {
    // The old code recursed in nextToken() per skipped character, so a long
    // run of stray bytes (binary input, a pasted blob) overflowed the stack.
    const toks = tokenize('@'.repeat(300000))
    expect(toks).toHaveLength(300001) // 300000 strays + Eof
  })

  it('refuses to paste a stray token, leaving both operands', () => {
    const ast = parse('#define P(a, b) a ## b\nint q = P(x, @);')
    expect(
      ast.errors.some(
        (d) => d.message === 'pasting "x" and "@" does not give a valid preprocessing token',
      ),
    ).toBe(true)
    expect(ast.errors.some((d) => d.message === "stray '@' in program")).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// X-macro torture: the quickjs table patterns end to end
// ---------------------------------------------------------------------------
describe('X-macro patterns', () => {
  const json = (ast: unknown): string =>
    JSON.stringify(ast, (k, v) => (typeof v === 'bigint' ? v.toString() : v))

  it('builds an opcode enum through DEF rows', () => {
    const src = [
      'enum OpCode {',
      '#define DEF(id, size) OP_ ## id,',
      '#if 1',
      'DEF(nop, 1)',
      'DEF(push_i32, 5)',
      '#endif',
      '#undef DEF',
      'OP_COUNT,',
      '};',
    ].join('\n')
    const ast = parse(src)
    expect(ast.errors.filter((d) => d.severity === 'error')).toHaveLength(0)
    const j = json(ast.decls)
    expect(j).toContain('OP_nop')
    expect(j).toContain('OP_push_i32')
    expect(j).toContain('OP_COUNT')
  })

  it('honors define/use/undef/redefine cycles in stream order', () => {
    const src = [
      '#define DEF(x) int x;',
      'DEF(a)',
      '#undef DEF',
      '#define DEF(x) double x;',
      'DEF(b)',
      '#undef DEF',
    ].join('\n')
    const ast = parse(src)
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(2)
    const j = json(ast.decls)
    expect(j).toContain('"a"')
    expect(j).toContain('"b"')
  })

  it('accepts keywords as macro arguments (atom table)', () => {
    const src = [
      'enum Atom {',
      '#define DEF(name, str) ATOM_ ## name,',
      'DEF(if, "if")',
      'DEF(else, "else")',
      '#undef DEF',
      '};',
    ].join('\n')
    const ast = parse(src)
    expect(ast.errors).toHaveLength(0)
    const j = json(ast.decls)
    expect(j).toContain('ATOM_if')
    expect(j).toContain('ATOM_else')
  })

  it('builds computed-goto dispatch labels', () => {
    const src = [
      '#define CASE(op) case_ ## op',
      'void interp(void) {',
      '  static const void *table[] = { &&case_OP_nop };',
      '  goto *table[0];',
      'CASE(OP_nop):',
      '  return;',
      '}',
    ].join('\n')
    const ast = parse(src)
    expect(ast.errors).toHaveLength(0)
    expect(json(ast.decls)).toContain('case_OP_nop')
  })

  it('handles rows across lines and dead rows between them', () => {
    const src = [
      '#define ROW(a, b) int a = b;',
      'ROW(x1, 1)',
      '#if 0',
      'ROW(dead, 2)',
      '#endif',
      'ROW(x2,',
      '    3)',
    ].join('\n')
    const ast = parse(src)
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(2)
    expect(json(ast.decls)).not.toContain('dead')
  })
})

// ---------------------------------------------------------------------------
// Phase-2 line splices (deleted before tokenization, gcc 15 differential)
// ---------------------------------------------------------------------------
describe('phase-2 line splices', () => {
  it('splices inside an identifier before tokenization', () => {
    const ast = parse('#define FOO 42\nint x = FO\\\nO;')
    expect(ast.errors).toHaveLength(0)
    expect(JSON.stringify(ast.decls)).toContain('"value":42')
  })

  it('splices inside a number', () => {
    const ast = parse('int x = 12\\\n34;')
    expect(ast.errors).toHaveLength(0)
    expect(JSON.stringify(ast.decls)).toContain('"value":1234')
  })

  it('keeps a spliced #define name/paren adjacency function-like', () => {
    const ast = parse('#define F\\\n(x) x\nint a = F(7);')
    expect(ast.errors).toHaveLength(0)
    expect(dirAt(ast, 0, 'DefineDirective').functionLike).toBe(true)
    expect(JSON.stringify(ast.decls)).toContain('"value":7')
  })

  it('treats a comment between #define name and paren as object-like', () => {
    const ast = parse('#define H/*c*/(x) x\n')
    expect(dirAt(ast, 0, 'DefineDirective').functionLike).toBe(false)
  })

  it('stringifies a spliced argument as one token', () => {
    const ast = parse('#define S(x) #x\nconst char *s = S(a\\\nb);')
    expect(ast.errors).toHaveLength(0)
    expect(JSON.stringify(ast.decls)).toContain('"ab"')
  })

  it('maps spliced token spans back to physical offsets', () => {
    const src = 'int ab\\\ncd = 1;'
    const toks = tokenize(src)
    expect(toks[1].value).toBe('abcd')
    expect(src.slice(toks[1].start, toks[1].end)).toBe('ab\\\ncd')
    // The following tokens sit past the deleted splice.
    expect(src.slice(toks[2].start, toks[2].end)).toBe('=')
  })

  it('splices across CRLF and joins the halves', () => {
    const toks = tokenize('ab\\\r\ncd')
    expect(toks[0].value).toBe('abcd')
  })

  it('joins identifier halves across a blank-padded splice with a warning', () => {
    const scanner = new Scanner('int a\\ \t\nb;')
    const toks = scanner.scan()
    expect(toks[1].value).toBe('ab')
    expect(scanner.diagnostics).toHaveLength(1)
    expect(scanner.diagnostics[0].message).toContain('separated by space')
  })

  it('leaves a stray backslash when nothing continues the line', () => {
    const src = 'int a\\b;'
    const scanner = new Scanner(src)
    const toks = scanner.scan()
    // Not spliced: the backslash survives as its own preprocessing token
    // between the two identifiers. The lexer stays quiet about it (GCC's cpp
    // does too); parse() is what reports it.
    expect(scanner.diagnostics).toHaveLength(0)
    expect(toks[1].value).toBe('a')
    expect(toks[2].kind).toBe(TokenKind.Stray)
    expect(src.slice(toks[2].start, toks[2].end)).toBe('\\')
    expect(toks[3].value).toBe('b')
  })
})

// ---------------------------------------------------------------------------
// Dynamic predefined macros (__LINE__ family) and #line
// ---------------------------------------------------------------------------
describe('dynamic predefined macros', () => {
  const json = (src: string, opts?: Parameters<typeof parse>[1]): string => {
    const ast = parse(src, opts)
    expect(ast.errors).toHaveLength(0)
    return JSON.stringify(ast.decls)
  }

  it('expands __LINE__ to the physical line number', () => {
    expect(json('int x = __LINE__;')).toContain('"value":1')
    expect(json('\n\nint x = __LINE__;')).toContain('"value":3')
  })

  it('evaluates __LINE__ inside #if on the directive line', () => {
    const ast = parse('\n#if __LINE__ == 2\nint yes;\n#endif\n')
    expect(ast.decls).toHaveLength(1)
  })

  it('reports the invocation line for __LINE__ used inside a macro', () => {
    expect(json('#define WHERE __LINE__\n\nint x = WHERE;')).toContain('"value":3')
  })

  it('is #ifdef-visible', () => {
    const ast = parse('#ifdef __LINE__\nint has;\n#endif\n')
    expect(ast.decls).toHaveLength(1)
  })

  it('applies #line to subsequent lines', () => {
    const out = json('int a = __LINE__;\n#line 100\nint b = __LINE__;\nint c = __LINE__;')
    expect(out).toContain('"value":100')
    expect(out).toContain('"value":101')
  })

  it('macro-expands #line arguments (C11 6.10.4p5)', () => {
    expect(json('#define FOO 200\n#line FOO\nint x = __LINE__;')).toContain('"value":200')
  })

  it('diagnoses a #line without a usable line number', () => {
    const ast = parse('#line x y\nint keep;')
    expect(ast.errors.some((d) => d.message.includes('#line'))).toBe(true)
    expect(ast.decls).toHaveLength(1)
  })

  it('defaults __FILE__ to <source> and follows #line renames', () => {
    expect(json('const char *f = __FILE__;')).toContain('"value":"<source>"')
    // The line after the directive presents as 50 (C11 6.10.4p3).
    const out = json('#line 50 "virtual.c"\nint l = __LINE__;\nconst char *f = __FILE__;')
    expect(out).toContain('"value":50')
    expect(out).toContain('"value":"virtual.c"')
  })

  it('produces deterministic __DATE__ and __TIME__', () => {
    const out = json('const char *d = __DATE__;\nconst char *t = __TIME__;')
    expect(out).toContain('"value":"Jan  1 1970"')
    expect(out).toContain('"value":"00:00:00"')
  })

  it('counts __COUNTER__ per use under GNU mode only', () => {
    const out = json('int a = __COUNTER__;\nint b = __COUNTER__;\nint c = __COUNTER__;')
    expect(out).toContain('"value":0')
    expect(out).toContain('"value":1')
    expect(out).toContain('"value":2')
    const iso = parse('int a = __COUNTER__;', { gnuExtensions: false })
    expect(JSON.stringify(iso.decls)).toContain('__COUNTER__') // plain identifier
  })

  it("survives profile 'none'", () => {
    expect(json('int x = __LINE__;', { profile: 'none' })).toContain('"value":1')
  })

  it('lets an explicit -D override a builtin silently', () => {
    const ast = parse('int x = __LINE__;', { macros: { __LINE__: 777 } })
    expect(ast.errors).toHaveLength(0)
    expect(JSON.stringify(ast.decls)).toContain('"value":777')
  })
})

// ---------------------------------------------------------------------------
// Header-gated profile macros (#include activates, never resolves)
// ---------------------------------------------------------------------------
describe('header-gated profile macros', () => {
  it('leaves header names free for user code until included', () => {
    const ast = parse('int bool;\nint INT_MAX = 5;\n')
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(2)
  })

  it('activates <stdbool.h> names only after the include', () => {
    const before = parse('bool x = true;\n')
    expect(before.errors.length).toBeGreaterThan(0)
    const after = parse('#include <stdbool.h>\nbool x = true;\n')
    expect(after.errors).toHaveLength(0)
    expect(after.decls).toHaveLength(1)
  })

  it('ignores unknown headers', () => {
    const ast = parse('#include <notreal.h>\nint INT_MAX = 5;\n')
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(1)
  })

  it('lets <inttypes.h> imply <stdint.h> (C11 7.8p1)', () => {
    const ast = parse('#include <inttypes.h>\nlong long b = INT64_C(5);\n')
    expect(ast.errors).toHaveLength(0)
    // 5LL carries a bigint value; stringify with a bigint-safe replacer.
    const j = JSON.stringify(ast.decls, (_, v) => (typeof v === 'bigint' ? String(v) : v))
    expect(j).not.toContain('CallExpression')
  })

  it('activates on quoted includes too', () => {
    const ast = parse('#include "stdint.h"\n#if INT32_MAX == 2147483647\nint ok;\n#endif\n')
    expect(ast.decls).toHaveLength(1)
  })

  it('macro-expands an include operand before activating its header', () => {
    const ast = parse('#define H <stdbool.h>\n#include H\nbool b = true;\n')
    expect(ast.errors).toHaveLength(0)
    expect(dirAt(ast, 1, 'IncludeDirective').path).toBe('<stdbool.h>')
    expect(ast.decls).toHaveLength(1)
  })

  it('does not macro-expand a literal header name', () => {
    const ast = parse('#define stdbool notreal\n#include <stdbool.h>\nbool b = true;\n')
    expect(ast.errors).toHaveLength(0)
    expect(dirAt(ast, 1, 'IncludeDirective').path).toBe('<stdbool.h>')
    expect(ast.decls).toHaveLength(1)
  })

  it('diagnoses an expanded include operand that is not a header name', () => {
    const ast = parse('#define H stdbool.h\n#include H\nint keep;\n')
    expect(ast.errors.some((d) => d.message.includes('expects "FILENAME" or <FILENAME>'))).toBe(
      true,
    )
    expect(ast.decls).toHaveLength(1)
  })

  it('does not activate from a skipped region', () => {
    const ast = parse(
      '#if 0\n#include <limits.h>\n#endif\n#if INT_MAX\nint bad;\n#endif\nint keep;',
    )
    expect(ast.decls).toHaveLength(1)
  })

  it('keeps user -D definitions over later includes', () => {
    const ast = parse('#include <limits.h>\nint v = INT_MAX;', { macros: { INT_MAX: 777 } })
    expect(ast.errors).toHaveLength(0)
    expect(JSON.stringify(ast.decls)).toContain('"value":777')
  })

  it('keeps force-undefines across includes', () => {
    const ast = parse('#include <limits.h>\n#ifdef INT_MAX\nint has;\n#endif\nint keep;', {
      macros: { INT_MAX: false },
    })
    expect(ast.decls).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// _Pragma operator (C11 6.10.9)
// ---------------------------------------------------------------------------
describe('_Pragma operator', () => {
  it('records a pragma directive and drops the operator from the stream', () => {
    const ast = parse('_Pragma("GCC diagnostic push")\nint x;\n')
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(1)
    const p = ast.directives.find((d) => d.type === 'PragmaDirective')
    expect(p !== undefined && p.type === 'PragmaDirective' && p.text).toBe('GCC diagnostic push')
  })

  it('destringizes macro-produced operands (DO_PRAGMA idiom)', () => {
    const ast = parse(
      '#define DO_PRAGMA(x) _Pragma(#x)\nDO_PRAGMA(GCC diagnostic ignored "-Wfoo")\nint x;\n',
    )
    expect(ast.errors).toHaveLength(0)
    expect(ast.decls).toHaveLength(1)
    const p = ast.directives.find((d) => d.type === 'PragmaDirective')
    expect(p !== undefined && p.type === 'PragmaDirective' && p.text).toBe(
      'GCC diagnostic ignored "-Wfoo"',
    )
  })

  it('diagnoses a non-string operand', () => {
    const ast = parse('_Pragma(42)\nint x;\n')
    expect(ast.errors.some((d) => d.message.includes('_Pragma'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// GNU comma idiom: omitted vs explicitly empty variadics (gcc 15 differential)
// ---------------------------------------------------------------------------
describe('comma idiom omitted vs empty', () => {
  // SA stringifies what Q's `, ## __VA_ARGS__` produced: gcc 15 gives
  // Q(0) -> "0" (omitted swallows), Q(0,) -> "0 ," (explicit empty keeps),
  // Q(0,1) -> "0 ,1" — identically under -std=gnu11 and -std=c11.
  const PRELUDE = '#define SA(...) #__VA_ARGS__\n#define Q(fmt, ...) SA(fmt , ## __VA_ARGS__)\n'
  const str = (call: string, opts?: Parameters<typeof parse>[1]): string => {
    const ast = parse(`${PRELUDE}const char *s = ${call};\n`, opts)
    expect(ast.errors).toHaveLength(0)
    const m = JSON.stringify(ast.decls).match(/"value":"((?:[^"\\]|\\.)*)"/)
    return m === null ? '<none>' : JSON.parse(`"${m[1]}"`)
  }

  it('swallows the comma when the variadic part is omitted', () => {
    expect(str('Q(0)')).toBe('0')
  })

  it('keeps the comma for an explicitly empty variadic argument', () => {
    expect(str('Q(0,)')).toBe('0 ,')
  })

  it('keeps the comma when arguments are present', () => {
    expect(str('Q(0,1)')).toBe('0 ,1')
  })

  it('requires the variadic argument in ISO mode but permits an explicit empty one', () => {
    const omitted = parse(`${PRELUDE}const char *s = Q(0);\n`, { gnuExtensions: false })
    expect(omitted.errors.some((d) => d.message.includes("argument for the '...'"))).toBe(true)
    expect(str('Q(0,)', { gnuExtensions: false })).toBe('0 ,')
  })

  it('accepts an empty argument for a variadic-only macro in ISO mode', () => {
    const ast = parse('#define S(...) #__VA_ARGS__\nconst char *s = S();\n', {
      gnuExtensions: false,
    })
    expect(ast.errors).toHaveLength(0)
    expect(JSON.stringify(ast.decls)).toContain('"value":""')
  })

  it('supports GNU named variadics and gates them from ISO mode', () => {
    const ast = parse(
      '#define SA2(...) #__VA_ARGS__\n#define R(fmt, args...) SA2(fmt , ## args)\nconst char *a = R(7);\n',
    )
    expect(ast.errors).toHaveLength(0)
    expect(JSON.stringify(ast.decls)).toContain('"value":"7"')

    const iso = parse('#define R(fmt, args...) fmt\n', { gnuExtensions: false })
    expect(iso.errors.some((d) => d.message.includes('named variadic'))).toBe(true)
  })

  // Same probe for a macro whose *only* parameter is the variadic one, the
  // logging-macro shape. `L()` is the omitted case there — gcc 15 -std=gnu11:
  // L() -> "x", L( ) -> "x", L(1) -> "x ,1", L(1,2) -> "x ,1,2", L(,) -> "x ,,"
  // — while -std=c11 keeps the comma for L().
  const VA_ONLY = '#define SA(...) #__VA_ARGS__\n#define L(...) SA(x , ## __VA_ARGS__)\n'
  const strL = (call: string, opts?: Parameters<typeof parse>[1]): string => {
    const ast = parse(`${VA_ONLY}const char *s = ${call};\n`, opts)
    expect(ast.errors).toHaveLength(0)
    const m = JSON.stringify(ast.decls).match(/"value":"((?:[^"\\]|\\.)*)"/)
    return m === null ? '<none>' : JSON.parse(`"${m[1]}"`)
  }

  it('swallows the comma when a variadic-only macro is called with nothing', () => {
    expect(strL('L()')).toBe('x')
    expect(strL('L( )')).toBe('x')
  })

  it('keeps the comma for an explicitly empty variadic-only argument', () => {
    expect(strL('L(,)')).toBe('x ,,')
  })

  it('keeps the comma when a variadic-only macro has arguments', () => {
    expect(strL('L(1)')).toBe('x ,1')
    expect(strL('L(1,2)')).toBe('x ,1,2')
  })

  it('keeps the comma for an empty variadic-only argument in ISO mode', () => {
    expect(strL('L()', { gnuExtensions: false })).toBe('x ,')
  })

  it('swallows the comma for a GNU named variadic with no other parameter', () => {
    const named = '#define SA(...) #__VA_ARGS__\n#define N(args...) SA(x , ## args)\n'
    const str2 = (call: string): string => {
      const ast = parse(`${named}const char *s = ${call};\n`)
      expect(ast.errors).toHaveLength(0)
      const m = JSON.stringify(ast.decls).match(/"value":"((?:[^"\\]|\\.)*)"/)
      return m === null ? '<none>' : JSON.parse(`"${m[1]}"`)
    }
    expect(str2('N()')).toBe('x')
    expect(str2('N(1)')).toBe('x ,1')
  })

  it('parses the zero-named-parameter logging idiom end to end', () => {
    const src = [
      '#define LOG(...) log("ctx", ## __VA_ARGS__)',
      'int log(const char *, ...);',
      'void f(void) { LOG(); LOG(1); LOG(1, 2); }',
    ].join('\n')
    const ast = parse(src)
    expect(ast.errors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// EOF-unterminated literals
// ---------------------------------------------------------------------------
describe('EOF-unterminated literals', () => {
  it('diagnoses every literal form left open at end of file', () => {
    for (const src of ['"abc', "'a", 'L"abc', "L'a", 'u8"abc', 'u"abc', '"abc\\']) {
      const scanner = new Scanner(src)
      scanner.scan()
      expect(
        scanner.diagnostics.some((d) => d.message.includes('missing terminating')),
        `no diagnostic for ${JSON.stringify(src)}`,
      ).toBe(true)
    }
  })

  it('does not double-report after a newline break', () => {
    const scanner = new Scanner("'x\n")
    scanner.scan()
    expect(scanner.diagnostics).toHaveLength(1)
  })

  it('surfaces the diagnostic through parse()', () => {
    const ast = parse('char *s = "abc')
    expect(ast.errors.some((d) => d.message.includes('missing terminating'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// preprocess: false compatibility gate
// ---------------------------------------------------------------------------
describe('preprocess option', () => {
  it('produces identical output on directive-free sources', () => {
    const src = 'int a = 1;\nlong f(void) { return a; }\n'
    const on = parse(src)
    const off = parse(src, { preprocess: false })
    expect(on).toEqual(off)
  })

  it('preprocess: false preserves the legacy leaky behavior', () => {
    const src = '#define X 1\nint a;'
    const off = parse(src, { preprocess: false })
    expect(off.directives).toHaveLength(0)
    expect(off.errors.length).toBeGreaterThan(0) // '#' reaches the parser

    const on = parse(src)
    expect(on.directives).toHaveLength(1)
    expect(on.errors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Macro re-enabling: a macro is off limits only while its own replacement
// list is being rescanned (C11 6.10.3.4p2 as GCC implements it). Every
// expectation below is `gcc -E -P` verbatim.
// ---------------------------------------------------------------------------
describe('macro disabling is scoped to the expansion, not inherited', () => {
  it('re-enters a macro once its own expansion is exhausted', () => {
    // f is live again by the time `(9)` is rescanned, so g(9) -> f(9) -> 9*g.
    expect(expandText('#define f(a) a*g\n#define g(a) f(a)\nf(2)(9)\n')).toBe('2 * 9 * g')
  })

  it('does not paint a macro name that came from a replacement list', () => {
    // The NIL inside G_1's body is a fresh token: it must not inherit the
    // paint from the NIL that produced G_1 at the call site.
    const src =
      '#define NIL(xxx) xxx\n#define G_0(arg) NIL(G_1)(arg)\n#define G_1(arg) NIL(arg)\nG_0(42)\n'
    expect(expandText(src)).toBe('42')
  })

  it('still stops direct self-reference', () => {
    expect(expandText('#define F(x) F(x)\nF(1)\n')).toBe('F ( 1 )')
  })

  it('still stops mutual recursion', () => {
    expect(expandText('#define M1 M2\n#define M2 M1\nM1\n')).toBe('M1')
  })

  it('keeps a name painted after it is skipped once', () => {
    // The I inside the argument is skipped while I is expanding, and stays
    // inert when the result is rescanned against `(7)`.
    expect(expandText('#define I(x) x\nI(I)(7)\n')).toBe('I ( 7 )')
  })
})
// ---------------------------------------------------------------------------
// GCC line markers (`# 5 "hdr.h" 1`), the shape `gcc -E` output arrives in
// ---------------------------------------------------------------------------
describe('GCC line markers', () => {
  const SRC =
    '# 5 "hdr.h" 1\nint a = __LINE__;\nconst char *f = __FILE__;\n# 20 "orig.c" 2\nint b = __LINE__;\n'

  it('retargets __LINE__ and __FILE__', () => {
    const ast = parse(SRC)
    expect(ast.errors).toHaveLength(0)
    const json = JSON.stringify(ast.decls)
    expect(json).toContain('"value":5') // int a
    expect(json).toContain('"value":"hdr.h"') // __FILE__
    expect(json).toContain('"value":20') // int b
  })

  it('records the marker as a LineDirective node', () => {
    const ast = parse(SRC)
    const markers = ast.directives.filter((d) => d.type === 'LineDirective')
    expect(markers).toHaveLength(2)
    expect(dirAt(ast, 0, 'LineDirective').text).toBe('5 "hdr.h" 1')
  })
})
// ---------------------------------------------------------------------------
// Directive text is the *logical* line: phase-2 splices stay deleted
// ---------------------------------------------------------------------------
describe('spliced directive text', () => {
  it('joins a spliced include path so header gating still fires', () => {
    const ast = parse('#include <std\\\nbool.h>\nbool b = true;\n')
    expect(ast.errors).toHaveLength(0)
    expect(dirAt(ast, 0, 'IncludeDirective').path).toBe('<stdbool.h>')
    expect(ast.decls).toHaveLength(1)
  })

  it('joins a spliced pragma', () => {
    const ast = parse('#pragma GCC diagnostic \\\npush\nint a;\n')
    expect(dirAt(ast, 0, 'PragmaDirective').text).toBe('GCC diagnostic push')
  })

  it('joins a spliced #error message', () => {
    const ast = parse('#error line one \\\nline two\n')
    expect(ast.errors[0].message).toBe('#error line one line two')
  })

  it('stores a spliced #define body as logical-line text', () => {
    const ast = parse('#define F a\\\nb\nint F;\n')
    expect(ast.errors).toHaveLength(0)
    expect(dirAt(ast, 0, 'DefineDirective').body).toBe('ab')
  })
})
// ---------------------------------------------------------------------------
// #line takes a digit sequence (C11 6.10.4p3), not an integer constant
// ---------------------------------------------------------------------------
describe('#line argument', () => {
  const lineOf = (src: string): string => JSON.stringify(parse(src).decls)

  it('reads a leading zero as decimal, not octal', () => {
    expect(lineOf('#line 0777\nint a = __LINE__;\n')).toContain('"value":777')
  })

  it('rejects a hex literal', () => {
    const ast = parse('#line 0x10\nint a = __LINE__;\n')
    expect(ast.errors.some((d) => d.message.includes('digit sequence'))).toBe(true)
  })

  it('rejects an integer suffix', () => {
    const ast = parse('#line 10L\nint a = __LINE__;\n')
    expect(ast.errors.some((d) => d.message.includes("not '10L'"))).toBe(true)
  })

  it('rejects out-of-range line numbers', () => {
    expect(parse('#line 0\nint a;\n').errors).toHaveLength(1)
    expect(parse('#line 2147483648\nint a;\n').errors).toHaveLength(1)
    expect(parse('#line 2147483647\nint a;\n').errors).toHaveLength(0)
  })

  it('macro-expands the optional filename even after a literal line number', () => {
    const ast = parse(
      '#define F "virt.c"\n#line 10 F\nint n = __LINE__;\nconst char *f = __FILE__;\n',
    )
    expect(ast.errors).toHaveLength(0)
    const out = JSON.stringify(ast.decls)
    expect(out).toContain('"value":10')
    expect(out).toContain('"value":"virt.c"')
  })

  it('warns about trailing tokens in a standard #line directive', () => {
    const ast = parse('#line 10 "x.c" junk\nint n = __LINE__;\n')
    expect(ast.errors.map((d) => d.severity)).toEqual(['warning'])
    expect(ast.errors[0].message).toContain('extra tokens')
    expect(JSON.stringify(ast.decls)).toContain('"value":10')
  })
})
// ---------------------------------------------------------------------------
// #if character constants have the target's plain-char signedness
// ---------------------------------------------------------------------------
describe('character constants in #if', () => {
  const taken = (src: string, opts?: Parameters<typeof parse>[1]): boolean =>
    parse(`#if ${src}\nint a;\n#endif\n`, opts).decls.length === 1

  it("sign-extends '\\xff' on a signed-char target", () => {
    expect(taken("'\\xff' < 0")).toBe(true)
    expect(taken("'\\xff' == -1")).toBe(true)
  })

  it('honors __CHAR_UNSIGNED__ (gcc -funsigned-char)', () => {
    expect(taken("'\\xff' == 255", { macros: { __CHAR_UNSIGNED__: 1 } })).toBe(true)
    expect(taken("'\\xff' < 0", { macros: { __CHAR_UNSIGNED__: 1 } })).toBe(false)
  })

  it('leaves plain ASCII and multi-character constants alone', () => {
    expect(taken("'A' == 65")).toBe(true)
    expect(taken("'ab' == 24930")).toBe(true)
  })
})
// ---------------------------------------------------------------------------
// #pragma pack / GCC visibility reach the parser
// ---------------------------------------------------------------------------
describe('#pragma pack and visibility', () => {
  const packOf = (src: string): unknown[] =>
    parse(src)
      .decls.flatMap((d) => (d.type === 'Declaration' ? [d.typeSpec] : []))
      .map((ts) => (ts !== null && 'maxFieldAlign' in ts ? ts.maxFieldAlign : undefined))

  it('applies pack to struct definitions and restores it on pop', () => {
    const src =
      '#pragma pack(push, 1)\nstruct A { char c; int i; };\n#pragma pack(pop)\nstruct B { char c; int i; };\n'
    const ast = parse(src)
    expect(ast.errors).toHaveLength(0)
    expect(packOf(src)).toEqual([1, null])
  })

  it('nests push without an alignment and treats pack() / pack(0) as reset', () => {
    const src =
      '#pragma pack(2)\n#pragma pack(push)\n#pragma pack(4)\nstruct A { int i; };\n#pragma pack(pop)\nstruct B { int i; };\n#pragma pack()\nstruct C { int i; };\n'
    expect(packOf(src)).toEqual([4, 2, null])
  })

  it('warns and preserves the current state for an invalid alignment', () => {
    const src =
      '#pragma pack(2)\n#pragma pack(3)\nstruct A { int i; };\n#pragma pack(push, 7)\nstruct B { int i; };\n'
    const ast = parse(src)
    expect(ast.errors.map((d) => d.severity)).toEqual(['warning', 'warning'])
    expect(packOf(src)).toEqual([2, 2])
  })

  it('warns and preserves the current state when pack(pop) underflows', () => {
    const src = '#pragma pack(2)\n#pragma pack(pop)\nstruct A { int i; };\n'
    const ast = parse(src)
    expect(ast.errors.map((d) => d.severity)).toEqual(['warning'])
    expect(ast.errors[0].message).toContain('without matching')
    expect(packOf(src)).toEqual([2])
  })

  it('accepts the pragma via the _Pragma operator', () => {
    const src = '_Pragma("pack(1)")\nstruct A { char c; int i; };\n'
    expect(parse(src).errors).toHaveLength(0)
    expect(packOf(src)).toEqual([1])
  })

  it('sets default visibility until pop', () => {
    const ast = parse(
      '#pragma GCC visibility push(hidden)\nint hid(void);\n#pragma GCC visibility pop\nint vis(void);\n',
    )
    expect(ast.errors).toHaveLength(0)
    const vis = ast.decls.flatMap((d) =>
      d.type === 'Declaration' ? d.declarators.map((x) => x.attrs.visibility) : [],
    )
    expect(vis).toEqual(['hidden', null])
  })

  it('still records every pragma as a directive node', () => {
    const ast = parse('#pragma pack(1)\n#pragma once\n#pragma GCC diagnostic push\nint a;\n')
    expect(ast.directives.map((d) => d.type)).toEqual([
      'PragmaDirective',
      'PragmaDirective',
      'PragmaDirective',
    ])
    expect(ast.errors).toHaveLength(0)
  })

  it('hoists a pragma out of a macro argument list instead of into the expansion', () => {
    const ast = parse('#define F(x) int x;\nF(\n#pragma pack(1)\na)\n')
    expect(ast.decls).toHaveLength(1)
    expect(ast.errors.map((d) => d.severity)).toEqual(['warning']) // non-portable, not an error
  })

  it('tolerates a pragma between struct fields and in a parameter list', () => {
    const ast = parse(
      'struct S {\n char c;\n#pragma pack(1)\n int i;\n};\nvoid g(\n#pragma pack(1)\n int a);\n',
    )
    expect(ast.errors).toHaveLength(0)
  })
})
// ---------------------------------------------------------------------------
// Lexer diagnostics from skipped conditional groups (gcc reports them too,
// but only as warnings)
// ---------------------------------------------------------------------------
describe('diagnostics inside skipped groups', () => {
  it('demotes an unterminated literal in a dead #if to a warning', () => {
    const ast = parse("#if 0\nNotes: costs $5 @ 50% off; don't do this\n#endif\nint a;\n")
    expect(ast.decls).toHaveLength(1)
    expect(ast.errors.every((d) => d.severity === 'warning')).toBe(true)
    expect(ast.errors.some((d) => d.message.includes('missing terminating'))).toBe(true)
  })

  it('demotes inside the dead half of #else', () => {
    const ast = parse('#if 1\nint a;\n#else\nchar *s = "oops\n#endif\n')
    expect(ast.errors.every((d) => d.severity === 'warning')).toBe(true)
  })

  it('keeps live-code lexer errors at error severity', () => {
    const ast = parse('#if 0\n#endif\nchar *s = "oops\n')
    expect(ast.errors.some((d) => d.phase === 'lexer' && d.severity === 'error')).toBe(true)
  })

  // An unterminated comment is never demotable: it eats the `#endif` that
  // would have closed the group, so no skippedRange is ever recorded for it.
  // GCC reports the same pair of errors here.
  it('keeps an unterminated comment in a dead #if at error severity', () => {
    const ast = parse('#if 0\n/* oops\n#endif\nint a;\n')
    const comment = ast.errors.filter((d) => d.message === 'unterminated comment')
    expect(comment.map((d) => d.severity)).toEqual(['error'])
    expect(ast.errors.some((d) => d.message === 'unterminated conditional directive')).toBe(true)
  })
})
// ---------------------------------------------------------------------------
// Lexer diagnostics from #error/#warning message text. C11 6.10.5 makes the
// operand a diagnostic message, not code, so gcc lexes it but never compiles
// it: `gcc -std=gnu11 -fsyntax-only` warns and exits 0. Every severity below
// was checked against gcc 15.2.
// ---------------------------------------------------------------------------
describe('diagnostics in #error/#warning message text', () => {
  it("demotes the apostrophe in #warning don't to a warning", () => {
    const ast = parse("#warning don't do this\nint x;\n")
    expect(ast.decls).toHaveLength(1)
    // gcc: two warnings (the literal and the #warning itself), exit 0.
    expect(ast.errors.every((d) => d.severity === 'warning')).toBe(true)
    expect(
      ast.errors.some(
        (d) => d.phase === 'lexer' && d.message === "missing terminating ' character",
      ),
    ).toBe(true)
  })

  it('demotes an unterminated double quote in #warning text', () => {
    const ast = parse('#warning say "hi\nint x;\n')
    expect(ast.decls).toHaveLength(1)
    expect(ast.errors.every((d) => d.severity === 'warning')).toBe(true)
    expect(ast.errors.some((d) => d.message === 'missing terminating " character')).toBe(true)
  })

  // gcc reports the same pair: the literal is a warning, the #error is the
  // error that fails the build.
  it('demotes the literal in #error text but keeps the #error itself', () => {
    const ast = parse("#error don't do this\nint x;\n")
    const errors = ast.errors.filter((d) => d.severity === 'error')
    expect(errors.map((d) => d.phase)).toEqual(['preprocessor'])
    expect(errors[0].message).toBe("#error don't do this")
    expect(ast.errors.find((d) => d.phase === 'lexer')?.severity).toBe('warning')
  })

  // A balanced pair of apostrophes lexes as a (multi-character) constant, so
  // there is nothing to report at all — gcc is silent here too.
  it('reports nothing when the prose has two apostrophes', () => {
    const ast = parse("#warning don't won't\nint x;\n")
    expect(ast.errors.every((d) => d.severity === 'warning')).toBe(true)
    expect(ast.errors.some((d) => d.phase === 'lexer')).toBe(false)
  })

  // The demotion is scoped to the directive's own span, not to the file.
  it('still errors on a broken literal after a #warning line', () => {
    const ast = parse("#warning don't do this\nint y = 'a;\n")
    const lexer = ast.errors.filter((d) => d.phase === 'lexer')
    expect(lexer.map((d) => d.severity)).toEqual(['warning', 'error'])
  })

  // gcc hands a *recognized* pragma's tokens to the front end, which does
  // error on the bad literal (`#pragma pack(don't)`, `#pragma message(don't)`
  // and `#pragma GCC diagnostic don't` all exit 1) while an unrecognized
  // `#pragma don't` only warns. That split is gcc's pragma registry, so this
  // parser keeps the error rather than guessing.
  it('keeps an unterminated literal in #pragma text at error severity', () => {
    for (const src of ["#pragma don't do this\nint x;\n", "#pragma pack(don't)\nint x;\n"]) {
      const ast = parse(src)
      expect(ast.errors.some((d) => d.phase === 'lexer' && d.severity === 'error')).toBe(true)
    }
  })

  // The #if condition is real preprocessing code: gcc rejects the token too.
  it('keeps an unterminated literal in an #if condition at error severity', () => {
    const ast = parse("#if don't\n#endif\nint x;\n")
    expect(ast.errors.some((d) => d.phase === 'lexer' && d.severity === 'error')).toBe(true)
    expect(ast.errors.some((d) => d.phase === 'preprocessor' && d.severity === 'error')).toBe(true)
  })

  it('keeps an unterminated literal in ordinary code at error severity', () => {
    const ast = parse("int y = 'a;\n")
    expect(ast.errors.some((d) => d.phase === 'lexer' && d.severity === 'error')).toBe(true)
  })

  // Only the unterminated-literal message demotes, so any other lexer error
  // on the line keeps its severity. Nothing here reports one yet — the
  // scanner runs the comment to EOF silently — but gcc calls this `error:
  // unterminated comment` and exits 1, so the guard is in place for when the
  // scanner starts saying so.
  it('never demotes an unterminated comment on a #warning line', () => {
    const ast = parse('#warning oops /* unterminated\nint x;\n')
    expect(
      ast.errors.every((d) => d.message !== 'unterminated comment' || d.severity === 'error'),
    ).toBe(true)
  })
})
