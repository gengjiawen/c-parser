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
