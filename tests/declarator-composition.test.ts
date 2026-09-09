import { expect, it } from 'vitest'
import { parse } from '../src/index'
function derived(source: string) {
  const a = parse(source)
  expect(a.errors).toEqual([])
  const d = a.decls[0]
  if (d.type !== 'Declaration') throw Error('declaration')
  return d.declarators[0].derived
}
it('preserves array and pointer constructor order across grouping', () => {
  expect(
    derived('int (*(*a)[2])[3];').map((d) =>
      d.kind === 'Array' && d.size?.type === 'IntLiteral' ? d.size.value : d.kind,
    ),
  ).toEqual([3, 'Pointer', 2, 'Pointer'])
  expect(
    derived('int (a[2])[3];').map((d) =>
      d.kind === 'Array' && d.size?.type === 'IntLiteral' ? d.size.value : d.kind,
    ),
  ).toEqual([2, 3])
})
it('composes nested function pointers from return type to outer declarator', () => {
  const ds = derived('int (*(*fp)(void))(int);')
  expect(ds.map((d) => d.kind)).toEqual([
    'Pointer',
    'FunctionPointer',
    'Pointer',
    'FunctionPointer',
  ])
  expect(ds[1]).toMatchObject({ params: [{ typeSpec: { type: 'IntType' } }] })
  expect(ds[3]).toMatchObject({ params: [] })
})
it('keeps multidimensional function return arrays in source order', () => {
  const a = parse('int (*f(void))[3][4] {}')
  expect(a.errors).toEqual([])
  expect(a.decls[0]).toMatchObject({
    returnType: {
      type: 'PointerType',
      base: {
        type: 'ArrayType',
        size: { value: 3 },
        element: { type: 'ArrayType', size: { value: 4 } },
      },
    },
  })
})

it('keeps parameter pointer placement and applies only outermost array adjustment', () => {
  const ast = parse('void f(int (**a)[4], int *(*b)[4], int (*c[2])[3]);')
  expect(ast.errors).toEqual([])
  const ds = derived('void f(int (**a)[4], int *(*b)[4], int (*c[2])[3]);')
  expect(ds[0]).toMatchObject({
    params: [
      {
        typeSpec: {
          type: 'PointerType',
          base: {
            type: 'PointerType',
            base: { type: 'ArrayType', size: { value: 4 }, element: { type: 'IntType' } },
          },
        },
      },
      {
        typeSpec: {
          type: 'PointerType',
          base: {
            type: 'ArrayType',
            size: { value: 4 },
            element: { type: 'PointerType', base: { type: 'IntType' } },
          },
        },
      },
      {
        typeSpec: {
          type: 'PointerType',
          base: {
            type: 'PointerType',
            base: { type: 'ArrayType', size: { value: 3 }, element: { type: 'IntType' } },
          },
        },
      },
    ],
  })
})
it('retains function structure in abstract declarators', () => {
  const ast = parse('int x=sizeof(int (*(*)(void))[3]);')
  expect(ast.errors).toEqual([])
  expect(ast.decls[0]).toMatchObject({
    declarators: [
      {
        init: {
          expr: {
            argument: {
              typeSpec: {
                type: 'FunctionPointerType',
                returnType: {
                  type: 'PointerType',
                  base: { type: 'ArrayType', size: { value: 3 } },
                },
              },
            },
          },
        },
      },
    ],
  })
})
it('preserves pointer-to-array parameters in K&R definitions', () => {
  const ast = parse('int f(a) int (*a)[3]; {return 0;}')
  expect(ast.errors).toEqual([])
  expect(ast.decls[0]).toMatchObject({
    params: [
      { typeSpec: { type: 'PointerType', base: { type: 'ArrayType', size: { value: 3 } } } },
    ],
  })
})

it('distinguishes a named typedef shadow from an abstract parameter prototype', () => {
  const ast = parse('typedef int T; void f(void){int (T); T=1;} void g(int (T));')
  expect(ast.errors).toEqual([])
  expect(ast.decls[1]).toMatchObject({
    body: {
      items: [
        { declarators: [{ name: 'T', derived: [] }] },
        { expr: { type: 'AssignExpression' } },
      ],
    },
  })
  expect(ast.decls[2]).toMatchObject({
    declarators: [
      {
        derived: [
          { params: [{ fptrParams: [{ typeSpec: { type: 'TypedefNameType', name: 'T' } }] }] },
        ],
      },
    ],
  })
})
