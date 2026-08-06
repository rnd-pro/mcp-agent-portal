import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  PRODUCT_CONTEXT_VERSION,
  createRuntimeSafeActionFromProductAction,
  createProductContextAgentView,
  createProductRuntimeContext,
  normalizeRuntimeEnrichment,
  normalizeRuntimeHook,
  normalizeRuntimeSafeAction,
  normalizeProductContext,
  normalizeRuntimeContext,
} from '../runtime/product-context.js';
import {
  PRODUCT_RUNTIME_CONTEXT_NAME,
  buildWebMcpTourPrompt,
  coerceWebMcpPresentationCommand,
  coerceWebMcpTourTimelinePayload,
  collectWebMcpComponentTargets,
  createProductActionToolDescriptor,
  createProductContextToolDescriptors,
  createProductWebMcpBundle,
  createWebMcpHookActionPlan,
  createWebMcpPresentationActionPack,
  createWebMcpPresentationActions,
  createWebMcpPresentationController,
  createWebMcpWindowRuntimeActionPack,
  createWebMcpWindowRuntimeActions,
  createWebMcpTourTurnActionPlan,
  createWebMcpTourTurnActionPlans,
  createWebMcpHooks,
  createWebMcpObserver,
  describeWebMcpPresentationActions,
  formatWebMcpTargetLine,
  getWebMcpPresentationActionPhase,
  matchesWebMcpHookTrigger,
  normalizeWebMcpTargetText,
  registerProductContextTools,
  resolveWebMcpRuntimeTarget,
  runWebMcpHookAction,
  validateWebMcpPresentationCommand,
  WEBMCP_PANEL_BEHAVIOR_ACTION_ID,
  WEBMCP_PRESENTATION_TOUR_PHASES,
  WEBMCP_WINDOW_ADD_PANEL_ACTION_ID,
  WEBMCP_WINDOW_LAYOUT_ACTION_ID,
  WEBMCP_WINDOW_REMOVE_PANEL_ACTION_ID,
  webMcpTargetAttrValue,
} from '../webmcp.js';
import {
  getUiSchema,
  listUiSchemaVersions,
} from '../manifest/index.js';

function sampleProductContext() {
  return {
    product: {
      id: 'automation-release-demo',
      name: 'Automation release flow',
      category: 'automation',
      description: 'Public demo product for release workflow planning and Pages publish gates.',
    },
    views: [
      {
        id: 'kanban-board',
        label: 'Kanban board',
        route: '#automation/kanban-board',
        description: 'Workflow board with host-owned release tasks.',
        componentRefs: ['release-board'],
        entityRefs: ['publish-pages'],
        actionRefs: ['select-release-card', 'request-release-move'],
      },
    ],
    componentRefs: [
      {
        id: 'release-board',
        component: 'sn-kanban-board',
        descriptor: 'sn-kanban-board',
        schema: 'component-descriptor-v2',
        version: '0.3.0-alpha.50',
        capabilities: ['selection', 'move-intent'],
        viewId: 'kanban-board',
        role: 'workflow board',
        selector: 'cascade-board-panel sn-kanban-board',
        description: 'Reusable board component rendering release-flow tasks.',
        entityRefs: ['publish-pages'],
        actionRefs: ['select-release-card', 'request-release-move'],
      },
    ],
    entities: [
      {
        id: 'publish-pages',
        type: 'release-task',
        label: 'Publish GitHub Pages',
        status: 'ready',
        componentRefs: ['release-board'],
      },
    ],
    actions: [
      {
        id: 'select-release-card',
        title: 'Select release card',
        description: 'Selects a visible release task and updates the inspector.',
        componentRefs: ['release-board'],
        entityRefs: ['publish-pages'],
        inputSchema: {
          type: 'object',
          required: ['cardId'],
          properties: {
            cardId: { type: 'string' },
          },
        },
      },
      {
        id: 'request-release-move',
        name: 'release_flow_request_move',
        title: 'Request release move',
        description: 'Emits a host-owned move intent; the board does not mutate release policy.',
        componentRefs: ['release-board'],
        entityRefs: ['publish-pages'],
        destructive: false,
        inputSchema: {
          type: 'object',
          required: ['cardId', 'toColumnId'],
          properties: {
            cardId: { type: 'string' },
            toColumnId: { type: 'string' },
          },
        },
      },
    ],
    eventLog: [
      {
        id: 'board-ready',
        type: 'render',
        title: 'Board ready',
        status: 'done',
        componentRefId: 'release-board',
        entityId: 'publish-pages',
      },
    ],
  };
}

