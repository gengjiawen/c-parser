import { parse } from '../src/index'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const fixturesDir = join(__dirname, '..', 'fixtures')
const fixtureFiles = readdirSync(fixturesDir).filter((f) => f.endsWith('.c'))

describe('fixtures', () => {
  for (const file of fixtureFiles) {
    describe(file, () => {
      const source = readFileSync(join(fixturesDir, file), 'utf8')

      it('parses without throwing', () => {
        expect(() => parse(source)).not.toThrow()
      })

      it('produces a TranslationUnit', () => {
        const ast = parse(source)
        expect(ast.type).toBe('TranslationUnit')
        expect(ast.decls).toBeInstanceOf(Array)
        expect(ast.decls.length).toBeGreaterThan(0)
      })

      it('all declarations have a valid type', () => {
        const ast = parse(source)
        for (const decl of ast.decls) {
          expect(['Declaration', 'FunctionDefinition', 'TopLevelAsm']).toContain(decl.type)
        }
      })

      it('has correct source range', () => {
        const ast = parse(source)
        expect(ast.start).toBe(0)
        expect(ast.end).toBe(source.length)
      })
    })
  }
})
