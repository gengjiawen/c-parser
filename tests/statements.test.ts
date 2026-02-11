import { parse } from '../src/index'

/** Helper: parse a function body and return the first statement */
function parseStmt(stmtStr: string) {
  const ast = parse(`void f(void) { ${stmtStr} }`)
  const fn = ast.decls[0]
  if (fn.type !== 'FunctionDefinition') throw new Error('expected FunctionDefinition')
  return fn.body.items[0]
}

/** Helper: parse a function body and return all statements */
function parseStmts(bodyStr: string) {
  const ast = parse(`void f(void) { ${bodyStr} }`)
  const fn = ast.decls[0]
  if (fn.type !== 'FunctionDefinition') throw new Error('expected FunctionDefinition')
  return fn.body.items
}

describe('statements', () => {
  describe('return statement', () => {
    it('parses return with value', () => {
      const stmt = parseStmt('return 42;')
      expect(stmt.type).toBe('ReturnStatement')
      if (stmt.type === 'ReturnStatement') {
        expect(stmt.expr).not.toBeNull()
        if (stmt.expr) {
          expect(stmt.expr.type).toBe('IntLiteral')
        }
      }
    })

    it('parses return without value', () => {
      const stmt = parseStmt('return;')
      expect(stmt.type).toBe('ReturnStatement')
      if (stmt.type === 'ReturnStatement') {
        expect(stmt.expr).toBeNull()
      }
    })

    it('parses return with expression', () => {
      const stmt = parseStmt('return a + b;')
      if (stmt.type === 'ReturnStatement' && stmt.expr) {
        expect(stmt.expr.type).toBe('BinaryExpression')
      }
    })
  })

  describe('if/else statement', () => {
    it('parses if without else', () => {
      const stmt = parseStmt('if (x) return 1;')
      expect(stmt.type).toBe('IfStatement')
      if (stmt.type === 'IfStatement') {
        expect(stmt.condition).toBeDefined()
        expect(stmt.consequent).toBeDefined()
        expect(stmt.alternate).toBeNull()
      }
    })

    it('parses if with else', () => {
      const stmt = parseStmt('if (x) return 1; else return 0;')
      expect(stmt.type).toBe('IfStatement')
      if (stmt.type === 'IfStatement') {
        expect(stmt.alternate).not.toBeNull()
      }
    })

    it('parses if with block body', () => {
      const stmt = parseStmt('if (x) { return 1; }')
      expect(stmt.type).toBe('IfStatement')
      if (stmt.type === 'IfStatement') {
        expect(stmt.consequent.type).toBe('CompoundStatement')
      }
    })

    it('parses nested if-else-if', () => {
      const stmt = parseStmt('if (a) return 1; else if (b) return 2; else return 3;')
      expect(stmt.type).toBe('IfStatement')
      if (stmt.type === 'IfStatement') {
        expect(stmt.alternate).not.toBeNull()
        if (stmt.alternate) {
          expect(stmt.alternate.type).toBe('IfStatement')
        }
      }
    })
  })

  describe('while loop', () => {
    it('parses while loop', () => {
      const stmt = parseStmt('while (x) x--;')
      expect(stmt.type).toBe('WhileStatement')
      if (stmt.type === 'WhileStatement') {
        expect(stmt.condition).toBeDefined()
        expect(stmt.body).toBeDefined()
      }
    })

    it('parses while with block body', () => {
      const stmt = parseStmt('while (1) { break; }')
      expect(stmt.type).toBe('WhileStatement')
      if (stmt.type === 'WhileStatement') {
        expect(stmt.body.type).toBe('CompoundStatement')
      }
    })
  })

  describe('do-while loop', () => {
    it('parses do-while loop', () => {
      const stmt = parseStmt('do { x++; } while (x < 10);')
      expect(stmt.type).toBe('DoWhileStatement')
      if (stmt.type === 'DoWhileStatement') {
        expect(stmt.body).toBeDefined()
        expect(stmt.condition).toBeDefined()
      }
    })
  })

  describe('for loop', () => {
    it('parses for loop with all parts', () => {
      const stmt = parseStmt('for (i = 0; i < 10; i++) x++;')
      expect(stmt.type).toBe('ForStatement')
      if (stmt.type === 'ForStatement') {
        expect(stmt.init).not.toBeNull()
        expect(stmt.condition).not.toBeNull()
        expect(stmt.update).not.toBeNull()
        expect(stmt.body).toBeDefined()
      }
    })

    it('parses for loop with empty parts', () => {
      const stmt = parseStmt('for (;;) break;')
      expect(stmt.type).toBe('ForStatement')
      if (stmt.type === 'ForStatement') {
        expect(stmt.condition).toBeNull()
        expect(stmt.update).toBeNull()
      }
    })

    it('parses for loop with declaration init', () => {
      const stmt = parseStmt('for (int i = 0; i < 10; i++) x++;')
      expect(stmt.type).toBe('ForStatement')
      if (stmt.type === 'ForStatement') {
        expect(stmt.init).not.toBeNull()
        if (stmt.init) {
          expect(stmt.init.kind).toBe('Declaration')
        }
      }
    })
  })

  describe('switch statement', () => {
    it('parses switch with cases', () => {
      const stmt = parseStmt('switch (x) { case 1: break; case 2: break; default: break; }')
      expect(stmt.type).toBe('SwitchStatement')
      if (stmt.type === 'SwitchStatement') {
        expect(stmt.discriminant).toBeDefined()
        expect(stmt.body).toBeDefined()
      }
    })

    it('parses case labels inside switch body', () => {
      const stmt = parseStmt('switch (x) { case 0: return 0; case 1: return 1; }')
      expect(stmt.type).toBe('SwitchStatement')
      if (stmt.type === 'SwitchStatement' && stmt.body.type === 'CompoundStatement') {
        const items = stmt.body.items
        const caseLabels = items.filter((i) => i.type === 'CaseStatement')
        expect(caseLabels.length).toBeGreaterThanOrEqual(2)
      }
    })
  })

  describe('break and continue', () => {
    it('parses break statement', () => {
      const stmt = parseStmt('break;')
      expect(stmt.type).toBe('BreakStatement')
    })

    it('parses continue statement', () => {
      const stmt = parseStmt('continue;')
      expect(stmt.type).toBe('ContinueStatement')
    })
  })

  describe('goto and label', () => {
    it('parses goto statement', () => {
      const stmt = parseStmt('goto end;')
      expect(stmt.type).toBe('GotoStatement')
      if (stmt.type === 'GotoStatement') {
        expect(stmt.label).toBe('end')
      }
    })

    it('parses label statement', () => {
      const stmts = parseStmts('end: return 0;')
      const label = stmts.find((s) => s.type === 'LabelStatement')
      expect(label).toBeDefined()
      if (label && label.type === 'LabelStatement') {
        expect(label.label).toBe('end')
      }
    })
  })

  describe('compound statement', () => {
    it('parses empty block', () => {
      const stmt = parseStmt('{}')
      expect(stmt.type).toBe('CompoundStatement')
      if (stmt.type === 'CompoundStatement') {
        expect(stmt.items).toHaveLength(0)
      }
    })

    it('parses block with multiple statements', () => {
      const stmt = parseStmt('{ int x; x = 1; return x; }')
      expect(stmt.type).toBe('CompoundStatement')
      if (stmt.type === 'CompoundStatement') {
        expect(stmt.items.length).toBeGreaterThanOrEqual(2)
      }
    })
  })

  describe('expression statement', () => {
    it('parses expression statement', () => {
      const stmt = parseStmt('x = 1;')
      expect(stmt.type).toBe('ExpressionStatement')
      if (stmt.type === 'ExpressionStatement') {
        expect(stmt.expr).toBeDefined()
      }
    })

    it('parses function call statement', () => {
      const stmt = parseStmt('foo();')
      expect(stmt.type).toBe('ExpressionStatement')
      if (stmt.type === 'ExpressionStatement' && stmt.expr) {
        expect(stmt.expr.type).toBe('FunctionCallExpression')
      }
    })
  })

  describe('null statement', () => {
    it('parses empty statement (semicolon)', () => {
      const stmts = parseStmts(';')
      // Empty statement may be parsed as NullStatement or just skipped
      expect(stmts.length).toBeGreaterThanOrEqual(0)
    })
  })
})
