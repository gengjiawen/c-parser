// GCC extensions
__extension__ typedef __signed__ long long int64_t;

static inline int min(int a, int b) {
    return a < b ? a : b;
}

int stmt_expr_example(int x) {
    int y = ({ int tmp = x * 2; tmp + 1; });
    return y;
}

typeof(1 + 2) z;

void use_asm(void) {
    int val;
    __asm__ __volatile__ ("nop" : : : "memory");
    __asm__ ("movl $42, %0" : "=r"(val));
}

void computed_goto(int n) {
    void *labels[] = { &&label_a, &&label_b };
    goto *labels[n];
label_a:
    return;
label_b:
    return;
}

struct __attribute__((packed)) packed_struct {
    char a;
    int b;
    short c;
};

void __attribute__((noreturn)) die(const char *msg);

_Static_assert(sizeof(int) == 4, "int must be 4 bytes");
