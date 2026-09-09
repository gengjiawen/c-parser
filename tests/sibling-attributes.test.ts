import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('applies shared attributes to every sibling and suffix attributes only to their declarator', () => {
  for (const scope of [false, true]) {
    const source =
      '__attribute__((weak)) int a,b; int c __attribute__((section("s"))),d; void f(void) __attribute__((constructor)),g(void);'
    const ast = parse(scope ? `void outer(void){${source}}` : source)
    expect(ast.errors).toEqual([])
    const ds =
      scope && ast.decls[0].type === 'FunctionDefinition' ? ast.decls[0].body.items : ast.decls
    expect(ds[0]).toMatchObject({
      declarators: [{ attrs: { isWeak: true } }, { attrs: { isWeak: true } }],
    })
    expect(ds[1]).toMatchObject({
      declarators: [{ attrs: { section: 's' } }, { attrs: { section: null } }],
    })
    expect(ds[2]).toMatchObject({
      declarators: [{ attrs: { isConstructor: true } }, { attrs: { isConstructor: false } }],
    })
  }
})
it('records alignment per declarator without raising unrelated sibling alignment', () => {
  for (const source of [
    'int a __attribute__((aligned(64))),b;',
    'int a,b __attribute__((aligned(16)));',
  ]) {
    const ast = parse(source)
    expect(ast.errors).toEqual([])
    expect(ast.decls[0]).toMatchObject({
      alignment: null,
      declarators: source.includes('64')
        ? [{ attrs: { alignment: 64 } }, { attrs: { alignment: null } }]
        : [{ attrs: { alignment: null } }, { attrs: { alignment: 16 } }],
    })
  }
})
