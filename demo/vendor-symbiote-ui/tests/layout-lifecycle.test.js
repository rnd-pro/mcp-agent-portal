import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';

class TestCSSStyleSheet {
  replaceSync(text) {
    this.cssText = text;
  }
}

let layoutWindow = null;

function installLayoutDom() {
  if (!layoutWindow) {
    let { window } = parseHTML('<!doctype html><html><body></body></html>');
    layoutWindow = window;
    Object.assign(globalThis, {
      window,
      document: window.document,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      customElements: window.customElements,
      Node: window.Node,
      Event: window.Event,
      CustomEvent: window.CustomEvent,
      MutationObserver: window.MutationObserver,
      CSSStyleSheet: TestCSSStyleSheet,
      getComputedStyle: window.getComputedStyle || (() => ({ transitionDuration: '0s', animationDuration: '0s' })),
      requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
      cancelAnimationFrame: (id) => clearTimeout(id),
    });
    window.document.adoptedStyleSheets = [];
    return;
  }

  layoutWindow.document.body.innerHTML = '';
  layoutWindow.document.adoptedStyleSheets = [];
}

async function nextLayoutRenderTick() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function defineLayoutTestElement(tagName, lifecycle) {
  if (customElements.get(tagName)) return;
  customElements.define(tagName, class extends HTMLElement {
    connectedCallback() {
      lifecycle.connected += 1;
    }

    disconnectedCallback() {
      lifecycle.disconnected += 1;
      if (this._layoutSuspendReason !== 'layout-move') {
        lifecycle.teardown += 1;
      }
    }

    suspendLayout(context = {}) {
      lifecycle.suspended += 1;
      this._layoutSuspendReason = context.reason || 'layout-suspend';
    }

    resumeLayout() {
      lifecycle.resumed += 1;
      this._layoutSuspendReason = '';
    }
  });
}

test('layout lifecycle helpers suspend and resume reusable and host-owned subtree elements once', async () => {
  let { suspendLayoutSubtree, resumeLayoutSubtree } = await import('../layout/index.js');
  let { document } = parseHTML(`
    <section id="workspace">
      <agent-chat>
        <chat-workspace>
          <chat-composer></chat-composer>
          <cell-bg></cell-bg>
        </chat-workspace>
      </agent-chat>
    </section>
  `);
  let root = document.getElementById('workspace');
  let calls = [];
  for (let element of root.querySelectorAll('agent-chat, chat-workspace, chat-composer, cell-bg')) {
    element.suspendLayout = (context) => calls.push(['suspend', element.localName, context.reason]);
    element.resumeLayout = (context) => calls.push(['resume', element.localName, context.reason]);
  }

  assert.equal(suspendLayoutSubtree(root, { reason: 'workspace-inactive' }), 4);
  assert.deepEqual(calls, [
    ['suspend', 'agent-chat', 'workspace-inactive'],
    ['suspend', 'chat-workspace', 'workspace-inactive'],
    ['suspend', 'chat-composer', 'workspace-inactive'],
    ['suspend', 'cell-bg', 'workspace-inactive'],
  ]);
  for (let element of root.querySelectorAll('agent-chat, chat-workspace, chat-composer, cell-bg')) {
    assert.equal(element.hasAttribute('data-layout-suspended'), true);
  }

  calls = [];
  assert.equal(resumeLayoutSubtree(root, { reason: 'workspace-active' }), 4);
  assert.deepEqual(calls, [
    ['resume', 'agent-chat', 'workspace-active'],
    ['resume', 'chat-workspace', 'workspace-active'],
    ['resume', 'chat-composer', 'workspace-active'],
    ['resume', 'cell-bg', 'workspace-active'],
  ]);
  for (let element of root.querySelectorAll('agent-chat, chat-workspace, chat-composer, cell-bg')) {
    assert.equal(element.hasAttribute('data-layout-suspended'), false);
  }
});

