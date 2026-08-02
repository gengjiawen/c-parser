// QuickJS-style idioms: goto error handling, designated init, compound literals

// Tagged value type (JSValue-style)
typedef union JSValueUnion {
    int int32;
    double float64;
    void *ptr;
} JSValueUnion;

typedef struct JSValue {
    JSValueUnion u;
    long long tag;
} JSValue;

// Compound literal with nested designated initializer (JS_MKVAL style)
JSValue js_mkval(int val, long long tag) {
    return (JSValue){ (JSValueUnion){ .int32 = val }, tag };
}

// goto-based error handling — the dominant control-flow idiom in QuickJS
int build_array(int n) {
    int ret = 0;
    if (n < 0)
        goto fail;
    // comma operator in for init/update (shape-walk style)
    for (int i = 0, j = n - 1; i < j; i++, j--) {
        if (i == n)
            goto done;
    }
done: ;
    return ret;
fail:
    return -1;
}

// Struct designated initializers (JSClassExoticMethods style)
struct exotic_methods {
    int (*get_own_property)(void *obj, int prop);
    int (*define_own_property)(void *obj, int prop);
    int (*delete_property)(void *obj, int prop);
};

static const struct exotic_methods js_arguments_exotic_methods = {
    .define_own_property = 0,
};

// Union type-punning (cutils float64_as_uint64)
unsigned long long float64_as_uint64(double d) {
    union {
        double d;
        unsigned long long u64;
    } u;
    u.d = d;
    return u.u64;
}

// volatile local to enforce evaluation order (js_math fdlibm style)
double force_eval(double x) {
    volatile double temp = x * x;
    return temp;
}

// Hex float literals — int64 range checks in date/bigint conversion
int fits_int64(double d) {
    return d >= -0x1p63 && d < 0x1p63;
}

// Adjacent string literal concatenation (libunicode property tables)
static const char unicode_prop_names[] =
    "Lu,Uppercase_Letter" "\0"
    "Ll,Lowercase_Letter" "\0"
    "Lt,Titlecase_Letter" "\0";

// Variadic argument access (JS_ThrowTypeError / js_printf internals)
typedef char *va_list_t;
int sum_varargs(va_list_t ap, int n) {
    int total = 0;
    while (n-- > 0)
        total += __builtin_va_arg(ap, int);
    return total;
}

// extern table declarations (libregexp / libunicode)
extern const unsigned int lre_id_start_table_ascii[4];

// Cast-to-void to suppress unused warnings
void set_mode(int mode) {
    (void)mode;
}
