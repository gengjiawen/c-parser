import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('shares one materialization budget across all initializer lists in a parse', () => {
  const ast = parse(
    'int a[]={[0 ... 32767]=1}; int b[]={[0 ... 32767]=2}; int c[]={[0 ... 32767]=3};',
  )
  expect(ast.errors).toEqual([])
  const inits = ast.decls.map((d) => (d.type === 'Declaration' ? d.declarators[0].init : null))
  expect(inits[0]?.kind === 'List' ? inits[0].items.length : 0).toBe(32768)
  expect(inits[2]).toMatchObject({ kind: 'List', items: [{ designators: [{ kind: 'Range' }] }] })
  expect(parse('int fresh[]={[0 ... 1]=0};').decls[0]).toMatchObject({
    declarators: [{ init: { items: [{}, {}] } }],
  })
})
