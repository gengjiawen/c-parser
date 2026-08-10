import { parse } from '../src/index'
import type { AST } from '../src/index'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

// Spans feed AST Explorer's source highlighting, so every node has to point at
// the text it was built from, and every child has to sit inside its parent.

interface SpanSummary {
  name: string
  start: number
  end: number
  text: string
}

/** Every InitDeclarator in source order, with the text its span covers. */
function declaratorSpans(source: string): SpanSummary[] {
  const ast = parse(source)
  const found: SpanSummary[] = []
  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null) return
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    const node = value as Record<string, unknown>
    if (node.type === 'InitDeclarator') {
      const decl = value as AST.InitDeclarator
      found.push({
        name: decl.name,
        start: decl.start,
        end: decl.end,
        text: source.slice(decl.start, decl.end),
      })
    }
    for (const child of Object.values(node)) visit(child)
  }
  visit(ast.decls)
  found.sort((a, b) => a.start - b.start || a.end - b.end)
  return found
}

describe('InitDeclarator spans', () => {
  it('covers the declarator, not the leading storage-class specifier', () => {
    // The bug this guards: every declarator reported the span of the first
    // specifier token, so both of these read "static".
    expect(declaratorSpans('static const int alpha = 1, beta = 2;')).toEqual([
      { name: 'alpha', start: 17, end: 26, text: 'alpha = 1' },
      { name: 'beta', start: 28, end: 36, text: 'beta = 2' },
    ])
  })

  it('covers a bare declarator with no initializer', () => {
    expect(declaratorSpans('int x;')).toEqual([{ name: 'x', start: 4, end: 5, text: 'x' }])
  })

  it('starts at the pointer, not at the name', () => {
    expect(declaratorSpans('int *x = 0;')).toEqual([
      { name: 'x', start: 4, end: 10, text: '*x = 0' },
    ])
  })

  it('covers array dimensions and a braced initializer', () => {
    expect(declaratorSpans('int a[10], b[2][3] = {{1, 2, 3}, {4, 5, 6}};')).toEqual([
      { name: 'a', start: 4, end: 9, text: 'a[10]' },
      { name: 'b', start: 11, end: 43, text: 'b[2][3] = {{1, 2, 3}, {4, 5, 6}}' },
    ])
  })

  it('covers a function declarator including its parameter list', () => {
    expect(declaratorSpans('int f(int a, char *b);')).toEqual([
      { name: 'f', start: 4, end: 21, text: 'f(int a, char *b)' },
    ])
  })

  it('covers a K&R identifier-list declaration', () => {
    expect(declaratorSpans('int f(a, b);')).toEqual([
      { name: 'f', start: 4, end: 11, text: 'f(a, b)' },
    ])
  })

  it('covers a parenthesized function-pointer declarator', () => {
    expect(declaratorSpans('int (*fp)(int) = 0;')).toEqual([
      { name: 'fp', start: 4, end: 18, text: '(*fp)(int) = 0' },
    ])
  })

  it('leaves an attribute written before the first declarator to the declaration', () => {
    // GCC folds attributes between the specifiers and the first declarator
    // into the declaration specifiers, where they apply to every declarator.
    expect(declaratorSpans('int __attribute__((unused)) x = 1;')).toEqual([
      { name: 'x', start: 28, end: 33, text: 'x = 1' },
    ])
  })

  it('covers an attribute written after the declarator', () => {
    expect(declaratorSpans('int y __attribute__((aligned(16)));')).toEqual([
      { name: 'y', start: 4, end: 34, text: 'y __attribute__((aligned(16)))' },
    ])
  })

  it('gives an attribute written after the comma to the declarator it prefixes', () => {
    expect(declaratorSpans('int __attribute__((a)) p, __attribute__((b)) q;')).toEqual([
      { name: 'p', start: 23, end: 24, text: 'p' },
      { name: 'q', start: 26, end: 46, text: '__attribute__((b)) q' },
    ])
  })

  it('covers an asm label between the declarator and the initializer', () => {
    expect(declaratorSpans('int x __asm__("y") = 1;')).toEqual([
      { name: 'x', start: 4, end: 22, text: 'x __asm__("y") = 1' },
    ])
  })

  it('covers an asm label with no initializer', () => {
    expect(declaratorSpans('extern int errno __asm__("__errno_location");')).toEqual([
      { name: 'errno', start: 11, end: 44, text: 'errno __asm__("__errno_location")' },
    ])
  })

  it('covers each name in a typedef list', () => {
    expect(declaratorSpans('typedef unsigned long size_t, *size_p;')).toEqual([
      { name: 'size_t', start: 22, end: 28, text: 'size_t' },
      { name: 'size_p', start: 30, end: 37, text: '*size_p' },
    ])
  })

  it('covers block-scope declarators', () => {
    expect(declaratorSpans('void g(void) { int i = 0, j = i + 1; }')).toEqual([
      { name: 'i', start: 19, end: 24, text: 'i = 0' },
      { name: 'j', start: 26, end: 35, text: 'j = i + 1' },
    ])
  })

  it('covers block-scope declarators past a storage-class specifier', () => {
    expect(declaratorSpans('void g(void) { static char buf[8], *p = buf; }')).toEqual([
      { name: 'buf', start: 27, end: 33, text: 'buf[8]' },
      { name: 'p', start: 35, end: 43, text: '*p = buf' },
    ])
  })

  it('spans a declarator that wraps across lines', () => {
    expect(declaratorSpans('int a\n  =\n  1,\n  b = 2;')).toEqual([
      { name: 'a', start: 4, end: 13, text: 'a\n  =\n  1' },
      { name: 'b', start: 17, end: 22, text: 'b = 2' },
    ])
  })

  it('leaves the enclosing Declaration span alone', () => {
    const source = 'static const int alpha = 1, beta = 2;'
    const decl = parse(source).decls[0]
    expect(decl.start).toBe(0)
    expect(decl.end).toBe(source.length)
    expect(source.slice(decl.start, decl.end)).toBe(source)
  })

  it('keeps struct field spans on the field, bitfield width included', () => {
    // Struct fields are StructFieldDeclarations, not InitDeclarators; the
    // declarator fix must not disturb them.
    const source = 'struct S { int a : 3, b : 5; int c; };'
    const decl = parse(source).decls[0] as AST.Declaration
    const structType = decl.typeSpec as AST.StructType
    expect(
      (structType.fields ?? []).map((f) => ({
        name: f.name,
        start: f.start,
        end: f.end,
        text: source.slice(f.start, f.end),
      })),
    ).toEqual([
      { name: 'a', start: 15, end: 20, text: 'a : 3' },
      { name: 'b', start: 22, end: 27, text: 'b : 5' },
      { name: 'c', start: 33, end: 34, text: 'c' },
    ])
  })

  it('derives loc from the corrected offsets', () => {
    // loc is computed on demand from start/end, so it moves with the fix.
    const ast = parse('int a\n  =\n  1,\n  b = 2;', { loc: true })
    const decl = ast.decls[0] as AST.Declaration
    expect(decl.declarators.map((d) => d.loc)).toEqual([
      { start: { line: 1, column: 4 }, end: { line: 3, column: 3 } },
      { start: { line: 4, column: 2 }, end: { line: 4, column: 7 } },
    ])
  })

  it('never produces an inverted span, even on a missing declarator', () => {
    for (const source of ['int x, ;', 'int = 5;', 'int x']) {
      for (const d of declaratorSpans(source)) {
        expect(d.end).toBeGreaterThanOrEqual(d.start)
      }
    }
  })

  it('keeps sibling declarators disjoint', () => {
    const spans = declaratorSpans('int v, w = 2, z;')
    expect(spans.map((s) => s.text)).toEqual(['v', 'w = 2', 'z'])
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end)
    }
  })

  it('materializes range designators inside the initializer they came from', () => {
    // `[0 ... 2]` expands to one index per element; the synthesized IntLiterals
    // all stand for the range text rather than sitting at offset 0.
    const source = 'int t[4] = { [0 ... 2] = 7 };'
    const decl = parse(source).decls[0] as AST.Declaration
    const init = decl.declarators[0].init as AST.ListInitializer
    const indexes = init.items.map((item) => item.designators[0])
    expect(indexes).toHaveLength(3)
    for (const designator of indexes) {
      expect(designator.kind).toBe('Index')
      if (designator.kind !== 'Index') continue
      expect(source.slice(designator.index.start, designator.index.end)).toBe('0 ... 2')
    }
  })
})

