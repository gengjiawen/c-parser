import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('promotes UTF-16 character literals while keeping UTF-32 unsigned', () => {
  expect(
    parse('_Static_assert(u\'a\'-100<0,"utf16"); _Static_assert(U\'a\'-100>0,"utf32");').errors,
  ).toEqual([])
})