function sampleRuntimeContext() {
  return {
    activeSurfaceId: 'release-window',
    activeWindowId: 'release-window',
    activeTabId: 'release-tab',
    locale: 'ru',
    selectedEntityRefs: ['publish-pages'],
    safeActions: [{
      id: 'request-release-move',
      name: 'release_flow_request_move',
      title: 'Request release move',
      reason: 'The selected task is ready and the action is non-destructive.',
      componentRefs: ['release-board'],
      entityRefs: ['publish-pages'],
      viewRefs: ['kanban-board'],
      targetRefs: ['cue:release-board:selected-card'],
    }],
    collapsed: { 'release-sidebar': true },
    layoutPresets: [{
      id: 'operations-board',
      label: 'Operations board',
      componentRefs: ['release-board'],
      viewRefs: ['kanban-board'],
    }],
    windows: [{
      id: 'release-window',
      title: 'Release workspace',
      resourceType: 'workflow-window',
      windowRole: 'operations-board',
      layoutPresetId: 'operations-board',
      panels: [{
        id: 'release-board-panel',
        panelType: 'board-panel',
        title: 'Release board',
        component: 'sn-kanban-board',
        collapsed: false,
      }],
    }],
    tabs: [{
      id: 'release-tab',
      title: 'Release tab',
      viewId: 'kanban-board',
      component: 'sn-tab-panel',
    }],
    targets: [{
      id: 'cue:release-board:selected-card',
      kind: 'cue',
      title: 'Selected release card',
      component: 'sn-kanban-board',
      target: {
        id: 'publish-pages',
        kind: 'entity-card',
        selector: '[data-card-id="publish-pages"]',
        component: 'sn-kanban-board',
        viewId: 'kanban-board',
        entityRefs: ['publish-pages'],
        actionRefs: ['request-release-move'],
        semantics: 'selected release task card',
      },
    }],
    capabilities: { presentation: { canSwitchTabs: true } },
    enrichment: [{
      id: 'release-flow-domain-semantics',
      type: 'domain-runtime',
      title: 'Release flow domain semantics',
      detail: 'The host enriches neutral UI targets with release workflow meaning.',
      source: 'test-host',
      targetRefs: ['cue:release-board:selected-card'],
      actionRefs: ['request-release-move'],
      priority: 3,
    }],
    hooks: [{
      id: 'ready-card-assist',
      title: 'Ready card assist',
      description: 'Suggests the safe move action when a ready release task is selected.',
      mode: 'assist',
      trigger: { type: 'interaction', action: 'select-card' },
      entityRefs: ['publish-pages'],
      safeActionRefs: ['request-release-move'],
    }],
  };
}

function resolveSchemaRef(root, ref) {
  return ref.split('/').slice(1).reduce((node, part) => node?.[part], root);
}

function typeMatches(value, type) {
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  return typeof value === type;
}

function assertSchemaValid(value, schema, root = schema, path = '$') {
  if (value === undefined) return;
  if (schema.$ref) {
    assertSchemaValid(value, resolveSchemaRef(root, schema.$ref), root, path);
    return;
  }
  if ('const' in schema) {
    assert.equal(value, schema.const, `${path} const`);
  }
  if (schema.enum) {
    assert.ok(schema.enum.includes(value), `${path} enum`);
  }
  if (schema.type) {
    let types = Array.isArray(schema.type) ? schema.type : [schema.type];
    assert.ok(types.some((type) => typeMatches(value, type)), `${path} type`);
  }
  if (schema.minLength !== undefined && typeof value === 'string') {
    assert.ok(value.length >= schema.minLength, `${path} minLength`);
  }
  if (schema.type === 'array') {
    if (schema.uniqueItems) {
      assert.equal(new Set(value).size, value.length, `${path} uniqueItems`);
    }
    for (let [index, item] of value.entries()) {
      assertSchemaValid(item, schema.items, root, `${path}[${index}]`);
    }
    return;
  }
  if (schema.type !== 'object' || !value || Array.isArray(value)) return;

  for (let required of schema.required || []) {
    assert.notEqual(value[required], undefined, `${path}.${required} required`);
  }
  let properties = schema.properties || {};
  for (let [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    let propertySchema = properties[key];
    if (!propertySchema) {
      assert.notEqual(schema.additionalProperties, false, `${path}.${key} additionalProperties`);
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        assertSchemaValid(child, schema.additionalProperties, root, `${path}.${key}`);
      }
      continue;
    }
    assertSchemaValid(child, propertySchema, root, `${path}.${key}`);
  }
}

test('normalizeProductContext keeps product semantics above neutral component refs', () => {
  let context = normalizeProductContext(sampleProductContext());

  assert.equal(context.version, PRODUCT_CONTEXT_VERSION);
  assert.equal(context.product.id, 'automation-release-demo');
  assert.equal(context.product.name, 'Automation release flow');
  assert.equal(context.views[0].route, '#automation/kanban-board');
  assert.deepEqual(context.views[0].componentRefs, ['release-board']);
  assert.equal(context.componentRefs[0].component, 'sn-kanban-board');
  assert.equal(context.componentRefs[0].descriptor, 'sn-kanban-board');
  assert.equal(context.componentRefs[0].schema, 'component-descriptor-v2');
  assert.deepEqual(context.componentRefs[0].capabilities, ['selection', 'move-intent']);
  assert.equal(context.componentRefs[0].role, 'workflow board');
  assert.equal(context.entities[0].type, 'release-task');
  assert.equal(context.actions[0].name, 'automation_release_demo_select_release_card');
  assert.equal(context.actions[1].name, 'release_flow_request_move');
  assert.equal(context.actions[1].destructive, false);
  assert.equal(context.eventLog[0].componentRefId, 'release-board');
  assert.equal(context.webmcp.mode, 'product-actions');
  assert.deepEqual(context.webmcp.toolNames, [
    'automation_release_demo_select_release_card',
    'release_flow_request_move',
  ]);
});

