# c-parser

A C11 parser written in TypeScript with GCC extensions support. Zero runtime dependencies.

Try the [online playground](https://gengjiawen.github.io/c-parser/).

Built for use with [AST Explorer](https://astexplorer.net/). 

## Install

```bash
npm install c-parser
```

## Usage

```typescript
import { parse } from 'c-parser';

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
});
```

### AST Explorer Adapter

```typescript
import adapter from 'c-parser/adapter';
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
- GCC `__attribute__` extensions
- Inline assembly (`asm` / `__asm__`)
- Location tracking on every AST node (`start`, `end`, `loc`)
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
