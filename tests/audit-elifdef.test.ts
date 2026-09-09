import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('handles elifdef/elifndef at active and skipped conditional levels', () => {
  for (const [first, macro, kind, taken] of [
    [0, '#define X', 'elifdef', true],
    [0, '', 'elifndef', true],
    [1, '#define X', 'elifdef', false],
  ] as const) {
    const ast = parse(`${macro}\n#if ${first}\nint first;\n#${kind} X\nint second;\n#endif`)
    expect(ast.errors).toEqual([])
    expect(ast.decls).toHaveLength(1)
    expect(ast.decls[0]).toMatchObject({ declarators: [{ name: taken ? 'second' : 'first' }] })
  }
  expect(parse('#if 0\n#if 1\n#elifdef X\n#error dead\n#endif\n#endif').errors).toEqual([])
})