test('createProductContextAgentView exposes what an agent needs to inspect a product', () => {
  let view = createProductContextAgentView(sampleProductContext());

  assert.equal(view.product.id, 'automation-release-demo');
  assert.match(view.summary, /Automation release flow/);
  assert.equal(view.views[0].id, 'kanban-board');
  assert.equal(view.views[0].componentRefs[0], 'release-board');
  assert.equal(view.componentRefs[0].component, 'sn-kanban-board');
  assert.equal(view.actions[0].inputSchema.required[0], 'cardId');
  assert.equal(view.eventLog[0].title, 'Board ready');
  assert.match(view.webmcp.actionPolicy, /host-owned product intents/);
});

test('createProductRuntimeContext carries live browser UI context for narration', () => {
  let runtime = normalizeRuntimeContext(sampleRuntimeContext());
  let context = createProductRuntimeContext(sampleProductContext(), runtime);
  let composed = createProductRuntimeContext({
    ...sampleProductContext(),
    runtime: sampleRuntimeContext(),
  });

  assert.equal(context.product.id, 'automation-release-demo');
  assert.equal(composed.runtime.activeWindowId, 'release-window');
  assert.match(context.agent.summary, /Automation release flow/);
  assert.match(context.agent.summary, /Views: Kanban board/);
  assert.equal(context.runtime.activeSurfaceId, 'release-window');
  assert.equal(context.runtime.activeTabId, 'release-tab');
  assert.deepEqual(context.runtime.selectedEntityRefs, ['publish-pages']);
  assert.deepEqual(context.runtime.safeActionRefs, ['request-release-move']);
  assert.equal(context.runtime.safeActions[0].safe, true);
  assert.deepEqual(context.runtime.safeActions[0].targetRefs, ['cue:release-board:selected-card']);
  assert.equal(context.runtime.collapsed['release-sidebar'], true);
  assert.equal(context.runtime.layoutPresets[0].id, 'operations-board');
  assert.equal(context.runtime.windows[0].children[0].component, 'sn-kanban-board');
  assert.equal(context.runtime.tabs[0].id, 'release-tab');
  assert.equal(context.runtime.surfaces[0].children[0].component, 'sn-kanban-board');
  assert.equal(context.runtime.cues[0].target.semantics, 'selected release task card');
  assert.equal(context.runtime.enrichment[0].source, 'test-host');
  assert.equal(context.runtime.enrichment[0].priority, 3);
  assert.equal(context.runtime.hooks[0].trigger.action, 'select-card');
  assert.equal(context.runtime.capabilities.presentation.canSwitchTabs, true);

  let safeAction = createRuntimeSafeActionFromProductAction(sampleProductContext().actions[0], {
    reason: 'Visible card selection is a non-mutating UI operation.',
  });
  assert.equal(safeAction.id, 'select-release-card');
  assert.equal(safeAction.safe, true);
  assert.equal(normalizeRuntimeSafeAction('quick-view').id, 'quick-view');
  assert.equal(normalizeRuntimeEnrichment('extra-context').title, 'extra-context');
  assert.equal(normalizeRuntimeHook('assist-hook').mode, 'assist');
});

test('product context actions become WebMCP descriptors without a browser-only dependency', async () => {
  let context = normalizeProductContext(sampleProductContext());
  let descriptor = createProductActionToolDescriptor(context, context.actions[0]);
  let rawDescriptor = createProductActionToolDescriptor(sampleProductContext(), sampleProductContext().actions[0]);
  let descriptors = createProductContextToolDescriptors(context);
  let bundle = createProductWebMcpBundle(context, {
    runtime: sampleRuntimeContext(),
    enrichActionDescriptor(descriptor) {
      return {
        ...descriptor,
        annotations: {
          ...descriptor.annotations,
          agentVisibleRuntimeContract: true,
        },
      };
    },
  });

  assert.equal(descriptor.name, 'automation_release_demo_select_release_card');
  assert.equal(rawDescriptor.name, 'automation_release_demo_select_release_card');
  assert.match(descriptor.description, /Automation release flow/);
  assert.match(descriptor.description, /Selects a visible release task/);
  assert.equal(descriptor.annotations.productId, 'automation-release-demo');
  assert.equal(descriptor.annotations.actionId, 'select-release-card');
  assert.deepEqual(descriptor.annotations.componentRefs, ['release-board']);
  assert.deepEqual(descriptors.map((tool) => tool.name), [
    'automation_release_demo_select_release_card',
    'release_flow_request_move',
  ]);
  assert.equal(bundle.runtime.enrichment[0].id, 'release-flow-domain-semantics');
  assert.equal(bundle.safeActionRefs[0], 'request-release-move');
  assert.equal(bundle.descriptors[0].annotations.agentVisibleRuntimeContract, true);

  let registered = [];
  let published = [];
  let unpublished = 0;
  let result = await registerProductContextTools(context, {
    executeAction() {},
    modelContext: {
      registerTool(tool) {
        registered.push(tool);
        return () => {};
      },
      registerContext(payload) {
        published.push(payload);
        return () => {
          unpublished += 1;
        };
      },
    },
  }, sampleRuntimeContext());

  assert.equal(result.nativeActive, false);
  assert.equal(result.descriptors.length, 2);
  assert.equal(registered.length, 2);
  assert.equal(result.contextView.runtime.activeWindowId, 'release-window');
  assert.equal(result.runtime.cues[0].target.entityRefs[0], 'publish-pages');
  assert.equal(result.publication.published, true);
  assert.equal(result.publication.method, 'registerContext');
  assert.equal(published[0].name, PRODUCT_RUNTIME_CONTEXT_NAME);
  assert.equal(published[0].value.runtime.safeActionRefs[0], 'request-release-move');
  result.refresh({
    ...sampleRuntimeContext(),
    activeWindowId: 'release-window-updated',
    cues: [{ id: 'window:release-window-updated', title: 'Updated release window' }],
  });
  assert.equal(registered.length, 2);
  assert.equal(unpublished, 1);
  assert.equal(published.length, 2);
  assert.equal(result.contextView.runtime.activeWindowId, 'release-window-updated');
  assert.equal(result.runtime.cues[0].id, 'window:release-window-updated');
  assert.equal(published[1].value.runtime.cues[0].id, 'window:release-window-updated');
  result.unregister();
  assert.equal(unpublished, 2);

  let destructiveAction = {
    id: 'delete-card',
    name: 'delete_card',
    destructive: true
  };
  let destructiveDesc = createProductActionToolDescriptor(context, destructiveAction);
  assert.equal(destructiveDesc.annotations.destructiveHint, true);
  assert.equal(destructiveDesc.annotations.destructive, true);
  assert.ok(!('destructiveHint' in destructiveDesc));
});

