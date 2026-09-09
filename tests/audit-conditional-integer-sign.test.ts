import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('uses intmax_t for unsuffixed preprocessing integer constants', () => {
  for (const expr of [
    '-0x80000000 < 0',
    '0xffffffff > -1',
    '-037777777777 < 0',
    '0xffffffffU > -1 == 0',
    '0xffffffffffffffff > 0',
    '-1 < 0U == 0',
  ]) {
    const ast = parse(`#if ${expr}\nint yes;\n#else\n#error wrong branch\n#endif`)
    expect(ast.errors, expr).toEqual([])
  }
  const macro = parse('#define X 0xffffffff\n#if X > -1\nint yes;\n#else\n#error wrong\n#endif')
  expect(macro.errors).toEqual([])
})