// --- Containment invariant -------------------------------------------------

interface Violation {
  parent: string
  child: string
  parentSpan: [number, number]
  childSpan: [number, number]
}

interface ContainmentReport {
  spannedNodes: number
  violations: Violation[]
}

function isSpannedNode(value: unknown): value is AST.BaseNode & { type: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const node = value as Record<string, unknown>
  return (
    typeof node.type === 'string' && typeof node.start === 'number' && typeof node.end === 'number'
  )
}

/** Walk the tree and collect every node whose span escapes its parent's. */
function checkContainment(root: unknown): ContainmentReport {
  const violations: Violation[] = []
  let spannedNodes = 0

  const visit = (value: unknown, parent: (AST.BaseNode & { type: string }) | null): void => {
    if (typeof value !== 'object' || value === null) return
    if (Array.isArray(value)) {
      for (const item of value) visit(item, parent)
      return
    }
    let nextParent = parent
    if (isSpannedNode(value)) {
      spannedNodes++
      if (parent !== null && (value.start < parent.start || value.end > parent.end)) {
        violations.push({
          parent: parent.type,
          child: value.type,
          parentSpan: [parent.start, parent.end],
          childSpan: [value.start, value.end],
        })
      }
      nextParent = value
    }
    for (const child of Object.values(value as Record<string, unknown>)) visit(child, nextParent)
  }

  visit(root, null)
  return { spannedNodes, violations }
}

