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
