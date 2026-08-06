import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';

import { createXRPanelHost } from '../xr/panel-host.js';
import { createXRHitMap } from '../xr/pointer.js';
import { createHitMapDescriptor } from './xr-spatial-fixtures.js';

function createHost() {
  let { window, document, customElements } = parseHTML('<html><body><div id="container"></div></body></html>');
  let host = createXRPanelHost({ document, globalThis: window, customElements });
  return { document, host };
}

function createPanel() {
  return {
    id: 'panel-1',
    component: 'div',
    position: [0, 1.2, -1.5],
    rotation: [0, 0, 0],
    size: [0.8, 0.45],
    contentHash: 'sha256:panel-content',
    revision: 7,
    hitMap: createXRHitMap(createHitMapDescriptor()),
  };
}

function pointerEvent(type, frame) {
  return {
    type,
    panelId: 'panel-1',
    source: 'xr-controller',
    sourceId: 'controller-right',
    sessionId: 'session-1',
    point: { x: 0.2, y: 0.2 },
    frame,
    buttons: { primary: true },
  };
}

test('panel host owns mounting and focus but exposes no spatial pose mutators', () => {
  let { document, host } = createHost();
  let panel = createPanel();
  let element = host.mountPanel(panel, document.getElementById('container'));
  assert.equal(element.dataset.xrPanelId, 'panel-1');
  assert.equal(host.getState().mounted, 1);
  assert.equal(host.movePanel, undefined);
  assert.equal(host.resizePanel, undefined);
  assert.equal(host.pinPanel, undefined);
  assert.equal(host.resetPanel, undefined);
  assert.equal(host.focusPanel('panel-1'), true);
  assert.equal(host.getState().activeFocusPanelId, 'panel-1');
  host.cleanup();
  assert.equal(host.getState().mounted, 0);
  assert.deepEqual(host.getState().pendingSelectionSourceIds, []);
});

test('panel action requires a fresh paired selectstart/selectend hit-map match', () => {
  let { document, host } = createHost();
  let element = host.mountPanel(createPanel(), document.getElementById('container'));
  let actions = [];
  element.addEventListener('xr-panel-action', (event) => actions.push(event.detail));

  let click = host.dispatchPointerEvent(pointerEvent('click', {
    id: 'session-1:1:10',
    sequence: 10,
    time: 100,
  }));
  assert.equal(click.ok, true);
  assert.equal(click.interaction, null);
  assert.equal(actions.length, 0, 'click alone cannot authorize an XR content action');

  let start = host.dispatchPointerEvent(pointerEvent('selectstart', {
    id: 'session-1:1:10',
    sequence: 10,
    time: 100,
  }));
  assert.equal(start.interaction.ok, true);
  assert.deepEqual(host.getState().pendingSelectionSourceIds, ['controller-right']);

  let end = host.dispatchPointerEvent(pointerEvent('selectend', {
    id: 'session-1:1:11',
    sequence: 11,
    time: 120,
  }));
  assert.equal(end.interaction.ok, true);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].targetId, 'replace-action');
  assert.equal(actions[0].action, 'replace');
  assert.equal(Object.isFrozen(actions[0].receipt), true);
  assert.deepEqual(host.getState().pendingSelectionSourceIds, []);

  host.dispatchPointerEvent(pointerEvent('selectstart', {
    id: 'session-1:1:12',
    sequence: 12,
    time: 130,
  }));
  let mismatch = host.dispatchPointerEvent(pointerEvent('selectend', {
    id: 'session-1:1:13',
    sequence: 13,
    time: 140,
  }), { revision: 8 });
  assert.equal(mismatch.interaction.ok, false);
  assert.equal(mismatch.interaction.reason, 'revision-mismatch');
  assert.equal(actions.length, 1);

  let stale = host.dispatchPointerEvent(pointerEvent('selectstart', {
    id: 'session-1:1:20',
    sequence: 20,
    time: 300,
  }));
  assert.equal(stale.interaction.ok, false);
  assert.equal(stale.interaction.reason, 'stale-hit-map');
  assert.equal(actions.length, 1);
  host.cleanup();
});
