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

    // __attribute__ directly after a type specifier that parseTypeSpecifier
    // returns early from used to hang consumePostTypeQualifiers forever.
    it('parses __attribute__ after __int128', () => {
      const decl = parse('__int128 __attribute__((aligned(16))) x;').decls[0]
      expect(decl.type).toBe('Declaration')
      if (decl.type === 'Declaration') {
        expect(decl.typeSpec.type).toBe('Int128Type')
        expect(decl.declarators[0].name).toBe('x')
      }
    })

    it('parses __attribute__ after __uint128_t', () => {
      const decl = parse('__uint128_t __attribute__((aligned(16))) x;').decls[0]
      expect(decl.type).toBe('Declaration')
      if (decl.type === 'Declaration') {
        expect(decl.declarators[0].name).toBe('x')
      }
    })

    it('parses __attribute__ after _Atomic(T)', () => {
      const decl = parse('_Atomic(int) __attribute__((aligned(4))) x;').decls[0]
      expect(decl.type).toBe('Declaration')
      if (decl.type === 'Declaration') {
        expect(decl.declarators[0].name).toBe('x')
      }
    })

    it('parses __attribute__ after __auto_type', () => {
      const fn = parse('void f(void) { __auto_type __attribute__((unused)) x = 1; }').decls[0]
      expect(fn.type).toBe('FunctionDefinition')
    })

    it('parses __extension__ after a type specifier', () => {
      const decl = parse('__int128 __extension__ x;').decls[0]
      expect(decl.type).toBe('Declaration')
      if (decl.type === 'Declaration') {
        expect(decl.declarators[0].name).toBe('x')
      }
    })

    it('tracks span for packed struct definition declaration', () => {
      const source =
        'int sentinel = 1;\n' +
        'struct __attribute__((packed)) packed_struct {\n' +
        '  char a;\n' +
        '  int b;\n' +
        '  short c;\n' +
        '};\n'
      const ast = parse(source)
      const decl = ast.decls.find(
        (d) =>
          d.type === 'Declaration' &&
          d.typeSpec.type === 'StructType' &&
          d.typeSpec.name === 'packed_struct',
      )
      expect(decl).toBeDefined()
      if (decl && decl.type === 'Declaration') {
        const expectedStart = source.indexOf('struct __attribute__((packed)) packed_struct')
        const expectedEnd = source.indexOf('};', expectedStart) + 2
        expect(decl.start).toBe(expectedStart)
        expect(decl.end).toBe(expectedEnd)
        expect(decl.typeSpec.type).toBe('StructType')
        if (decl.typeSpec.type === 'StructType') {
          expect(decl.typeSpec.isPacked).toBe(true)
        }
      }
    })

    it('tracks start/end on type specifiers', () => {
      const source = 'unsigned long value;'
      const ast = parse(source)
      const decl = ast.decls[0]
      expect(decl.type).toBe('Declaration')
      if (decl.type === 'Declaration') {
        expect(decl.typeSpec.type).toBe('UnsignedLongType')
        expect(source.slice(decl.typeSpec.start, decl.typeSpec.end)).toBe('unsigned long')
      }
    })

    it('tracks struct field start/end for function-pointer member', () => {
      const source = 'struct ops {\n  int (*open)(const char *path);\n};'
      const ast = parse(source)
      const decl = ast.decls[0]
      expect(decl.type).toBe('Declaration')
      if (decl.type === 'Declaration' && decl.typeSpec.type === 'StructType') {
        const field = decl.typeSpec.fields?.[0]
        expect(field).toBeDefined()
        if (field) {
          expect(field.type).toBe('StructFieldDeclaration')
          expect(field.name).toBe('open')
          const nameNode = field.nameNode
          expect(nameNode).toBeDefined()
          expect(nameNode?.type).toBe('Identifier')
          expect(nameNode?.name).toBe('open')
          if (nameNode) {
            expect(source.slice(nameNode.start, nameNode.end)).toBe('open')
          }
          expect(source.slice(field.start, field.end)).toBe('open')
          expect(field.typeSpec.type).toBe('IntType')
          expect(source.slice(field.typeSpec.start, field.typeSpec.end)).toBe('int')
          const fptr = field.derived.find((d) => d.kind === 'FunctionPointer')
          expect(fptr?.kind).toBe('FunctionPointer')
          if (fptr?.kind === 'FunctionPointer') {
            const param = fptr.params[0]
            expect(param.name).toBe('path')
            expect(param.nameNode?.type).toBe('Identifier')
            expect(param.nameNode?.name).toBe('path')
            if (param.nameNode) {
              expect(source.slice(param.nameNode.start, param.nameNode.end)).toBe('path')
            }
          }
        }
      }
    })

    it('tracks struct field end through bitfield width', () => {
      const source = 'struct bits { unsigned flag:3; };'
      const ast = parse(source)
      const decl = ast.decls[0]
      expect(decl.type).toBe('Declaration')
      if (decl.type === 'Declaration' && decl.typeSpec.type === 'StructType') {
        const field = decl.typeSpec.fields?.[0]
        expect(field).toBeDefined()
        if (field) {
          expect(field.name).toBe('flag')
          expect(source.slice(field.start, field.end)).toBe('flag:3')
        }
      }
    })

    it('parses __extension__ keyword', () => {
      const ast = parse('__extension__ typedef unsigned long long uint64;')
      expect(ast.decls[0].type).toBe('Declaration')
    })

    // The span used to be read after the whole directive was consumed, so it
    // pointed past the node instead of at it.
    it('tracks span for a top-level asm directive', () => {
      const source = '__asm__(".text");'
      const decl = parse(source).decls[0]
      expect(decl.type).toBe('TopLevelAsm')
      if (decl.type === 'TopLevelAsm') {
        expect(decl.asm).toBe('.text')
        expect(source.slice(decl.start, decl.end)).toBe('__asm__(".text");')
      }
    })

    it('tracks span for a volatile top-level asm directive between declarations', () => {
      const source = 'int a;\n__asm__ volatile (".byte 0x90");\nint b;'
      const decl = parse(source).decls[1]
      expect(decl.type).toBe('TopLevelAsm')
      if (decl.type === 'TopLevelAsm') {
        expect(source.slice(decl.start, decl.end)).toBe('__asm__ volatile (".byte 0x90");')
      }
    })

    it('tracks span for _Static_assert declaration', () => {
      const source = '_Static_assert(sizeof(int) == 4, "int must be 4 bytes");'
      const ast = parse(source)
      const decl = ast.decls[0]
      expect(decl.type).toBe('Declaration')
      if (decl.type === 'Declaration') {
        expect(decl.start).toBe(0)
        expect(decl.end).toBe(source.length)
      }
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

  describe('statement and expression spans', () => {
    /** Collect every AST node of the given type, in document order. */
    const collect = (root: unknown, type: string): { start: number; end: number }[] => {
      const found: { start: number; end: number }[] = []
      const visit = (node: unknown) => {
        if (node === null || typeof node !== 'object') return
        if (Array.isArray(node)) {
          node.forEach(visit)
          return
        }
        const rec = node as Record<string, unknown>
        if (rec.type === type && typeof rec.start === 'number' && typeof rec.end === 'number') {
          found.push({ start: rec.start, end: rec.end })
        }
        for (const key of Object.keys(rec)) {
          if (key === 'loc') continue
          visit(rec[key])
        }
      }
      visit(root)
      return found
    }

    /** The source text every node of `type` covers, in document order. */
    const slices = (source: string, type: string): string[] =>
      collect(parse(source), type).map((n) => source.slice(n.start, n.end))

    it('spans the whole function definition, block and return statement', () => {
      const source = 'int f(void) { return 1 + 2 * 3; }'
      expect(slices(source, 'FunctionDefinition')).toEqual([source])
      expect(slices(source, 'CompoundStatement')).toEqual(['{ return 1 + 2 * 3; }'])
      expect(slices(source, 'ReturnStatement')).toEqual(['return 1 + 2 * 3;'])
    })

    it('spans binary expressions from left operand to right operand', () => {
      const source = 'int f(void) { return 1 + 2 * 3; }'
      expect(slices(source, 'BinaryExpression')).toEqual(['1 + 2 * 3', '2 * 3'])
    })

    it('accounts for discarded grouping parentheses in enclosing spans', () => {
      const binary = 'int f(void) { return (1 + 2) * (3 + 4); }'
      expect(slices(binary, 'BinaryExpression')).toEqual(['(1 + 2) * (3 + 4)', '1 + 2', '3 + 4'])

      const sizeof = 'int f(void) { return sizeof((x)); }'
      expect(slices(sizeof, 'SizeofExpression')).toEqual(['sizeof((x))'])

      const call = 'int f(void) { return (fn)(x); }'
      expect(slices(call, 'FunctionCallExpression')).toEqual(['(fn)(x)'])
      expect(slices(call, 'Identifier')).toEqual(['fn', 'x'])
    })

    it('spans if/else through the else branch and loops through the body', () => {
      const source = 'void g(void) { if (a) b(); else c(); while (x) y(); }'
      expect(slices(source, 'IfStatement')).toEqual(['if (a) b(); else c();'])
      expect(slices(source, 'WhileStatement')).toEqual(['while (x) y();'])
      expect(slices(source, 'FunctionCallExpression')).toEqual(['b()', 'c()', 'y()'])
    })

    it('spans for statements and their operators', () => {
      const source = 'void h(void) { for (int i = 0; i < n; i++) sum += a[i]; }'
      expect(slices(source, 'ForStatement')).toEqual(['for (int i = 0; i < n; i++) sum += a[i];'])
      expect(slices(source, 'PostfixExpression')).toEqual(['i++'])
      expect(slices(source, 'CompoundAssignExpression')).toEqual(['sum += a[i]'])
      expect(slices(source, 'ArraySubscriptExpression')).toEqual(['a[i]'])
    })

    it('spans casts, sizeof, member access and conditionals', () => {
      const source = 'void k(void) { p->q.r = (int)x; s = sizeof(long); t = a ? b : c; }'
      expect(slices(source, 'MemberAccessExpression')).toEqual(['p->q.r'])
      expect(slices(source, 'PointerMemberAccessExpression')).toEqual(['p->q'])
      expect(slices(source, 'CastExpression')).toEqual(['(int)x'])
      expect(slices(source, 'SizeofExpression')).toEqual(['sizeof(long)'])
      expect(slices(source, 'ConditionalExpression')).toEqual(['a ? b : c'])
      expect(slices(source, 'AssignExpression')).toEqual([
        'p->q.r = (int)x',
        's = sizeof(long)',
        't = a ? b : c',
      ])
    })

    it('spans do-while, switch, case and break', () => {
      const source = 'void m(void) { do { x(); } while (y); switch (z) { case 1: w(); break; } }'
      expect(slices(source, 'DoWhileStatement')).toEqual(['do { x(); } while (y);'])
      expect(slices(source, 'SwitchStatement')).toEqual(['switch (z) { case 1: w(); break; }'])
      expect(slices(source, 'CaseStatement')).toEqual(['case 1: w();'])
      expect(slices(source, 'BreakStatement')).toEqual(['break;'])
    })

    it('spans labels and goto', () => {
      const source = 'void n(void) { lbl: goto lbl; }'
      expect(slices(source, 'LabelStatement')).toEqual(['lbl: goto lbl;'])
      expect(slices(source, 'GotoStatement')).toEqual(['goto lbl;'])
    })

    it('spans the full run of concatenated string literals', () => {
      const source = 'const char *s = "ab" "cd" "ef";'
      expect(slices(source, 'StringLiteral')).toEqual(['"ab" "cd" "ef"'])
    })

    it('spans compound literals and statement expressions', () => {
      const literal = 'int v = (int[]){1, 2, 3}[0];'
      expect(slices(literal, 'CompoundLiteralExpression')).toEqual(['(int[]){1, 2, 3}'])
      expect(slices(literal, 'ArraySubscriptExpression')).toEqual(['(int[]){1, 2, 3}[0]'])

      const stmtExpr = 'void r(void) { int y = ({ int t = 1; t + 1; }); }'
      expect(slices(stmtExpr, 'StmtExpression')).toEqual(['({ int t = 1; t + 1; })'])
    })

    it('spans inline asm and _Generic', () => {
      const asm = 'void o(void) { __asm__ __volatile__("nop" ::: "memory"); }'
      expect(slices(asm, 'InlineAsmStatement')).toEqual([
        '__asm__ __volatile__("nop" ::: "memory");',
      ])

      const generic = 'int q = _Generic(1, int: 2, default: 3);'
      expect(slices(generic, 'GenericSelectionExpression')).toEqual([
        '_Generic(1, int: 2, default: 3)',
      ])
    })

    it('keeps spans well-formed even for truncated input', () => {
      const check = (source: string, node: unknown) => {
        if (node === null || typeof node !== 'object') return
        if (Array.isArray(node)) {
          node.forEach((child) => check(source, child))
          return
        }
        const rec = node as Record<string, unknown>
        if (typeof rec.start === 'number' && typeof rec.end === 'number') {
          expect(rec.end).toBeGreaterThanOrEqual(rec.start)
          expect(rec.end).toBeLessThanOrEqual(source.length)
        }
        for (const key of Object.keys(rec)) {
          if (key === 'loc') continue
          check(source, rec[key])
        }
      }
      for (const source of [
        'void bad(void) { return 1 + ',
        'int trunc(void) { if (',
        'int x = a[',
      ]) {
        check(source, parse(source))
      }

      // A node whose first token is past the end of input must anchor at end of
      // input, not at offset 0.
      const source = 'int trunc(void) { if ('
      const [ifStmt] = collect(parse(source), 'IfStatement')
      const [missingBranch] = collect(parse(source), 'ExpressionStatement')
      expect(ifStmt).toBeDefined()
      expect(missingBranch.start).toBeGreaterThanOrEqual(ifStmt.start)
    })
  })

  describe('locations', () => {
    const positionFor = (source: string, offset: number) => {
      const clamped = Math.max(0, Math.min(offset, source.length))
      const before = source.slice(0, clamped)
      const lines = before.split('\n')
      return {
        line: lines.length,
        column: lines[lines.length - 1].length,
      }
    }

    it('omits loc by default', () => {
      const ast = parse('int main(void) { return 0; }')
      expect(ast.loc).toBeUndefined()

      const fn = ast.decls[0]
      expect(fn.loc).toBeUndefined()
      if (fn.type === 'FunctionDefinition') {
        const stmt = fn.body.items[0]
        expect(stmt.loc).toBeUndefined()
      }
    })

    it('computes loc when enabled', () => {
      const source = 'int main(void) {\n  return 0;\n}\n'
      const ast = parse(source, { loc: true })
      expect(ast.loc).toEqual({
        start: { line: 1, column: 0 },
        end: { line: 4, column: 0 },
      })

      const fn = ast.decls[0]
      expect(fn.type).toBe('FunctionDefinition')
      if (fn.type === 'FunctionDefinition') {
        expect(fn.loc).toEqual({
          start: positionFor(source, fn.start),
          end: positionFor(source, fn.end),
        })

        const stmt = fn.body.items[0]
        expect(stmt.type).toBe('ReturnStatement')
        if (stmt.type === 'ReturnStatement') {
          expect(stmt.loc).toEqual({
            start: positionFor(source, stmt.start),
            end: positionFor(source, stmt.end),
          })
        }
      }
    })
  })

  // Recursive descent spends JS stack on nesting, so input nested deeper than
  // the stack can hold used to throw a RangeError straight out of parse().
  // Every construct that recurses must instead stop with one diagnostic.
  describe('deep nesting', () => {
    const N = 2000

    const nestingErrors = (ast: ReturnType<typeof parse>) =>
      ast.errors.filter((d) => d.message.includes('nesting too deep'))

    const expectRecovered = (source: string) => {
      const started = Date.now()
      const ast = parse(source, { preprocess: false })
      // Unwinding, not re-parsing: hitting the limit must not turn into
      // quadratic error recovery over the rest of the input.
      expect(Date.now() - started).toBeLessThan(5000)
      expect(ast.type).toBe('TranslationUnit')
      const deep = nestingErrors(ast)
      expect(deep).toHaveLength(1)
      expect(deep[0].phase).toBe('parser')
      expect(deep[0].severity).toBe('error')
      expect(deep[0].start).toBeGreaterThanOrEqual(0)
      expect(deep[0].end).toBeLessThanOrEqual(source.length)
      // And it is the only diagnostic: the unwinding constructs must not each
      // report their own missing ')' or '}' on top of it.
      expect(ast.errors).toHaveLength(1)
    }

    const wellFormed: [string, string][] = [
      ['parentheses', `int x = ${'('.repeat(N)}1${')'.repeat(N)};`],
      ['blocks', `void f(void) {${'{'.repeat(N)}${'}'.repeat(N)}}`],
      ['call arguments', `int x = ${'f('.repeat(N)}1${')'.repeat(N)};`],
      ['array subscripts', `int x = ${'a['.repeat(N)}1${']'.repeat(N)};`],
      ['casts', `int x = ${'(int)'.repeat(N)}1;`],
      ['unary operators', `int x = ${'!'.repeat(N)}1;`],
      ['sizeof operators', `int x = ${'sizeof '.repeat(N)}1;`],
      ['conditional operators', `int x = ${'1?1:'.repeat(N)}1;`],
      ['comma operators', `int x = (${'1,'.repeat(N)}1);`],
      ['if statements', `void f(void) {${'if (1)'.repeat(N)};}`],
      ['else branches', `void f(void) {${'if (1) ; else '.repeat(N)};}`],
      ['statement expressions', `int x = ${'({'.repeat(N)}1;${'})'.repeat(N)};`],
      ['braced initializers', `int x[] = ${'{'.repeat(N)}1${'}'.repeat(N)};`],
      ['declarator parentheses', `int ${'('.repeat(N)}x${')'.repeat(N)};`],
      ['abstract declarators', `int x = sizeof(int ${'('.repeat(N)}*${')'.repeat(N)});`],
      ['struct definitions', `struct S {${'struct {'.repeat(N)}int a;${'} b;'.repeat(N)}} s;`],
      ['function pointer params', `void f(${'void (*g)('.repeat(N)}int${')'.repeat(N)});`],
    ]

    const unclosed: [string, string][] = [
      ['parentheses', `int x = ${'('.repeat(N)}`],
      ['blocks', `void f(void) {${'{'.repeat(N)}`],
      ['call arguments', `int x = ${'f('.repeat(N)}`],
      ['braced initializers', `int x[] = ${'{'.repeat(N)}`],
      ['struct definitions', `struct S {${'struct {'.repeat(N)}`],
      ['statement expressions', `int x = ${'({'.repeat(N)}`],
    ]

    it.each(wellFormed)('stops instead of overflowing on nested %s', (_name, source) => {
      expectRecovered(source)
    })

    it.each(unclosed)('stops instead of overflowing on nested unclosed %s', (_name, source) => {
      expectRecovered(source)
    })

    it('stops with the preprocessor enabled', () => {
      const source = `#define ONE 1\nint x = ${'('.repeat(N)}ONE${')'.repeat(N)};`
      const ast = parse(source)
      expect(nestingErrors(ast)).toHaveLength(1)
      expect(ast.directives).toHaveLength(1)
    })

    it('keeps the declarations it finished before the limit', () => {
      const ast = parse(`int before = 1;\nint x = ${'('.repeat(N)}1${')'.repeat(N)};`, {
        preprocess: false,
      })
      expect(ast.decls[0].type).toBe('Declaration')
      expect(nestingErrors(ast)).toHaveLength(1)
    })

    it('reports the input it discarded instead of dropping it silently', () => {
      const source = [
        'int a = 1;',
        `int deep = ${'('.repeat(300)}1${')'.repeat(300)};`,
        'int b = 2;',
        'int c = 3;',
        'void f(void) {}',
      ].join('\n')
      const ast = parse(source, { preprocess: false })

      // Everything after the over-nested declaration is thrown away...
      expect(ast.decls).toHaveLength(2)
      // ...so the diagnostic has to say so, and cover the discarded range.
      expect(ast.errors).toHaveLength(1)
      expect(ast.errors[0].message).toMatch(
        /^nesting too deep \(maximum \d+ levels\); the remaining \d+ tokens were not parsed$/,
      )
      expect(ast.errors[0].start).toBeGreaterThan(source.indexOf('int deep'))
      expect(ast.errors[0].end).toBe(source.length)
    })

    it('does not carry the limit over to the next parse', () => {
      parse(`int x = ${'('.repeat(N)}1${')'.repeat(N)};`, { preprocess: false })
      const ast = parse('int y = 1 + 2;', { preprocess: false })
      expect(ast.errors).toEqual([])
      expect(ast.decls).toHaveLength(1)
    })

    it('leaves ordinary nesting depths alone', () => {
      const expr = parse(`int x = ${'('.repeat(32)}1 + 2${')'.repeat(32)};`, { preprocess: false })
      expect(expr.errors).toEqual([])
      const decl = expr.decls[0]
      expect(decl.type).toBe('Declaration')
      if (decl.type === 'Declaration') {
        const init = decl.declarators[0].init
        expect(init?.kind).toBe('Expr')
        if (init?.kind === 'Expr') expect(init.expr.type).toBe('BinaryExpression')
      }

      const blocks = parse(`void f(void) {${'{'.repeat(64)}int a;${'}'.repeat(64)}}`, {
        preprocess: false,
      })
      expect(blocks.errors).toEqual([])
      expect(blocks.decls[0].type).toBe('FunctionDefinition')
    })
  })
})
