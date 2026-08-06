import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  RUNTIME_UI_CONTRACT,
  RUNTIME_UI_CONTRACT_VERSION,
  applyRuntimeLayoutAction,
  applyRuntimeUiState,
  createRuntimeUiController,
  createRuntimeUiInstance,
  normalizeRuntimeUiNode,
} from '../runtime/index.js';
import { createPanel, findPanelByType } from '../layout/LayoutTree.js';
import { getUiSchema } from '../manifest/ui-schema-catalog.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.parentNode = null;
    this.removed = false;
    this.calls = [];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  append(child) {
    child.parentNode = this;
    this.children.push(child);
  }

  remove() {
    this.removed = true;
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  addEventListener(type, handler) {
    let list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type, handler) {
    let list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((item) => item !== handler));
  }

  dispatch(type, detail = {}) {
    let event = { type, detail, target: this };
    for (let handler of this.listeners.get(type) || []) handler(event);
  }

  setItems(items) {
    this.calls.push({ method: 'setItems', args: [items] });
  }

  unsafeMethod(value) {
    this.calls.push({ method: 'unsafeMethod', args: [value] });
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

test('runtime UI contract creates components, applies state, routes intents, and tears down listeners', () => {
  let intents = [];
  let instance = createRuntimeUiInstance(
    {
      id: 'composer-1',
      component: 'chat-composer',
      attrs: { role: 'search', hidden: false, active: true },
      props: { placeholder: 'Build a chart' },
      state: {
        attrs: { 'data-ready': true },
        props: { value: 'Render KPI panel' },
        methods: { setItems: [[{ id: 'provider', value: 'codex' }]] },
      },
      events: {
        'chat-composer-footer-control': 'composer.footer.intent',
      },
      children: [
        {
          id: 'status-1',
          component: 'sn-status-ribbon',
          props: { tone: 'success' },
        },
      ],
    },
    {
      document: new FakeDocument(),
      allowedMethods: ['setItems'],
      onIntent: (intent) => intents.push(intent),
    }
  );

  assert.equal(RUNTIME_UI_CONTRACT.version, RUNTIME_UI_CONTRACT_VERSION);
  assert.equal(instance.element.tagName, 'CHAT-COMPOSER');
  assert.equal(instance.element.dataset.runtimeUiId, 'composer-1');
  assert.equal(instance.element.attributes.get('role'), 'search');
  assert.equal(instance.element.attributes.get('active'), '');
  assert.equal(instance.element.attributes.get('data-ready'), '');
  assert.equal(instance.element.attributes.has('hidden'), false);
  assert.equal(instance.element.placeholder, 'Build a chart');
  assert.equal(instance.element.value, 'Render KPI panel');
  assert.deepEqual(instance.element.calls[0], {
    method: 'setItems',
    args: [[{ id: 'provider', value: 'codex' }]],
  });
  assert.equal(instance.children.length, 1);
  assert.equal(instance.element.children[0].tagName, 'SN-STATUS-RIBBON');

  instance.element.dispatch('chat-composer-footer-control', { id: 'provider' });
  assert.equal(intents.length, 1);
  assert.equal(intents[0].version, 'runtime-ui-v1');
  assert.equal(intents[0].action, 'composer.footer.intent');
  assert.equal(intents[0].component, 'chat-composer');
  assert.equal(intents[0].componentId, 'composer-1');
  assert.deepEqual(intents[0].detail, { id: 'provider' });

  instance.update({
    attrs: { 'data-ready': false },
    props: { value: 'Updated' },
  });
  assert.equal(instance.element.attributes.has('data-ready'), false);
  assert.equal(instance.element.value, 'Updated');

  instance.destroy();
  instance.element.dispatch('chat-composer-footer-control', { id: 'model' });
  assert.equal(intents.length, 1);
  assert.equal(instance.element.removed, true);
});

test('runtime UI controller tracks created components and removes dynamic instances', () => {
  let controller = createRuntimeUiController({ document: new FakeDocument() });
  let instance = controller.create({
    id: 'panel-a',
    component: 'sn-card',
    children: [
      { id: 'panel-a-status', component: 'sn-status-ribbon' },
    ],
  });

  assert.equal(controller.instances.get('panel-a'), instance);
  assert.equal(controller.instances.get('panel-a-status'), instance.children[0]);
  assert.equal(controller.update('panel-a', { props: { title: 'Runtime panel' } }), instance);
  assert.equal(controller.update('panel-a-status', { props: { tone: 'success' } }), instance.children[0]);
  assert.equal(instance.element.title, 'Runtime panel');
  assert.equal(instance.children[0].element.tone, 'success');
  assert.equal(controller.destroy('panel-a'), true);
  assert.equal(controller.instances.has('panel-a'), false);
  assert.equal(controller.instances.has('panel-a-status'), false);
  assert.equal(instance.element.removed, true);
  assert.equal(controller.destroy('panel-a'), false);
});

test('runtime UI state method calls are host-gated when an allowlist is provided', () => {
  let element = new FakeElement('sn-data-table');

  applyRuntimeUiState(element, {
    methods: {
      unsafeMethod: ['blocked-by-default'],
    },
  });

  assert.deepEqual(element.calls, []);

  applyRuntimeUiState(element, {
    methods: {
      setItems: [[{ id: 'allowed' }]],
      unsafeMethod: ['blocked'],
    },
  }, {
    allowedMethods: ['setItems'],
  });

  assert.deepEqual(element.calls, [
    { method: 'setItems', args: [[{ id: 'allowed' }]] },
  ]);

  applyRuntimeUiState(element, {
    methods: {
      unsafeMethod: ['allowed-by-callback'],
    },
  }, {
    allowMethod: (name) => name === 'unsafeMethod',
  });

  assert.deepEqual(element.calls[1], {
    method: 'unsafeMethod',
    args: ['allowed-by-callback'],
  });
});

test('runtime layout action adapter opens, closes, and removes UI-invoked panels through tree helpers', () => {
  let root = createPanel('graph');
  let opened = applyRuntimeLayoutAction(root, {
    type: 'open-panel',
    panelType: 'theme',
    options: {
      uiInvoked: true,
      source: 'agent-constructor',
      panelState: { storageKey: 'theme-lab' },
    },
  });

  assert.equal(opened.handled, true);
  assert.equal(opened.mode, 'tree');
  assert.equal(opened.created, true);
  assert.equal(findPanelByType(opened.root, 'theme', { uiInvoked: true }).panelState.source, 'agent-constructor');

  let closed = applyRuntimeLayoutAction(opened.root, {
    type: 'close-ui-panel',
    panelType: 'theme',
  });
  assert.equal(closed.closed, true);
  assert.equal(findPanelByType(closed.root, 'theme', { uiInvoked: true }).panelState.closed, true);

  let removed = applyRuntimeLayoutAction(closed.root, {
    type: 'remove-ui-panel',
    panelType: 'theme',
  });
  assert.equal(removed.removed, true);
  assert.equal(findPanelByType(removed.root, 'theme', { uiInvoked: true }), null);
});

test('runtime layout action adapter delegates to panel-layout element methods', () => {
  let calls = [];
  let layoutElement = {
    openPanel(panelType, options) {
      calls.push({ method: 'openPanel', panelType, options });
      return 'panel-1';
    },
    closeUiPanel(panelType) {
      calls.push({ method: 'closeUiPanel', panelType });
      return true;
    },
    removeUiPanel(panelType) {
      calls.push({ method: 'removeUiPanel', panelType });
      return true;
    },
  };

  assert.deepEqual(
    applyRuntimeLayoutAction(layoutElement, {
      type: 'open-panel',
      panelType: 'theme',
      options: { uiInvoked: true },
    }),
    { handled: true, mode: 'element', panelId: 'panel-1' }
  );
  assert.deepEqual(
    applyRuntimeLayoutAction(layoutElement, { type: 'close-ui-panel', panelType: 'theme' }),
    { handled: true, mode: 'element', closed: true }
  );
  assert.deepEqual(
    applyRuntimeLayoutAction(layoutElement, { type: 'remove-ui-panel', panelType: 'theme' }),
    { handled: true, mode: 'element', removed: true }
  );
  assert.equal(calls.length, 3);
});

test('runtime schema normalization keeps host-owned bindings and layout metadata', () => {
  let node = normalizeRuntimeUiNode({
    tagName: 'source-viewer',
    bindings: { content: 'selection.file' },
    events: { 'source-open': 'source.open' },
    layout: { area: 'detail', weight: 2 },
  });

  assert.equal(node.component, 'source-viewer');
  assert.deepEqual(node.bindings, { content: 'selection.file' });
  assert.deepEqual(node.events, { 'source-open': 'source.open' });
  assert.deepEqual(node.layout, { area: 'detail', weight: 2 });
  assert.deepEqual(applyRuntimeUiState(null, { props: { value: 1 } }), null);
});

test('runtime-ui-v1 schema describes component state updates and method calls', async () => {
  let schema = JSON.parse(await readFile(new URL('../schemas/runtime-ui-v1.json', import.meta.url), 'utf8'));
  let catalogSchema = getUiSchema('runtime-ui-v1');
  let node = schema.$defs.node;
  let componentState = schema.$defs.componentState;

  assert.equal(node.properties.state.$ref, '#/$defs/componentState');
  assert.equal(componentState.properties.props.type, 'object');
  assert.equal(componentState.properties.attrs.type, 'object');
  assert.equal(componentState.properties.methods.type, 'object');
  assert.equal(componentState.additionalProperties, false);
  assert.deepEqual(catalogSchema.$defs.componentState, componentState);
  assert.equal(catalogSchema.$defs.node.properties.state.$ref, '#/$defs/componentState');
});
