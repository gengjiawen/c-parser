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
// __builtin_offsetof — member offset from a type name, no instance needed.
// The second argument is a member designator: a member name followed by any
// number of '.field', '->field' and '[index]' steps.
// ---------------------------------------------------------------------------
struct JSString {
    unsigned int header;
    unsigned int len;
    char u[8];
};

struct JSShape {
    struct JSString *name;
    struct JSString atoms[4];
    int prop_count;
};

static const unsigned long shape_name_offset =
    __builtin_offsetof(struct JSShape, name);
static const unsigned long shape_atom_len_offset =
    __builtin_offsetof(struct JSShape, atoms[2].len);
// '->' is accepted in a designator too: 'atoms->len' means 'atoms[0].len'
static const unsigned long shape_first_atom_len_offset =
    __builtin_offsetof(struct JSShape, atoms->len);

// How <stddef.h> defines offsetof on GCC, and the container_of it enables
#define offsetof(type, member) __builtin_offsetof(type, member)
#define container_of(ptr, type, member) \
    ((type *)((char *)(ptr) - offsetof(type, member)))

struct list_head { struct list_head *prev, *next; };
struct JSGCObjectHeader { int ref_count; struct list_head link; };

static struct JSGCObjectHeader *gc_header_of(struct list_head *el) {
    return container_of(el, struct JSGCObjectHeader, link);
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
