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

// C11 _Atomic as a type qualifier on the pointer itself (6.7.6.1):
// an atomic pointer to int, not a pointer to atomic int.
static int *_Atomic atomic_slot;

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

// _Atomic pointer as a function parameter, one level down.
static void c11_publish(int *_Atomic *slot, int *value) {
    *slot = value;
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

    c11_publish(&atomic_slot, &p->x);

    tls_counter = tls_counter + choose_int(acc) + align_type + align_expr;
    return tls_counter;
}
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
    name: 'QuickJS Idioms',
    code: `\
// QuickJS-style idioms: value macros, X-macros, goto cleanup, and runtime tables

#include <stdarg.h>

// The playground records includes but does not load system headers. This is
// the GCC type that <stdarg.h> normally exposes as va_list.
typedef __builtin_va_list va_list;

// Tagged value representation (the non-NaN-boxing QuickJS configuration).
typedef union JSValueUnion {
    int int32;
    double float64;
    void *ptr;
} JSValueUnion;

typedef struct JSValue {
    JSValueUnion u;
    long long tag;
} JSValue;

enum {
    JS_TAG_INT = 0,
    JS_TAG_FLOAT64 = 8,
};

// QuickJS uses an object-like macro to express a borrowed value type.
#if !defined(JS_CHECK_JSVALUE)
#define JSValueConst JSValue
#endif

// Function-like macro expanding to nested compound literals and a designated
// initializer (the real JS_MKVAL shape).
#define JS_MKVAL(tag, val) (JSValue){ (JSValueUnion){ .int32 = val }, tag }

static JSValue js_int32(int value) {
    return JS_MKVAL(JS_TAG_INT, value);
}

static int js_is_int(JSValueConst value) {
    return value.tag == JS_TAG_INT;
}

// Atom tables are generated repeatedly from one list. \`if\` is a C keyword,
// but it is still a valid macro argument and can participate in token pasting.
#define JS_ATOM_LIST \\
    DEF(null)         \\
    DEF(false)        \\
    DEF(if)

#define DEF(name) JS_ATOM_ ## name,
enum js_atom {
    JS_ATOM_LIST
    JS_ATOM_COUNT,
};
#undef DEF

// Reuse the same X-macro list with stringification. The expanded string
// literals are adjacent, so C concatenates them into one NUL-separated table.
#define DEF(name) #name "\\0"
static const char js_atom_names[] = JS_ATOM_LIST;
#undef DEF
#undef JS_ATOM_LIST

// goto-based error handling is the dominant cleanup idiom in QuickJS.
int build_array(int *items, int n) {
    int ret = -1;

    if (items == 0 || n < 0)
        goto fail;

    // Two loop variables; the update expression uses the comma operator.
    for (int i = 0, j = n - 1; i < j; i++, j--) {
        items[i] = j;
        items[j] = i;
    }
    ret = 0;
    goto done;

fail:
    ret = -1;
done:
    return ret;
}

// Struct designated initializers (JSClassExoticMethods style).
struct exotic_methods {
    int (*get_own_property)(void *obj, int prop);
    int (*define_own_property)(void *obj, int prop);
    int (*delete_property)(void *obj, int prop);
};

static int js_arguments_define_own_property(void *obj, int prop) {
    (void)obj;
    return prop >= 0 ? 0 : -1;
}

static const struct exotic_methods js_arguments_exotic_methods = {
    .define_own_property = js_arguments_define_own_property,
};

// Union type-punning (cutils float64_as_uint64).
unsigned long long float64_as_uint64(double d) {
    union {
        double d;
        unsigned long long u64;
    } u;
    u.d = d;
    return u.u64;
}

// QuickJS uses volatile intermediates to preserve the ECMAScript evaluation
// order and prevent the compiler from combining operations into an FMA.
double make_time(double hours, double minutes, double seconds) {
    volatile double temp;
    double time = hours * 3600000;
    time += (temp = minutes * 60000);
    time += (temp = seconds * 1000);
    return time;
}

// Hexadecimal floating constants in int64 boundary checks.
int fits_int64(double d) {
    return d >= -0x1p63 && d < 0x1p63;
}

// Direct adjacent-string table from libunicode.
static const char unicode_gc_name_table[] =
    "Lu,Uppercase_Letter" "\\0"
    "Ll,Lowercase_Letter" "\\0"
    "Lt,Titlecase_Letter" "\\0";

// <stdarg.h> macros expand to the __builtin_va_* forms understood by the
// parser, matching QuickJS functions such as code_match and js_printf.
int sum_varargs(int n, ...) {
    va_list ap;
    int total = 0;

    va_start(ap, n);
    while (n-- > 0)
        total += va_arg(ap, int);
    va_end(ap);
    return total;
}

// Extern table declaration (libregexp/libunicode style).
extern const unsigned int lre_id_start_table_ascii[4];
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
