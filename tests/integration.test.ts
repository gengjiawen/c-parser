import { parse } from '../src/index'

describe('integration', () => {
  describe('complete function with body', () => {
    it('parses a simple function definition', () => {
      const ast = parse(`
        int add(int a, int b) {
          return a + b;
        }
      `)
      expect(ast.decls).toHaveLength(1)
      const fn = ast.decls[0]
      expect(fn.type).toBe('FunctionDefinition')
      if (fn.type === 'FunctionDefinition') {
        expect(fn.name).toBe('add')
        expect(fn.returnType.type).toBe('IntType')
        expect(fn.params).toHaveLength(2)
        expect(fn.params[0].name).toBe('a')
        expect(fn.params[1].name).toBe('b')
        expect(fn.body.type).toBe('CompoundStatement')
        expect(fn.body.items).toHaveLength(1)
        expect(fn.body.items[0].type).toBe('ReturnStatement')
      }
    })

    it('parses function with local variables', () => {
      const ast = parse(`
        int square(int x) {
          int result;
          result = x * x;
          return result;
        }
      `)
      const fn = ast.decls[0]
      if (fn.type === 'FunctionDefinition') {
        expect(fn.body.items.length).toBeGreaterThanOrEqual(3)
      }
    })

    it('parses void function with no params', () => {
      const ast = parse('void noop(void) {}')
      const fn = ast.decls[0]
      expect(fn.type).toBe('FunctionDefinition')
      if (fn.type === 'FunctionDefinition') {
        expect(fn.name).toBe('noop')
        expect(fn.returnType.type).toBe('VoidType')
        expect(fn.params).toHaveLength(0)
      }
    })
  })

  describe('multiple functions', () => {
    it('parses multiple function definitions', () => {
      const ast = parse(`
        int foo(void) { return 1; }
        int bar(void) { return 2; }
        int baz(void) { return 3; }
      `)
      expect(ast.decls).toHaveLength(3)
      expect(ast.decls[0].type).toBe('FunctionDefinition')
      expect(ast.decls[1].type).toBe('FunctionDefinition')
      expect(ast.decls[2].type).toBe('FunctionDefinition')
      if (ast.decls[0].type === 'FunctionDefinition') {
        expect(ast.decls[0].name).toBe('foo')
      }
      if (ast.decls[1].type === 'FunctionDefinition') {
        expect(ast.decls[1].name).toBe('bar')
      }
      if (ast.decls[2].type === 'FunctionDefinition') {
        expect(ast.decls[2].name).toBe('baz')
      }
    })

    it('parses mix of declarations and functions', () => {
      const ast = parse(`
        int global_var;
        void helper(void) { return; }
        int main(void) { return 0; }
      `)
      expect(ast.decls).toHaveLength(3)
      expect(ast.decls[0].type).toBe('Declaration')
      expect(ast.decls[1].type).toBe('FunctionDefinition')
      expect(ast.decls[2].type).toBe('FunctionDefinition')
    })
  })

  describe('struct with typedef', () => {
    it('parses typedef struct', () => {
      const ast = parse(`
        typedef struct {
          int x;
          int y;
        } Point;
      `)
      const decl = ast.decls[0]
      expect(decl.type).toBe('Declaration')
      if (decl.type === 'Declaration') {
        expect(decl.isTypedef).toBe(true)
        expect(decl.typeSpec.type).toBe('StructType')
        expect(decl.declarators[0].name).toBe('Point')
      }
    })

    it('parses typedef struct and uses it', () => {
      const ast = parse(`
        typedef struct { int x; int y; } Point;
        Point p;
      `)
      expect(ast.decls).toHaveLength(2)
      const usage = ast.decls[1]
      if (usage.type === 'Declaration') {
        expect(usage.typeSpec.type).toBe('TypedefNameType')
        if (usage.typeSpec.type === 'TypedefNameType') {
          expect(usage.typeSpec.name).toBe('Point')
        }
      }
    })

    it('parses named typedef struct', () => {
      const ast = parse(`
        typedef struct node {
          int value;
          struct node *next;
        } Node;
      `)
      const decl = ast.decls[0]
      if (decl.type === 'Declaration') {
        expect(decl.isTypedef).toBe(true)
        if (decl.typeSpec.type === 'StructType') {
          expect(decl.typeSpec.name).toBe('node')
          expect(decl.typeSpec.fields).toHaveLength(2)
        }
      }
    })
  })

  describe('function pointers', () => {
    it('parses function pointer declaration', () => {
      const ast = parse('void (*fp)(int);')
      const decl = ast.decls[0]
      expect(decl.type).toBe('Declaration')
      if (decl.type === 'Declaration') {
        expect(decl.declarators[0].name).toBe('fp')
        const derived = decl.declarators[0].derived
        const hasFptr = derived.some((d) => d.kind === 'FunctionPointer')
        expect(hasFptr).toBe(true)
      }
    })

    it('parses function pointer with multiple params', () => {
      const ast = parse('int (*callback)(int, int);')
      const decl = ast.decls[0]
      if (decl.type === 'Declaration') {
        const derived = decl.declarators[0].derived
        const fptr = derived.find((d) => d.kind === 'FunctionPointer')
        expect(fptr).toBeDefined()
        if (fptr && fptr.kind === 'FunctionPointer') {
          expect(fptr.params).toHaveLength(2)
        }
      }
    })

    it('parses typedef function pointer', () => {
      const ast = parse('typedef void (*handler_t)(int);')
      const decl = ast.decls[0]
      if (decl.type === 'Declaration') {
        expect(decl.isTypedef).toBe(true)
        expect(decl.declarators[0].name).toBe('handler_t')
      }
    })
  })

  describe('complex declarations', () => {
    it('parses array of pointers', () => {
      const ast = parse('int *arr[5];')
      const decl = ast.decls[0]
      if (decl.type === 'Declaration') {
        expect(decl.declarators[0].name).toBe('arr')
        const derived = decl.declarators[0].derived
        expect(derived.some((d) => d.kind === 'Pointer')).toBe(true)
        expect(derived.some((d) => d.kind === 'Array')).toBe(true)
      }
    })

    it('parses struct with bitfields', () => {
      const ast = parse(`
        struct flags {
          unsigned int a : 1;
          unsigned int b : 3;
          unsigned int c : 4;
        };
      `)
      const decl = ast.decls[0]
      if (decl.type === 'Declaration' && decl.typeSpec.type === 'StructType') {
        const fields = decl.typeSpec.fields!
        expect(fields).toHaveLength(3)
        expect(fields[0].bitWidth).not.toBeNull()
        expect(fields[1].bitWidth).not.toBeNull()
        expect(fields[2].bitWidth).not.toBeNull()
      }
    })

    it('parses nested struct', () => {
      const ast = parse(`
        struct outer {
          struct inner {
            int val;
          } nested;
          int other;
        };
      `)
      const decl = ast.decls[0]
      if (decl.type === 'Declaration' && decl.typeSpec.type === 'StructType') {
        expect(decl.typeSpec.fields).toHaveLength(2)
      }
    })

    it('parses static function', () => {
      const ast = parse('static int helper(void) { return 0; }')
      const fn = ast.decls[0]
      if (fn.type === 'FunctionDefinition') {
        expect(fn.attrs.isStatic).toBe(true)
        expect(fn.name).toBe('helper')
      }
    })

    it('parses inline function', () => {
      const ast = parse('inline int fast(int x) { return x * 2; }')
      const fn = ast.decls[0]
      if (fn.type === 'FunctionDefinition') {
        expect(fn.attrs.isInline).toBe(true)
      }
    })
  })

  describe('GCC extensions', () => {
    it('parses __attribute__((unused))', () => {
      const ast = parse('int x __attribute__((unused));')
      expect(ast.decls[0].type).toBe('Declaration')
    })

    it('parses typeof expression', () => {
      const ast = parse('typeof(42) x;')
      const decl = ast.decls[0]
      if (decl.type === 'Declaration') {
        expect(decl.typeSpec.type).toBe('TypeofExprType')
      }
    })

    it('parses typeof type', () => {
      const ast = parse('typeof(int) x;')
      const decl = ast.decls[0]
      if (decl.type === 'Declaration') {
        expect(decl.typeSpec.type).toBe('TypeofTypeType')
        if (decl.typeSpec.type === 'TypeofTypeType') {
          expect(decl.typeSpec.typeSpec.type).toBe('IntType')
        }
      }
    })

    it('parses statement expression', () => {
      const ast = parse(`
        void f(void) {
          int x = ({ int tmp = 1; tmp + 2; });
        }
      `)
      const fn = ast.decls[0]
      expect(fn.type).toBe('FunctionDefinition')
    })

    it('parses __attribute__((aligned))', () => {
      // The parser accepts aligned attributes in various positions
      const ast = parse('int x __attribute__((aligned(16)));')
      const decl = ast.decls[0]
      expect(decl.type).toBe('Declaration')
      if (decl.type === 'Declaration') {
        expect(decl.declarators[0].name).toBe('x')
        expect(decl.typeSpec.type).toBe('IntType')
      }
    })

    it('parses __extension__ keyword', () => {
      const ast = parse('__extension__ typedef unsigned long long uint64;')
      expect(ast.decls[0].type).toBe('Declaration')
    })

    it('parses variadic function definition', () => {
      const ast = parse(`
        int myprintf(const char *fmt, ...) {
          return 0;
        }
      `)
      const fn = ast.decls[0]
      if (fn.type === 'FunctionDefinition') {
        expect(fn.variadic).toBe(true)
      }
    })
  })

  describe('realistic programs', () => {
    it('parses a linked list node definition and function', () => {
      const ast = parse(`
        struct node {
          int data;
          struct node *next;
        };

        struct node *create_node(int val) {
          return 0;
        }
      `)
      expect(ast.decls).toHaveLength(2)
      expect(ast.decls[0].type).toBe('Declaration')
      expect(ast.decls[1].type).toBe('FunctionDefinition')
    })

    it('parses a function with control flow', () => {
      const ast = parse(`
        int fibonacci(int n) {
          if (n <= 1) return n;
          int a = 0, b = 1;
          for (int i = 2; i <= n; i++) {
            int temp = a + b;
            a = b;
            b = temp;
          }
          return b;
        }
      `)
      const fn = ast.decls[0]
      expect(fn.type).toBe('FunctionDefinition')
      if (fn.type === 'FunctionDefinition') {
        expect(fn.name).toBe('fibonacci')
        expect(fn.body.items.length).toBeGreaterThanOrEqual(3)
      }
    })

    it('parses enum used in switch', () => {
      const ast = parse(`
        enum direction { UP, DOWN, LEFT, RIGHT };
        int handle(enum direction d) {
          switch (d) {
            case 0: return 1;
            case 1: return -1;
            default: return 0;
          }
        }
      `)
      expect(ast.decls).toHaveLength(2)
    })
  })
})