test('createWebMcpObserver records recent events for WebMCP runtime refresh and hooks', () => {
  let observer = createWebMcpObserver({ limit: 2 });
  let seen = [];
  let unsubscribe = observer.subscribe((entry) => seen.push(entry));

  assert.deepEqual(observer.record({ type: 'interaction', action: 'open-tab' }), {
    type: 'interaction',
    action: 'open-tab',
    seq: 1,
  });
  observer.record({ type: 'data', action: 'refresh' });
  observer.record('plain-event');

  assert.deepEqual(seen.map((entry) => entry.seq), [1, 2, 3]);
  assert.deepEqual(observer.recent(3).map((entry) => entry.seq), [3, 2]);
  assert.deepEqual(observer.recent(2, 'data').map((entry) => entry.action), ['refresh']);
  assert.deepEqual(observer.recent(2, (entry) => entry.value === 'plain-event').map((entry) => entry.seq), [3]);

  unsubscribe();
  observer.record({ type: 'interaction', action: 'ignored' });
  assert.deepEqual(seen.map((entry) => entry.seq), [1, 2, 3]);

  observer.clear();
  assert.deepEqual(observer.recent(), []);
});

test('createWebMcpHooks is a neutral observer rule engine', () => {
  let subscribers = [];
  let fired = [];
  let hooks = createWebMcpHooks({
    observer: {
      subscribe(callback) {
        subscribers.push(callback);
        return () => {
          subscribers = subscribers.filter((item) => item !== callback);
        };
      },
    },
  });

  hooks.register({
    id: 'ready-card-assist',
    match: { type: 'interaction', action: 'select-card' },
    cooldown: 2,
    trigger: (entry) => fired.push(entry.seq),
  });
  subscribers[0]({ type: 'interaction', action: 'select-card', seq: 1 });
  subscribers[0]({ type: 'interaction', action: 'select-card', seq: 2 });
  subscribers[0]({ type: 'interaction', action: 'select-card', seq: 3 });
  assert.deepEqual(fired, [1, 3]);

  hooks.dispose();
  assert.equal(subscribers.length, 0);
});

test('createWebMcpHooks registers runtime hook descriptors with constraints', () => {
  let fired = [];
  let hooks = createWebMcpHooks();
  let unregister = hooks.registerRuntimeHooks(sampleRuntimeContext().hooks, {
    enrichEntry(entry, hook) {
      assert.equal(hook.id, 'ready-card-assist');
      if (entry.cardId !== 'publish-pages') return null;
      return { status: 'ready', entityRefs: ['publish-pages'] };
    },
    trigger(entry, hook) {
      fired.push([entry.seq, hook.id, entry.status]);
    },
  });

  assert.equal(matchesWebMcpHookTrigger({ constraints: { status: 'ready' } }, { status: 'ready' }), true);
  assert.equal(matchesWebMcpHookTrigger({ constraints: { status: 'ready' } }, { status: 'draft' }), false);
  hooks.evaluate({ type: 'interaction', action: 'select-card', cardId: 'other', seq: 1 });
  hooks.evaluate({ type: 'interaction', action: 'select-card', cardId: 'publish-pages', seq: 2 });
  assert.deepEqual(fired, [[2, 'ready-card-assist', 'ready']]);

  unregister[0]();
  hooks.evaluate({ type: 'interaction', action: 'select-card', cardId: 'publish-pages', seq: 3 });
  assert.deepEqual(fired, [[2, 'ready-card-assist', 'ready']]);
});

test('WebMCP hook action planner routes descriptors through safe action commands', async () => {
  let hook = {
    id: 'ready-card-assist',
    title: 'Approve selected card',
    actionRefs: ['request_release_move'],
    metadata: {
      confirmationRequired: true,
      actionInput: {
        cardId: '$entry.card.id',
        status: 'approved',
        note: '$hook.title',
      },
    },
  };
  let action = {
    id: 'request-release-move',
    name: 'request_release_move',
    metadata: { permission: 'operator-confirm' },
  };
  let entry = { card: { id: 'publish-pages' } };
  let plan = createWebMcpHookActionPlan(entry, hook, { actions: [action] });

  assert.deepEqual(plan.command, {
    tool: 'request_release_move',
    input: { cardId: 'publish-pages', status: 'approved', note: 'Approve selected card' },
  });
  assert.equal(plan.confirmationRequired, true);

  let ran = [];
  let result = await runWebMcpHookAction(entry, hook, {
    actions: [action],
    consumer: {
      run(tool, input) {
        ran.push({ tool, input });
        return { ok: true };
      },
    },
  });
  assert.equal(result.planned, true);
  assert.deepEqual(ran, [plan.command]);
});

