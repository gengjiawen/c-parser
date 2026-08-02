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
    const scanner = new Scanner('int a\\b;')
    scanner.scan()
    expect(scanner.diagnostics.some((d) => d.message.includes('stray'))).toBe(true)
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

  it('stays active without GNU extensions (gcc -std=c11 behaves the same)', () => {
    expect(str('Q(0)', { gnuExtensions: false })).toBe('0')
    expect(str('Q(0,)', { gnuExtensions: false })).toBe('0 ,')
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
