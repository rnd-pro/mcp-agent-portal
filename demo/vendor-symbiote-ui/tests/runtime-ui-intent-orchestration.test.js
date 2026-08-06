import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  createRuntimeUiController,
  executeAgentIntent,
} from '../runtime/index.js';
import { getUiSchema } from '../manifest/ui-schema-catalog.js';

class FakeStyle {
  constructor() {
    this.props = new Map();
  }
  setProperty(name, val) {
    this.props.set(name, String(val));
  }
  getPropertyValue(name) {
    return this.props.get(name) || '';
  }
  removeProperty(name) {
    this.props.delete(name);
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.style = new FakeStyle();
    this.parentNode = null;
    this.removed = false;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.get(name) || null;
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }

  append(child) {
    child.parentNode = this;
    this.children.push(child);
  }
  appendChild(child) {
    this.append(child);
  }

  setItems(items) {
    this.items = items;
  }

  unsafeMethod(value) {
    this.unsafeValue = value;
  }

  remove() {
    this.removed = true;
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    }
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body');
  }
  createElement(tagName) {
    return new FakeElement(tagName);
  }
  querySelector(selector) {
    if (selector === 'body') return this.body;
    return null;
  }
}

test('executeAgentIntent runs operations sequentially and mounts components', async () => {
  let fakeDoc = new FakeDocument();
  let fakeRoot = new FakeElement('div');

  let controller = createRuntimeUiController({
    document: fakeDoc,
    root: fakeRoot,
  });

  let intent = {
    version: 'agent-intent-v1',
    intentId: 'transaction-1',
    operations: [
      {
        type: 'ui',
        params: {
          action: 'create',
          node: {
            id: 'widget-1',
            component: 'sn-chat-widget',
            props: { placeholder: 'Start typing...' },
          },
          targetSelector: 'body',
        },
      },
      {
        type: 'theme',
        params: {
          targetSelector: 'body',
          presets: {
            color: 'carbon',
            skin: 'compact',
            motion: 'disabled',
          },
        },
      },
      {
        type: 'state',
        params: {
          id: 'widget-1',
          state: {
            props: { placeholder: 'Ask anything...' },
          },
        },
      },
    ],
  };

  let res = await executeAgentIntent(controller, intent, {
    document: fakeDoc,
    intentPolicy: {
      allowedComponents: ['sn-chat-widget'],
      allowedTargetSelectors: ['body'],
      allowedStateIds: ['widget-1'],
      allowedStateProps: ['placeholder'],
      allowedThemeTargets: ['body'],
    },
  });

  assert.ok(res.success);
  assert.equal(res.executedCount, 3);

  let widget = controller.instances.get('widget-1');
  assert.ok(widget);
  assert.equal(widget.element.placeholder, 'Ask anything...');
  assert.equal(fakeDoc.body.children.length, 1);
  assert.equal(fakeDoc.body.children[0].tagName, 'SN-CHAT-WIDGET');

  // Verify theme properties were applied to body style
  assert.equal(fakeDoc.body.style.getPropertyValue('--sn-theme-motion-scale'), '0.00');
});

test('executeAgentIntent rolls back completed actions in case of subsequent failure', async () => {
  let fakeDoc = new FakeDocument();
  let fakeRoot = new FakeElement('div');

  let controller = createRuntimeUiController({
    document: fakeDoc,
    root: fakeRoot,
  });

  let intent = {
    version: 'agent-intent-v1',
    intentId: 'transaction-fail',
    operations: [
      {
        type: 'ui',
        params: {
          action: 'create',
          node: {
            id: 'temp-widget-1',
            component: 'sn-temp-widget',
          },
          targetSelector: 'body',
        },
      },
      {
        type: 'theme',
        params: {
          targetSelector: '#non-existent-selector', // This will fail!
          presets: {
            color: 'light',
          },
        },
      },
    ],
  };

  await assert.rejects(async () => {
    await executeAgentIntent(controller, intent, {
      document: fakeDoc,
    });
  }, /Theme target element not found/);

  // The first ui creation should be rolled back and the element should be destroyed
  assert.equal(controller.instances.has('temp-widget-1'), false);
  assert.equal(fakeDoc.body.children.length, 0);
});

test('executeAgentIntent validates dryRun without side effects', async () => {
  let fakeDoc = new FakeDocument();
  let controller = createRuntimeUiController({ document: fakeDoc });

  let res = await executeAgentIntent(controller, {
    version: 'agent-intent-v1',
    intentId: 'dry-run',
    dryRun: true,
    operations: [
      {
        type: 'ui',
        params: {
          action: 'create',
          node: { id: 'preview-1', component: 'sn-preview' },
          targetSelector: 'body',
        },
      },
    ],
  }, {
    document: fakeDoc,
    intentPolicy: {
      allowedComponents: ['sn-preview'],
      allowedTargetSelectors: ['body'],
    },
  });

  assert.deepEqual(res, {
    success: true,
    dryRun: true,
    executedCount: 0,
    validatedCount: 1,
  });
  assert.equal(fakeDoc.body.children.length, 0);
  assert.equal(controller.instances.size, 0);
});