test('node-canvas exposes reusable layout suspend and resume lifecycle', async () => {
  installLayoutDom();
  await import('../canvas/NodeCanvas/NodeCanvas.js');

  let element = document.createElement('node-canvas');
  element.ref = {
    quickToolbar: { hideCalls: 0, hide() { this.hideCalls += 1; } },
    contextMenu: {
      hidden: false,
      hideCalls: 0,
      hide() { this.hideCalls += 1; },
      setAttribute(name) {
        if (name === 'hidden') this.hidden = true;
      },
    },
  };
  let synced = 0;
  let refreshed = 0;
  element.syncPhantom = () => {
    synced += 1;
  };
  element.refreshConnections = () => {
    refreshed += 1;
  };

  element.suspendLayout({ reason: 'view-mode-hidden' });
  assert.equal(element._layoutSuspended, true);
  assert.equal(element.getAttribute('data-layout-suspended'), '');
  assert.equal(element.ref.quickToolbar.hideCalls, 1);
  assert.equal(element.ref.contextMenu.hideCalls, 1);

  element.resumeLayout({ reason: 'view-mode-active' });
  assert.equal(element._layoutSuspended, false);
  assert.equal(element.hasAttribute('data-layout-suspended'), false);
  assert.equal(synced, 1);
  assert.equal(refreshed, 1);
});

test('opening a UI panel preserves existing layout panel components by node id', async () => {
  installLayoutDom();
  let [{ createPanel, createSplit }] = await Promise.all([
    import('../layout/LayoutTree.js'),
    import('../layout/Layout/Layout.js'),
  ]);
  let graphLifecycle = { connected: 0, disconnected: 0, teardown: 0, suspended: 0, resumed: 0 };
  let contentLifecycle = { connected: 0, disconnected: 0, teardown: 0, suspended: 0, resumed: 0 };
  let materialsLifecycle = { connected: 0, disconnected: 0, teardown: 0, suspended: 0, resumed: 0 };
  let themeLifecycle = { connected: 0, disconnected: 0, teardown: 0, suspended: 0, resumed: 0 };

  defineLayoutTestElement('test-lifecycle-graph-panel', graphLifecycle);
  defineLayoutTestElement('test-lifecycle-content-panel', contentLifecycle);
  defineLayoutTestElement('test-lifecycle-materials-panel', materialsLifecycle);
  defineLayoutTestElement('test-lifecycle-theme-panel', themeLifecycle);

  let layout = document.createElement('panel-layout');
  document.body.append(layout);
  layout.registerPanelType('materials', { component: 'test-lifecycle-materials-panel' });
  layout.registerPanelType('graph', { component: 'test-lifecycle-graph-panel' });
  layout.registerPanelType('content', { component: 'test-lifecycle-content-panel' });
  layout.registerPanelType('theme', { component: 'test-lifecycle-theme-panel' });
  layout.setLayout(createSplit(
    'horizontal',
    createPanel('materials'),
    createSplit('horizontal', createPanel('graph'), createPanel('content'), 0.64),
    0.24
  ));
  await nextLayoutRenderTick();

  let graphPanel = layout.querySelector('test-lifecycle-graph-panel');
  let contentPanel = layout.querySelector('test-lifecycle-content-panel');
  assert.equal(graphLifecycle.connected, 1);
  assert.equal(contentLifecycle.connected, 1);

  layout.openPanel('theme', {
    direction: 'horizontal',
    ratio: 0.72,
    source: 'theme-widget',
    uiInvoked: true,
  });
  await nextLayoutRenderTick();

  assert.equal(graphLifecycle.teardown, 0);
  assert.equal(contentLifecycle.teardown, 0);
  assert.equal(graphLifecycle.suspended, 1);
  assert.equal(graphLifecycle.resumed, 1);
  assert.equal(contentLifecycle.suspended, 1);
  assert.equal(contentLifecycle.resumed, 1);
  assert.equal(layout.querySelector('test-lifecycle-graph-panel'), graphPanel);
  assert.equal(layout.querySelector('test-lifecycle-content-panel'), contentPanel);
  assert.equal(themeLifecycle.connected, 1);
});

