import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('diagnoses missing member names', () => {
  for (const op of ['.', '->'])
    expect(
      parse(`void f(void){p${op};}`).errors.some((e) => e.message === 'expected member name'),
    ).toBe(true)
})
it('leaves a closing brace for its block when a statement body is missing', () => {
  for (const head of ['if(x)', 'while(x)', 'if(x);else']) {
    const ast = parse(`void f(void){${head}} int a; int b;`)
    expect(ast.errors.some((e) => e.message === 'expected statement')).toBe(true)
    expect(ast.decls).toHaveLength(3)
  }
})
