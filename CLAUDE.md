# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

The parser pipeline is: source string → Scanner (lexer) → Parser → AST nodes.

**Lexer** (`src/lexer/`): `Scanner` tokenizes C source into `Token` objects. `token.ts` defines 180+ `TokenKind` values covering C11 and GCC extensions.

**Parser** (`src/parser/`): Uses a prototype-extension pattern — parsing methods are defined in separate files (`expressions.ts`, `statements.ts`, `declarations.ts`, `declarators.ts`, `types.ts`) and added to the `Parser` class prototype rather than defined inline. The core `Parser` class in `parser.ts` manages token state, typedef tracking, and provides token helpers (`peek()`, `advance()`, `expect()`, `consumeIf()`).

**AST** (`src/ast/`): `nodes.ts` has TypeScript type definitions for all AST nodes (every node includes `start`, `end`, `loc` for source locations). `builders.ts` has factory functions for constructing nodes.

**Entry point** (`src/index.ts`): Exports `parse(source, options?)` as the main API. Options: `{ gnuExtensions?: boolean }` (default: true).

**AST Explorer adapter** (`src/adapter/astexplorer.ts`): Wraps the parser for AST Explorer integration.

## Test Structure

Tests live in `tests/` and mirror parser modules: `lexer.test.ts`, `expressions.test.ts`, `statements.test.ts`, `declarations.test.ts`, `fixtures.test.ts`, `integration.test.ts`.

## Fixtures & Playground Sync

`playground/src/examples.ts` is generated from `fixtures/*.c` (excluding `quickjs-amalgam.c`). Never edit it by hand — run `pnpm sync-examples` after changing any fixture. New fixture files must be added to the `NAME_MAP` in `scripts/sync-examples.js`.
