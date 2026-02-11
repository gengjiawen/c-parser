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