test('WebMCP component target collector consumes component-authored catalogs', () => {
  let rowEl = { dataset: { tourTargetId: 'element:release:queue:row:publish-pages' } };
  let table = {
    localName: 'sn-data-table',
    getWebMcpTargets(options) {
      assert.equal(options.tabId, 'release');
      assert.equal(options.panelId, 'queue');
      return [{
        id: 'element:release:queue:row:publish-pages',
        kind: 'detail',
        title: 'Publish pages',
        summary: 'ready · priority 1',
        resourceType: 'release-task',
        metadata: { rowId: 'publish-pages' },
        element: rowEl,
      }];
    },
  };
  let panel = {
    querySelectorAll() {
      return [table];
    },
  };
  let targets = collectWebMcpComponentTargets(panel, {
    tabId: 'release',
    panelId: 'queue',
    enrichTarget(target) {
      return { ...target, actionRefs: ['request_release_move'] };
    },
  });

  assert.deepEqual(targets, [{
    tabId: 'release',
    panelId: 'queue',
    resourceType: 'release-task',
    component: 'sn-data-table',
    id: 'element:release:queue:row:publish-pages',
    kind: 'detail',
    title: 'Publish pages',
    summary: 'ready · priority 1',
    metadata: { rowId: 'publish-pages' },
    actionRefs: ['request_release_move'],
  }]);
});

test('WebMCP runtime target helpers resolve neutral window panel and element ids', () => {
  let detailEl = { textContent: 'Deploy TEST', dataset: {} };
  let panelEl = {
    textContent: 'Script sync Deploy TEST',
    querySelectorAll(selector) {
      assert.equal(selector, 'button');
      return [detailEl];
    },
  };
  let layout = {
    querySelector(selector) {
      return selector === '[data-panel-id="script-sync"]' ? panelEl : null;
    },
  };
  let doc = { querySelector: () => null };
  let windows = [{ id: 'code-workspace', layout, container: { textContent: 'Code workspace' } }];

  assert.equal(normalizeWebMcpTargetText('undefined Deploy   TEST', 'fallback'), 'Deploy TEST');
  assert.equal(webMcpTargetAttrValue('element:"quoted"'), 'element:\\"quoted\\"');
  assert.equal(formatWebMcpTargetLine({ kind: 'panel', title: 'Script sync', resourceType: 'code', collapsed: true }), 'panel · Script sync · code · collapsed');
  assert.equal(resolveWebMcpRuntimeTarget('window:code-workspace', { document: doc, windows })?.layout, layout);
  assert.equal(resolveWebMcpRuntimeTarget('panel:code-workspace:script-sync', { document: doc, windows })?.el, panelEl);
  let resolvedDetail = resolveWebMcpRuntimeTarget('element:code-workspace:script-sync:0', {
    document: doc,
    windows,
    detailSelector: 'button',
  });
  assert.equal(resolvedDetail.el, detailEl);
  assert.equal(detailEl.dataset.tourTargetId, 'element:code-workspace:script-sync:0');
});

