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

// Atom tables are generated repeatedly from one list. `if` is a C keyword,
// but it is still a valid macro argument and can participate in token pasting.
#define JS_ATOM_LIST \
    DEF(null)         \
    DEF(false)        \
    DEF(if)

#define DEF(name) JS_ATOM_ ## name,
enum js_atom {
    JS_ATOM_LIST
    JS_ATOM_COUNT,
};
#undef DEF

// Reuse the same X-macro list with stringification. The expanded string
// literals are adjacent, so C concatenates them into one NUL-separated table.
#define DEF(name) #name "\0"
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
    "Lu,Uppercase_Letter" "\0"
    "Ll,Lowercase_Letter" "\0"
    "Lt,Titlecase_Letter" "\0";

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
