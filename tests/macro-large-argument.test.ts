import { describe, expect, it } from 'vitest'
import { parse } from '../src/index'

describe('large macro arguments', () => {
  it('substitutes arguments without using them as JavaScript call arguments', () => {
    const count = 70000
    const source = `#define ID(x) x\nint a[] = { ID(${Array(count).fill('1').join(',')}) };`
    // Variadic arguments exercise a single substitution with over 128k tokens.
    const ast = parse(source.replace('ID(x) x', 'ID(...) __VA_ARGS__'))
    expect(ast.errors).toEqual([])
    const decl = ast.decls[0]
    expect(decl.type).toBe('Declaration')
    if (decl.type !== 'Declaration') return
    const init = decl.declarators[0].init
    expect(init?.kind).toBe('List')
    if (init?.kind === 'List') expect(init.items).toHaveLength(count)
  })
})