test('joining panels promotes the surviving layout node without recreating its component', async () => {
  installLayoutDom();
  let [{ createPanel, createSplit }] = await Promise.all([
    import('../layout/LayoutTree.js'),
    import('../layout/Layout/Layout.js'),
  ]);
  let removedLifecycle = { connected: 0, disconnected: 0, teardown: 0, suspended: 0, resumed: 0 };
  let survivorLifecycle = { connected: 0, disconnected: 0, teardown: 0, suspended: 0, resumed: 0 };

  defineLayoutTestElement('test-join-removed-panel', removedLifecycle);
  defineLayoutTestElement('test-join-survivor-panel', survivorLifecycle);

  let removedPanel = createPanel('removed');
  let survivorPanel = createPanel('survivor');
  let layout = document.createElement('panel-layout');
  document.body.append(layout);
  layout.registerPanelType('removed', { component: 'test-join-removed-panel' });
  layout.registerPanelType('survivor', { component: 'test-join-survivor-panel' });
  layout.setLayout(createSplit('horizontal', removedPanel, survivorPanel, 0.5));
  await nextLayoutRenderTick();

  let survivorComponent = layout.querySelector('test-join-survivor-panel');
  assert.ok(survivorComponent, 'expected survivor panel component to mount');
  assert.equal(survivorLifecycle.connected, 1);

  layout.joinPanels(removedPanel.id);
  await nextLayoutRenderTick();

  assert.equal(layout.querySelector('test-join-survivor-panel'), survivorComponent);
  assert.equal(survivorLifecycle.teardown, 0);
  assert.equal(survivorLifecycle.suspended, 1);
  assert.equal(survivorLifecycle.resumed, 1);
  assert.equal(layout.querySelector('test-join-removed-panel'), null);
  assert.equal(layout.querySelector(':scope > * > layout-node')?.$.nodeId, survivorPanel.id);
  assert.equal(layout.getLayout().id, survivorPanel.id);
});

test('separate panel-layout roots expose collapse controls through a peer group', async () => {
  installLayoutDom();
  let [{ createPanel }] = await Promise.all([
    import('../layout/LayoutTree.js'),
    import('../layout/Layout/Layout.js'),
  ]);
  await import('../layout/LayoutNode/LayoutNode.js');

  let main = document.createElement('panel-layout');
  let chat = document.createElement('panel-layout');
  main.setAttribute('layout-peer-group', 'workspace');
  chat.setAttribute('layout-peer-group', 'workspace');
  main.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 420, right: 600, bottom: 420 });
  chat.getBoundingClientRect = () => ({ left: 608, top: 0, width: 320, height: 420, right: 928, bottom: 420 });

  document.body.append(main, chat);
  main.setLayout(createPanel('main', {}, { collapse: 'manual' }));
  chat.setLayout(createPanel('chat', {}, { collapse: 'manual' }));
  await nextLayoutRenderTick();
  await nextLayoutRenderTick();

  let mainNode = main.querySelector('layout-node[node-type="panel"]');
  let chatNode = chat.querySelector('layout-node[node-type="panel"]');
  assert.ok(mainNode);
  assert.ok(chatNode);
  assert.equal(main.hasAttribute('layout-peer-active'), true);
  assert.equal(chat.hasAttribute('layout-peer-active'), true);
  assert.equal(main.getAttribute('layout-peer-collapse-dir'), 'horizontal');
  assert.equal(main.getAttribute('layout-peer-collapse-side'), 'first');
  assert.equal(chat.getAttribute('layout-peer-collapse-side'), 'second');
  assert.equal(mainNode.$.canCollapse, true);
  assert.equal(chatNode.$.canCollapse, true);
  assert.equal(chatNode.$.collapseIcon, 'chevron_right');

  chatNode.querySelector('.collapse-btn')?.click();
  await nextLayoutRenderTick();
  chatNode = chat.querySelector('layout-node[node-type="panel"]');
  assert.equal(chat.hasAttribute('root-collapsed'), true);
  assert.equal(chat.getAttribute('root-collapse-dir'), 'horizontal');
  assert.equal(chat.getAttribute('root-collapse-side'), 'second');
  assert.equal(chatNode.hasAttribute('collapsed'), true);

  chat.remove();
  await nextLayoutRenderTick();
  await nextLayoutRenderTick();
  mainNode = main.querySelector('layout-node[node-type="panel"]');
  assert.equal(main.hasAttribute('layout-peer-active'), false);
  assert.equal(mainNode.$.canCollapse, false);
});

