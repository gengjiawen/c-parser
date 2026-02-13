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
