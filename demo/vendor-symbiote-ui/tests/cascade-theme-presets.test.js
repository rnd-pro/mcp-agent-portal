import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  insertCascadeThemeUserPreset,
  listCascadeThemeUserPresets,
  getCascadeThemeUserPreset,
  CascadeThemePresetError,
} from '../themes/cascade-theme-presets.js';
import { CASCADE_THEME_DEFAULTS } from '../themes/cascade-theme-controls.js';

class MockStorage {
  constructor() {
    this.store = new Map();
    this.failGet = false;
    this.failSet = false;
    this.failLength = false;
    this.failKey = false;
    this.readbackMismatch = false;
    this.partialWriteThenThrow = false;
    this.failRemove = false;
    this.retainOnRemove = false;
    this.getCalls = 0;
    this.removedKeys = [];
  }
  get length() {
    if (this.failLength) throw new Error('Storage unavailable');
    return this.store.size;
  }
  key(index) {
    if (this.failKey) throw new Error('Storage unavailable');
    return Array.from(this.store.keys())[index] || null;
  }
  getItem(key) {
    this.getCalls++;
    if (this.failGet) throw new Error('Storage unavailable');
    if (this.readbackMismatch && this.store.has(key)) return 'mismatch';
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    if (this.failSet) throw new Error('Storage unavailable');
    this.store.set(key, String(value));
    if (this.partialWriteThenThrow) throw new Error('Partial storage write');
  }
  removeItem(key) {
    this.removedKeys.push(key);
    if (this.failRemove) throw new Error('Storage removal failed');
    if (!this.retainOnRemove) this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

test('Cascade Theme Presets Store tests', async (t) => {
  const getValidState = () => ({ ...CASCADE_THEME_DEFAULTS });

  function stringifyCanonical(value) {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map(stringifyCanonical).join(',')}]`;
    }
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stringifyCanonical(value[key])}`)
      .join(',')}}`;
  }

  await t.test('Insert, retrieve, and list user presets with strict structure', () => {
    const storage = new MockStorage();
    const state = getValidState();
    state.hue = 120;

    const preset = {
      state,
      name: 'Forest Theme',
    };

    const clock = {
      now: () => new Date('2026-07-17T22:00:00.000Z')
    };

    const saved = insertCascadeThemeUserPreset(preset, { storage, clock });
    assert.ok(saved.id);
    assert.equal(saved.version, 'v1');
    assert.equal(saved.createdAt, '2026-07-17T22:00:00.000Z');
    assert.equal(saved.name, 'Forest Theme');
    assert.deepEqual(saved.state, state);
    assert.equal(saved.register, ''); // Defaults to '' when omitted

    // Verify it is saved under the namespace
    assert.equal(storage.length, 1);
    const key = storage.key(0);
    assert.ok(key.startsWith('symbiote-ui:presets:v1:'));

    // Retrieve by getCascadeThemeUserPreset
    const retrieved = getCascadeThemeUserPreset(saved.id, { storage });
    assert.ok(retrieved);
    assert.equal(retrieved.id, saved.id);
    assert.equal(retrieved.version, 'v1');
    assert.equal(retrieved.createdAt, '2026-07-17T22:00:00.000Z');
    assert.equal(retrieved.name, 'Forest Theme');
    assert.deepEqual(retrieved.state, state);
    assert.equal(retrieved.register, '');

    // List all presets
    const list = listCascadeThemeUserPresets({ storage });
    assert.equal(list.length, 1);
    assert.equal(list[0].id, saved.id);
  });

  await t.test('Storage unavailable triggers STORAGE_UNAVAILABLE error', () => {
    const storage = new MockStorage();
    storage.failSet = true;
    const preset = {
      state: getValidState(),
      name: 'Forest Theme',
    };

    assert.throws(() => {
      insertCascadeThemeUserPreset(preset, { storage });
    }, (err) => {
      return err instanceof CascadeThemePresetError && err.code === 'STORAGE_UNAVAILABLE';
    });
  });

  await t.test('Throwing window.localStorage getter is normalized to STORAGE_UNAVAILABLE', () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {},
    });
    Object.defineProperty(globalThis.window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('Access denied');
      },
    });

    try {
      assert.throws(() => insertCascadeThemeUserPreset({ state: getValidState() }), (error) => {
        return error instanceof CascadeThemePresetError && error.code === 'STORAGE_UNAVAILABLE';
      });
    } finally {
      if (previousWindow) {
        Object.defineProperty(globalThis, 'window', previousWindow);
      } else {
        delete globalThis.window;
      }
    }
  });

  await t.test('Malformed storage surfaces fail explicitly for every operation', () => {
    const malformedStorage = {};
    const id = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';
    const actions = [
      () => insertCascadeThemeUserPreset({ state: getValidState() }, { storage: malformedStorage }),
      () => getCascadeThemeUserPreset(id, { storage: malformedStorage }),
      () => listCascadeThemeUserPresets({ storage: malformedStorage }),
    ];

    for (const action of actions) {
      assert.throws(action, (error) => {
        return error instanceof CascadeThemePresetError && error.code === 'STORAGE_UNAVAILABLE';
      });
    }
  });

  await t.test('Storage key and value operations reject non-Storage return types', () => {
    for (const malformedKey of [undefined, 42, {}]) {
      const storage = new MockStorage();
      storage.store.set('placeholder', 'value');
      storage.key = () => malformedKey;
      assert.throws(() => listCascadeThemeUserPresets({ storage }), (error) => {
        return error instanceof CascadeThemePresetError && error.code === 'STORAGE_UNAVAILABLE';
      });
    }

    const id = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';
    const objectValueStorage = {
      getItem() {
        return {
          toString() {
            return '{}';
          },
        };
      },
    };
    assert.throws(() => getCascadeThemeUserPreset(id, { storage: objectValueStorage }), (error) => {
      return error instanceof CascadeThemePresetError && error.code === 'STORAGE_UNAVAILABLE';
    });
  });

  await t.test('Collision and readback paths validate getItem return types', () => {
    const id = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';
    const collisionStorage = {
      getItem() {
        return undefined;
      },
      setItem() {},
      removeItem() {},
    };
    assert.throws(() => insertCascadeThemeUserPreset(
      { state: getValidState() },
      { storage: collisionStorage, uuidFactory: () => id },
    ), (error) => {
      return error instanceof CascadeThemePresetError && error.code === 'STORAGE_UNAVAILABLE';
    });

    let storedValue = null;
    let readCount = 0;
    const readbackStorage = {
      getItem() {
        readCount++;
        if (readCount === 1) return null;
        if (readCount === 2) return {};
        return storedValue;
      },
      setItem(_key, value) {
        storedValue = value;
      },
      removeItem() {
        storedValue = null;
      },
    };
    assert.throws(() => insertCascadeThemeUserPreset(
      { state: getValidState() },
      { storage: readbackStorage, uuidFactory: () => id },
    ), (error) => {
      return error instanceof CascadeThemePresetError && error.code === 'STORAGE_UNAVAILABLE';
    });
    assert.equal(storedValue, null);
  });

  await t.test('Preset inputs and options reject accessors without invoking them', () => {
    let presetGetterCalls = 0;
    const accessorPreset = {};
    Object.defineProperty(accessorPreset, 'state', {
      enumerable: true,
      get() {
        presetGetterCalls++;
        return getValidState();
      },
    });
    assert.throws(() => insertCascadeThemeUserPreset(accessorPreset, { storage: new MockStorage() }), (error) => {
      return error instanceof CascadeThemePresetError && error.code === 'INVALID_PAYLOAD';
    });
    assert.equal(presetGetterCalls, 0);

    let stateGetterCalls = 0;
    const accessorState = {};
    Object.defineProperty(accessorState, 'hue', {
      enumerable: true,
      get() {
        stateGetterCalls++;
        return stateGetterCalls;
      },
    });
    assert.throws(() => insertCascadeThemeUserPreset(
      { state: accessorState },
      { storage: new MockStorage() },
    ), (error) => {
      return error instanceof CascadeThemePresetError && error.code === 'INVALID_PAYLOAD';
    });
    assert.equal(stateGetterCalls, 0);

    let optionGetterCalls = 0;
    const accessorOptions = {};
    Object.defineProperty(accessorOptions, 'storage', {
      enumerable: true,
      get() {
        optionGetterCalls++;
        return new MockStorage();
      },
    });
    assert.throws(() => listCascadeThemeUserPresets(accessorOptions), (error) => {
      return error instanceof CascadeThemePresetError && error.code === 'INVALID_PAYLOAD';
    });
    assert.equal(optionGetterCalls, 0);
  });

  await t.test('Preset APIs normalize hostile prototype inspection failures', () => {
    const hostilePreset = new Proxy({}, {
      getPrototypeOf() {
        throw new Error('prototype trap');
      },
    });
    assert.throws(() => insertCascadeThemeUserPreset(hostilePreset, { storage: new MockStorage() }), (error) => {
      return error instanceof CascadeThemePresetError && error.code === 'INVALID_PAYLOAD';
    });

    const hostileOptions = new Proxy({}, {
      getPrototypeOf() {
        throw new Error('options prototype trap');
      },
    });
    assert.throws(() => listCascadeThemeUserPresets(hostileOptions), (error) => {
      return error instanceof CascadeThemePresetError && error.code === 'INVALID_PAYLOAD';
    });
  });

  await t.test('Preset APIs normalize hostile thrown values without reading message properties', () => {
    const hostileMessage = {};
    let messageReads = 0;
    Object.defineProperty(hostileMessage, 'message', {
      get() {
        messageReads++;
        throw new Error('message must not be read');
      },
    });

    for (const thrown of [null, 0, Symbol('failure'), hostileMessage]) {
      assert.throws(() => insertCascadeThemeUserPreset(
        { state: getValidState() },
        { storage: new MockStorage(), uuidFactory: () => { throw thrown; } },
      ), (error) => error instanceof CascadeThemePresetError);

      assert.throws(() => insertCascadeThemeUserPreset(
        { state: getValidState() },
        { storage: new MockStorage(), clock: { now: () => { throw thrown; } } },
      ), (error) => error instanceof CascadeThemePresetError);

      const storage = {
        getItem() {
          throw thrown;
        },
        setItem() {},
        removeItem() {},
      };
      assert.throws(() => insertCascadeThemeUserPreset(
        { state: getValidState() },
        { storage, uuidFactory: () => 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6' },
      ), (error) => error instanceof CascadeThemePresetError);
    }

    assert.throws(() => insertCascadeThemeUserPreset(
      { state: getValidState(), name: hostileMessage },
      { storage: new MockStorage() },
    ), (error) => error instanceof CascadeThemePresetError && error.code === 'INVALID_NAME');
    assert.equal(messageReads, 0);
  });

  await t.test('Present optional fields and injected dependencies require exact types', () => {
    const cases = [
      [{ state: getValidState(), register: undefined }, { storage: new MockStorage() }],
      [{ state: getValidState(), name: undefined }, { storage: new MockStorage() }],
      [{ state: getValidState() }, { storage: new MockStorage(), uuidFactory: undefined }],
      [{ state: getValidState() }, { storage: new MockStorage(), clock: undefined }],
      [{ state: getValidState() }, { storage: new MockStorage(), clock: null }],
    ];

    for (const [preset, options] of cases) {
      assert.throws(() => insertCascadeThemeUserPreset(preset, options), (error) => {
        return error instanceof CascadeThemePresetError
          && (error.code === 'INVALID_PAYLOAD' || error.code === 'INVALID_NAME');
      });
    }
  });

  await t.test('Clock values are type-checked before Date operations', () => {
    const hostileDateLike = {};
    let isoReads = 0;
    Object.defineProperty(hostileDateLike, 'toISOString', {
      get() {
        isoReads++;
        throw new Error('hostile toISOString getter');
      },
    });

    for (const timestamp of [null, 0, Symbol('timestamp'), hostileDateLike]) {
      assert.throws(() => insertCascadeThemeUserPreset(
        { state: getValidState() },
        { storage: new MockStorage(), clock: { now: () => timestamp } },
      ), (error) => {
        return error instanceof CascadeThemePresetError && error.code === 'INVALID_PAYLOAD';
      });
    }
    assert.equal(isoReads, 0);
  });

  await t.test('Clock reentrancy cannot insert foreign bytes after the final collision check', () => {
    const storage = new MockStorage();
    const id = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';
    const key = `symbiote-ui:presets:v1:${id}`;
    const foreignBytes = '{"foreign":true}';
    let uuidCalls = 0;

    assert.throws(() => insertCascadeThemeUserPreset(
      { state: getValidState() },
      {
        storage,
        clock: {
          now() {
            storage.store.set(key, foreignBytes);
            return new Date('2026-07-17T22:00:00.000Z');
          },
        },
        uuidFactory() {
          uuidCalls++;
          return id;
        },
      },
    ), (error) => error instanceof CascadeThemePresetError && error.code === 'COLLISION');

    assert.equal(uuidCalls, 10);
    assert.equal(storage.store.get(key), foreignBytes);
    assert.deepEqual(storage.removedKeys, []);
  });

  await t.test('A failed write never removes foreign bytes left at the attempted key', () => {
    const storage = new MockStorage();
    const id = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';
    const key = `symbiote-ui:presets:v1:${id}`;
    const foreignBytes = '{"foreign":"preserve"}';
    storage.setItem = (attemptedKey) => {
      storage.store.set(attemptedKey, foreignBytes);
      throw 0;
    };

    assert.throws(() => insertCascadeThemeUserPreset(
      { state: getValidState() },
      { storage, uuidFactory: () => id },
    ), (error) => error instanceof CascadeThemePresetError && error.code === 'CONFLICT');
    assert.equal(storage.store.get(key), foreignBytes);
    assert.deepEqual(storage.removedKeys, []);
  });

  await t.test('setItem and removeItem must return exactly undefined', () => {
    const id = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';
    const key = `symbiote-ui:presets:v1:${id}`;

    for (const wrongResult of [null, 0, false, '', Symbol('result'), {}]) {
      const storage = new MockStorage();
      storage.setItem = (attemptedKey, value) => {
        storage.store.set(attemptedKey, String(value));
        return wrongResult;
      };
      assert.throws(() => insertCascadeThemeUserPreset(
        { state: getValidState() },
        { storage, uuidFactory: () => id },
      ), (error) => {
        return error instanceof CascadeThemePresetError && error.code === 'STORAGE_UNAVAILABLE';
      });
      assert.equal(storage.store.has(key), false);
    }

    for (const wrongResult of [null, 0, false, '', Symbol('result'), {}]) {
      const storage = new MockStorage();
      storage.partialWriteThenThrow = true;
      storage.removeItem = (attemptedKey) => {
        storage.removedKeys.push(attemptedKey);
        storage.store.delete(attemptedKey);
        return wrongResult;
      };
      assert.throws(() => insertCascadeThemeUserPreset(
        { state: getValidState() },
        { storage, uuidFactory: () => id },
      ), (error) => {
        return error instanceof CascadeThemePresetError && error.code === 'CLEANUP_FAILURE';
      });
      assert.equal(storage.store.has(key), false);
    }
  });

  await t.test('Falsy and symbol Storage throws are never mistaken for success', () => {
    const id = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';

    for (const thrown of [null, 0, Symbol('write failure')]) {
      const storage = new MockStorage();
      storage.setItem = () => {
        throw thrown;
      };
      assert.throws(() => insertCascadeThemeUserPreset(
        { state: getValidState() },
        { storage, uuidFactory: () => id },
      ), (error) => {
        return error instanceof CascadeThemePresetError && error.code === 'STORAGE_UNAVAILABLE';
      });
    }

    for (const thrown of [null, 0, Symbol('remove failure')]) {
      const storage = new MockStorage();
      storage.partialWriteThenThrow = true;
      storage.removeItem = () => {
        throw thrown;
      };
      assert.throws(() => insertCascadeThemeUserPreset(
        { state: getValidState() },
        { storage, uuidFactory: () => id },
      ), (error) => {
        return error instanceof CascadeThemePresetError && error.code === 'CLEANUP_FAILURE';
      });
    }
  });

  await t.test('Preset inputs and options reject symbol and non-enumerable own keys', () => {
    const symbolPreset = { state: getValidState() };
    symbolPreset[Symbol('hidden')] = true;
    assert.throws(() => insertCascadeThemeUserPreset(symbolPreset, { storage: new MockStorage() }), (error) => {
      return error instanceof CascadeThemePresetError && error.code === 'INVALID_PAYLOAD';
    });

    const nonEnumerableState = { hue: 10 };
    Object.defineProperty(nonEnumerableState, 'contrast', {
      enumerable: false,
      value: 100,
    });
    assert.throws(() => insertCascadeThemeUserPreset(
      { state: nonEnumerableState },
      { storage: new MockStorage() },
    ), (error) => {
      return error instanceof CascadeThemePresetError && error.code === 'INVALID_PAYLOAD';
    });

    const symbolOptions = { storage: new MockStorage() };
    symbolOptions[Symbol('hidden')] = true;
    assert.throws(() => listCascadeThemeUserPresets(symbolOptions), (error) => {
      return error instanceof CascadeThemePresetError && error.code === 'INVALID_PAYLOAD';
    });
  });

  await t.test('Readback bytes not owned by the write attempt are preserved as a conflict', () => {
    const storage = new MockStorage();
    const preset = {
      state: getValidState(),
      name: 'Forest Theme',
    };

    storage.readbackMismatch = true;

    assert.throws(() => {
      insertCascadeThemeUserPreset(preset, { storage });
    }, (err) => {
      return err instanceof CascadeThemePresetError && err.code === 'CONFLICT';
    });

    assert.equal(storage.store.size, 1);
    assert.deepEqual(storage.removedKeys, []);
  });

  await t.test('Collision retry bounding behavior and never overwrites', () => {
    const storage = new MockStorage();
    const preset = {
      state: getValidState(),
      name: 'Forest Theme',
    };

    // Populate mock storage with an existing key
    const collidingId = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
    const collidingKey = `symbiote-ui:presets:v1:${collidingId}`;
    const collidingBytes = '{  "sentinel" : "preserve exact collision bytes"  }';
    storage.setItem(collidingKey, collidingBytes);

    // Inject a factory that generates the colliding UUID first
    let calls = 0;
    const uuidFactory = () => {
      calls++;
      if (calls === 1) {
        return collidingId; // First call collides
      }
      return 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6'; // Second call is free
    };

    const saved = insertCascadeThemeUserPreset(preset, { storage, uuidFactory });
    assert.equal(saved.id, 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6');
    assert.equal(calls, 2);
    assert.equal(storage.getItem(collidingKey), collidingBytes);
  });

  await t.test('Partial write cleanup removes only the attempted preset key', () => {
    const storage = new MockStorage();
    const id = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';
    const attemptedKey = `symbiote-ui:presets:v1:${id}`;
    const unrelatedKey = 'unrelated:application:data';
    const unrelatedBytes = '{ "leave": "unchanged" }';
    storage.setItem(unrelatedKey, unrelatedBytes);
    storage.partialWriteThenThrow = true;

    assert.throws(() => {
      insertCascadeThemeUserPreset(
        { state: getValidState() },
        { storage, uuidFactory: () => id },
      );
    }, (error) => {
      return error instanceof CascadeThemePresetError && error.code === 'STORAGE_UNAVAILABLE';
    });

    assert.equal(storage.store.has(attemptedKey), false);
    assert.equal(storage.store.get(unrelatedKey), unrelatedBytes);
    assert.deepEqual(storage.removedKeys, [attemptedKey]);
  });

  await t.test('Partial write reports cleanup failure when targeted removal fails', () => {
    const storage = new MockStorage();
    const id = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';
    const attemptedKey = `symbiote-ui:presets:v1:${id}`;
    const unrelatedKey = 'unrelated:application:data';
    storage.setItem(unrelatedKey, 'preserve');
    storage.partialWriteThenThrow = true;
    storage.failRemove = true;

    assert.throws(() => insertCascadeThemeUserPreset(
      { state: getValidState() },
      { storage, uuidFactory: () => id },
    ), (error) => {
      return error instanceof CascadeThemePresetError && error.code === 'CLEANUP_FAILURE';
    });
    assert.equal(storage.store.has(attemptedKey), true);
    assert.equal(storage.store.get(unrelatedKey), 'preserve');
    assert.deepEqual(storage.removedKeys, [attemptedKey]);
  });

  await t.test('Readback mismatch never removes bytes whose ownership cannot be proved', () => {
    const storage = new MockStorage();
    const id = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';
    const attemptedKey = `symbiote-ui:presets:v1:${id}`;
    const unrelatedKey = 'unrelated:application:data';
    storage.setItem(unrelatedKey, 'preserve');
    storage.readbackMismatch = true;
    storage.retainOnRemove = true;

    assert.throws(() => insertCascadeThemeUserPreset(
      { state: getValidState() },
      { storage, uuidFactory: () => id },
    ), (error) => {
      return error instanceof CascadeThemePresetError && error.code === 'CONFLICT';
    });
    assert.equal(storage.store.has(attemptedKey), true);
    assert.equal(storage.store.get(unrelatedKey), 'preserve');
    assert.deepEqual(storage.removedKeys, []);
  });

  await t.test('Collision exhaustion triggers COLLISION error', () => {
    const storage = new MockStorage();
    const preset = {
      state: getValidState(),
      name: 'Forest Theme',
    };

    const collidingId = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';
    storage.setItem(`symbiote-ui:presets:v1:${collidingId}`, JSON.stringify({
      id: collidingId,
      version: 'v1',
      createdAt: '2026-07-17T22:00:00.000Z',
      state: getValidState(),
      register: '',
    }));

    const uuidFactory = () => collidingId;

    assert.throws(() => {
      insertCascadeThemeUserPreset(preset, { storage, uuidFactory });
    }, (err) => {
      return err instanceof CascadeThemePresetError && err.code === 'COLLISION';
    });
  });

  await t.test('Corruption detection on retrieve and list rejects corrupt JSON/schema', () => {
    const storage = new MockStorage();

    // Store corrupted JSON
    storage.setItem('symbiote-ui:presets:v1:f81d4fae-7dec-41d0-a765-00a0c91e6bf6', '{invalid json}');

    assert.throws(() => {
      getCascadeThemeUserPreset('f81d4fae-7dec-41d0-a765-00a0c91e6bf6', { storage });
    }, (err) => {
      return err instanceof CascadeThemePresetError && err.code === 'CORRUPTION';
    });

    assert.throws(() => {
      listCascadeThemeUserPresets({ storage });
    }, (err) => {
      return err instanceof CascadeThemePresetError && err.code === 'CORRUPTION';
    });
  });

  await t.test('get rejects malformed and non-v4 IDs before storage lookup', () => {
    const storage = new MockStorage();
    const invalidIds = [
      '',
      'not-a-uuid',
      'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
      'f81d4fae-7dec-41d0-7765-00a0c91e6bf6',
    ];

    for (const id of invalidIds) {
      assert.throws(() => getCascadeThemeUserPreset(id, { storage }), (error) => {
        return error instanceof CascadeThemePresetError && error.code === 'INVALID_PAYLOAD';
      });
    }
    assert.equal(storage.getCalls, 0);
  });

  await t.test('Integrity errors on list never convert to an empty list', () => {
    const storage = new MockStorage();

    // Insert one valid preset and one corrupted preset
    const validId = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
    storage.setItem(`symbiote-ui:presets:v1:${validId}`, JSON.stringify({
      id: validId,
      version: 'v1',
      createdAt: '2026-07-17T22:00:00.000Z',
      state: getValidState(),
      register: '',
    }));

    storage.setItem('symbiote-ui:presets:v1:f81d4fae-7dec-41d0-a765-00a0c91e6bf6', '{"corrupt": true}');

    // Calling listUserPresets must throw CORRUPTION, not return [validPreset] or empty list
    assert.throws(() => {
      listCascadeThemeUserPresets({ storage });
    }, (err) => {
      return err instanceof CascadeThemePresetError && err.code === 'CORRUPTION';
    });
  });

  await t.test('Validation checks on insert input rejects caller-owned fields', () => {
    const storage = new MockStorage();

    // Rejects id
    assert.throws(() => {
      insertCascadeThemeUserPreset({ state: getValidState(), id: 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6' }, { storage });
    }, (err) => {
      return err instanceof CascadeThemePresetError && err.code === 'INVALID_PAYLOAD';
    });

    // Rejects version
    assert.throws(() => {
      insertCascadeThemeUserPreset({ state: getValidState(), version: 'v1' }, { storage });
    }, (err) => {
      return err instanceof CascadeThemePresetError && err.code === 'INVALID_PAYLOAD';
    });

    // Rejects createdAt
    assert.throws(() => {
      insertCascadeThemeUserPreset({ state: getValidState(), createdAt: '2026-07-17T22:00:00.000Z' }, { storage });
    }, (err) => {
      return err instanceof CascadeThemePresetError && err.code === 'INVALID_PAYLOAD';
    });
  });

  await t.test('Validation of UUID factory output format', () => {
    const storage = new MockStorage();
    const preset = { state: getValidState() };

    // Returns invalid UUID (not v4)
    const uuidFactory = () => 'invalid-uuid-format';

    assert.throws(() => {
      insertCascadeThemeUserPreset(preset, { storage, uuidFactory });
    }, (err) => {
      return err instanceof CascadeThemePresetError && err.code === 'STORAGE_UNAVAILABLE';
    });
  });

  await t.test('Parser checks missing or unknown fields in stored record', () => {
    const storage = new MockStorage();
    const validId = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

    // Unknown field
    storage.setItem(`symbiote-ui:presets:v1:${validId}`, JSON.stringify({
      id: validId,
      version: 'v1',
      createdAt: '2026-07-17T22:00:00.000Z',
      state: getValidState(),
      register: '',
      badField: 123
    }));
    assert.throws(() => getCascadeThemeUserPreset(validId, { storage }), (err) => {
      return err instanceof CascadeThemePresetError && err.code === 'CORRUPTION';
    });

    // Missing field (createdAt)
    storage.setItem(`symbiote-ui:presets:v1:${validId}`, JSON.stringify({
      id: validId,
      version: 'v1',
      state: getValidState(),
      register: '',
    }));
    assert.throws(() => getCascadeThemeUserPreset(validId, { storage }), (err) => {
      return err instanceof CascadeThemePresetError && err.code === 'CORRUPTION';
    });
  });

  await t.test('Stored createdAt must be the exact canonical ISO representation', () => {
    const storage = new MockStorage();
    const id = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';
    const key = `symbiote-ui:presets:v1:${id}`;
    const nonCanonicalDates = [
      '2026-07-17T22:00:00Z',
      '2026-07-17T19:00:00.000-03:00',
    ];

    for (const createdAt of nonCanonicalDates) {
      storage.setItem(key, JSON.stringify({
        id,
        version: 'v1',
        createdAt,
        state: getValidState(),
        register: '',
      }));
      assert.throws(() => getCascadeThemeUserPreset(id, { storage }), (error) => {
        return error instanceof CascadeThemePresetError && error.code === 'CORRUPTION';
      });
    }
  });

  await t.test('Stored records require canonical JSON bytes', () => {
    const storage = new MockStorage();
    const id = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';
    const key = `symbiote-ui:presets:v1:${id}`;
    const record = {
      id,
      version: 'v1',
      createdAt: '2026-07-17T22:00:00.000Z',
      state: getValidState(),
      register: '',
    };
    const canonical = stringifyCanonical(record);
    storage.setItem(key, canonical);
    assert.deepEqual(getCascadeThemeUserPreset(id, { storage }), record);

    const reordered = JSON.stringify(record);
    const duplicateKey = canonical.replace('"version":"v1"', '"version":"v1","version":"v1"');
    assert.notEqual(reordered, canonical);
    assert.notEqual(duplicateKey, canonical);

    for (const serialized of [`${canonical}\n`, reordered, duplicateKey]) {
      storage.setItem(key, serialized);
      assert.throws(() => getCascadeThemeUserPreset(id, { storage }), (error) => {
        return error instanceof CascadeThemePresetError && error.code === 'CORRUPTION';
      });
    }
  });

  await t.test('Insert rejects a clock that produces a non-canonical timestamp', () => {
    const storage = new MockStorage();
    const clock = {
      now: () => ({ toISOString: () => '2026-07-17T22:00:00Z' }),
    };

    assert.throws(() => {
      insertCascadeThemeUserPreset({ state: getValidState() }, { storage, clock });
    }, (error) => {
      return error instanceof CascadeThemePresetError && error.code === 'INVALID_PAYLOAD';
    });
    assert.equal(storage.store.size, 0);
  });

  await t.test('Complete stored state requires own properties', () => {
    const storage = new MockStorage();
    const id = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';
    const state = getValidState();
    const inheritedProperty = 'mode';
    const previousDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, inheritedProperty);
    delete state[inheritedProperty];

    Object.defineProperty(Object.prototype, inheritedProperty, {
      configurable: true,
      value: CASCADE_THEME_DEFAULTS[inheritedProperty],
    });

    try {
      storage.setItem(`symbiote-ui:presets:v1:${id}`, JSON.stringify({
        id,
        version: 'v1',
        createdAt: '2026-07-17T22:00:00.000Z',
        state,
        register: '',
      }));
      assert.throws(() => getCascadeThemeUserPreset(id, { storage }), (error) => {
        return error instanceof CascadeThemePresetError && error.code === 'CORRUPTION';
      });
    } finally {
      if (previousDescriptor) {
        Object.defineProperty(Object.prototype, inheritedProperty, previousDescriptor);
      } else {
        delete Object.prototype[inheritedProperty];
      }
    }
  });
});
