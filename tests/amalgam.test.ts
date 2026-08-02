import { parse } from '../src/index'
import type { TranslationUnit } from '../src/ast/nodes'
import { readFileSync } from 'fs'
import { join } from 'path'

// Exact gates for fixtures/quickjs-amalgam.c (83k lines, unpreprocessed
// quickjs-ng): the whole file preprocesses and parses cleanly.
// History: M0 baseline 28125 errors / 86982 skipped tokens / 12518 "decls"
// (directive tokens leaked into the parser and minted garbage declarations);
// M1 removes directives from the stream: 6824 / 22500 / 5089; M2 evaluates
// conditionals and expands object macros: 3147 / 2751 / 3117; M3 expands
// function-like macros (X-macro DEF tables, CASE/SWITCH dispatch, ##/#) and
// adds <inttypes.h> to the profile: 0 / 0 / 2875 — every remaining
// declaration is real.
const ERROR_COUNT = 0
const SKIPPED_TOKENS = 0
const DECL_COUNT = 2875
const MAX_PARSE_MS = 15000 // ~2.8s locally; slack for slow CI
// Exact census of directives at active levels (guards both directive-extent
// and conditional-evaluation regressions). Directives nested inside skipped
// groups are intentionally not recorded: full census is 1362, of which 373
// sit in dead regions (_WIN32/MSVC/__cplusplus/wasi branches).
const DIRECTIVE_COUNT = 989

const SKIP_RE = /^skipped (\d+) unexpected token/

function skippedTokenCount(ast: TranslationUnit): number {
  let n = 0
  for (const d of ast.errors) {
    const m = SKIP_RE.exec(d.message)
    if (m !== null) n += parseInt(m[1], 10)
  }
  return n
}

describe('quickjs amalgam baseline', () => {
  const source = readFileSync(join(__dirname, '..', 'fixtures', 'quickjs-amalgam.c'), 'utf8')
  let ast: TranslationUnit
  let elapsedMs = 0

  beforeAll(() => {
    const t0 = performance.now()
    ast = parse(source)
    elapsedMs = performance.now() - t0
  }, 60000)

  it('parses with zero errors', () => {
    const errors = ast.errors.filter((d) => d.severity === 'error')
    // Print the first few on failure — the message is the debugging entry.
    expect(errors.slice(0, 5)).toEqual([])
    expect(errors.length).toBe(ERROR_COUNT)
  })

  it('produces no warnings', () => {
    const warnings = ast.errors.filter((d) => d.severity === 'warning')
    expect(warnings).toHaveLength(0)
  })

  it('skips no tokens', () => {
    expect(skippedTokenCount(ast)).toBe(SKIPPED_TOKENS)
  })

  it('declaration count matches the snapshot', () => {
    expect(ast.decls.length).toBe(DECL_COUNT)
  })

  it('records every directive', () => {
    expect(ast.directives.length).toBe(DIRECTIVE_COUNT)
  })

  it('parses within the time budget', () => {
    expect(elapsedMs).toBeLessThan(MAX_PARSE_MS)
  })

  it('diagnostics carry spans inside the source', () => {
    for (const d of ast.errors.slice(0, 200)) {
      expect(d.start).toBeGreaterThanOrEqual(0)
      expect(d.end).toBeGreaterThanOrEqual(d.start)
      expect(d.end).toBeLessThanOrEqual(source.length)
    }
  })

  // Deep gates — flagship macro chains asserted on the final AST, each
  // exercising a different expansion feature all the way through the parser.
  let declJsonCache: string | null = null
  function declJson(): string {
    declJsonCache ??= JSON.stringify(ast.decls, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    )
    return declJsonCache
  }

  it('stringifies the version macros into JS_GetVersion', () => {
    // QJS_VERSION_STRING = STRINGIFY(MAJOR) "." STRINGIFY(MINOR) "." ... — a
    // two-level # chain whose pieces the parser then joins by string-literal
    // concatenation into a single literal. Read the expected digits out of
    // the #defines themselves.
    const ver = ['MAJOR', 'MINOR', 'PATCH'].map(
      (part) => new RegExp(`#define QJS_VERSION_${part} (\\d+)`).exec(source)?.[1],
    )
    expect(ver).not.toContain(undefined)
    const fn = ast.decls.find((d) => d.type === 'FunctionDefinition' && d.name === 'JS_GetVersion')
    expect(fn).toBeDefined()
    expect(JSON.stringify(fn)).toContain(`"value":"${ver.join('.')}"`)
  })

  it('builds atom enum members from keyword arguments', () => {
    // The atom table invokes DEF(if, "if") / DEF(else, "else") — keywords as
    // macro arguments, pasted into identifiers via ##.
    expect(declJson()).toContain('JS_ATOM_if')
    expect(declJson()).toContain('JS_ATOM_else')
  })

  it('expands the computed-goto dispatch table', () => {
    // CASE(OP_x) → case_OP_x labels (## paste + &&label address-of-label).
    const labels = declJson().match(/case_OP_/g) ?? []
    expect(labels.length).toBe(492)
  })

  it('expands the opcode enum from the X-macro table', () => {
    expect(declJson()).toContain('OP_push_i32')
  })

  it('routes va_arg through the stdarg shims', () => {
    // va_arg(ap, T) → __builtin_va_arg(ap, T) → VaArgExpression nodes.
    const nodes = declJson().match(/"VaArgExpression"/g) ?? []
    expect(nodes.length).toBe(14)
  })
})