test('WebMCP presentation action pack is reusable product-neutral context', () => {
  let domainAction = {
    id: 'select-release-card',
    name: 'select_release_card',
    title: 'Select release card',
    description: 'Pure UI: select a release task card without changing policy.',
    inputSchema: { type: 'object', required: ['cardId'], properties: { cardId: { type: 'string' } } },
    metadata: { targetRefs: ['element:release-card'] },
  };
  let actions = createWebMcpPresentationActions({ additionalActions: [domainAction] });
  let pack = createWebMcpPresentationActionPack({ additionalActions: [domainAction] });
  let instructions = describeWebMcpPresentationActions(actions);

  assert.ok(actions.some((action) => action.name === 'select_window'));
  assert.ok(actions.some((action) => action.name === 'select_release_card'));
  assert.deepEqual(pack.actionNames, actions.map((action) => action.name));
  assert.ok(pack.safeActions.every((action) => action.safe));
  assert.deepEqual(pack.safeActions.find((action) => action.id === 'select-release-card').targetRefs, ['element:release-card']);
  assert.match(instructions, /select_window/);
  assert.match(instructions, /select_release_card/);

  assert.deepEqual(
    pack.coerceCommand(
      { tool: 'select_window', input: { targetId: 'window:release-board' } },
      { allowedTargetIds: ['window:release-board'] },
    ),
    { tool: 'select_window', input: { targetId: 'window:release-board' } },
  );
  assert.equal(
    coerceWebMcpPresentationCommand(
      { tool: 'select_window', input: { targetId: 'window:missing' } },
      { actions, allowedTargetIds: ['window:release-board'] },
    ),
    null,
  );
  assert.match(
    validateWebMcpPresentationCommand(
      { tool: 'select_release_card', input: {} },
      { actions },
    ).errors.join('\n'),
    /input\.cardId is required/,
  );
  assert.equal(
    getWebMcpPresentationActionPhase({ tool: 'select_window' }, { actions }),
    WEBMCP_PRESENTATION_TOUR_PHASES.BEFORE_FOCUS,
  );
  assert.equal(
    getWebMcpPresentationActionPhase({ tool: 'mark_ui' }, { actions }),
    WEBMCP_PRESENTATION_TOUR_PHASES.AFTER_FOCUS_ANNOTATION,
  );
  assert.equal(
    getWebMcpPresentationActionPhase({ tool: 'select_release_card' }, { actions }),
    WEBMCP_PRESENTATION_TOUR_PHASES.AFTER_FOCUS,
  );
  assert.deepEqual(
    createWebMcpTourTurnActionPlan(
      { cues: [{ kind: 'interaction', targetId: 'card:publish-pages', interaction: { binding: { source: 'webmcp', tool: 'select_release_card', input: { cardId: 'publish-pages' } } } }] },
      { actions },
    ).command,
    { tool: 'select_release_card', input: { cardId: 'publish-pages' } },
  );
  assert.equal(
    createWebMcpTourTurnActionPlan({ cues: [{ kind: 'interaction', interaction: { binding: { source: 'webmcp', tool: 'missing', input: {} } } }] }, { actions }).phase,
    WEBMCP_PRESENTATION_TOUR_PHASES.NONE,
  );
  assert.equal(createWebMcpTourTurnActionPlans({ cues: [
    { kind: 'interaction', interaction: { binding: { source: 'webmcp', tool: 'select_window', input: {} } } },
    { kind: 'interaction', interaction: { binding: { source: 'webmcp', tool: 'mark_ui', input: {} } } },
  ] }, { actions }).length, 2);
});

test('WebMCP window runtime action pack exposes product-neutral UI mutation contracts', () => {
  let workspaceAction = {
    id: 'select-workspace-view',
    name: 'select_workspace_view',
    title: 'Select workspace view',
    description: 'Pure UI: switch one existing workspace view.',
    inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' } } },
    metadata: { targetRefs: ['element:*:workspace:*'] },
  };
  let actions = createWebMcpWindowRuntimeActions({
    windowLayoutInputSchema: { type: 'object', properties: { boardId: { type: 'string' }, layoutPreset: { type: 'string' } } },
    panelBehaviorSchema: { type: 'object', properties: { collapse: { type: 'string' } } },
    additionalActions: [workspaceAction],
  });
  let pack = createWebMcpWindowRuntimeActionPack({ additionalActions: [workspaceAction] });

  assert.deepEqual(actions.map((action) => action.id).slice(0, 4), [
    WEBMCP_WINDOW_LAYOUT_ACTION_ID,
    WEBMCP_WINDOW_ADD_PANEL_ACTION_ID,
    WEBMCP_WINDOW_REMOVE_PANEL_ACTION_ID,
    WEBMCP_PANEL_BEHAVIOR_ACTION_ID,
  ]);
  assert.ok(actions.some((action) => action.name === 'select_workspace_view'));
  assert.ok(pack.actionNames.includes('add_window_panel'));
  assert.ok(pack.actionIds.includes('select-workspace-view'));
  assert.ok(pack.safeActions.every((action) => action.safe));
  assert.deepEqual(pack.safeActions.find((action) => action.id === 'select-workspace-view').targetRefs, ['element:*:workspace:*']);
});

