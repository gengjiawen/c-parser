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
