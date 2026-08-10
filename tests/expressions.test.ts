import { parse } from '../src/index'

/** Helper: parse a C expression wrapped in a variable declaration and return the init expr */
function parseExpr(exprStr: string) {
  const ast = parse(`int _x_ = ${exprStr};`)
  const decl = ast.decls[0]
  if (decl.type !== 'Declaration') throw new Error('expected Declaration')
  const init = decl.declarators[0]?.init
  if (!init || init.kind !== 'Expr') throw new Error('expected Expr initializer')
  return init.expr
}

/** Helper: parse a standalone expression statement inside a function body */
function parseExprStmt(exprStr: string) {
  const ast = parse(`void f(void) { ${exprStr}; }`)
  const fn = ast.decls[0]
  if (fn.type !== 'FunctionDefinition') throw new Error('expected FunctionDefinition')
  const stmt = fn.body.items[0]
  if (!stmt || stmt.type !== 'ExpressionStatement' || !stmt.expr) {
    throw new Error('expected ExpressionStatement')
  }
  return stmt.expr
}

/**
 * Helper: parse a whole translation unit, assert it is diagnostic-free, and
 * return the initializer expression of its last declaration.
 */
function parseCleanInit(src: string) {
  const ast = parse(src)
  expect(ast.errors).toEqual([])
  const decl = ast.decls[ast.decls.length - 1]
  if (decl.type !== 'Declaration') throw new Error('expected Declaration')
  const init = decl.declarators[0]?.init
  if (!init || init.kind !== 'Expr') throw new Error('expected Expr initializer')
  return init.expr
}