test('WebMCP presentation controller drives native component adapters', () => {
  let selectedWindow = '';
  let clickedTab = false;
  let tabControl = {
    $: { id: 'release-board' },
    click() { clickedTab = true; },
  };
  let shell = {
    querySelector(selector) {
      assert.equal(selector, 'project-tabs');
      return {
        querySelectorAll(query) {
          assert.equal(query, 'project-tab-item');
          return [tabControl];
        },
      };
    },
    selectGroup(id) {
      selectedWindow = id;
      return true;
    },
  };
  let collapseNode = {
    collapsed: false,
    clickCount: 0,
    hasAttribute(name) { return name === 'collapsed' && this.collapsed; },
    querySelector(selector) {
      assert.equal(selector, '.collapse-btn:not([hidden])');
      return {
        click: () => {
          this.clickCount += 1;
          this.collapsed = true;
        },
      };
    },
    dispatchEvent(event) {
      if (event.type === 'panel-collapse-toggle') this.collapsed = event.detail.collapsed;
    },
  };
  let tableSelectEvent = null;
  let tableSelected = [];
  let rowClicks = 0;
  let row = {
    dataset: { rowId: 'WO-1' },
    click() { rowClicks += 1; },
    querySelector() { return null; },
  };
  let table = {
    get selectedRowIds() { return tableSelected; },
    set selectedRowIds(value) { tableSelected = value; },
    getData() { return { rows: [{ id: 'WO-1', cells: {} }] }; },
    querySelector(selector) {
      assert.equal(selector, 'tr[data-row-id="WO-1"]');
      return row;
    },
    dispatchEvent(event) { tableSelectEvent = event; },
  };
  let panelEl = {
    querySelector(selector) {
      if (selector === 'sn-data-table') return table;
      return null;
    },
    closest(selector) {
      return selector === 'layout-node' ? collapseNode : null;
    },
  };
  let layout = {
    querySelector(selector) {
      return selector === '[data-panel-id="queue"]' ? panelEl : null;
    },
  };
  let controller = createWebMcpPresentationController({
    shell,
    windows: [{ id: 'release-board', layout }],
    selectWindow(id) {
      selectedWindow = id;
      return true;
    },
  });

  assert.deepEqual(
    controller.selectWindow({ boardId: 'release-board' }),
    { ok: true, windowId: 'release-board', visual: true, resolved: null },
  );
  assert.equal(clickedTab, true);
  assert.equal(selectedWindow, 'release-board');

  let collapsed = controller.setPanelCollapsed({ boardId: 'release-board', panelId: 'queue', collapsed: true });
  assert.equal(collapsed.ok, true);
  assert.equal(collapsed.collapsed, true);
  assert.equal(collapsed.visual, true);
  assert.equal(collapseNode.collapsed, true);
  assert.equal(collapseNode.clickCount, 1);

  collapseNode.collapsed = false;
  let silentCollapsed = controller.setPanelCollapsed({ boardId: 'release-board', panelId: 'queue', collapsed: true, visual: false });
  assert.equal(silentCollapsed.ok, true);
  assert.equal(silentCollapsed.visual, false);
  assert.equal(collapseNode.collapsed, true);
  assert.equal(collapseNode.clickCount, 1);

  collapseNode.collapsed = false;
  let tourCollapsed = controller.setPanelCollapsed({ boardId: 'release-board', panelId: 'queue', collapsed: true, visual: false, source: 'tour-webmcp' });
  assert.equal(tourCollapsed.ok, true);
  assert.equal(tourCollapsed.visual, true);
  assert.equal(collapseNode.collapsed, true);
  assert.equal(collapseNode.clickCount, 2);

  let selectedRow = controller.selectDataTableRow({ boardId: 'release-board', panelId: 'queue', rowId: 'WO-1', visual: false });
  assert.equal(selectedRow.ok, true);
  assert.deepEqual(tableSelected, ['WO-1']);
  assert.equal(tableSelectEvent.type, 'sn-data-table-select');
  assert.equal(tableSelectEvent.detail.rowId, 'WO-1');

  tableSelectEvent = null;
  let selectedAgain = controller.selectDataTableRow({ boardId: 'release-board', panelId: 'queue', rowId: 'WO-1' });
  assert.equal(selectedAgain.ok, true);
  assert.equal(selectedAgain.changed, false);
  assert.equal(selectedAgain.visual, true);
  assert.equal(rowClicks, 1);
  assert.equal(tableSelectEvent, null);
});

test('WebMCP presentation window selection settles before a slow visual cursor finishes', () => {
  let selectedWindow = '';
  let selectedCount = 0;
  let gestureSettled = null;
  let clickedControl = null;
  let tabControl = { $: { id: 'release-board' } };
  let shell = {
    querySelector(selector) {
      assert.equal(selector, 'project-tabs');
      return {
        querySelectorAll(query) {
          assert.equal(query, 'project-tab-item');
          return [tabControl];
        },
      };
    },
  };
  let controller = createWebMcpPresentationController({
    shell,
    cursor: {
      clickElement(el, opts) {
        clickedControl = el;
        gestureSettled = opts.onGestureSettled;
      },
    },
    selectWindow(id) {
      selectedWindow = id;
      selectedCount += 1;
      return true;
    },
  });
  let settledCount = 0;

  let selected = controller.selectWindow({ boardId: 'release-board', onSettled: () => { settledCount += 1; } });

  assert.equal(selected.ok, true);
  assert.equal(selected.visual, true);
  assert.equal(clickedControl, tabControl);
  assert.equal(selectedWindow, 'release-board');
  assert.equal(selectedCount, 1);
  assert.equal(settledCount, 1);

  gestureSettled();

  assert.equal(selectedCount, 1);
  assert.equal(settledCount, 1);
});

