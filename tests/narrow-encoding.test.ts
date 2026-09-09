import { expect, it } from 'vitest'
import { parse, Scanner } from '../src/index'
it('uses identical execution bytes for raw Unicode, universal escapes and byte escapes', () => {
  for (const spellings of [
    ['"é"', '"\\u00e9"', '"\\xc3\\xa9"'],
    ['"中"', '"\\u4e2d"', '"\\xe4\\xb8\\xad"'],
    ['"😀"', '"\\U0001f600"', '"\\xf0\\x9f\\x98\\x80"'],
  ]) {
    const values = spellings.map((source) => new Scanner(source).scan()[0].value)
    expect(new Set(values).size).toBe(1)
  }
  expect(new Scanner('"\\xe9"').scan()[0].value).toBe('\xe9')
  expect(new Scanner("'é'").scan()[0].value).toBe(0xc3a9)
  expect(new Scanner("'😀'").scan()[0].value).toBe(0xf09f9880 | 0)
})
it('encodes stringified non-ASCII macro tokens with the same string contract', () => {
  const ast = parse('#define S(x) #x\nchar *p=S(é);')
  expect(ast.errors).toEqual([])
  expect(ast.decls[0]).toMatchObject({ declarators: [{ init: { expr: { value: '\xc3\xa9' } } }] })
})