test('executeAgentIntent fails fast for unknown operations and actions', async () => {
  let controller = createRuntimeUiController({ document: new FakeDocument() });

  await assert.rejects(() => executeAgentIntent(controller, {
    version: 'agent-intent-v1',
    intentId: 'unknown-op',
    operations: [{ type: 'teleport', params: {} }],
  }), /Unsupported agent intent operation/);

  await assert.rejects(() => executeAgentIntent(controller, {
    version: 'agent-intent-v1',
    intentId: 'unknown-ui-action',
    operations: [{ type: 'ui', params: { action: 'move', id: 'panel-1' } }],
  }), /Unsupported agent UI action/);
});

test('executeAgentIntent applies policy before side effects', async () => {
  let fakeDoc = new FakeDocument();
  let controller = createRuntimeUiController({ document: fakeDoc });

  await assert.rejects(() => executeAgentIntent(controller, {
    version: 'agent-intent-v1',
    intentId: 'operation-deny',
    operations: [
      {
        type: 'theme',
        params: {
          targetSelector: 'body',
          presets: { color: 'carbon' },
        },
      },
    ],
  }, {
    document: fakeDoc,
    intentPolicy: {
      allowOperations: ['ui'],
      allowedThemeTargets: ['body'],
    },
  }), /policy denied operation/);

  await assert.rejects(() => executeAgentIntent(controller, {
    version: 'agent-intent-v1',
    intentId: 'theme-target-deny',
    operations: [
      {
        type: 'theme',
        params: {
          targetSelector: 'body',
          presets: { color: 'carbon' },
        },
      },
    ],
  }, {
    document: fakeDoc,
    intentPolicy: {
      allowedThemeTargets: ['#preview'],
    },
  }), /policy denied theme target/);

  await assert.rejects(() => executeAgentIntent(controller, {
    version: 'agent-intent-v1',
    intentId: 'policy-deny',
    operations: [
      {
        type: 'ui',
        params: {
          action: 'create',
          node: { id: 'denied-1', component: 'sn-denied' },
          targetSelector: 'body',
        },
      },
    ],
  }, {
    document: fakeDoc,
    intentPolicy: {
      allowedComponents: ['sn-allowed'],
      allowedTargetSelectors: ['body'],
    },
  }), /policy denied component/);

  assert.equal(fakeDoc.body.children.length, 0);
  assert.equal(controller.instances.size, 0);
});

test('executeAgentIntent requires dedicated host-approved irreversible registration', async () => {
  let calls = [];
  let controller = createRuntimeUiController({ document: new FakeDocument() });
  controller.dynamicRegistry = {
    register: async (tagName, code, options = {}) => {
      calls.push({ tagName, code, options });
      return class DynamicElement {};
    },
  };

  let registerIntent = {
    version: 'agent-intent-v1',
    intentId: 'register-component',
    operations: [
      {
        type: 'register-component',
        params: {
          tagName: 'sn-dynamic-widget',
          code: 'export default class DynamicElement {}',
          options: {
            blockedKeywords: [],
          },
        },
      },
    ],
  };

  await assert.rejects(
    () => executeAgentIntent(controller, registerIntent),
    /requires host allowIrreversible/
  );

  let res = await executeAgentIntent(controller, registerIntent, {
    allowIrreversible: true,
    intentPolicy: {
      allowedComponents: ['sn-dynamic-widget'],
    },
  });

  assert.equal(res.executedCount, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tagName, 'sn-dynamic-widget');
  assert.deepEqual(calls[0].options.blockedKeywords, []);

  await assert.rejects(() => executeAgentIntent(controller, {
    version: 'agent-intent-v1',
    intentId: 'mixed-irreversible',
    operations: [
      registerIntent.operations[0],
      {
        type: 'ui',
        params: {
          action: 'create',
          node: { id: 'later', component: 'sn-dynamic-widget' },
          targetSelector: 'body',
        },
      },
    ],
  }, {
    allowIrreversible: true,
    intentPolicy: {
      allowedComponents: ['sn-dynamic-widget'],
      allowedTargetSelectors: ['body'],
    },
  }), /must run in a dedicated intent/);
});

