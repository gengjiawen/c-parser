# Plan: Rewrite C Parser in TypeScript for AST Explorer

## Context

The current C compiler at `/tmp/claudes-c-compiler` has a hand-written recursive descent parser in Rust (~5600 lines across 6 files). It supports C11 + extensive GCC extensions. The goal is to rewrite the parser in TypeScript as a standalone package, compatible with [AST Explorer](https://github.com/fkling/astexplorer) so users can interactively explore C ASTs in the browser.

## Project Structure

```
c-parser/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts                    -- Public API: parse(source, options) → AST
    ast/
      nodes.ts                  -- AST node type definitions (discriminated unions)
      builders.ts               -- Node factory functions (attach loc automatically)
      visitor.ts                -- AST walker for testing/transforms
    lexer/
      token.ts                  -- TokenKind enum + Token interface
      scanner.ts                -- Lexer class (byte-level tokenizer)
    parser/
      parser.ts                 -- Parser class, token helpers, entry point
      expressions.ts            -- Expression parsing (precedence climbing)
      types.ts                  -- Type specifier collection and resolution
      declarations.ts           -- External/local declarations, initializers
      declarators.ts            -- C declarator syntax (inside-out rule)
      statements.ts             -- All statement types + inline assembly
      attributes.ts             -- GCC __attribute__ parsing
      const-eval.ts             -- Constant expression evaluator
    adapter/
      astexplorer.ts            -- AST Explorer plugin interface
  tests/
    lexer.test.ts
    expressions.test.ts
    declarations.test.ts
    statements.test.ts
    types.test.ts
    declarators.test.ts
    integration.test.ts
  fixtures/
    *.c                         -- C source files for snapshot testing
```

Zero runtime dependencies. Build with `tsup`, test with `vitest`.

## AST Node Design (AST Explorer Compatible)

Every node carries `type`, `start`, `end`, and `loc` for AST Explorer:

```typescript
interface BaseNode {
  type: string;
  start: number;          // character offset
  end: number;            // character offset
  loc: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}
```

Use TypeScript discriminated unions mapping 1:1 from the Rust enums:
- `Expression` — 43 variants (BinaryExpression, UnaryExpression, CallExpression, CastExpression, etc.)
- `Statement` — 18 variants (IfStatement, WhileStatement, ForStatement, SwitchStatement, etc.)
- `TypeSpecifier` — 33 variants (IntType, PointerType, StructType, EnumType, etc.)
- `ExternalDeclaration` = FunctionDefinition | Declaration | TopLevelAsm

A `NodeBuilder` class precomputes a line-offset table from the source and provides factory methods that convert byte offsets to line/column positions.

## Lexer

Port from `src/frontend/lexer/scan.rs` (1188 lines) and `token.rs`.

- `TokenKind`: numeric `const enum` with 180+ members (fast comparison)
- `Scanner` class: operates on string via `charCodeAt()`, produces `Token[]` eagerly
- Keyword lookup: length + first-char fast-reject, then `Map<string, TokenKind>`
- Number literals: `parseInt`/`parseFloat` for most; `BigInt` for values > `Number.MAX_SAFE_INTEGER`
- Long double: store as `number` (f64 approximation) — sufficient for parse-only tool

## Parser

Single `Parser` class with methods split across files (functions taking parser as first arg, bound in the class). Mirrors the Rust `impl Parser` pattern.

### Key Rust files to port:
| Rust file | Lines | TS target |
|-----------|-------|-----------|
| `parser/parse.rs` | 1309 | `parser/parser.ts` |
| `parser/expressions.rs` | 732 | `parser/expressions.ts` |
| `parser/types.rs` | 1015 | `parser/types.ts` |
| `parser/declarations.rs` | 1282 | `parser/declarations.ts` |
| `parser/declarators.rs` | 828 | `parser/declarators.ts` |
| `parser/statements.rs` | 447 | `parser/statements.ts` |
| `parser/ast.rs` | 840 | `ast/nodes.ts` |

### Critical parsing techniques to preserve:
1. **Typedef/identifier disambiguation** — maintain `typedefs: Set<string>` and `shadowedTypedefs: Set<string>`, pre-seeded with ~90 standard library names
2. **Precedence climbing** — 10-level table-driven binary expression parsing
3. **Cast ambiguity** — speculative parsing with save/restore of `pos` and attribute state
4. **Inside-out declarator rule** — `combineDeclartorParts()` for `int (*fp)(int)` etc.
5. **Type specifier flag collection** — boolean flags for arbitrary keyword ordering, then `resolveTypeFlags()`

### Parser state:
- `tokens: Token[]`, `pos: number`
- `typedefs: Set<string>`, `shadowedTypedefs: Set<string>`
- `enumConstants: Map<string, number>`
- `pragmaPackStack`, `pragmaPackAlign`, `pragmaVisibilityStack`
- `attrs: ParsedDeclAttrs` (accumulated storage-class/qualifier flags)

## AST Explorer Adapter

```typescript
// src/adapter/astexplorer.ts
export default {
  id: 'c-parser',
  displayName: 'C (ccc)',
  version: '1.0.0',
  showInMenu: true,
  locationProps: new Set(['start', 'end', 'loc']),

  loadParser(callback) { callback({ parse }); },
  parse(parser, code, options) { return parser.parse(code, options); },
  nodeToRange(node) {
    if (node?.start != null) return [node.start, node.end];
    return null;
  },
  getDefaultOptions() { return { gnuExtensions: true }; },
};
```

## Phased Implementation

### Phase 1: Foundation
- `TokenKind` enum, `Token` interface, `Scanner` class (port all of `scan.rs`)
- All AST node interfaces in `nodes.ts`
- `NodeBuilder` with line/column computation
- `Parser` skeleton with token helpers
- Expression parsing: primaries + precedence climbing + unary/postfix
- **Verify**: can parse `1 + 2 * 3`, `a ? b : c`, `f(x, y)`

### Phase 2: Core C11
- Type specifier collection and resolution (`parseTypeSpecifier`)
- Declarator parsing with pointers and arrays (no function pointers yet)
- `parseExternalDecl`, `parseLocalDeclaration`
- All 18 statement types
- Initializer lists with designators
- **Verify**: can parse simple C programs with functions, variables, control flow

### Phase 3: Complex Declarators
- `isParenDeclarator()` lookahead
- `combineDeclaratorParts()` inside-out rule
- Function pointer declarators, pointer-to-array, nested cases
- Cast expression disambiguation (speculative parsing)
- Compound literals `(type){...}`
- K&R style function parameters
- **Verify**: can parse `int (*fp)(int)`, `int (*arr)[10]`

### Phase 4: GCC Extensions
- `__attribute__((...))` with all ~30 attribute dispatchers
- `typeof`, `__auto_type`, statement expressions, computed gotos
- Inline assembly (GCC extended asm)
- `_Generic`, `__builtin_va_arg`, `__builtin_types_compatible_p`
- `_Complex` types, imaginary literals, `__int128`
- `#pragma pack`, `#pragma GCC visibility`
- `_Static_assert` with constant expression evaluator
- **Verify**: can parse real-world C with GCC extensions

### Phase 5: AST Explorer Integration
- Implement adapter in `astexplorer.ts`
- Build config producing UMD/ESM bundle via `tsup`
- Error recovery improvements
- Performance tuning

## Verification

1. **Unit tests**: per-module tests for lexer, expressions, types, declarators, declarations, statements
2. **Snapshot tests**: parse C fixture files → JSON, compare against stored snapshots
3. **Cross-validation**: compare TS parser AST output against Rust parser output for same inputs
4. **Real-world**: parse preprocessed Linux kernel headers, GCC torture test snippets
5. **AST Explorer**: load the adapter locally, verify interactive exploration works with source highlighting
