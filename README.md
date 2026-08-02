# c-parser

[![npm version](https://img.shields.io/npm/v/c11-parser)](https://www.npmjs.com/package/c11-parser)

A C11 parser written in TypeScript with GCC extensions support and a built-in
preprocessor. Zero runtime dependencies.

Paste real-world C — macros, conditionals, X-macro tables and all — and get a
correct AST without running `gcc -E` first: the 83k-line quickjs-ng
amalgamation parses with zero errors out of the box.

Try the [online playground](https://gengjiawen.github.io/c-parser/).

Built for use with [AST Explorer](https://astexplorer.net/). 

## Install

```bash
npm install c11-parser
```

## Usage

```typescript
import { parse } from 'c11-parser';

const ast = parse(`
int main(void) {
    return 0;
}
`);

console.log(JSON.stringify(ast, null, 2));
```

### Options

```typescript
parse(source, {
  gnuExtensions: true, // Enable GCC extensions (default: true)
  loc: false, // Compute line/column locations on demand (default: false)
  preprocess: true, // Run the built-in preprocessor (default: true)
  profile: 'gcc-linux-x64', // Predefined-macro profile, or 'none' (default: 'gcc-linux-x64')
  macros: { DEBUG: 1 }, // Extra macros, like -D on a compiler command line
  maxPreprocessedTokens: 1_000_000, // Absolute preprocessing output budget
});
```

### Preprocessor

`parse()` runs a built-in C preprocessor by default: it deletes
backslash-newline splices (translation phase 2), executes directives in
stream order, evaluates `#if`/`#elif` conditions (64-bit arithmetic,
`defined()`, short-circuiting), expands object-like and function-like
macros — including `#` stringification, `##` token pasting, `__VA_ARGS__`,
and GNU extensions like `, ## __VA_ARGS__` comma swallowing and named
variadics — and handles the `_Pragma` operator.

- **Directives become AST nodes.** Every directive at an active level is
  recorded in `ast.directives` (`DefineDirective`, `IfDirective` with its
  `active` flag and skipped range, `IncludeDirective`, …), so tools can see
  the preprocessor structure alongside the parsed code. `_Pragma("…")` in
  the token stream is recorded as a `PragmaDirective` node.
- **Diagnostics are collected, not thrown.** `ast.errors` holds
  `{ message, start, end, phase, severity }` records from all three phases
  (`lexer` / `preprocessor` / `parser`); the parser recovers and keeps going.
- **Dynamic builtins are deterministic.** `__LINE__` and `__FILE__` expand
  and follow `#line` overrides (`__FILE__` defaults to `<source>`);
  `__COUNTER__` increments (GNU mode). For reproducible output, `__DATE__`
  is always `"Jan  1 1970"` and `__TIME__` is `"00:00:00"`.
- **`#include` is recorded but not resolved.** Macro-produced operands are
  expanded before recognizing their `"..."` or `<...>` target. The default
  `gcc-linux-x64` profile predefines compiler/target macros (`__GNUC__`,
  `__x86_64__`, …) up front, and holds back what system headers would
  provide — `<limits.h>`/`<stdint.h>` constants, `<inttypes.h>` format
  macros, `<stdbool.h>`, and `<stdarg.h>` shims that forward to the
  `__builtin_va_*` forms the parser understands — until the matching header
  is actually `#include`d (so `int bool;` still parses in a file that never
  includes `<stdbool.h>`). Pass `profile: 'none'` to start from an empty
  macro table.
- **`macros`** works like `-D`: `{ NDEBUG: true, VERSION: '"1.0"', 'MAX(a, b)':
  '((a) > (b) ? (a) : (b))' }`; `false` force-undefines a profile macro,
  including the header-gated ones.
- **`maxPreprocessedTokens`** is an absolute resource budget for emitted
  non-EOF tokens (default 1,000,000). It can be raised for intentionally
  expansion-heavy generated sources.
- **`preprocess: false`** restores the raw token-stream behavior: directives
  and macro names flow to the parser exactly as written (backslash-newline
  splices are still deleted during lexing, as in translation phase 2).

### AST Explorer Adapter

```typescript
import adapter from 'c11-parser/adapter';
```

## API

| Export      | Description                          |
| ----------- | ------------------------------------ |
| `parse`     | Parse C source into an AST           |
| `AST`       | All AST node type definitions        |
| `Scanner`   | Lexer class for tokenization         |
| `Parser`    | Parser class with token helpers      |
| `TokenKind` | Token kind enumeration (180+ tokens) |

## Features

- Full C11 syntax support
- Built-in preprocessor: conditionals, object/function-like macros, `#`/`##`,
  `__VA_ARGS__`, GNU extensions — parses the unpreprocessed quickjs-ng
  amalgamation (83k lines) with zero errors
- Preprocessor directives preserved as AST nodes (`ast.directives`)
- Error recovery with collected diagnostics (`ast.errors`)
- GCC `__attribute__` extensions
- Inline assembly (`asm` / `__asm__`)
- Byte-range tracking on every AST node (`start`, `end`)
- Optional line/column location tracking (`loc`) when enabled
- Dual package: ESM + CommonJS

## Development

```bash
pnpm build      # Build with tsup
pnpm test       # Run tests
pnpm lint       # Lint with oxlint
pnpm fmt        # Format with oxfmt
```

## License

MIT
