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

  // GCC __builtin_offsetof(type-name, member-designator). The designator is not
  // an expression, so it has its own grammar: a member name followed by any
  // number of '.field', '->field' and '[index]' steps.
  describe('__builtin_offsetof', () => {
    const PRELUDE =
      'struct Inner { int x; int y; };\n' +
      'struct S { char pad; int b; int arr[4]; struct Inner inner;\n' +
      '           struct Inner nested[3]; int m2[2][3]; struct S *self; };\n' +
      'typedef struct S S_t;\n' +
      'typedef int myint;\n' +
      'struct Shadow { int myint; };\n' +
      'union U { int a; double d; };\n'

    /** Parse the prelude plus `unsigned long _o_ = <expr>;` and return the whole AST. */
    function parseOffsetofSource(exprStr: string) {
      return parse(`${PRELUDE}unsigned long _o_ = ${exprStr};\nint _after_ = 1;\n`)
    }

    /** The initializer expression of the `_o_` declaration, with the parse diagnostics. */
    function parseOffsetof(exprStr: string) {
      const ast = parseOffsetofSource(exprStr)
      const decl = ast.decls.find(
        (d) => d.type === 'Declaration' && d.declarators[0]?.name === '_o_',
      )
      if (decl === undefined || decl.type !== 'Declaration') throw new Error('expected Declaration')
      const init = decl.declarators[0]?.init
      if (!init || init.kind !== 'Expr') throw new Error('expected Expr initializer')
      return { expr: init.expr, errors: ast.errors }
    }

    it('parses a plain member designator', () => {
      const { expr, errors } = parseOffsetof('__builtin_offsetof(struct S, b)')
      expect(errors).toEqual([])
      expect(expr.type).toBe('OffsetofExpression')
      if (expr.type === 'OffsetofExpression') {
        expect(expr.typeSpec.type).toBe('StructType')
        if (expr.typeSpec.type === 'StructType') {
          expect(expr.typeSpec.name).toBe('S')
        }
        expect(expr.member).toBe('b')
        expect(expr.designators).toEqual([])
      }
    })

    it('spans the whole builtin call', () => {
      const source = `${PRELUDE}unsigned long _o_ = __builtin_offsetof(struct S, b);\n`
      const ast = parse(source)
      const decl = ast.decls[ast.decls.length - 1]
      if (decl.type !== 'Declaration') throw new Error('expected Declaration')
      const init = decl.declarators[0]?.init
      if (!init || init.kind !== 'Expr') throw new Error('expected Expr initializer')
      expect(source.slice(init.expr.start, init.expr.end)).toBe('__builtin_offsetof(struct S, b)')
    })

    it('parses a nested member designator', () => {
      const { expr, errors } = parseOffsetof('__builtin_offsetof(struct S, inner.y)')
      expect(errors).toEqual([])
      expect(expr.type).toBe('OffsetofExpression')
      if (expr.type === 'OffsetofExpression') {
        expect(expr.member).toBe('inner')
        expect(expr.designators).toEqual([{ kind: 'Field', name: 'y', arrow: false }])
      }
    })

    it('parses an array element designator', () => {
      const { expr, errors } = parseOffsetof('__builtin_offsetof(struct S, arr[2])')
      expect(errors).toEqual([])
      expect(expr.type).toBe('OffsetofExpression')
      if (expr.type === 'OffsetofExpression') {
        expect(expr.member).toBe('arr')
        expect(expr.designators).toHaveLength(1)
        const d = expr.designators[0]
        expect(d.kind).toBe('Index')
        if (d.kind === 'Index') {
          expect(d.index.type).toBe('IntLiteral')
          if (d.index.type === 'IntLiteral') expect(d.index.value).toBe(2)
        }
      }
    })

    it('parses an array element followed by a member', () => {
      const { expr, errors } = parseOffsetof('__builtin_offsetof(struct S, nested[1].x)')
      expect(errors).toEqual([])
      expect(expr.type).toBe('OffsetofExpression')
      if (expr.type === 'OffsetofExpression') {
        expect(expr.member).toBe('nested')
        expect(expr.designators.map((d) => d.kind)).toEqual(['Index', 'Field'])
        const field = expr.designators[1]
        if (field.kind === 'Field') expect(field.name).toBe('x')
      }
    })

    it('parses multi-dimensional subscripts and non-literal indices', () => {
      const { expr, errors } = parseOffsetof('__builtin_offsetof(struct S, m2[1][sizeof(int) - 3])')
      expect(errors).toEqual([])
      expect(expr.type).toBe('OffsetofExpression')
      if (expr.type === 'OffsetofExpression') {
        expect(expr.designators.map((d) => d.kind)).toEqual(['Index', 'Index'])
        const second = expr.designators[1]
        if (second.kind === 'Index') expect(second.index.type).toBe('BinaryExpression')
      }
    })

    // GCC accepts '->' inside a member designator, where `a->b` means `a[0].b`.
    it('parses an arrow step in the designator', () => {
      const { expr, errors } = parseOffsetof('__builtin_offsetof(struct S, self->b)')
      expect(errors).toEqual([])
      expect(expr.type).toBe('OffsetofExpression')
      if (expr.type === 'OffsetofExpression') {
        expect(expr.member).toBe('self')
        expect(expr.designators).toEqual([{ kind: 'Field', name: 'b', arrow: true }])
      }
    })

    it('accepts a typedef name as the type argument', () => {
      const { expr, errors } = parseOffsetof('__builtin_offsetof(S_t, arr[1])')
      expect(errors).toEqual([])
      expect(expr.type).toBe('OffsetofExpression')
      if (expr.type === 'OffsetofExpression') {
        expect(expr.typeSpec.type).toBe('TypedefNameType')
        if (expr.typeSpec.type === 'TypedefNameType') expect(expr.typeSpec.name).toBe('S_t')
      }
    })

    it('accepts a union type argument', () => {
      const { expr, errors } = parseOffsetof('__builtin_offsetof(union U, d)')
      expect(errors).toEqual([])
      expect(expr.type).toBe('OffsetofExpression')
      if (expr.type === 'OffsetofExpression') {
        expect(expr.typeSpec.type).toBe('UnionType')
        expect(expr.member).toBe('d')
      }
    })

    it('accepts an anonymous struct type argument', () => {
      const { expr, errors } = parseOffsetof('__builtin_offsetof(struct { char c; int i; }, i)')
      expect(errors).toEqual([])
      expect(expr.type).toBe('OffsetofExpression')
      if (expr.type === 'OffsetofExpression') {
        expect(expr.typeSpec.type).toBe('StructType')
        if (expr.typeSpec.type === 'StructType') {
          expect(expr.typeSpec.name).toBeNull()
          expect(expr.typeSpec.fields).toHaveLength(2)
        }
        expect(expr.member).toBe('i')
      }
    })

    it('accepts a pointer type argument', () => {
      // gcc rejects this in its type checker ("'*0' is a pointer"), but the
      // grammar takes any type name and this parser does no type checking.
      const { expr, errors } = parseOffsetof('__builtin_offsetof(struct S *, b)')
      expect(errors).toEqual([])
      expect(expr.type).toBe('OffsetofExpression')
      if (expr.type === 'OffsetofExpression') {
        expect(expr.typeSpec.type).toBe('PointerType')
      }
    })

    // A member designator names a member, so a typedef name is a fine member
    // name there — it must not be mistaken for the start of a type.
    it('accepts a member whose name is also a typedef name', () => {
      const { expr, errors } = parseOffsetof('__builtin_offsetof(struct Shadow, myint)')
      expect(errors).toEqual([])
      expect(expr.type).toBe('OffsetofExpression')
      if (expr.type === 'OffsetofExpression') {
        expect(expr.member).toBe('myint')
      }
    })

    it('expands through a macro that forwards to the builtin', () => {
      const ast = parse(
        'struct S { int a; int b; };\n' +
          '#define offsetof(t, m) __builtin_offsetof(t, m)\n' +
          'unsigned long o = offsetof(struct S, b);\n',
      )
      expect(ast.errors).toEqual([])
      const decl = ast.decls[ast.decls.length - 1]
      if (decl.type !== 'Declaration') throw new Error('expected Declaration')
      const init = decl.declarators[0]?.init
      if (!init || init.kind !== 'Expr') throw new Error('expected Expr initializer')
      expect(init.expr.type).toBe('OffsetofExpression')
    })

    // gcc: "expected specifier-qualifier-list before 'gs'" — the first argument
    // is a type name, never an expression.
    it('rejects an expression as the type argument', () => {
      const ast = parse('struct S { int b; } gs;\nunsigned long o = __builtin_offsetof(gs, b);\n')
      const errors = ast.errors.filter((d) => d.severity === 'error')
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('expected type name in __builtin_offsetof')
    })

    // gcc: "expected identifier before '.' token" — the designator starts with
    // a member name, not with a '.' the way an initializer designator does.
    it('rejects a leading dot in the designator', () => {
      const ast = parseOffsetofSource('__builtin_offsetof(struct S, .b)')
      const errors = ast.errors.filter((d) => d.severity === 'error')
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('expected member name in __builtin_offsetof')
      // Recovery consumed the rest of the argument list, so the next
      // declaration still parses.
      expect(ast.decls[ast.decls.length - 1].type).toBe('Declaration')
    })

    it('rejects a missing member designator', () => {
      const ast = parseOffsetofSource('__builtin_offsetof(struct S)')
      const errors = ast.errors.filter((d) => d.severity === 'error')
      expect(errors).toHaveLength(2)
      expect(errors[0].message).toContain("expected ',' between '__builtin_offsetof' arguments")
      expect(errors[1].message).toContain('expected member name in __builtin_offsetof')
    })

    // gcc: "expected ')' before '+' token" — nothing but ')' may follow the
    // designator.
    it('rejects trailing junk after the designator', () => {
      const ast = parseOffsetofSource('__builtin_offsetof(struct S, arr[1] + 1)')
      const errors = ast.errors.filter((d) => d.severity === 'error')
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain("expected ')'")
      expect(ast.decls[ast.decls.length - 1].type).toBe('Declaration')
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