test('executeAgentIntent treats destructive ui and layout operations as irreversible', async () => {
  let fakeDoc = new FakeDocument();
  let controller = createRuntimeUiController({ document: fakeDoc });
  controller.create({ id: 'destroy-me', component: 'sn-panel' });

  let destroyIntent = {
    version: 'agent-intent-v1',
    intentId: 'destroy-ui',
    operations: [
      {
        type: 'ui',
        params: {
          action: 'destroy',
          id: 'destroy-me',
        },
      },
    ],
  };

  await assert.rejects(() => executeAgentIntent(controller, destroyIntent), /requires host allowIrreversible/);

  let res = await executeAgentIntent(controller, destroyIntent, { allowIrreversible: true });
  assert.equal(res.executedCount, 1);
  assert.equal(controller.instances.has('destroy-me'), false);

  await assert.rejects(() => executeAgentIntent(controller, {
    version: 'agent-intent-v1',
    intentId: 'mixed-remove-layout',
    operations: [
      {
        type: 'layout',
        params: {
          action: {
            type: 'remove-ui-panel',
            panelType: 'theme',
          },
        },
      },
      {
        type: 'ui',
        params: {
          action: 'create',
          node: { id: 'after-remove', component: 'sn-panel' },
          targetSelector: 'body',
        },
      },
    ],
  }, {
    allowIrreversible: true,
    intentPolicy: {
      allowedLayoutPanelTypes: ['theme'],
      allowedComponents: ['sn-panel'],
      allowedTargetSelectors: ['body'],
    },
  }), /must run in a dedicated intent/);
});

test('executeAgentIntent fails on unhandled layout and missing state target', async () => {
  let fakeDoc = new FakeDocument();
  let controller = createRuntimeUiController({ document: fakeDoc });

  await assert.rejects(() => executeAgentIntent(controller, {
    version: 'agent-intent-v1',
    intentId: 'bad-layout',
    operations: [
      {
        type: 'layout',
        params: {
          action: {
            type: 'unsupported-action',
            panelType: 'theme',
          },
        },
      },
    ],
  }, {
    intentPolicy: {
      allowedLayoutPanelTypes: ['theme'],
    },
  }), /layout action was not handled/);

  await assert.rejects(() => executeAgentIntent(controller, {
    version: 'agent-intent-v1',
    intentId: 'missing-state',
    operations: [
      {
        type: 'state',
        params: {
          id: 'missing',
          state: {
            props: { value: 1 },
          },
        },
      },
    ],
  }, {
    intentPolicy: {
      allowedStateIds: ['missing'],
      allowedStateProps: ['value'],
    },
  }), /state target not found/);
});

test('executeAgentIntent gates state methods through intent policy', async () => {
  let fakeDoc = new FakeDocument();
  let controller = createRuntimeUiController({ document: fakeDoc });
  controller.create({
    id: 'table-1',
    component: 'sn-data-table',
  });

  await assert.rejects(() => executeAgentIntent(controller, {
    version: 'agent-intent-v1',
    intentId: 'method-denied',
    operations: [
      {
        type: 'state',
        params: {
          id: 'table-1',
          state: {
            methods: {
              unsafeMethod: ['blocked'],
            },
          },
        },
      },
    ],
  }, {
    intentPolicy: {
      allowedStateIds: ['table-1'],
      allowedMethods: ['setItems'],
    },
  }), /policy denied method update/);

  let res = await executeAgentIntent(controller, {
    version: 'agent-intent-v1',
    intentId: 'method-allowed',
    operations: [
      {
        type: 'state',
        params: {
          id: 'table-1',
          state: {
            methods: {
              setItems: [[{ id: 'a' }]],
            },
          },
        },
      },
    ],
  }, {
    intentPolicy: {
      allowedStateIds: ['table-1'],
      allowedMethods: ['setItems'],
    },
  });

  assert.equal(res.executedCount, 1);
  assert.deepEqual(controller.instances.get('table-1').element.items, [{ id: 'a' }]);
});

test('agent intent schema mirror is strict and synchronized with disk schema', async () => {
  let diskSchema = JSON.parse(await readFile(new URL('../schemas/agent-intent-v1.json', import.meta.url), 'utf8'));
  let catalogSchema = getUiSchema('agent-intent-v1');

  assert.deepEqual(catalogSchema, diskSchema);
  assert.equal(catalogSchema.$id, 'https://rnd-pro.github.io/symbiote-ui/schemas/agent-intent-v1.json');
  assert.ok(catalogSchema.$defs.operation.oneOf.length >= 6);
  assert.equal(catalogSchema.$defs.registerComponentParams.additionalProperties, false);
  assert.equal(catalogSchema.$defs.themeParams.required.includes('targetSelector'), true);
  assert.equal(catalogSchema.$defs.uiCreateParams.properties.action.const, 'create');
});