test('WebMCP tour prompt is authored from browser context and safe actions', () => {
  let prompt = buildWebMcpTourPrompt({
    title: 'Release workspace',
    language: 'Russian',
    targets: [
      {
        id: 'window:release-board',
        kind: 'window',
        title: 'Release Board',
        summary: 'Cards grouped by approval state.',
        resourceType: 'kanban',
        windowRole: 'primary',
      },
      {
        id: 'element:release-board:publish-pages:0',
        kind: 'detail',
        title: 'Publish card',
        summary: 'Selected release task card.',
      },
    ],
  });

  assert.match(prompt, /WebMCP context/);
  assert.match(prompt, /window:release-board/);
  assert.match(prompt, /element:release-board:publish-pages:0/);
  assert.match(prompt, /Allowed tools only/);
  assert.match(prompt, /select_window/);
  assert.match(prompt, /set_panel_collapsed/);
  assert.match(prompt, /Do NOT say undefined, null, NaN/);
  assert.match(prompt, /Do NOT use words about position/);
  assert.match(prompt, /Choose the number of turns from the user task and grounded UI actions/);
  assert.doesNotMatch(prompt, /5-8 turns/);
  assert.match(prompt, /Use guide as the single narrator/);
  assert.doesNotMatch(prompt, /In cue use ONLY these panelId values/);
  assert.doesNotMatch(prompt, /"cue":\{"panelId"/);
});

test('WebMCP tour prompt carries task scope and turn budget when provided', () => {
  let prompt = buildWebMcpTourPrompt({
    title: 'Release workspace',
    language: 'English',
    taskText: 'Show the publish flow for the release board',
    profile: 'full',
    speakerMode: 'dialogue',
    turnBudget: { min: 8, max: 12 },
    requestedSurfaceIds: ['window:release-board'],
    selectedTabIds: ['release-board'],
    targets: [
      {
        id: 'window:release-board',
        kind: 'window',
        title: 'Release Board',
        summary: 'Cards grouped by approval state.',
      },
    ],
  });

  assert.match(prompt, /User task: "Show the publish flow for the release board"/);
  assert.match(prompt, /Presentation profile: "full"/);
  assert.match(prompt, /Requested targetIds to cover when possible: window:release-board/);
  assert.match(prompt, /Requested tab\/window ids to include: release-board/);
  assert.match(prompt, /Rules: Use 8-12 turns because the request explicitly sets that budget/);
  assert.match(prompt, /Both selected voices must contribute/);
  assert.match(prompt, /do not force alternation, reply pairs, an opening, a closing/);
});

test('WebMCP tour timeline coercion validates targets annotations and safe actions', () => {
  let payload = coerceWebMcpTourTimelinePayload(`
    Intro text ignored.
    \`\`\`json
    {
      "turns": [
        {
          "persona": "ops",
          "text": "This undefined release card is ready.",
          "cue": { "targetId": "element:release-board:publish-pages:0" },
          "annotations": [
            { "kind": "symbol", "symbol": "check", "intent": "success", "placement": "corner" },
            { "targetId": "window:release-board", "marker": "box" },
            { "targetId": "element:missing", "marker": "box" }
          ],
          "webmcp": {
            "tool": "mark_ui",
            "input": {
              "targetId": "element:release-board:publish-pages:0",
              "marker": "underline",
              "intent": "detail"
            }
          }
        },
        {
          "persona": "guide",
          "text": "Now open the board.",
          "cue": { "targetId": "window:release-board" },
          "marker": "box",
          "webmcp": {
            "tool": "select_window",
            "input": { "targetId": "window:release-board" }
          }
        },
        {
          "persona": "guide",
          "text": "This turn is invalid.",
          "cue": { "targetId": "element:missing" },
          "webmcp": { "tool": "dangerous", "input": {} }
        }
      ]
    }
    \`\`\`
  `, {
    runtimeTargets: [
      { id: 'window:release-board', kind: 'window' },
      { id: 'element:release-board:publish-pages:0', kind: 'detail', annotation: true },
    ],
    allowedToolNames: ['mark_ui', 'select_window'],
  });

  assert.equal(payload.turns.length, 2);
  assert.equal(payload.turns[0].persona, 'ops');
  assert.equal(payload.turns[0].text, 'This release card is ready.');
  assert.deepEqual(payload.turns[0].cue, { targetId: 'element:release-board:publish-pages:0' });
  assert.equal(payload.turns[0].annotations.length, 2);
  assert.deepEqual(payload.turns[0].annotations[0], {
    targetId: 'element:release-board:publish-pages:0',
    kind: 'symbol',
    intent: 'success',
    symbol: 'check',
    placement: 'corner',
  });
  assert.deepEqual(payload.turns[0].webmcp, {
    tool: 'annotate_ui',
    input: {
      targetId: 'element:release-board:publish-pages:0',
      kind: 'marker',
      intent: 'detail',
      marker: 'underline',
      placement: 'over',
    },
  });
  assert.deepEqual(payload.turns[1].webmcp, {
    tool: 'select_window',
    input: { targetId: 'window:release-board' },
  });
  assert.equal(payload.turns[1].annotations, undefined);
  assert.equal(payload.turns.find((turn) => turn.text === 'This turn is invalid.'), undefined);
});

test('product context schema is published through the UI schema catalog', async () => {
  let diskSchema = JSON.parse(await readFile(new URL('../schemas/product-context-v1.json', import.meta.url), 'utf8'));
  let schema = getUiSchema('product-context-v1');
  let context = createProductRuntimeContext(sampleProductContext(), sampleRuntimeContext());

  assert.ok(listUiSchemaVersions().includes('product-context-v1'));
  assert.deepEqual(schema, diskSchema);
  assert.equal(schema.$id, 'https://rnd-pro.github.io/symbiote-ui/schemas/product-context-v1.json');
  assert.equal(schema.properties.product.$ref, '#/$defs/product');
  assert.equal(schema.properties.componentRefs.items.$ref, '#/$defs/componentRef');
  assert.equal(schema.properties.actions.items.$ref, '#/$defs/action');
  assert.equal(schema.properties.runtime.$ref, '#/$defs/runtime');
  assert.equal(schema.$defs.componentRef.properties.capabilities.$ref, '#/$defs/idArray');
  assert.equal(schema.$defs.runtime.properties.windows.items.$ref, '#/$defs/runtimeItem');
  assert.equal(schema.$defs.runtime.properties.enrichment.items.$ref, '#/$defs/runtimeEnrichment');
  assert.equal(schema.$defs.runtime.properties.hooks.items.$ref, '#/$defs/runtimeHook');
  assert.equal(schema.$defs.runtimeItem.properties.target.$ref, '#/$defs/runtimeTarget');
  assertSchemaValid(context, diskSchema);
});
