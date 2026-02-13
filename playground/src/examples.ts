/**
 * DO NOT EDIT — generated from fixtures/*.c by scripts/sync-examples.js
 * Edit source fixtures or NAME_MAP instead.
 */
export interface Example {
  name: string
  code: string
}

export const examples: Example[] = [
  {
    name: 'Basic',
    code: `\
// Basic declarations and expressions
int x;
int y = 42;
const char *msg = "hello";
static int arr[10];
unsigned long long big = 0xDEADBEEFULL;

int add(int a, int b) {
    return a + b;
}

void noop(void) {}
`,
  },
  {
    name: 'Control Flow',
    code: `\
// Control flow statements
int abs(int x) {
    if (x < 0)
        return -x;
    else
        return x;
}

int sum(int n) {
    int total = 0;
    for (int i = 0; i < n; i++) {
        total += i;
    }
    return total;
}

int fib(int n) {
    int a = 0, b = 1;
    while (n > 0) {
        int tmp = b;
        b = a + b;
        a = tmp;
        n--;
    }
    return a;
}

void classify(int x) {
    switch (x) {
    case 0:
        break;
    case 1:
    case 2:
        break;
    default:
        break;
    }
}

int collatz(int n) {
    int steps = 0;
    do {
        if (n % 2 == 0)
            n /= 2;
        else
            n = 3 * n + 1;
        steps++;
    } while (n != 1);
    return steps;
}
`,
  },
  {
    name: 'Types & Structs',
    code: `\
// Type specifiers, structs, enums, typedefs
typedef unsigned long size_t;
typedef int (*compare_fn)(const void *, const void *);

struct point {
    int x;
    int y;
};

struct node {
    int value;
    struct node *next;
};

union variant {
    int i;
    float f;
    char c;
};

enum color { RED, GREEN = 5, BLUE };

struct packed_bits {
    unsigned int a : 3;
    unsigned int b : 5;
    unsigned int c : 8;
};

typedef struct {
    double real;
    double imag;
} complex_t;

void use_types(void) {
    struct point p = {1, 2};
    struct node n = {42, 0};
    union variant v;
    v.i = 10;
    enum color c = RED;
    complex_t z = {1.0, 2.0};
}
`,
  },
  {
    name: 'C11 Features',
    code: `\
// C11-focused fixture: standard features without GNU-only syntax.

// C11 _Atomic type specifier.
typedef _Atomic(int) atomic_int_t;
typedef struct point {
    int x;
    int y;
} point_t;

// C11 _Thread_local storage duration.
_Thread_local int tls_counter = 0;

// C11 _Static_assert at file scope.
_Static_assert(sizeof(int) >= 2, "int is too small");

// C11 _Generic generic selection.
static int choose_int(int value) {
    return _Generic((value),
                    int: value,
                    default: 0);
}

// C11 restrict qualifier on pointer parameters.
int c11_sum(point_t *restrict p, int n) {
    // C11 _Static_assert inside function scope.
    _Static_assert(_Alignof(point_t) >= _Alignof(int), "alignment check");

    // C11 _Bool boolean type.
    atomic_int_t acc = 0;
    _Bool ok = n > 0;

    // C11 _Alignof type and expression forms.
    int align_type = _Alignof(point_t);
    int align_expr = _Alignof(*p);

    for (int i = 0; i < n; i++) {
        acc = acc + p[i].x;
    }

    if (!ok) {
        return 0;
    }

    tls_counter = tls_counter + choose_int(acc) + align_type + align_expr;
    return tls_counter;
}
`,
  },
  {
    name: 'Declarators',
    code: `\
// Complex declarator syntax
int *p;
int **pp;
int arr[10];
int matrix[3][4];
int *arr_of_ptrs[5];
int (*ptr_to_arr)[5];
int (*fn_ptr)(int, int);
int (*fn_arr[4])(void);
void (*signal(int sig, void (*handler)(int)))(int);

typedef void (*callback_t)(int, void *);

struct ops {
    int (*open)(const char *path);
    int (*close)(int fd);
    int (*read)(int fd, void *buf, size_t count);
    int (*write)(int fd, const void *buf, size_t count);
};
`,
  },
  {
    name: 'GCC Extensions',
    code: `\
// ---------------------------------------------------------------------------
// __extension__ keyword — suppress warnings for GCC extensions in strict mode
// ---------------------------------------------------------------------------
__extension__ typedef __signed__ long long int64_t;

// ---------------------------------------------------------------------------
// Statement Expressions — ({ ... }) as an expression yielding the last value
// ---------------------------------------------------------------------------
static inline int min(int a, int b) {
    return a < b ? a : b;
}

int stmt_expr_example(int x) {
    int y = ({ int tmp = x * 2; tmp + 1; });
    return y;
}

// ---------------------------------------------------------------------------
// typeof — compile-time type inference
// ---------------------------------------------------------------------------
typeof(1 + 2) z;

// ---------------------------------------------------------------------------
// Labels as Values (Computed Goto) — dispatch table pattern (QuickJS-style)
// ---------------------------------------------------------------------------
enum { OP_ADD, OP_SUB, OP_MUL, OP_COUNT };

void interpreter(const unsigned char *pc) {
    static const void *const dispatch_table[256] = {
        [OP_ADD] = &&case_OP_ADD,
        [OP_SUB] = &&case_OP_SUB,
        [OP_MUL] = &&case_OP_MUL,
        [OP_COUNT ... 255] = &&case_default   // Designated Range Initializer
    };
    unsigned char opcode;
    goto *dispatch_table[opcode = *pc++];

case_OP_ADD:
    goto *dispatch_table[opcode = *pc++];
case_OP_SUB:
    goto *dispatch_table[opcode = *pc++];
case_OP_MUL:
    goto *dispatch_table[opcode = *pc++];
case_default:
    return;
}

// ---------------------------------------------------------------------------
// Designated Range Initializer — [low ... high] = value
// ---------------------------------------------------------------------------
int range_init[16] = {
    [0 ... 3] = -1,
    [4 ... 7] = 0,
    [8 ... 15] = 1
};

// ---------------------------------------------------------------------------
// __builtin_expect — branch prediction hints
// ---------------------------------------------------------------------------
#define likely(x)       __builtin_expect(!!(x), 1)
#define unlikely(x)     __builtin_expect(!!(x), 0)

int branch_predict(int x) {
    if (likely(x > 0))
        return 1;
    if (unlikely(x < -100))
        return -1;
    return 0;
}

// ---------------------------------------------------------------------------
// __builtin_clz / __builtin_ctz — leading/trailing zero count
// ---------------------------------------------------------------------------
int count_leading_zeros(unsigned int a) {
    return __builtin_clz(a);
}

int count_trailing_zeros(unsigned int a) {
    return __builtin_ctz(a);
}

int count_leading_zeros_ll(unsigned long long a) {
    return __builtin_clzll(a);
}

int count_trailing_zeros_ll(unsigned long long a) {
    return __builtin_ctzll(a);
}

// ---------------------------------------------------------------------------
// __builtin_frame_address — stack introspection
// ---------------------------------------------------------------------------
typedef unsigned long uintptr_t;

static uintptr_t js_get_stack_pointer(void) {
    return (uintptr_t)__builtin_frame_address(0);
}

// ---------------------------------------------------------------------------
// __int128 / unsigned __int128 — 128-bit integer types
// ---------------------------------------------------------------------------
typedef __int128 int128_t;
typedef unsigned __int128 uint128_t;

uint128_t mul_128(uint128_t a, uint128_t b) {
    return a * b;
}

// ---------------------------------------------------------------------------
// __attribute__ series
// ---------------------------------------------------------------------------

// format(printf, ...) — printf format checking
void __attribute__((format(printf, 2, 3)))
    js_throw_error(int ctx, const char *fmt, ...);

// always_inline — force inlining
static __attribute__((always_inline)) inline int
force_inlined(int x) {
    return x + 1;
}

// noinline — prevent inlining
__attribute__((noinline)) int never_inlined(int x) {
    return x * 2;
}

// unused — suppress unused warnings
static __attribute__((unused)) void helper_unused(void) {}

// warn_unused_result — force callers to check return value
__attribute__((warn_unused_result)) int must_check(void);

// packed — remove alignment padding
struct __attribute__((packed)) packed_struct {
    char a;
    int b;
    short c;
};

// noreturn — function never returns
void __attribute__((noreturn)) die(const char *msg);

// ---------------------------------------------------------------------------
// Extended Asm (inline assembly)
// ---------------------------------------------------------------------------
void use_asm(void) {
    int val;
    __asm__ __volatile__ ("nop" : : : "memory");
    __asm__ ("movl $42, %0" : "=r"(val));
}

// ARM yield / x86 pause — spin-wait hints (QuickJS-style)
void cpu_relax(void) {
#if defined(__aarch64__)
    asm volatile("yield" ::: "memory");
#elif defined(__x86_64__) || defined(__i386__)
    asm volatile("pause" ::: "memory");
#else
    asm volatile("" ::: "memory");
#endif
}
`,
  },
  {
    name: 'Hash Map',
    code: `\
// Realistic C program: simple hash map
typedef unsigned long size_t;

struct entry {
    const char *key;
    void *value;
    struct entry *next;
};

struct hashmap {
    struct entry **buckets;
    size_t capacity;
    size_t size;
};

static unsigned long hash(const char *str) {
    unsigned long h = 5381;
    int c;
    while ((c = *str++) != 0) {
        h = ((h << 5) + h) + c;
    }
    return h;
}

void *hashmap_get(struct hashmap *map, const char *key) {
    unsigned long h = hash(key) % map->capacity;
    struct entry *e = map->buckets[h];
    while (e != 0) {
        // strcmp would go here
        e = e->next;
    }
    return 0;
}

int hashmap_put(struct hashmap *map, const char *key, void *value) {
    unsigned long h = hash(key) % map->capacity;
    struct entry *e = map->buckets[h];

    while (e != 0) {
        e = e->next;
    }

    // Would allocate new entry here
    map->size++;
    return 0;
}

void hashmap_foreach(struct hashmap *map, void (*fn)(const char *, void *)) {
    for (size_t i = 0; i < map->capacity; i++) {
        struct entry *e = map->buckets[i];
        while (e != 0) {
            fn(e->key, e->value);
            e = e->next;
        }
    }
}
`,
  },
]
