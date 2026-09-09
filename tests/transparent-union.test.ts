import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('retains transparent_union on bare global and local definitions', () => {
  for (const declaration of [
    'union __attribute__((transparent_union)) U {int x;float y;};',
    'union U {int x;float y;} __attribute__((transparent_union));',
  ]) {
    const global = parse(declaration + 'int after;')
    expect(global.errors).toEqual([])
    expect(global.decls).toMatchObject([
      { isTransparentUnion: true },
      { isTransparentUnion: false },
    ])
    const local = parse(`void f(void){${declaration}int after;}`)
    expect(local.errors).toEqual([])
    expect(local.decls[0]).toMatchObject({
      body: { items: [{ isTransparentUnion: true }, { isTransparentUnion: false }] },
    })
  }
})
