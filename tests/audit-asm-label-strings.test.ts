import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('concatenates all strings in declaration asm labels', () => {
  for (const prefix of ['', 'void outer(void){']) {
    const ast = parse(
      prefix +
        'extern int f(void) __asm__("" "foo"), g(void) __asm__("b" "ar");' +
        (prefix ? '}' : ''),
    )
    expect(ast.errors).toEqual([])
    const d = ast.decls[0]
    const decl = d.type === 'FunctionDefinition' ? d.body.items[0] : d
    expect(decl).toMatchObject({
      declarators: [{ attrs: { asmRegister: 'foo' } }, { attrs: { asmRegister: 'bar' } }],
    })
  }
})
