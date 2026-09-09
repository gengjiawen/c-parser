import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('diagnoses malformed active C numeric and character constants', () => {
  for (const literal of [
    '1uu',
    '1lL',
    '08',
    '0b',
    '0x',
    '1e',
    '0x1p',
    "''",
    String.raw`'\x'`,
    String.raw`'\u123'`,
    String.raw`'\uD800'`,
    String.raw`"\U00110000"`,
  ]) {
    expect(
      parse(`int x=${literal};`).errors.some((e) => e.severity === 'error'),
      literal,
    ).toBe(true)
  }
})
it('does not validate discarded or stringified preprocessing numbers as C constants', () => {
  expect(
    parse(
      '#define BAD 1uu\n#define IGNORE(x) 1\n#define STR(x) #x\nint a=IGNORE(0x); char *s=STR(1e);\n#if 0\nint b=08;\n#endif',
    ).errors,
  ).toEqual([])
  expect(
    parse('#define BAD 1uu\nint x=BAD;').errors.some(
      (e) => e.message === 'invalid numeric constant',
    ),
  ).toBe(true)
})
it('retains valid integer, float, character and escape spelling forms', () => {
  for (const literal of [
    '0',
    '077',
    '0xffUL',
    '123LLU',
    '0b101',
    '1.0f',
    '1e+3L',
    '0x1.8p-2',
    "'a'",
    "L'a'",
    String.raw`'\x41'`,
    String.raw`'\u00e9'`,
    String.raw`"\\uD800"`,
  ])
    expect(parse(`int x=${literal};`).errors, literal).toEqual([])
})
