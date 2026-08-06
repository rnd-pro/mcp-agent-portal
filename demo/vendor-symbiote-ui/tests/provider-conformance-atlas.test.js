import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listComponents } from '../manifest/component-registry.js';
import {
  HTML_INPUT_TYPES,
  PROVIDER_CONFORMANCE_ATLAS_SCHEMA,
  PROVIDER_CONFORMANCE_RECEIPT_SCHEMA,
  executeProviderConformanceCase,
  getProviderConformanceAtlas,
} from '../manifest/provider-conformance-atlas.js';

test('provider atlas derives every component event and control from the live registry', () => {
  let components = listComponents({ includeExperimental: true });
  let expectedEvents = components.flatMap((component) => (
    (component.contract?.events || []).map((event) => `${component.tagName}:${event.name}`)
  ));
  let expectedControls = components
    .filter((component) => component.category === 'control'
      || component.contract?.capabilities?.includes('form-control'))
    .map((component) => component.tagName)
    .sort();
  let atlas = getProviderConformanceAtlas();

  assert.equal(atlas.schemaVersion, PROVIDER_CONFORMANCE_ATLAS_SCHEMA);
  assert.equal(atlas.summary.componentCount, components.length);
  assert.equal(atlas.summary.declaredEventCount, expectedEvents.length);
  assert.deepEqual(atlas.controls.map((control) => control.tagName).sort(), expectedControls);
  assert.deepEqual(
    atlas.cases.events.map((item) => `${item.component.tagName}:${item.fixture.eventName}`).sort(),
    expectedEvents.sort(),
  );
  assert.equal(atlas.summary.totalCaseCount, Object.values(atlas.cases).flat().length);
});

test('provider atlas exposes a compact digest catalog for normal discovery', () => {
  let compact = getProviderConformanceAtlas({ includeCases: false });
  assert.equal(compact.cases, undefined);
  assert.equal(compact.caseCatalog.events.count, compact.summary.declaredEventCount);
  assert.match(compact.caseCatalog.events.digest, /^[0-9a-f]{8}$/);
});

test('provider atlas covers every standard HTML input type with explicit admission policy', () => {
  let atlas = getProviderConformanceAtlas();
  let inputCases = atlas.cases.nativeInputs.filter((item) => item.kind === 'html-input-type');
  assert.deepEqual(inputCases.map((item) => item.fixture.inputType), [...HTML_INPUT_TYPES]);
  assert.equal(inputCases.find((item) => item.fixture.inputType === 'password').execution.admission, 'restricted');
  assert.equal(inputCases.find((item) => item.fixture.inputType === 'hidden').execution.admission, 'non-visual');
  assert.equal(inputCases.find((item) => item.fixture.inputType === 'file').execution.admission, 'host-adapter');
  assert.deepEqual(
    atlas.cases.nativeInputs.filter((item) => item.kind === 'html-input-surface')
      .map((item) => item.fixture.inputType),
    ['textarea', 'select', 'contenteditable'],
  );
});

test('provider atlas expands every WebMCP enum value into an executable input case', () => {
  let components = listComponents({ includeExperimental: true });
  let atlas = getProviderConformanceAtlas();
  for (let component of components) {
    for (let tool of component.contract?.webmcp?.tools || []) {
      let cases = atlas.cases.webmcp.filter((item) => item.fixture.toolName === tool.name);
      assert.ok(cases.length, tool.name);
      for (let [property, schema] of Object.entries(tool.inputSchema?.properties || {})) {
        for (let value of schema.enum || []) {
          assert.ok(cases.some((item) => item.fixture.payload[property] === value), `${tool.name}.${property}=${value}`);
        }
      }
    }
  }
});

function fakeAdapter({ omitEvents = false, resetMode = 'full' } = {}) {
  let state = { value: 'initial', visibleResult: false, events: [] };
  return {
    async mount() { return { id: 'fixture' }; },
    async snapshot() { return { ...state, events: [...state.events] }; },
    async perform(_mounted, _action, testCase) {
      if (Object.prototype.hasOwnProperty.call(testCase.expected, 'value')) {
        state.value = testCase.expected.value;
      }
      state.visibleResult = true;
      state.events = omitEvents ? [] : [...testCase.expected.eventNames];
      return { ...state, events: [...state.events] };
    },
    async reset(_mounted, _testCase, before) {
      if (resetMode === 'full') state = { ...before, events: [...before.events] };
      if (resetMode === 'value-only') state.value = before.value;
      return { reset: true };
    },
    async dispose() {},
  };
}

test('provider atlas execution returns action, result, and reversible reset receipts', async () => {
  let atlas = getProviderConformanceAtlas();
  let testCase = atlas.cases.componentInputs.find((item) => item.expected.value === 'fixture value');
  let receipt = await executeProviderConformanceCase(testCase, fakeAdapter());

  assert.equal(receipt.schemaVersion, PROVIDER_CONFORMANCE_RECEIPT_SCHEMA);
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.passed, true);
  assert.equal(receipt.action.visibleResult, true);
  assert.equal(receipt.result.value, 'fixture value');
  assert.equal(receipt.reset.passed, true);
});

test('provider atlas execution fails closed when a declared event is absent', async () => {
  let atlas = getProviderConformanceAtlas();
  let testCase = atlas.cases.events[0];
  let receipt = await executeProviderConformanceCase(testCase, fakeAdapter({ omitEvents: true }));

  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.passed, false);
  assert.match(receipt.failures.join(' '), /missing events/);
});

test('provider atlas rejects a claimed reset unless the full snapshot is restored', async () => {
  let atlas = getProviderConformanceAtlas();
  let testCase = atlas.cases.componentInputs.find((item) => item.expected.value === 'fixture value');
  let receipt = await executeProviderConformanceCase(
    testCase,
    fakeAdapter({ resetMode: 'value-only' }),
  );

  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.passed, false);
  assert.equal(receipt.reset.reset, true);
  assert.equal(receipt.reset.passed, false);
  assert.match(receipt.failures.join(' '), /initial snapshot/);
});

test('provider atlas preserves the initial snapshot when an adapter exposes mutable state', async () => {
  let atlas = getProviderConformanceAtlas();
  let testCase = atlas.cases.componentInputs.find((item) => item.expected.value === 'fixture value');
  let state = { value: 'initial', visibleResult: false, events: [] };
  let adapter = {
    async mount() { return {}; },
    async snapshot() { return state; },
    async perform() {
      state.value = testCase.expected.value;
      state.visibleResult = true;
      return state;
    },
    async reset() { return { reset: true }; },
    async dispose() {},
  };

  let receipt = await executeProviderConformanceCase(testCase, adapter);

  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.reset.passed, false);
  assert.match(receipt.failures.join(' '), /initial snapshot/);
});

test('restricted and non-visual inputs produce explicit exclusion receipts', async () => {
  let atlas = getProviderConformanceAtlas();
  for (let inputType of ['password', 'hidden']) {
    let testCase = atlas.cases.nativeInputs.find((item) => item.fixture.inputType === inputType);
    let receipt = await executeProviderConformanceCase(testCase);
    assert.equal(receipt.status, 'excluded');
    assert.equal(receipt.excluded, true);
    assert.equal(receipt.passed, false);
    assert.match(receipt.exclusionReason, /excluded|visual interaction surface/i);
  }
});
