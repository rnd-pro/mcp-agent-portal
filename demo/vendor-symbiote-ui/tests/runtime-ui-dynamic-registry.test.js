import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createDynamicComponentRegistry,
  validateComponentCode,
} from '../runtime/index.js';

class MockCustomElementsRegistry {
  constructor() {
    this.store = new Map();
  }
  define(name, constructor) {
    if (this.store.has(name)) {
      throw new Error(`Element ${name} already defined`);
    }
    this.store.set(name, constructor);
  }
  get(name) {
    return this.store.get(name);
  }
}

test('validateComponentCode verifies safe code and blocks bad patterns', () => {
  // Safe code
  assert.ok(validateComponentCode('export default class MyComponent extends HTMLElement {}'));

  // Blocked pattern (eval)
  assert.throws(() => {
    validateComponentCode('eval("dangerous code")');
  }, /Security violation/);

  // Blocked pattern (localStorage)
  assert.throws(() => {
    validateComponentCode('let x = localStorage.getItem("key")');
  }, /Security violation/);

  // Caller-provided blockedKeywords extend the default deny-list; they do not replace it.
  assert.throws(() => {
    validateComponentCode('eval("still dangerous")', {
      blockedKeywords: [],
    });
  }, /Security violation/);

  // Custom validate callback
  assert.throws(() => {
    validateComponentCode('const x = 1;', {
      validate: (code) => !code.includes('const'),
    });
  }, /Custom validation failed/);
});

test('createDynamicComponentRegistry manages class and code registrations', async () => {
  let mockCE = new MockCustomElementsRegistry();
  let registry = createDynamicComponentRegistry({
    customElements: mockCE,
    importModule: async (url) => {
      // Mock dynamic import returning a fake Web Component class
      return {
        default: class MockDynamicComponent {
          static tag = 'dynamic-custom';
        },
      };
    },
  });

  // 1. Tag name validation (must contain hyphen)
  await assert.rejects(async () => {
    await registry.register('nohyphen', class A {});
  }, /must contain a hyphen/);

  // 2. Direct Class registration
  class MyClass {}
  let resClass = await registry.register('my-class-element', MyClass);
  assert.equal(resClass, MyClass);
  assert.equal(mockCE.get('my-class-element'), MyClass);
  assert.ok(registry.has('my-class-element'));

  // 3. String code registration (using mock dynamic import)
  let code = `export default class MockDynamicComponent extends HTMLElement {}`;
  let resCodeClass = await registry.register('dynamic-element', code);
  assert.ok(resCodeClass);
  assert.equal(mockCE.get('dynamic-element'), resCodeClass);
  assert.ok(registry.has('dynamic-element'));

  // 4. Duplicate registration check
  await assert.rejects(async () => {
    await registry.register('my-class-element', class AnotherClass {});
  }, /already defined/);

  // 5. Duplicate registration check - allowOverride: true
  let overrideRes = await registry.register('my-class-element', MyClass, {
    allowOverride: true,
  });
  assert.equal(overrideRes, MyClass);

  // 6. Listing and querying definitions
  let list = registry.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].tagName, 'my-class-element');
  assert.equal(list[1].tagName, 'dynamic-element');
  assert.equal(list[1].code, code);
});
