// Precedence Climbing Parser Demo
// Single-file TypeScript implementation

type Token =
  | { type: 'NUMBER'; value: number }
  | { type: 'IDENT'; name: string }
  | { type: 'PLUS' }
  | { type: 'MINUS' }
  | { type: 'STAR' }
  | { type: 'SLASH' }
  | { type: 'EQ' }
  | { type: 'LT' }
  | { type: 'GT' }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' }
  | { type: 'EOF' }

// Lexer
function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < input.length) {
    const c = input[i]

    if (c === ' ' || c === '\t' || c === '\n') {
      i++
      continue
    }

    if (c === '+') {
      tokens.push({ type: 'PLUS' })
      i++
    } else if (c === '-') {
      tokens.push({ type: 'MINUS' })
      i++
    } else if (c === '*') {
      tokens.push({ type: 'STAR' })
      i++
    } else if (c === '/') {
      tokens.push({ type: 'SLASH' })
      i++
    } else if (c === '=') {
      if (input[i + 1] === '=') {
        tokens.push({ type: 'EQ' })
        i += 2
      } else {
        throw new Error('Single = not supported, use ==')
      }
    } else if (c === '<') {
      tokens.push({ type: 'LT' })
      i++
    } else if (c === '>') {
      tokens.push({ type: 'GT' })
      i++
    } else if (c === '(') {
      tokens.push({ type: 'LPAREN' })
      i++
    } else if (c === ')') {
      tokens.push({ type: 'RPAREN' })
      i++
    } else if (/[0-9]/.test(c)) {
      let num = ''
      while (i < input.length && /[0-9]/.test(input[i])) {
        num += input[i]
        i++
      }
      tokens.push({ type: 'NUMBER', value: parseInt(num) })
    } else if (/[a-zA-Z_]/.test(c)) {
      let name = ''
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        name += input[i]
        i++
      }
      tokens.push({ type: 'IDENT', name })
    } else {
      throw new Error(`Unknown character: ${c}`)
    }
  }

  tokens.push({ type: 'EOF' })
  return tokens
}

// AST Nodes
type Expr =
  | { type: 'Number'; value: number }
  | { type: 'Ident'; name: string }
  | { type: 'Binary'; op: string; left: Expr; right: Expr }

// Parser
// Core structure: precedence from lowest to highest,
// each level recursively calls the next level
// parseEquality()     // ==
//   → parseRelational()  // < >
//     → parseAdditive()  // + -
//       → parseMultiplicative()  // * /
//         → parsePrimary()  // number, ident, (expr)
class Parser {
  tokens: Token[]
  pos: number

  constructor(tokens: Token[]) {
    this.tokens = tokens
    this.pos = 0
  }

  peek(): Token {
    return this.tokens[this.pos]
  }

  advance(): Token {
    return this.tokens[this.pos++]
  }

  // Precedence levels (lowest to highest)
  parseExpr(): Expr {
    return this.parseEquality()
  }

  parseEquality(): Expr {
    let left = this.parseRelational()
    while (this.peek().type === 'EQ') {
      this.advance()
      const right = this.parseRelational()
      left = { type: 'Binary', op: '==', left, right }
    }
    return left
  }

  parseRelational(): Expr {
    let left = this.parseAdditive()
    while (this.peek().type === 'LT' || this.peek().type === 'GT') {
      const op = this.peek().type === 'LT' ? '<' : '>'
      this.advance()
      const right = this.parseAdditive()
      left = { type: 'Binary', op, left, right }
    }
    return left
  }

  parseAdditive(): Expr {
    let left = this.parseMultiplicative()
    while (this.peek().type === 'PLUS' || this.peek().type === 'MINUS') {
      const op = this.peek().type === 'PLUS' ? '+' : '-'
      this.advance()
      const right = this.parseMultiplicative()
      left = { type: 'Binary', op, left, right }
    }
    return left
  }

  parseMultiplicative(): Expr {
    let left = this.parsePrimary()
    while (this.peek().type === 'STAR' || this.peek().type === 'SLASH') {
      const op = this.peek().type === 'STAR' ? '*' : '/'
      this.advance()
      const right = this.parsePrimary()
      left = { type: 'Binary', op, left, right }
    }
    return left
  }

  parsePrimary(): Expr {
    const tok = this.peek()
    if (tok.type === 'NUMBER') {
      this.advance()
      return { type: 'Number', value: tok.value }
    }
    if (tok.type === 'IDENT') {
      this.advance()
      return { type: 'Ident', name: tok.name }
    }
    if (tok.type === 'LPAREN') {
      this.advance()
      const expr = this.parseExpr()
      if (this.peek().type !== 'RPAREN') {
        throw new Error('Expected )')
      }
      this.advance()
      return expr
    }
    throw new Error(`Unexpected token: ${tok.type}`)
  }
}

// AST Printer
function printAST(expr: Expr, indent = 0): string {
  const spaces = '  '.repeat(indent)
  switch (expr.type) {
    case 'Number':
      return `${spaces}Number(${expr.value})`
    case 'Ident':
      return `${spaces}Ident(${expr.name})`
    case 'Binary':
      return `${spaces}Binary(${expr.op})\n${printAST(expr.left, indent + 1)}\n${printAST(expr.right, indent + 1)}`
  }
}

// Demo
function parse(input: string): Expr {
  const tokens = tokenize(input)
  const parser = new Parser(tokens)
  return parser.parseExpr()
}

// Test cases
const tests = [
  '1 + 2',
  '1 + 2 * 3',
  '(1 + 2) * 3',
  'a + b * c == d',
  '1 + 2 + 3',
  '1 * 2 * 3',
  'a < b + c',
  'x == y + z * w',
]

console.log('=== Precedence Climbing Parser Demo ===\n')

for (const test of tests) {
  console.log(`Input: ${test}`)
  const ast = parse(test)
  console.log('AST:')
  console.log(printAST(ast))
  console.log('')
}
