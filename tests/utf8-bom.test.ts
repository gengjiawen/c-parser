import { expect, it } from 'vitest'
import { parse, Scanner } from '../src/index'
it('ignores a leading BOM without shifting original token offsets', () => {
  const source = '\ufeffint x;'
  const ast = parse(source)
  expect(ast.errors).toEqual([])
  expect(ast.decls).toHaveLength(1)
  expect(ast.decls[0].start).toBe(1)
  const token = new Scanner(source, true).scan()[0]
  expect(source.slice(token.start, token.end)).toBe('int')
})
it('recognizes directives after a leading BOM', () => {
  const ast = parse('\ufeff#define X 1\nint x=X;')
  expect(ast.errors).toEqual([])
  expect(ast.directives).toHaveLength(1)
})
