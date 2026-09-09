import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('counts recursive array bounds in abstract type names toward the nesting limit', () => {
  const bound = 'sizeof(int['.repeat(300) + '1' + '])'.repeat(300)
  for (const source of [
    `int x=${bound};`,
    `int x=_Alignof(int[${bound}]);`,
    `void f(void){ (int[${bound}]){0}; }`,
  ]) {
    const ast = parse(source)
    expect(ast.errors.some((e) => e.message.includes('nesting too deep'))).toBe(true)
  }
})