// StructFieldDeclaration is the one node type that still breaks containment: a
// field's span covers only its own name (plus bitfield width), while its
// `typeSpec` points back at the type specifier shared by the whole field group
// and its `derived` array sizes sit past the name. Across the fixtures that is
// 1240 violations — 1175 of them in quickjs-amalgam.c — split 984 typeSpec /
// 191 derived there, by child node type: TypedefNameType 400, PointerType 290,
// IntType 216, Identifier 93, BoolType 69, StructType 39, ArrayType 26,
// DoubleType 17, VoidType 11, UnionType 11, FloatType 3. Fixing that means
// widening the field span (or narrowing the type reference), which is a
// separate change; until then it is excluded here by name rather than hidden
// behind a numeric threshold.
const KNOWN_UNCONTAINED_PARENTS = new Set(['StructFieldDeclaration'])

const fixturesDir = join(__dirname, '..', 'fixtures')
const fixtureFiles = readdirSync(fixturesDir).filter((f) => f.endsWith('.c'))

// quickjs-amalgam.c is 83k lines: parsing plus the walk runs past the 5s
// default on a loaded machine.
const CONTAINMENT_TIMEOUT_MS = 60000

describe('span containment', () => {
  for (const file of fixtureFiles) {
    it(
      `${file}: every node lies inside its parent`,
      () => {
        const source = readFileSync(join(fixturesDir, file), 'utf8')
        const { spannedNodes, violations } = checkContainment(parse(source))
        expect(spannedNodes).toBeGreaterThan(0)

        const unexpected = violations.filter((v) => !KNOWN_UNCONTAINED_PARENTS.has(v.parent))
        // Render a few offenders on failure: the pair of node types plus the text
        // each side claims is what identifies the construction site.
        const describeViolation = (v: Violation): string =>
          `${v.parent}${JSON.stringify(source.slice(...v.parentSpan))} > ` +
          `${v.child}${JSON.stringify(source.slice(...v.childSpan))}`
        // Called out separately: init-declarator spans are what this suite fixes.
        expect(
          unexpected
            .filter((v) => v.parent === 'InitDeclarator')
            .slice(0, 10)
            .map(describeViolation),
        ).toEqual([])
        expect(unexpected.slice(0, 10).map(describeViolation)).toEqual([])
        expect(unexpected).toHaveLength(0)
      },
      CONTAINMENT_TIMEOUT_MS,
    )
  }
})
