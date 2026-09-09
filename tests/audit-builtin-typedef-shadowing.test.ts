import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('lets file scope objects shadow convenience typedef names', () => {
  for (const name of ['FILE', 'uint', 'size_t']) {
    const ast = parse(`int ${name}; void f(void){ ${name}=2; ${name}++; }`, { profile: 'none' })
    expect(ast.errors).toEqual([])
    expect(ast.decls[1]).toMatchObject({
      body: { items: [{ type: 'ExpressionStatement' }, { type: 'ExpressionStatement' }] },
    })
  }
})
