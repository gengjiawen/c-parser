import { parse } from '../src/index'
import type { AST } from '../src/index'

/** Helper: parse source and return the first declaration */
function parseDecl(source: string): AST.Declaration {
  const ast = parse(source)
  const decl = ast.decls[0]
  if (decl.type !== 'Declaration') throw new Error(`expected Declaration, got ${decl.type}`)
  return decl
}

describe('declarations', () => {
  describe('simple variable declarations', () => {
    it('parses int x;', () => {
      const decl = parseDecl('int x;')
      expect(decl.type).toBe('Declaration')
      expect(decl.typeSpec.type).toBe('IntType')
      expect(decl.declarators).toHaveLength(1)
      expect(decl.declarators[0].name).toBe('x')
      expect(decl.declarators[0].init).toBeNull()
    })

    it('parses char c;', () => {
      const decl = parseDecl('char c;')
      expect(decl.typeSpec.type).toBe('CharType')
      expect(decl.declarators[0].name).toBe('c')
    })

    it('parses void type declaration', () => {
      const decl = parseDecl('void *p;')
      expect(decl.typeSpec.type).toBe('VoidType')
    })

    it('parses float f;', () => {
      const decl = parseDecl('float f;')
      expect(decl.typeSpec.type).toBe('FloatType')
    })

    it('parses double d;', () => {
      const decl = parseDecl('double d;')
      expect(decl.typeSpec.type).toBe('DoubleType')
    })

    it('parses long int x;', () => {
      const decl = parseDecl('long int x;')
      expect(decl.typeSpec.type).toBe('LongType')
    })

    it('parses unsigned int x;', () => {
      const decl = parseDecl('unsigned int x;')
      expect(decl.typeSpec.type).toBe('UnsignedIntType')
    })

    it('parses long long x;', () => {
      const decl = parseDecl('long long x;')
      expect(decl.typeSpec.type).toBe('LongLongType')
    })

    it('parses unsigned long long x;', () => {
      const decl = parseDecl('unsigned long long x;')
      expect(decl.typeSpec.type).toBe('UnsignedLongLongType')
    })

    it('parses short x;', () => {
      const decl = parseDecl('short x;')
      expect(decl.typeSpec.type).toBe('ShortType')
    })

    it('parses signed char x;', () => {
      const decl = parseDecl('signed char x;')
      expect(decl.typeSpec.type).toBe('CharType')
    })

    it('parses unsigned char x;', () => {
      const decl = parseDecl('unsigned char x;')
      expect(decl.typeSpec.type).toBe('UnsignedCharType')
    })
  })

  describe('with initializer', () => {
    it('parses int x = 42;', () => {
      const decl = parseDecl('int x = 42;')
      expect(decl.declarators[0].name).toBe('x')
      const init = decl.declarators[0].init
      expect(init).not.toBeNull()
      expect(init!.kind).toBe('Expr')
      if (init!.kind === 'Expr') {
        expect(init!.expr.type).toBe('IntLiteral')
      }
    })

    it('parses with expression initializer', () => {
      const decl = parseDecl('int x = 1 + 2;')
      const init = decl.declarators[0].init
      expect(init!.kind).toBe('Expr')
      if (init!.kind === 'Expr') {
        expect(init!.expr.type).toBe('BinaryExpression')
      }
    })

    it('parses braced initializer list', () => {
      const decl = parseDecl('int arr[] = {1, 2, 3};')
      const init = decl.declarators[0].init
      expect(init).not.toBeNull()
      expect(init!.kind).toBe('List')
      if (init!.kind === 'List') {
        expect(init!.items).toHaveLength(3)
      }
    })
  })

  describe('multiple declarators', () => {
    it('parses int x, y, z;', () => {
      const decl = parseDecl('int x, y, z;')
      expect(decl.declarators).toHaveLength(3)
      expect(decl.declarators[0].name).toBe('x')
      expect(decl.declarators[1].name).toBe('y')
      expect(decl.declarators[2].name).toBe('z')
    })

    it('parses mixed declarators with initializers', () => {
      const decl = parseDecl('int x = 1, y, z = 3;')
      expect(decl.declarators).toHaveLength(3)
      expect(decl.declarators[0].init).not.toBeNull()
      expect(decl.declarators[1].init).toBeNull()
      expect(decl.declarators[2].init).not.toBeNull()
    })
  })

  describe('pointer declarations', () => {
    it('parses int *p;', () => {
      const decl = parseDecl('int *p;')
      expect(decl.declarators[0].name).toBe('p')
      expect(decl.declarators[0].derived).toHaveLength(1)
      expect(decl.declarators[0].derived[0].kind).toBe('Pointer')
    })

    it('parses int **pp;', () => {
      const decl = parseDecl('int **pp;')
      expect(decl.declarators[0].derived).toHaveLength(2)
      expect(decl.declarators[0].derived[0].kind).toBe('Pointer')
      expect(decl.declarators[0].derived[1].kind).toBe('Pointer')
    })
  })

  describe('array declarations', () => {
    it('parses int arr[10];', () => {
      const decl = parseDecl('int arr[10];')
      expect(decl.declarators[0].name).toBe('arr')
      const derived = decl.declarators[0].derived
      expect(derived).toHaveLength(1)
      expect(derived[0].kind).toBe('Array')
      if (derived[0].kind === 'Array') {
        expect(derived[0].size).not.toBeNull()
      }
    })

    it('parses int arr[];', () => {
      const decl = parseDecl('int arr[];')
      const derived = decl.declarators[0].derived
      expect(derived[0].kind).toBe('Array')
      if (derived[0].kind === 'Array') {
        expect(derived[0].size).toBeNull()
      }
    })
  })

  describe('typedef', () => {
    it('parses typedef unsigned long size_t;', () => {
      const decl = parseDecl('typedef unsigned long mysize;')
      expect(decl.isTypedef).toBe(true)
      expect(decl.typeSpec.type).toBe('UnsignedLongType')
      expect(decl.declarators[0].name).toBe('mysize')
    })

    it('parses typedef with pointer', () => {
      const decl = parseDecl('typedef int *intptr;')
      expect(decl.isTypedef).toBe(true)
      expect(decl.declarators[0].name).toBe('intptr')
    })
  })

  describe('storage class specifiers', () => {
    it('parses static int x;', () => {
      const decl = parseDecl('static int x;')
      expect(decl.isStatic).toBe(true)
      expect(decl.isExtern).toBe(false)
    })

    it('parses extern int y;', () => {
      const decl = parseDecl('extern int y;')
      expect(decl.isExtern).toBe(true)
      expect(decl.isStatic).toBe(false)
    })

    it('parses const int x;', () => {
      const decl = parseDecl('const int x;')
      expect(decl.isConst).toBe(true)
    })

    it('parses volatile int x;', () => {
      const decl = parseDecl('volatile int x;')
      expect(decl.isVolatile).toBe(true)
    })
  })

  describe('struct definitions', () => {
    it('parses struct definition', () => {
      const decl = parseDecl('struct point { int x; int y; };')
      expect(decl.typeSpec.type).toBe('StructType')
      if (decl.typeSpec.type === 'StructType') {
        expect(decl.typeSpec.name).toBe('point')
        expect(decl.typeSpec.fields).not.toBeNull()
        expect(decl.typeSpec.fields!).toHaveLength(2)
        expect(decl.typeSpec.fields![0].name).toBe('x')
        expect(decl.typeSpec.fields![1].name).toBe('y')
      }
    })

    it('parses struct reference (no body)', () => {
      const decl = parseDecl('struct point p;')
      expect(decl.typeSpec.type).toBe('StructType')
      if (decl.typeSpec.type === 'StructType') {
        expect(decl.typeSpec.name).toBe('point')
        expect(decl.typeSpec.fields).toBeNull()
      }
    })

    it('parses anonymous struct', () => {
      const decl = parseDecl('struct { int a; int b; } s;')
      expect(decl.typeSpec.type).toBe('StructType')
      if (decl.typeSpec.type === 'StructType') {
        expect(decl.typeSpec.name).toBeNull()
        expect(decl.typeSpec.fields).toHaveLength(2)
      }
    })
  })

  describe('union definitions', () => {
    it('parses union definition', () => {
      const decl = parseDecl('union data { int i; float f; };')
      expect(decl.typeSpec.type).toBe('UnionType')
      if (decl.typeSpec.type === 'UnionType') {
        expect(decl.typeSpec.name).toBe('data')
        expect(decl.typeSpec.fields).toHaveLength(2)
      }
    })
  })

  describe('enum definitions', () => {
    it('parses enum definition', () => {
      const decl = parseDecl('enum color { RED, GREEN, BLUE };')
      expect(decl.typeSpec.type).toBe('EnumType')
      if (decl.typeSpec.type === 'EnumType') {
        expect(decl.typeSpec.name).toBe('color')
        expect(decl.typeSpec.variants).not.toBeNull()
        expect(decl.typeSpec.variants!).toHaveLength(3)
        expect(decl.typeSpec.variants![0].name).toBe('RED')
        expect(decl.typeSpec.variants![1].name).toBe('GREEN')
        expect(decl.typeSpec.variants![2].name).toBe('BLUE')
      }
    })

    it('parses enum with explicit values', () => {
      const decl = parseDecl('enum { A = 0, B = 5, C = 10 };')
      if (decl.typeSpec.type === 'EnumType') {
        expect(decl.typeSpec.variants!).toHaveLength(3)
        expect(decl.typeSpec.variants![0].value).not.toBeNull()
        expect(decl.typeSpec.variants![1].value).not.toBeNull()
      }
    })

    it('parses enum reference', () => {
      const decl = parseDecl('enum color c;')
      if (decl.typeSpec.type === 'EnumType') {
        expect(decl.typeSpec.name).toBe('color')
        expect(decl.typeSpec.variants).toBeNull()
      }
    })
  })

  describe('function declarations', () => {
    it('parses function declaration', () => {
      const decl = parseDecl('int foo(int a, int b);')
      expect(decl.declarators[0].name).toBe('foo')
      const derived = decl.declarators[0].derived
      const funcDecl = derived.find((d) => d.kind === 'Function')
      expect(funcDecl).toBeDefined()
      if (funcDecl && funcDecl.kind === 'Function') {
        expect(funcDecl.params).toHaveLength(2)
      }
    })

    it('parses void function declaration', () => {
      const decl = parseDecl('void bar(void);')
      expect(decl.typeSpec.type).toBe('VoidType')
      expect(decl.declarators[0].name).toBe('bar')
    })

    it('parses variadic function declaration', () => {
      const decl = parseDecl('int printf(const char *fmt, ...);')
      const derived = decl.declarators[0].derived
      const funcDecl = derived.find((d) => d.kind === 'Function')
      if (funcDecl && funcDecl.kind === 'Function') {
        expect(funcDecl.variadic).toBe(true)
      }
    })
  })

  describe('translation unit', () => {
    it('returns TranslationUnit with decls array', () => {
      const ast = parse('int x; int y;')
      expect(ast.type).toBe('TranslationUnit')
      expect(ast.decls).toHaveLength(2)
    })

    it('handles empty source', () => {
      const ast = parse('')
      expect(ast.type).toBe('TranslationUnit')
      expect(ast.decls).toHaveLength(0)
    })
  })
})
