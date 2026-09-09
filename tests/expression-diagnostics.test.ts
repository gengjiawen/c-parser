import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('diagnoses type specifiers and asm in expression position', () => {
  for (const expression of [
    'typeof(x)',
    '__typeof__(x)',
    'asm("nop")',
    'sizeof(asm("nop"))',
    '_Generic(0,int:1,)',
    '_Generic(0,)',
  ]) {
    expect(
      parse(`void f(void){int x=${expression};}`).errors.some((e) => e.severity === 'error'),
      expression,
    ).toBe(true)
  }
})
it('retains valid typeof declarations, asm statements and generic associations', () => {
  expect(
    parse('void f(void){int x;typeof(x) y;asm("nop");int z=_Generic(x,int:1,default:2);}').errors,
  ).toEqual([])
})
