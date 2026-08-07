function assertFunction(value, name) {
  if (typeof value !== 'function') {
    throw new Error(`persistence adapter ${name}() is required`);
  }
}

export function createPersistenceAdapter(adapter = {}) {
  assertFunction(adapter.get, 'get');
  assertFunction(adapter.set, 'set');
  assertFunction(adapter.delete, 'delete');

  return {
    name: String(adapter.name || 'persistence-adapter'),
    async get(key, options) {
      return adapter.get(String(key), options);
    },
    async set(key, value, options) {
      return adapter.set(String(key), value, options);
    },
    async delete(key, options) {
      return adapter.delete(String(key), options);
    },
    async list(prefix = '', options) {
      return typeof adapter.list === 'function'
        ? adapter.list(String(prefix), options)
        : [];
    },
  };
}

export function createMemoryPersistenceAdapter(initialValues = {}) {
  let store = new Map(Object.entries(initialValues));
  return createPersistenceAdapter({
    name: 'memory-persistence-adapter',
    get(key) {
      return store.get(key);
    },
    set(key, value) {
      store.set(key, value);
      return value;
    },
    delete(key) {
      return store.delete(key);
    },
    list(prefix = '') {
      return [...store.keys()].filter((key) => key.startsWith(prefix));
    },
  });
}