describe('expressions', () => {
  describe('integer literals', () => {
    it('parses decimal integer literal', () => {
      const expr = parseExpr('42')
      expect(expr.type).toBe('IntLiteral')
      if (expr.type === 'IntLiteral') {
        expect(expr.value).toBe(42)
      }
    })

    it('parses zero', () => {
      const expr = parseExpr('0')
      expect(expr.type).toBe('IntLiteral')
      if (expr.type === 'IntLiteral') {
        expect(expr.value).toBe(0)
      }
    })

    it('parses hex literal', () => {
      const expr = parseExpr('0xFF')
      expect(expr.type).toBe('IntLiteral')
      if (expr.type === 'IntLiteral') {
        expect(expr.value).toBe(255)
      }
    })

    // The scanner stores small integers in `value` and large ones in
    // `bigValue`; reading only one of the two silently produced 0.
    it('keeps the value of a small long long literal', () => {
      const expr = parseExpr('42LL')
      expect(expr.type).toBe('LongLongLiteral')
      if (expr.type === 'LongLongLiteral') {
        expect(expr.value).toBe(42n)
      }
    })

    it('keeps the value of a small unsigned long long literal', () => {
      const expr = parseExpr('7ULL')
      expect(expr.type).toBe('ULongLongLiteral')
      if (expr.type === 'ULongLongLiteral') {
        expect(expr.value).toBe(7n)
      }
    })

    it('keeps the value of a zero long long literal', () => {
      const expr = parseExpr('0LL')
      expect(expr.type).toBe('LongLongLiteral')
      if (expr.type === 'LongLongLiteral') {
        expect(expr.value).toBe(0n)
      }
    })

    it('keeps the value of a large long long literal', () => {
      const expr = parseExpr('9223372036854775807LL')
      expect(expr.type).toBe('LongLongLiteral')
      if (expr.type === 'LongLongLiteral') {
        expect(expr.value).toBe(9223372036854775807n)
      }
    })

    it('keeps the value of a large unsigned long long literal', () => {
      const expr = parseExpr('18446744073709551615ULL')
      expect(expr.type).toBe('ULongLongLiteral')
      if (expr.type === 'ULongLongLiteral') {
        expect(expr.value).toBe(18446744073709551615n)
      }
    })

    it('keeps the value of a small unsigned long literal', () => {
      const expr = parseExpr('9UL')
      expect(expr.type).toBe('ULongLiteral')
      if (expr.type === 'ULongLiteral') {
        expect(expr.value).toBe(9)
      }
    })

    it('keeps an unsigned long literal exact when it needs a bigint', () => {
      const expr = parseExpr('18446744073709551615UL')
      expect(expr.type).toBe('ULongLiteral')
      if (expr.type === 'ULongLiteral') {
        expect(expr.value).toBe(18446744073709551615n)
      }
    })

    it('keeps a long literal exact when it needs a bigint', () => {
      const expr = parseExpr('9007199254740993L')
      expect(expr.type).toBe('LongLiteral')
      if (expr.type === 'LongLiteral') {
        expect(expr.value).toBe(9007199254740993n)
      }
    })

    it('keeps the value of a long literal', () => {
      const expr = parseExpr('5L')
      expect(expr.type).toBe('LongLiteral')
      if (expr.type === 'LongLiteral') {
        expect(expr.value).toBe(5)
      }
    })
  })

  describe('string literals', () => {
    it('parses simple string literal', () => {
      const ast = parse('char *s = "hello";')
      const decl = ast.decls[0]
      if (decl.type === 'Declaration') {
        const init = decl.declarators[0]?.init
        expect(init?.kind).toBe('Expr')
        if (init?.kind === 'Expr') {
          expect(init.expr.type).toBe('StringLiteral')
          if (init.expr.type === 'StringLiteral') {
            expect(init.expr.value).toBe('hello')
          }
        }
      }
    })

    it('parses string with escape sequences', () => {
      const ast = parse('char *s = "hello\\nworld";')
      const decl = ast.decls[0]
      if (decl.type === 'Declaration') {
        const init = decl.declarators[0]?.init
        if (init?.kind === 'Expr' && init.expr.type === 'StringLiteral') {
          expect(init.expr.value).toBe('hello\nworld')
        }
      }
    })
  })

  describe('identifier references', () => {
    it('parses identifier in expression', () => {
      const expr = parseExprStmt('x')
      expect(expr.type).toBe('Identifier')
      if (expr.type === 'Identifier') {
        expect(expr.name).toBe('x')
      }
    })
  })

  describe('binary expressions', () => {
    it('parses addition', () => {
      const expr = parseExpr('1 + 2')
      expect(expr.type).toBe('BinaryExpression')
      if (expr.type === 'BinaryExpression') {
        expect(expr.operator).toBe('Add')
        expect(expr.left.type).toBe('IntLiteral')
        expect(expr.right.type).toBe('IntLiteral')
      }
    })

    it('parses multiplication has higher precedence than addition', () => {
      const expr = parseExpr('1 + 2 * 3')
      expect(expr.type).toBe('BinaryExpression')
      if (expr.type === 'BinaryExpression') {
        expect(expr.operator).toBe('Add')
        expect(expr.left.type).toBe('IntLiteral')
        // right should be 2*3
        expect(expr.right.type).toBe('BinaryExpression')
        if (expr.right.type === 'BinaryExpression') {
          expect(expr.right.operator).toBe('Mul')
        }
      }
    })

    it('parses left-associative subtraction', () => {
      const expr = parseExpr('1 - 2 - 3')
      expect(expr.type).toBe('BinaryExpression')
      if (expr.type === 'BinaryExpression') {
        expect(expr.operator).toBe('Sub')
        // left should be (1-2)
        expect(expr.left.type).toBe('BinaryExpression')
        if (expr.left.type === 'BinaryExpression') {
          expect(expr.left.operator).toBe('Sub')
        }
        expect(expr.right.type).toBe('IntLiteral')
      }
    })

    it('parses comparison operators', () => {
      const expr = parseExpr('1 < 2')
      expect(expr.type).toBe('BinaryExpression')
      if (expr.type === 'BinaryExpression') {
        expect(expr.operator).toBe('Lt')
      }
    })

    it('parses logical operators', () => {
      const expr = parseExpr('1 && 2')
      expect(expr.type).toBe('BinaryExpression')
      if (expr.type === 'BinaryExpression') {
        expect(expr.operator).toBe('LogicalAnd')
      }
    })

    it('parses bitwise operators', () => {
      const expr = parseExpr('1 | 2')
      expect(expr.type).toBe('BinaryExpression')
      if (expr.type === 'BinaryExpression') {
        expect(expr.operator).toBe('BitOr')
      }
    })

    it('parses shift operators', () => {
      const expr = parseExpr('1 << 2')
      expect(expr.type).toBe('BinaryExpression')
      if (expr.type === 'BinaryExpression') {
        expect(expr.operator).toBe('Shl')
      }
    })
  })

  describe('unary expressions', () => {
    it('parses negation', () => {
      const expr = parseExpr('-1')
      expect(expr.type).toBe('UnaryExpression')
      if (expr.type === 'UnaryExpression') {
        expect(expr.operator).toBe('Neg')
      }
    })

    it('parses logical not', () => {
      const expr = parseExprStmt('!x')
      expect(expr.type).toBe('UnaryExpression')
      if (expr.type === 'UnaryExpression') {
        expect(expr.operator).toBe('LogicalNot')
      }
    })

    it('parses bitwise not', () => {
      const expr = parseExprStmt('~x')
      expect(expr.type).toBe('UnaryExpression')
      if (expr.type === 'UnaryExpression') {
        expect(expr.operator).toBe('BitNot')
      }
    })

    it('parses dereference', () => {
      const expr = parseExprStmt('*p')
      expect(expr.type).toBe('DerefExpression')
    })

    it('parses address-of', () => {
      const expr = parseExprStmt('&x')
      expect(expr.type).toBe('AddressOfExpression')
    })

    it('parses pre-increment', () => {
      const expr = parseExprStmt('++x')
      expect(expr.type).toBe('UnaryExpression')
      if (expr.type === 'UnaryExpression') {
        expect(expr.operator).toBe('PreInc')
      }
    })

    it('parses pre-decrement', () => {
      const expr = parseExprStmt('--x')
      expect(expr.type).toBe('UnaryExpression')
      if (expr.type === 'UnaryExpression') {
        expect(expr.operator).toBe('PreDec')
      }
    })
  })

  describe('postfix expressions', () => {
    it('parses post-increment', () => {
      const expr = parseExprStmt('x++')
      expect(expr.type).toBe('PostfixExpression')
      if (expr.type === 'PostfixExpression') {
        expect(expr.operator).toBe('PostInc')
      }
    })

    it('parses post-decrement', () => {
      const expr = parseExprStmt('x--')
      expect(expr.type).toBe('PostfixExpression')
      if (expr.type === 'PostfixExpression') {
        expect(expr.operator).toBe('PostDec')
      }
    })
  })

  describe('function calls', () => {
    it('parses function call with no args', () => {
      const expr = parseExprStmt('f()')
      expect(expr.type).toBe('FunctionCallExpression')
      if (expr.type === 'FunctionCallExpression') {
        expect(expr.callee.type).toBe('Identifier')
        expect(expr.args).toHaveLength(0)
      }
    })

    it('parses function call with args', () => {
      const expr = parseExprStmt('f(x, y)')
      expect(expr.type).toBe('FunctionCallExpression')
      if (expr.type === 'FunctionCallExpression') {
        expect(expr.args).toHaveLength(2)
      }
    })
  })

  describe('array subscript', () => {
    it('parses array subscript', () => {
      const expr = parseExprStmt('a[i]')
      expect(expr.type).toBe('ArraySubscriptExpression')
      if (expr.type === 'ArraySubscriptExpression') {
        expect(expr.object.type).toBe('Identifier')
        if (expr.object.type === 'Identifier') {
          expect(expr.object.name).toBe('a')
        }
      }
    })
  })

  describe('member access', () => {
    it('parses dot member access', () => {
      const expr = parseExprStmt('s.x')
      expect(expr.type).toBe('MemberAccessExpression')
      if (expr.type === 'MemberAccessExpression') {
        expect(expr.member).toBe('x')
      }
    })

    it('parses arrow member access', () => {
      const expr = parseExprStmt('p->y')
      expect(expr.type).toBe('PointerMemberAccessExpression')
      if (expr.type === 'PointerMemberAccessExpression') {
        expect(expr.member).toBe('y')
      }
    })
  })

  describe('ternary expression', () => {
    it('parses ternary conditional', () => {
      const expr = parseExpr('a ? b : c')
      expect(expr.type).toBe('ConditionalExpression')
      if (expr.type === 'ConditionalExpression') {
        expect(expr.condition.type).toBe('Identifier')
        expect(expr.consequent.type).toBe('Identifier')
        expect(expr.alternate.type).toBe('Identifier')
      }
    })
  })

  describe('assignment', () => {
    it('parses simple assignment', () => {
      const expr = parseExprStmt('x = 1')
      expect(expr.type).toBe('AssignExpression')
      if (expr.type === 'AssignExpression') {
        expect(expr.left.type).toBe('Identifier')
        expect(expr.right.type).toBe('IntLiteral')
      }
    })

    it('parses compound assignment', () => {
      const expr = parseExprStmt('x += 1')
      expect(expr.type).toBe('CompoundAssignExpression')
      if (expr.type === 'CompoundAssignExpression') {
        expect(expr.operator).toBe('Add')
      }
    })
  })

  describe('cast expression', () => {
    it('parses cast to int', () => {
      const expr = parseExprStmt('(int)x')
      expect(expr.type).toBe('CastExpression')
      if (expr.type === 'CastExpression') {
        expect(expr.typeSpec.type).toBe('IntType')
        expect(expr.operand.type).toBe('Identifier')
      }
    })

    it('parses cast to pointer', () => {
      const expr = parseExprStmt('(void *)x')
      expect(expr.type).toBe('CastExpression')
      if (expr.type === 'CastExpression') {
        expect(expr.typeSpec.type).toBe('PointerType')
      }
    })
  })

  describe('sizeof', () => {
    it('parses sizeof with type', () => {
      const expr = parseExpr('sizeof(int)')
      expect(expr.type).toBe('SizeofExpression')
      if (expr.type === 'SizeofExpression') {
        expect(expr.argument.kind).toBe('Type')
        if (expr.argument.kind === 'Type') {
          expect(expr.argument.typeSpec.type).toBe('IntType')
        }
      }
    })

    it('parses sizeof with expression', () => {
      const expr = parseExprStmt('sizeof x')
      expect(expr.type).toBe('SizeofExpression')
      if (expr.type === 'SizeofExpression') {
        expect(expr.argument.kind).toBe('Expr')
      }
    })

    // C11 6.5.3.4: `sizeof (T){...}` is sizeof of the compound literal
    // `(T){...}` (a unary-expression), not sizeof of the type name `T`.
    // Committing to the type form left the braces orphaned, which poisoned the
    // enclosing declaration.
    it('parses sizeof of a compound literal', () => {
      const expr = parseCleanInit('unsigned long _x_ = sizeof (int){1};')
      expect(expr.type).toBe('SizeofExpression')
      if (expr.type !== 'SizeofExpression') return
      expect(expr.argument.kind).toBe('Expr')
      if (expr.argument.kind !== 'Expr') return
      expect(expr.argument.expr.type).toBe('CompoundLiteralExpression')
      if (expr.argument.expr.type !== 'CompoundLiteralExpression') return
      expect(expr.argument.expr.typeSpec.type).toBe('IntType')
    })

    it('parses sizeof of a struct compound literal', () => {
      const expr = parseCleanInit('struct S { int a; }; unsigned long _x_ = sizeof (struct S){0};')
      expect(expr.type).toBe('SizeofExpression')
      if (expr.type !== 'SizeofExpression') return
      expect(expr.argument.kind).toBe('Expr')
      if (expr.argument.kind !== 'Expr') return
      expect(expr.argument.expr.type).toBe('CompoundLiteralExpression')
      if (expr.argument.expr.type !== 'CompoundLiteralExpression') return
      expect(expr.argument.expr.typeSpec.type).toBe('StructType')
    })

    it('parses sizeof of a typedef-name compound literal', () => {
      const expr = parseCleanInit('typedef int T; unsigned long _x_ = sizeof (T){0};')
      expect(expr.type).toBe('SizeofExpression')
      if (expr.type !== 'SizeofExpression') return
      expect(expr.argument.kind).toBe('Expr')
      if (expr.argument.kind !== 'Expr') return
      expect(expr.argument.expr.type).toBe('CompoundLiteralExpression')
      if (expr.argument.expr.type !== 'CompoundLiteralExpression') return
      expect(expr.argument.expr.typeSpec.type).toBe('TypedefNameType')
    })

    // Postfix operators bind to the compound literal, so the member access is
    // inside the sizeof operand.
    it('applies postfix operators to a sizeof compound literal', () => {
      const expr = parseCleanInit(
        'struct S { int a; }; unsigned long _x_ = sizeof (struct S){ .a = 1 }.a;',
      )
      expect(expr.type).toBe('SizeofExpression')
      if (expr.type !== 'SizeofExpression') return
      expect(expr.argument.kind).toBe('Expr')
      if (expr.argument.kind !== 'Expr') return
      expect(expr.argument.expr.type).toBe('MemberAccessExpression')
      if (expr.argument.expr.type !== 'MemberAccessExpression') return
      expect(expr.argument.expr.object.type).toBe('CompoundLiteralExpression')
    })

    it('parses a sizeof compound literal as one additive operand', () => {
      const expr = parseCleanInit('unsigned long _x_ = sizeof (int){1} + 2;')
      expect(expr.type).toBe('BinaryExpression')
      if (expr.type !== 'BinaryExpression') return
      expect(expr.operator).toBe('Add')
      expect(expr.left.type).toBe('SizeofExpression')
      if (expr.left.type !== 'SizeofExpression') return
      expect(expr.left.argument.kind).toBe('Expr')
    })

    it('parses sizeof of a parenthesized compound literal', () => {
      const expr = parseCleanInit('unsigned long _x_ = sizeof((int){1});')
      expect(expr.type).toBe('SizeofExpression')
      if (expr.type !== 'SizeofExpression') return
      expect(expr.argument.kind).toBe('Expr')
      if (expr.argument.kind !== 'Expr') return
      expect(expr.argument.expr.type).toBe('CompoundLiteralExpression')
    })

    // A type name not followed by '{' still parses as the type form.
    it('keeps the type form when no brace follows', () => {
      const expr = parseCleanInit('unsigned long _x_ = sizeof (int) * 2;')
      expect(expr.type).toBe('BinaryExpression')
      if (expr.type !== 'BinaryExpression') return
      expect(expr.operator).toBe('Mul')
      expect(expr.left.type).toBe('SizeofExpression')
      if (expr.left.type !== 'SizeofExpression') return
      expect(expr.left.argument.kind).toBe('Type')
    })

    it('keeps the type form before a dereferenced identifier', () => {
      const expr = parseExprStmt('sizeof(int)*p')
      expect(expr.type).toBe('BinaryExpression')
      if (expr.type !== 'BinaryExpression') return
      expect(expr.operator).toBe('Mul')
      expect(expr.left.type).toBe('SizeofExpression')
      if (expr.left.type !== 'SizeofExpression') return
      expect(expr.left.argument.kind).toBe('Type')
      expect(expr.right.type).toBe('Identifier')
    })
  })

  describe('alignof', () => {
    it('parses _Alignof with type', () => {
      const expr = parseCleanInit('unsigned long _x_ = _Alignof(int);')
      expect(expr.type).toBe('AlignofExpression')
      if (expr.type !== 'AlignofExpression') return
      expect(expr.typeSpec.type).toBe('IntType')
    })

    it('parses __alignof__ with type', () => {
      const expr = parseCleanInit('unsigned long _x_ = __alignof__(int);')
      expect(expr.type).toBe('GnuAlignofExpression')
      if (expr.type !== 'GnuAlignofExpression') return
      expect(expr.typeSpec.type).toBe('IntType')
    })

    it('parses __alignof__ with expression', () => {
      const expr = parseExprStmt('__alignof__(x)')
      expect(expr.type).toBe('GnuAlignofExprExpression')
      if (expr.type !== 'GnuAlignofExprExpression') return
      expect(expr.expr.type).toBe('Identifier')
    })

    // Same C11 6.5.3.4 rule as sizeof: the operand is the compound literal.
    it('parses _Alignof of a compound literal', () => {
      const expr = parseCleanInit('unsigned long _x_ = _Alignof (int){1};')
      expect(expr.type).toBe('AlignofExprExpression')
      if (expr.type !== 'AlignofExprExpression') return
      expect(expr.expr.type).toBe('CompoundLiteralExpression')
      if (expr.expr.type !== 'CompoundLiteralExpression') return
      expect(expr.expr.typeSpec.type).toBe('IntType')
    })

    it('parses _Alignof of a struct compound literal', () => {
      const expr = parseCleanInit(
        'struct S { int a; }; unsigned long _x_ = _Alignof (struct S){0};',
      )
      expect(expr.type).toBe('AlignofExprExpression')
      if (expr.type !== 'AlignofExprExpression') return
      expect(expr.expr.type).toBe('CompoundLiteralExpression')
      if (expr.expr.type !== 'CompoundLiteralExpression') return
      expect(expr.expr.typeSpec.type).toBe('StructType')
    })

    it('parses __alignof__ of a compound literal', () => {
      const expr = parseCleanInit('unsigned long _x_ = __alignof__ (int){1};')
      expect(expr.type).toBe('GnuAlignofExprExpression')
      if (expr.type !== 'GnuAlignofExprExpression') return
      expect(expr.expr.type).toBe('CompoundLiteralExpression')
      if (expr.expr.type !== 'CompoundLiteralExpression') return
      expect(expr.expr.typeSpec.type).toBe('IntType')
    })

    it('parses __alignof__ of a typedef-name compound literal', () => {
      const expr = parseCleanInit('typedef int T; unsigned long _x_ = __alignof__ (T){0};')
      expect(expr.type).toBe('GnuAlignofExprExpression')
      if (expr.type !== 'GnuAlignofExprExpression') return
      expect(expr.expr.type).toBe('CompoundLiteralExpression')
      if (expr.expr.type !== 'CompoundLiteralExpression') return
      expect(expr.expr.typeSpec.type).toBe('TypedefNameType')
    })
  })

  describe('comma expression', () => {
    it('parses comma expression', () => {
      // Comma expression needs parens in initializer context, use statement context
      const expr = parseExprStmt('(a, b)')
      // Parenthesized comma expression: the parser returns the inner expression
      // which is a CommaExpression
      expect(expr.type).toBe('CommaExpression')
      if (expr.type === 'CommaExpression') {
        expect(expr.left.type).toBe('Identifier')
        expect(expr.right.type).toBe('Identifier')
      }
    })
  })
})
