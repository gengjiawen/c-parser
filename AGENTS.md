## Project

c-parser-ts is a C11 parser (with GCC extensions) written in TypeScript. Zero runtime dependencies. Dual-package (ESM + CommonJS) designed for use with AST Explorer.

## Commands

Package manager is pnpm.

- `pnpm build` — build with tsup
- `pnpm test` — run all tests (vitest run)
- `pnpm test tests/lexer.test.ts` — run a single test file
- `pnpm test -- -t "test name"` — run a single test by name
- `pnpm typecheck` — type-check without emitting
- `pnpm fmt` — format with oxfmt

## Architecture

The parser pipeline is: source string → Scanner (lexer) → Preprocessor → Parser → AST nodes. The preprocessor runs by default (`preprocess: false` bypasses it).

**Lexer** (`src/lexer/`): `Scanner` tokenizes C source into `Token` objects. A phase-2 pre-pass deletes backslash-newline splices before tokenization (spans are remapped back to original offsets; spliced tokens carry a `spelling`). `token.ts` defines 180+ `TokenKind` values covering C11 and GCC extensions, plus `TokenFlags` (BOL / SpaceBefore / Synthetic) the preprocessor relies on for directive recognition and stringification. Unterminated string/char literals are diagnosed at newline and at EOF.

**Preprocessor** (`src/preprocessor/`): consumes the scanner's token stream and produces the stream the parser sees. `preprocessor.ts` is the driver (directive execution in stream order, conditional stack, skipped regions, `_Pragma` operator interception, `#line` overrides, header-macro activation on `#include`); `directives.ts` parses directive lines into AST nodes and the macro table; `macro-table.ts` stores `MacroDef`s; `expander.ts` is the expansion engine (function-like invocation across lines/directives, lazy argument pre-expansion, `#` stringify, `##` paste with re-lexing, recursion guard scoped to the expansion being rescanned — GCC's model, so a macro is live again once its own replacement list is exhausted — omitted-vs-empty `__VA_ARGS__` distinction for `, ## __VA_ARGS__`); `cond-eval.ts` evaluates `#if` expressions in 64-bit BigInt with short-circuiting; `line-map.ts` tracks physical lines and `#line` overrides for the dynamic builtins (`__LINE__`, `__FILE__`, `__COUNTER__`, plus deterministic `__DATE__` = `"Jan  1 1970"` and `__TIME__` = `"00:00:00"`); `profile.ts` seeds predefined macros (default `gcc-linux-x64`: compiler/target macros up front; limits/stdint constants, inttypes format macros, stdbool, and stdarg shims are header-gated — seeded only when the matching header is `#include`d). `#include` is recorded as a node but never resolved. Directives at active levels become `ast.directives` nodes; `#pragma pack(...)` and `#pragma GCC visibility ...` additionally leave a synthetic token in the stream so the parser's alignment/visibility state gets set. GCC line markers (`# 5 "hdr.h" 1`) are ordinary `LineDirective`s — `gcc -E` output reproduces its original `__LINE__`/`__FILE__`. All phases push `Diagnostic`s into `ast.errors`; lexer errors falling inside a skipped conditional group are demoted to warnings, since the scanner lexes dead code it cannot know is dead.

**Parser** (`src/parser/`): Uses a prototype-extension pattern — parsing methods are defined in separate files (`expressions.ts`, `statements.ts`, `declarations.ts`, `declarators.ts`, `types.ts`) and added to the `Parser` class prototype rather than defined inline. The core `Parser` class in `parser.ts` manages token state, typedef tracking, and provides token helpers (`peek()`, `advance()`, `expect()`, `consumeIf()`).

**AST** (`src/ast/`): `nodes.ts` has TypeScript type definitions for all AST nodes (`start`/`end` always present; `loc` is optional and computed on demand), including the `PreprocessorDirective` union. `builders.ts` has factory functions for constructing nodes.

**Entry point** (`src/index.ts`): Exports `parse(source, options?)` as the main API. Options: `{ gnuExtensions?: boolean, loc?: boolean, preprocess?: boolean, profile?: 'gcc-linux-x64' | 'none', macros?: Record<string, string | number | boolean> }` (defaults: `gnuExtensions` true, `loc` false, `preprocess` true, `profile` 'gcc-linux-x64').

**AST Explorer adapter** (`src/adapter/astexplorer.ts`): Wraps the parser for AST Explorer integration.

## Test Structure

Tests live in `tests/` and mirror parser modules: `lexer.test.ts`, `expressions.test.ts`, `statements.test.ts`, `declarations.test.ts`, `preprocessor.test.ts`, `fixtures.test.ts`, `integration.test.ts`. `amalgam.test.ts` is the flagship gate: `fixtures/quickjs-amalgam.c` (83k lines of unpreprocessed quickjs-ng) must parse with exactly 0 errors, 0 warnings, 0 skipped tokens, and snapshot-exact declaration/directive counts — update the snapshots only when a change legitimately alters them.

## Fixtures & Playground Sync

`playground/src/examples.ts` is generated from `fixtures/*.c` (excluding `quickjs-amalgam.c`). Never edit it by hand — run `pnpm sync-examples` after changing any fixture. New fixture files must be added to the `NAME_MAP` in `scripts/sync-examples.js`.

## Commit Convention

- Use Conventional Commits for all commit messages.
- Format: `<type>(<scope>): <summary>`
- Examples:
  - `feat(ast): make loc optional and compute on demand`
  - `fix(parser): correct declarator span end`
