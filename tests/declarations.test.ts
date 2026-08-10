import { parse } from '../src/index'
import type { AST } from '../src/index'

/** Helper: parse source and return the first declaration */
function parseDecl(source: string): AST.Declaration {
  const ast = parse(source)
  const decl = ast.decls[0]
  if (decl.type !== 'Declaration') throw new Error(`expected Declaration, got ${decl.type}`)
  return decl
}

/** Helper: parse a declaration in block scope and return it */
function parseLocalDecl(source: string): AST.Declaration {
  const ast = parse(`void f(void) { ${source} }`)
  const fn = ast.decls[0]
  if (fn.type !== 'FunctionDefinition')
    throw new Error(`expected FunctionDefinition, got ${fn.type}`)
  const item = fn.body.items[0]
  if (item.type !== 'Declaration') throw new Error(`expected Declaration, got ${item.type}`)
  return item
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

    it('expands a GCC range designator', () => {
      const decl = parseDecl('int arr[4] = { [0 ... 3] = -1 };')
      const init = decl.declarators[0].init
      expect(init!.kind).toBe('List')
      if (init!.kind === 'List') {
        expect(init!.items).toHaveLength(4)
        expect(init!.items.map((i) => i.designators[0].kind)).toEqual([
          'Index',
          'Index',
          'Index',
          'Index',
        ])
      }
    })

    // Expanding [lo ... hi] into one item per index used to be unbounded, so a
    // single line of C could allocate millions of nodes.
    it('leaves an oversized range designator unexpanded', () => {
      const decl = parseDecl('int arr[1] = { [0 ... 100000000] = 1 };')
      const init = decl.declarators[0].init
      expect(init!.kind).toBe('List')
      if (init!.kind === 'List') {
        expect(init!.items).toHaveLength(1)
        expect(init!.items[0].designators[0].kind).toBe('Range')
      }
    })

    it('leaves an inverted range designator unexpanded', () => {
      const decl = parseDecl('int arr[10] = { [5 ... 2] = 1 };')
      const init = decl.declarators[0].init
      expect(init!.kind).toBe('List')
      if (init!.kind === 'List') {
        expect(init!.items).toHaveLength(1)
        expect(init!.items[0].designators[0].kind).toBe('Range')
      }
    })

    it('leaves unsafe integer bounds unexpanded', () => {
      const decl = parseDecl('int arr[1] = { [9007199254740992LL ... 9007199254740992LL] = 1 };')
      const init = decl.declarators[0].init
      expect(init!.kind).toBe('List')
      if (init!.kind === 'List') {
        expect(init!.items).toHaveLength(1)
        expect(init!.items[0].designators[0].kind).toBe('Range')
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

  // A type-name parsed inside an initializer (cast, sizeof, _Alignof, _Generic,
  // compound literal, ...) used to set the parser's qualifier flags without
  // restoring them, so the enclosing declaration inherited qualifiers that
  // belonged only to the inner type-name.
  describe('type qualifiers are not inherited from initializers', () => {
    it('does not inherit volatile from a cast', () => {
      const decl = parseDecl('int v = *(volatile int *)0;')
      expect(decl.isVolatile).toBe(false)
      expect(decl.isConst).toBe(false)
    })

    it('does not inherit const from _Alignof', () => {
      const decl = parseDecl('int a = _Alignof(const long);')
      expect(decl.isConst).toBe(false)
      expect(decl.isVolatile).toBe(false)
    })

    it('does not inherit volatile from __alignof__', () => {
      const decl = parseDecl('int b = __alignof__(volatile long);')
      expect(decl.isVolatile).toBe(false)
    })

    it('does not inherit volatile from sizeof', () => {
      const decl = parseDecl('int s = sizeof(volatile int);')
      expect(decl.isVolatile).toBe(false)
    })

    it('does not inherit qualifiers from a _Generic association', () => {
      const decl = parseDecl('int g = _Generic(1, const int: 1, volatile int: 2, default: 3);')
      expect(decl.isConst).toBe(false)
      expect(decl.isVolatile).toBe(false)
    })

    it('does not inherit qualifiers from a compound literal', () => {
      const decl = parseDecl('int cl = (volatile int){0};')
      expect(decl.isVolatile).toBe(false)
      expect(parseDecl('int cl = (const int){0};').isConst).toBe(false)
    })

    it('does not inherit qualifiers from nested type-names', () => {
      const decl = parseDecl('int w = sizeof(volatile int) + (const int){0};')
      expect(decl.isConst).toBe(false)
      expect(decl.isVolatile).toBe(false)
    })

    it('does not inherit qualifiers from __builtin_types_compatible_p', () => {
      const decl = parseDecl('int t = __builtin_types_compatible_p(const int, volatile int);')
      expect(decl.isConst).toBe(false)
      expect(decl.isVolatile).toBe(false)
    })

    it('does not inherit qualifiers from _Atomic or typeof operands', () => {
      expect(parseDecl('int at = sizeof(_Atomic(volatile int));').isVolatile).toBe(false)
      expect(parseDecl('int tq = sizeof(typeof(const int));').isConst).toBe(false)
    })

    it('does not inherit qualifiers from struct fields', () => {
      const decl = parseDecl('struct S { volatile int x; const int y; } s;')
      expect(decl.isVolatile).toBe(false)
      expect(decl.isConst).toBe(false)
    })

    it('does not inherit qualifiers in block scope', () => {
      expect(parseLocalDecl('int v = *(volatile int *)0;').isVolatile).toBe(false)
      expect(parseLocalDecl('int a = _Alignof(const long);').isConst).toBe(false)
      const nested = parseLocalDecl('int w = sizeof(volatile int) + (const int){0};')
      expect(nested.isConst).toBe(false)
      expect(nested.isVolatile).toBe(false)
    })

    it('still records genuine qualifiers written before the type', () => {
      expect(parseDecl('const int c = 1;').isConst).toBe(true)
      expect(parseDecl('volatile int v2;').isVolatile).toBe(true)
      const z = parseDecl('static const volatile unsigned long z = 0;')
      expect(z.isStatic).toBe(true)
      expect(z.isConst).toBe(true)
      expect(z.isVolatile).toBe(true)
    })

    it('still records genuine qualifiers written after the type', () => {
      expect(parseDecl('int const c2 = 1;').isConst).toBe(true)
      expect(parseDecl('int volatile v3;').isVolatile).toBe(true)
    })

    it('still records genuine qualifiers alongside an inner type-name', () => {
      const ci = parseDecl('const int ci = sizeof(volatile int);')
      expect(ci.isConst).toBe(true)
      expect(ci.isVolatile).toBe(false)
      const vi = parseDecl('volatile int vi = _Alignof(const int);')
      expect(vi.isVolatile).toBe(true)
      expect(vi.isConst).toBe(false)
    })

    it('still records genuine qualifiers in block scope', () => {
      expect(parseLocalDecl('const int c = 1;').isConst).toBe(true)
      expect(parseLocalDecl('int const c2 = 1;').isConst).toBe(true)
      expect(parseLocalDecl('volatile int v2;').isVolatile).toBe(true)
      const z = parseLocalDecl('static const volatile unsigned long z = 0;')
      expect(z.isStatic).toBe(true)
      expect(z.isConst).toBe(true)
      expect(z.isVolatile).toBe(true)
    })

    it('still records const on function parameters and _Generic associations', () => {
      const ast = parse('void fn(const char *a, int b);')
      const fnDecl = ast.decls[0]
      if (fnDecl.type !== 'Declaration') throw new Error('expected Declaration')
      const fnDerived = fnDecl.declarators[0].derived.find((d) => d.kind === 'Function')
      expect(fnDerived?.kind).toBe('Function')
      if (fnDerived?.kind === 'Function') {
        expect(fnDerived.params.map((p) => p.isConst)).toEqual([true, false])
      }

      const gen = parseDecl('int g = _Generic(1, const int: 1, volatile int: 2, default: 3);')
      const init = gen.declarators[0].init
      expect(init?.kind).toBe('Expr')
      if (init?.kind === 'Expr' && init.expr.type === 'GenericSelectionExpression') {
        expect(init.expr.associations.map((a) => a.isConst)).toEqual([true, false, false])
      }
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
