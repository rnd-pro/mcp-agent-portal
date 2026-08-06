import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  encodeCascadeThemeShare,
  decodeCascadeThemeShare,
  CascadeThemeShareError,
} from '../themes/cascade-theme-share.js';
import {
  CASCADE_THEME_CONTROL_LIST,
  CASCADE_THEME_DEFAULTS,
} from '../themes/cascade-theme-controls.js';

test('Cascade Theme Share Codec tests', async (t) => {
  const getValidState = () => ({ ...CASCADE_THEME_DEFAULTS });

  // Helper to encode bytes to base64url in tests
  function base64urlEncodeBytes(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = globalThis.btoa(binary);
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

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

  function tokenFromJson(json) {
    return `v1.${base64urlEncodeBytes(new TextEncoder().encode(json))}`;
  }

  await t.test('Name validation rules via encode', () => {
    // Valid name
    assert.doesNotThrow(() => encodeCascadeThemeShare({ state: getValidState(), name: 'My Cozy Theme' }));
    assert.doesNotThrow(() => encodeCascadeThemeShare({ state: getValidState(), name: '🔥 Custom (1)' }));

    // Trimmed constraint
    assert.throws(() => encodeCascadeThemeShare({ state: getValidState(), name: '  My Cozy Theme' }), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_NAME';
    });
    assert.throws(() => encodeCascadeThemeShare({ state: getValidState(), name: 'My Cozy Theme ' }), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_NAME';
    });

    // Control characters constraint
    assert.throws(() => encodeCascadeThemeShare({ state: getValidState(), name: 'My\nTheme' }), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_NAME';
    });
    assert.throws(() => encodeCascadeThemeShare({ state: getValidState(), name: 'My\u007fTheme' }), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_NAME';
    });
    assert.throws(() => encodeCascadeThemeShare({ state: getValidState(), name: 'My\u0085Theme' }), (err) => { // C1 control character
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_NAME';
    });

    // Length constraint: max 64 code points
    const longName = 'a'.repeat(65);
    assert.throws(() => encodeCascadeThemeShare({ state: getValidState(), name: longName }), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_NAME';
    });

    // Code point representation (surrogate pair counts as 1 code point)
    const emojiName = '👍'.repeat(64); // 64 emojis
    assert.doesNotThrow(() => encodeCascadeThemeShare({ state: getValidState(), name: emojiName }));
    assert.throws(() => encodeCascadeThemeShare({ state: getValidState(), name: emojiName + '👍' }), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_NAME';
    });
  });

  await t.test('Roundtrip encoding and decoding of theme state', () => {
    const state = getValidState();
    state.hue = 148;
    state.chroma = 70;
    state.mode = 'dark';

    const input = {
      state,
      register: 'tool',
      name: 'Default Dark Green',
    };

    const token = encodeCascadeThemeShare(input);
    assert.ok(token.startsWith('v1.'));

    const decoded = decodeCascadeThemeShare(token);
    assert.deepEqual(decoded.state, state);
    assert.equal(decoded.register, 'tool');
    assert.equal(decoded.name, 'Default Dark Green');
  });

  await t.test('Roundtrip encoding and decoding without optional fields', () => {
    const state = getValidState();
    const token = encodeCascadeThemeShare({ state });
    const decoded = decodeCascadeThemeShare(token);
    assert.deepEqual(decoded.state, state);
    assert.equal(decoded.register, '');
    assert.equal(decoded.name, undefined);
  });

  await t.test('Limits: oversize token or payload throws error', () => {
    const longToken = 'v1.' + 'A'.repeat(1025);
    assert.throws(() => {
      decodeCascadeThemeShare(longToken);
    }, (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'OVERSIZED';
    });
  });

  await t.test('decodeCascadeThemeShare throws UNSUPPORTED_VERSION on bad prefix', () => {
    assert.throws(() => decodeCascadeThemeShare('v2.c3VwZXI='), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'UNSUPPORTED_VERSION';
    });
  });

  await t.test('decodeCascadeThemeShare throws INVALID_ENCODING on bad encoding or JSON', () => {
    // Malformed base64url characters
    assert.throws(() => decodeCascadeThemeShare('v1.not-base64!!!'), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_ENCODING';
    });

    // Malformed base64url padding
    assert.throws(() => decodeCascadeThemeShare('v1.YWJjZGVmZ2g='), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_ENCODING';
    });

    // Malformed JSON
    const base64urlNotJson = 'v1.YWJjZGVmZ2g'; // "abcdefgh"
    assert.throws(() => decodeCascadeThemeShare(base64urlNotJson), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_ENCODING';
    });

    // Fatal UTF-8 (invalid byte sequence)
    assert.throws(() => decodeCascadeThemeShare('v1._w'), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_ENCODING';
    });
  });

  await t.test('decodeCascadeThemeShare throws INVALID_PAYLOAD on bad keys or format', () => {
    // Payload is not an object (array)
    const base64urlArray = 'v1.WzFd'; // "[1]"
    assert.throws(() => decodeCascadeThemeShare(base64urlArray), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_PAYLOAD';
    });

    // Missing state
    const base64urlNoState = 'v1.eyJuYW1lIjoiVGVzdCJ9'; // '{"name":"Test"}'
    assert.throws(() => decodeCascadeThemeShare(base64urlNoState), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_PAYLOAD';
    });

    // Extra unknown top-level keys
    const base64urlBadKeys = 'v1.eyJuYW1lIjoiVGVzdCIsInN0YXRlIjp7fSwid2F0IjoxMjN9';
    assert.throws(() => decodeCascadeThemeShare(base64urlBadKeys), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_PAYLOAD';
    });
  });

  await t.test('Validation before normalization checks', () => {
    // Enum values check
    const state = getValidState();
    state.themeVariant = 'invalid-variant';
    assert.throws(() => encodeCascadeThemeShare({ state }), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_PAYLOAD';
    });

    // Range checks
    const state2 = getValidState();
    state2.hue = 361; // Max is 360
    assert.throws(() => encodeCascadeThemeShare({ state: state2 }), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_PAYLOAD';
    });

    const state3 = getValidState();
    state3.brightness = -1; // Min is 0
    assert.throws(() => encodeCascadeThemeShare({ state: state3 }), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_PAYLOAD';
    });

    // Finite checks
    const state4 = getValidState();
    state4.contrast = NaN;
    assert.throws(() => encodeCascadeThemeShare({ state: state4 }), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_PAYLOAD';
    });

    // Type checks
    const state5 = getValidState();
    state5.mode = 123; // Must be string
    assert.throws(() => encodeCascadeThemeShare({ state: state5 }), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_PAYLOAD';
    });
  });

  await t.test('Exact control boundaries survive partial encode and complete decode', () => {
    const expectedKeys = CASCADE_THEME_CONTROL_LIST.map(({ name }) => name).sort();

    for (const control of CASCADE_THEME_CONTROL_LIST) {
      const boundaries = control.type === 'number'
        ? [control.min, control.max]
        : [control.values[0], control.values.at(-1)];

      for (const boundary of new Set(boundaries)) {
        const decoded = decodeCascadeThemeShare(encodeCascadeThemeShare({
          state: { [control.name]: boundary },
          register: '',
        }));
        assert.equal(decoded.state[control.name], boundary);
        assert.deepEqual(Object.keys(decoded.state).sort(), expectedKeys);
        assert.equal(decoded.register, '');
      }
    }
  });

  await t.test('Partial state encodes to a complete decoded state', () => {
    const decoded = decodeCascadeThemeShare(encodeCascadeThemeShare({ state: { hue: 0 } }));
    assert.deepEqual(decoded.state, { ...CASCADE_THEME_DEFAULTS, hue: 0 });
    assert.equal(decoded.register, '');
  });

  await t.test('Encoder rejects accessors without invoking them', () => {
    let inputGetterCalls = 0;
    const accessorInput = {};
    Object.defineProperty(accessorInput, 'state', {
      enumerable: true,
      get() {
        inputGetterCalls++;
        return getValidState();
      },
    });

    assert.throws(() => encodeCascadeThemeShare(accessorInput), (error) => {
      return error instanceof CascadeThemeShareError && error.code === 'INVALID_PAYLOAD';
    });
    assert.equal(inputGetterCalls, 0);

    let stateGetterCalls = 0;
    const accessorState = {};
    Object.defineProperty(accessorState, 'hue', {
      enumerable: true,
      get() {
        stateGetterCalls++;
        return stateGetterCalls;
      },
    });

    assert.throws(() => encodeCascadeThemeShare({ state: accessorState }), (error) => {
      return error instanceof CascadeThemeShareError && error.code === 'INVALID_PAYLOAD';
    });
    assert.equal(stateGetterCalls, 0);
  });

  await t.test('Encoder normalizes hostile prototype inspection failures', () => {
    const hostileInput = new Proxy({}, {
      getPrototypeOf() {
        throw new Error('prototype trap');
      },
    });

    assert.throws(() => encodeCascadeThemeShare(hostileInput), (error) => {
      return error instanceof CascadeThemeShareError && error.code === 'INVALID_PAYLOAD';
    });
  });

  await t.test('Codec normalizes hostile thrown values without reading message properties', () => {
    const hostileMessage = {};
    let messageReads = 0;
    Object.defineProperty(hostileMessage, 'message', {
      get() {
        messageReads++;
        throw new Error('message must not be read');
      },
    });

    for (const thrown of [null, 0, Symbol('failure'), hostileMessage]) {
      const hostileInput = new Proxy({}, {
        getPrototypeOf() {
          throw thrown;
        },
      });
      assert.throws(() => encodeCascadeThemeShare(hostileInput), (error) => {
        return error instanceof CascadeThemeShareError && error.code === 'INVALID_PAYLOAD';
      });
    }
    assert.equal(messageReads, 0);
  });

  await t.test('Present optional fields must satisfy their exact types', () => {
    for (const input of [
      { state: getValidState(), register: undefined },
      { state: getValidState(), name: undefined },
      { state: getValidState(), register: Symbol('register') },
      { state: getValidState(), name: Symbol('name') },
    ]) {
      assert.throws(() => encodeCascadeThemeShare(input), (error) => {
        return error instanceof CascadeThemeShareError
          && (error.code === 'INVALID_PAYLOAD' || error.code === 'INVALID_NAME');
      });
    }
  });

  await t.test('Encoder rejects symbol and non-enumerable own keys', () => {
    const symbolInput = { state: getValidState() };
    symbolInput[Symbol('hidden')] = true;
    assert.throws(() => encodeCascadeThemeShare(symbolInput), (error) => {
      return error instanceof CascadeThemeShareError && error.code === 'INVALID_PAYLOAD';
    });

    const nonEnumerableState = { hue: 10 };
    Object.defineProperty(nonEnumerableState, 'contrast', {
      enumerable: false,
      value: 100,
    });
    assert.throws(() => encodeCascadeThemeShare({ state: nonEnumerableState }), (error) => {
      return error instanceof CascadeThemeShareError && error.code === 'INVALID_PAYLOAD';
    });
  });

  await t.test('decodeCascadeThemeShare rejects non-ASCII tokens', () => {
    assert.throws(() => decodeCascadeThemeShare('v1.eyJuYW1lIjoiVGVzdCIsInN0YXRlIjp7fX0ü'), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_ENCODING';
    });
  });

  await t.test('decodeCascadeThemeShare detects non-canonical tail bits', () => {
    // "a" canonically encodes to "YQ"
    // "YR" decodes to the same byte [0x61] but has non-canonical tail bits.
    assert.throws(() => decodeCascadeThemeShare('v1.YR'), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_ENCODING';
    });
  });

  await t.test('decodeCascadeThemeShare rejects non-canonical JSON representations', () => {
    const payload = {
      state: getValidState(),
      register: '',
      name: 'Canonical',
    };
    const canonical = stringifyCanonical(payload);
    const alternateOrder = JSON.stringify(payload);
    const alternateNumber = canonical.replace('"contrast":100', '"contrast":1e2');
    const duplicateKey = `{"name":"Canonical","register":"","register":"","state":${stringifyCanonical(payload.state)}}`;
    const variants = [
      `${canonical}\n`,
      alternateOrder,
      alternateNumber,
      duplicateKey,
    ];

    assert.notEqual(alternateOrder, canonical);
    assert.notEqual(alternateNumber, canonical);

    for (const json of variants) {
      assert.throws(() => decodeCascadeThemeShare(tokenFromJson(json)), (error) => {
        return error instanceof CascadeThemeShareError && error.code === 'INVALID_ENCODING';
      });
    }
  });

  await t.test('Limits: 768 byte limit check on decoded payload', () => {
    const state = getValidState();
    const payload = {
      state,
      register: '',
      name: 'A'
    };
    const json = JSON.stringify(payload);
    // Add spaces to exceed 768 bytes
    const paddedJson = json.replace('}', ' '.repeat(600) + '}');
    const encoder = new TextEncoder();
    const bytes = encoder.encode(paddedJson);
    assert.ok(bytes.byteLength > 768);
    const token = 'v1.' + base64urlEncodeBytes(bytes);

    assert.throws(() => decodeCascadeThemeShare(token), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'OVERSIZED';
    });
  });

  await t.test('decodeCascadeThemeShare requires complete state during decode', () => {
    // A partial state (only hue) encoded manually
    const partialPayload = {
      state: { hue: 120 },
      register: '',
      name: 'Partial'
    };
    const json = stringifyCanonical(partialPayload);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(json);
    const token = 'v1.' + base64urlEncodeBytes(bytes);

    assert.throws(() => decodeCascadeThemeShare(token), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_PAYLOAD';
    });
  });

  await t.test('encodeCascadeThemeShare validates plain object inputs strictly', () => {
    // Non-plain input object
    class CustomInput {}
    const badInput = new CustomInput();
    badInput.state = getValidState();
    assert.throws(() => encodeCascadeThemeShare(badInput), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_PAYLOAD';
    });

    // Non-plain state object
    class CustomState {}
    const badState = new CustomState();
    assert.throws(() => encodeCascadeThemeShare({ state: badState }), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_PAYLOAD';
    });

    // Prototype pollution / unknown properties
    const pollutedState = Object.create({ unknownProp: 123 });
    // Object.create with custom proto will fail isPlainObject check
    assert.throws(() => encodeCascadeThemeShare({ state: pollutedState }), (err) => {
      return err instanceof CascadeThemeShareError && err.code === 'INVALID_PAYLOAD';
    });
  });

  await t.test('complete decoded state requires own properties', () => {
    const inheritedProperty = 'mode';
    const previousDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, inheritedProperty);
    const state = getValidState();
    delete state[inheritedProperty];

    Object.defineProperty(Object.prototype, inheritedProperty, {
      configurable: true,
      value: CASCADE_THEME_DEFAULTS[inheritedProperty],
    });

    try {
      const token = tokenFromJson(stringifyCanonical({ register: '', state }));
      assert.throws(() => decodeCascadeThemeShare(token), (error) => {
        return error instanceof CascadeThemeShareError && error.code === 'INVALID_PAYLOAD';
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