test('edge-collapse mode lets root rails sit flush on the outer edge', async () => {
  const [layoutCss, registry, customElements] = await Promise.all([
    readFile(new URL('../layout/Layout/Layout.css.js', import.meta.url), 'utf8'),
    readFile(new URL('../manifest/component-registry.js', import.meta.url), 'utf8'),
    readFile(new URL('../custom-elements.json', import.meta.url), 'utf8'),
  ]);

  assert.match(layoutCss, /\[edge-collapse\]\[root-collapsed\]\[root-collapse-dir='horizontal'\]\[root-collapse-side='first'\][\s\S]*padding-inline-start: 0/);
  assert.match(layoutCss, /\[edge-collapse\]\[root-collapsed\]\[root-collapse-dir='horizontal'\]\[root-collapse-side='second'\][\s\S]*padding-inline-end: 0/);
  assert.match(layoutCss, /\[edge-collapse\]\[root-collapsed\]\[root-collapse-dir='vertical'\]\[root-collapse-side='first'\][\s\S]*padding-block-start: 0/);
  assert.match(layoutCss, /\[edge-collapse\]\[root-collapsed\]\[root-collapse-dir='vertical'\]\[root-collapse-side='second'\][\s\S]*padding-block-end: 0/);
  assert.match(registry, /edge-collapse/);
  assert.match(customElements, /"name": "edge-collapse"/);
});

test('re-mounting the layout tree tears down replaced nodes without a stale panel-menu frame throwing', async () => {
  installLayoutDom();
  let [{ createPanel, createSplit }] = await Promise.all([
    import('../layout/LayoutTree.js'),
    import('../layout/Layout/Layout.js'),
  ]);
  await import('../layout/LayoutNode/LayoutNode.js');

  // Drive animation frames manually so a queued panel-menu-action sync can be
  // forced to fire *after* the replaced node is torn down, reproducing the race.
  let frameCallbacks = [];
  let originalRaf = globalThis.requestAnimationFrame;
  let originalCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => frameCallbacks.push(callback);
  globalThis.cancelAnimationFrame = (handle) => {
    if (handle) frameCallbacks[handle - 1] = null;
  };

  try {
    let layout = document.createElement('panel-layout');
    document.body.append(layout);
    layout.registerPanelType('alpha', {});
    layout.registerPanelType('beta', {});
    layout.setLayout(createSplit('horizontal', createPanel('alpha'), createPanel('beta')));
    await nextLayoutRenderTick();

    let staleNode = layout.querySelector('layout-node[node-type="panel"]');
    assert.ok(staleNode, 'expected a panel layout-node to mount');

    // Queue a panel-menu-action state sync for the node that is about to be replaced.
    let queuedBefore = frameCallbacks.length;
    staleNode.setPanelMenuActions([{ id: 'graph:focus', label: 'Focus' }]);
    assert.ok(frameCallbacks.length > queuedBefore, 'expected a panel-menu sync frame to be queued');

    // Replace the tree with fresh node ids, disconnecting the previous panels.
    layout.setLayout(createSplit('vertical', createPanel('beta'), createPanel('alpha')));
    await nextLayoutRenderTick();
    assert.equal(staleNode.isConnected, false, 'replaced node should be disconnected');

    // Let Symbiote's deferred teardown run: destroyCallback fires and the reactive
    // context is nulled, so `this.$` reads on the node become nullish.
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.equal(staleNode.$?.panelMenuActions ?? null, null, 'reactive context should be torn down');

    // Flushing every queued frame must not throw: the stale node's sync frame is the
    // one that previously crashed with `null is not an object (... panelMenuActions.map)`.
    let pending = frameCallbacks;
    frameCallbacks = [];
    assert.doesNotThrow(() => {
      for (let callback of pending) callback?.(0);
    }, 'pending animation frames should be safe to flush after teardown');

    // The state sync itself must also bail out defensively on a torn-down node.
    assert.doesNotThrow(() => staleNode._syncPanelMenuActionState());
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});
