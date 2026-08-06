import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createXRPortablePanelStore,
  verifyXRPortablePanelReceipt,
  verifyXRPortablePanelStateSnapshot
} from '../xr/portable-panel-state.js';

const mockContext = {
  sessionId: 'test-session',
  startFrameId: 'frame-1',
  endFrameId: 'frame-2',
  inputSourceId: 'controller-left',
  inputKind: 'controller',
  handedness: 'left',
  profiles: ['generic-trigger'],
  timestamp: 123456789
};

test('createXRPortablePanelStore initialization and validation', () => {
  const initialPanels = [
    {
      id: 'panel-1',
      canonical: {
        position: [0, 1.5, -1],
        quaternion: [0, 0, 0, 1],
        size: [0.8, 0.6]
      },
      current: {
        position: [0, 1.5, -1],
        quaternion: [0, 0, 0, 1],
        size: [0.8, 0.6]
      },
      portable: true,
      pinned: false,
      focused: false,
      revision: 0,
      sourceMetadata: { name: 'Main Panel' }
    },
    {
      id: 'panel-2',
      canonical: {
        position: [1, 1.5, -1],
        quaternion: [0, 0, 0, 1],
        size: [0.4, 0.3]
      },
      current: {
        position: [1, 1.5, -1],
        quaternion: [0, 0, 0, 1],
        size: [0.4, 0.3]
      },
      portable: false, // non-portable
      pinned: false,
      focused: false,
      revision: 0,
      sourceMetadata: {}
    }
  ];

  const store = createXRPortablePanelStore(initialPanels);
  const state = store.serialize();

  assert.equal(state.version, 'xr-portable-panel-state-v1');
  assert.equal(state.panels.length, 2);
  const p1 = state.panels.find(p => p.id === 'panel-1');
  assert.ok(p1);
  assert.equal(p1.portable, true);
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(p1));
  assert.ok(Object.isFrozen(p1.canonical));
  assert.ok(Object.isFrozen(p1.current));

  const validation = verifyXRPortablePanelStateSnapshot(state);
  assert.ok(validation.ok, validation.reasons.join(', '));
});

test('store operations: focus, pin toggle, reset', () => {
  const store = createXRPortablePanelStore([
    {
      id: 'p1',
      canonical: {
        position: [0, 1.5, -1],
        quaternion: [0, 0, 0, 1],
        size: [0.8, 0.6]
      },
      current: {
        position: [0, 1.5, -1],
        quaternion: [0, 0, 0, 1],
        size: [0.8, 0.6]
      },
      portable: true,
      pinned: false,
      focused: false,
      revision: 1,
      sourceMetadata: {}
    }
  ]);

  // Focus operation
  let receipt = store.focus('p1', mockContext);
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.action, 'focus');
  assert.equal(receipt.panelId, 'p1');
  assert.equal(store.serialize().panels.find(p => p.id === 'p1').focused, true);
  assert.ok(Object.isFrozen(receipt));

  let validation = verifyXRPortablePanelReceipt(receipt);
  assert.ok(validation.ok, validation.reasons.join(', '));

  // Pin toggle operation
  receipt = store.togglePin('p1', mockContext);
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.action, 'pin');
  assert.equal(store.serialize().panels.find(p => p.id === 'p1').pinned, true);

  validation = verifyXRPortablePanelReceipt(receipt);
  assert.ok(validation.ok, validation.reasons.join(', '));

  // Focus change with non-existent panel throws
  assert.throws(() => {
    store.focus('non-existent', mockContext);
  });
});

test('store operations: move and resize settlement', () => {
  const store = createXRPortablePanelStore([
    {
      id: 'p-portable',
      canonical: {
        position: [0, 1.5, -1],
        quaternion: [0, 0, 0, 1],
        size: [0.8, 0.6]
      },
      current: {
        position: [0, 1.5, -1],
        quaternion: [0, 0, 0, 1],
        size: [0.8, 0.6]
      },
      portable: true,
      pinned: false,
      focused: false,
      revision: 0,
      sourceMetadata: {}
    },
    {
      id: 'p-pinned',
      canonical: {
        position: [1, 1.5, -1],
        quaternion: [0, 0, 0, 1],
        size: [0.8, 0.6]
      },
      current: {
        position: [1, 1.5, -1],
        quaternion: [0, 0, 0, 1],
        size: [0.8, 0.6]
      },
      portable: true,
      pinned: true,
      focused: false,
      revision: 0,
      sourceMetadata: {}
    },
    {
      id: 'p-non-portable',
      canonical: {
        position: [2, 1.5, -1],
        quaternion: [0, 0, 0, 1],
        size: [0.8, 0.6]
      },
      current: {
        position: [2, 1.5, -1],
        quaternion: [0, 0, 0, 1],
        size: [0.8, 0.6]
      },
      portable: false,
      pinned: false,
      focused: false,
      revision: 0,
      sourceMetadata: {}
    }
  ]);

  // Valid move on portable unpinned panel
  let receipt = store.settleMove('p-portable', [0.1, 1.6, -1.1], [0, 0.1, 0, 0.995], mockContext);
  assert.equal(receipt.accepted, true, receipt.reason);
  assert.deepEqual(store.serialize().panels.find(p => p.id === 'p-portable').current.position, [0.1, 1.6, -1.1]);
  assert.equal(store.serialize().panels.find(p => p.id === 'p-portable').revision, 1);

  let validation = verifyXRPortablePanelReceipt(receipt);
  assert.ok(validation.ok, validation.reasons.join(', '));

  // Invalid move: pinned panel emits rejected receipt with identical before/after snapshots
  receipt = store.settleMove('p-pinned', [1.1, 1.6, -1.1], [0, 0, 0, 1], mockContext);
  assert.equal(receipt.accepted, false);
  assert.equal(receipt.reason, 'panel-pinned');
  assert.deepEqual(receipt.before, receipt.after);

  validation = verifyXRPortablePanelReceipt(receipt);
  assert.ok(validation.ok, validation.reasons.join(', '));

  // Invalid move: non-portable panel emits rejected receipt
  receipt = store.settleMove('p-non-portable', [2.1, 1.6, -1.1], [0, 0, 0, 1], mockContext);
  assert.equal(receipt.accepted, false);
  assert.equal(receipt.reason, 'panel-not-portable');
  assert.deepEqual(receipt.before, receipt.after);

  // Valid resize on portable unpinned panel
  receipt = store.settleResize('p-portable', [1.0, 0.7], mockContext);
  assert.equal(receipt.accepted, true);
  assert.deepEqual(store.serialize().panels.find(p => p.id === 'p-portable').current.size, [1.0, 0.7]);

  // Reset operation restores canonical pose and size, and sets pinned/focused false
  receipt = store.reset('p-portable', mockContext);
  assert.equal(receipt.accepted, true);
  const updated = store.serialize().panels.find(p => p.id === 'p-portable');
  assert.deepEqual(updated.current.position, [0, 1.5, -1]);
  assert.deepEqual(updated.current.size, [0.8, 0.6]);
  assert.equal(updated.pinned, false);
  assert.equal(updated.focused, false);
  assert.equal(updated.revision, 3); // revision incremented on reset
});

test('store restore and validation rules', () => {
  const store = createXRPortablePanelStore([
    {
      id: 'restored-1',
      canonical: {
        position: [0, 1, -1],
        quaternion: [0, 0, 0, 1],
        size: [0.5, 0.5]
      },
      current: {
        position: [0, 1, -1],
        quaternion: [0, 0, 0, 1],
        size: [0.5, 0.5]
      },
      portable: true,
      pinned: false,
      focused: false,
      revision: 0,
      sourceMetadata: {}
    }
  ]);

  const validSnapshot = {
    version: 'xr-portable-panel-state-v1',
    layoutRevision: 5,
    focusedPanelId: null,
    panels: [
      {
        id: 'restored-1',
        canonical: {
          position: [0, 1, -1],
          quaternion: [0, 0, 0, 1],
          size: [0.5, 0.5]
        },
        current: {
          position: [0, 1, -1],
          quaternion: [0, 0, 0, 1],
          size: [0.5, 0.5]
        },
        portable: true,
        pinned: false,
        focused: false,
        revision: 5,
        sourceMetadata: {}
      }
    ]
  };

  // Restore success
  assert.ok(store.restore(validSnapshot));
  assert.equal(store.serialize().panels[0].id, 'restored-1');

  // Restore failure: invalid schema version
  assert.throws(() => {
    store.restore({ version: 'invalid-version', panels: [] });
  });

  // Restore failure: duplicate IDs
  assert.throws(() => {
    store.restore({
      version: 'xr-portable-panel-state-v1',
      layoutRevision: 10,
      focusedPanelId: null,
      panels: [
        {
          id: 'dup',
          canonical: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], size: [1, 1] },
          current: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], size: [1, 1] },
          portable: true, pinned: false, focused: false, revision: 0, sourceMetadata: {}
        },
        {
          id: 'dup',
          canonical: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], size: [1, 1] },
          current: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], size: [1, 1] },
          portable: true, pinned: false, focused: false, revision: 0, sourceMetadata: {}
        }
      ]
    });
  });

  // Restore failure: non-finite values
  assert.throws(() => {
    store.restore({
      version: 'xr-portable-panel-state-v1',
      layoutRevision: 10,
      focusedPanelId: null,
      panels: [
        {
          id: 'restored-1',
          canonical: { position: [NaN, 0, 0], quaternion: [0, 0, 0, 1], size: [1, 1] },
          current: { position: [NaN, 0, 0], quaternion: [0, 0, 0, 1], size: [1, 1] },
          portable: true, pinned: false, focused: false, revision: 0, sourceMetadata: {}
        }
      ]
    });
  });

  // Restore failure: invalid quaternion magnitude
  assert.throws(() => {
    store.restore({
      version: 'xr-portable-panel-state-v1',
      layoutRevision: 10,
      focusedPanelId: null,
      panels: [
        {
          id: 'restored-1',
          canonical: { position: [0, 0, 0], quaternion: [0, 0, 0, 0], size: [1, 1] },
          current: { position: [0, 0, 0], quaternion: [0, 0, 0, 0], size: [1, 1] },
          portable: true, pinned: false, focused: false, revision: 0, sourceMetadata: {}
        }
      ]
    });
  });
});

test('store operations: close and restore visibility', () => {
  const panel = (id) => ({
    id,
    canonical: {
      position: [0, 1.5, -1],
      quaternion: [0, 0, 0, 1],
      size: [0.8, 0.6]
    },
    current: {
      position: [0, 1.5, -1],
      quaternion: [0, 0, 0, 1],
      size: [0.8, 0.6]
    },
    portable: true,
    pinned: false,
    focused: false,
    revision: 0,
    sourceMetadata: {}
  });

  const store = createXRPortablePanelStore([panel('p1')]);

  // Close: accepted receipt, hidden flag in after snapshot, revision bumped
  let receipt = store.setVisibility('p1', true, mockContext);
  assert.equal(receipt.accepted, true, receipt.reason);
  assert.equal(receipt.action, 'close');
  assert.equal(receipt.phase, 'applied');
  assert.equal(receipt.after.hidden, true);
  assert.equal(receipt.after.revision, receipt.before.revision + 1);
  assert.equal(receipt.layoutRevisionAfter, receipt.layoutRevisionBefore + 1);
  let validation = verifyXRPortablePanelReceipt(receipt);
  assert.ok(validation.ok, validation.reasons.join(', '));
  assert.equal(store.serialize().panels.find(p => p.id === 'p1').hidden, true);

  // Restore: accepted receipt, hidden flag cleared
  receipt = store.setVisibility('p1', false, mockContext);
  assert.equal(receipt.accepted, true, receipt.reason);
  assert.equal(receipt.action, 'restore');
  assert.equal(receipt.phase, 'applied');
  assert.equal(receipt.before.hidden, true);
  assert.equal(receipt.after.hidden, undefined);
  validation = verifyXRPortablePanelReceipt(receipt);
  assert.ok(validation.ok, validation.reasons.join(', '));
  assert.equal(store.serialize().panels.find(p => p.id === 'p1').hidden, undefined);

  // Validation failures throw instead of emitting receipts
  assert.throws(() => store.setVisibility('p1', 'yes', mockContext));
  assert.throws(() => store.setVisibility('missing', true, mockContext));
});

test('store close rejects panel-not-closable without mutating state', () => {
  const store = createXRPortablePanelStore([
    {
      id: 'fixed-panel',
      canonical: {
        position: [0, 1.5, -1],
        quaternion: [0, 0, 0, 1],
        size: [0.8, 0.6]
      },
      current: {
        position: [0, 1.5, -1],
        quaternion: [0, 0, 0, 1],
        size: [0.8, 0.6]
      },
      portable: true,
      pinned: false,
      focused: false,
      revision: 0,
      sourceMetadata: {}
    }
  ], {
    isPanelClosable: () => false
  });

  const receipt = store.setVisibility('fixed-panel', true, mockContext);
  assert.equal(receipt.accepted, false);
  assert.equal(receipt.action, 'close');
  assert.equal(receipt.phase, 'rejected');
  assert.equal(receipt.reason, 'panel-not-closable');
  assert.deepEqual(receipt.before, receipt.after);
  assert.equal(receipt.layoutRevisionAfter, receipt.layoutRevisionBefore);
  const validation = verifyXRPortablePanelReceipt(receipt);
  assert.ok(validation.ok, validation.reasons.join(', '));
  assert.equal(store.serialize().panels.find(p => p.id === 'fixed-panel').hidden, undefined);
});

test('hidden flag survives snapshot serialize/restore round-trip', () => {
  const panel = {
    id: 'p-roundtrip',
    canonical: {
      position: [0, 1.5, -1],
      quaternion: [0, 0, 0, 1],
      size: [0.8, 0.6]
    },
    current: {
      position: [0, 1.5, -1],
      quaternion: [0, 0, 0, 1],
      size: [0.8, 0.6]
    },
    portable: true,
    pinned: false,
    focused: false,
    revision: 0,
    sourceMetadata: {}
  };
  const store = createXRPortablePanelStore([structuredClone(panel)]);
  store.setVisibility('p-roundtrip', true, mockContext);

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.panels[0].hidden, true);
  const validation = verifyXRPortablePanelStateSnapshot(snapshot);
  assert.ok(validation.ok, validation.reasons.join(', '));

  const restored = createXRPortablePanelStore([structuredClone(panel)]);
  assert.ok(restored.restore(snapshot));
  assert.equal(restored.serialize().panels[0].hidden, true);

  // Snapshots and receipts without any hidden field (pre-close shape) still verify
  const legacyStore = createXRPortablePanelStore([structuredClone(panel)]);
  const legacySnapshot = legacyStore.getSnapshot();
  assert.equal('hidden' in legacySnapshot.panels[0], false);
  assert.ok(verifyXRPortablePanelStateSnapshot(legacySnapshot).ok);
  const legacyReceipt = legacyStore.focus('p-roundtrip', mockContext);
  assert.equal('hidden' in legacyReceipt.before, false);
  assert.ok(verifyXRPortablePanelReceipt(legacyReceipt).ok);

  // A non-boolean hidden value is rejected by both verifiers
  const badSnapshot = structuredClone(snapshot);
  badSnapshot.panels[0].hidden = 'yes';
  assert.equal(verifyXRPortablePanelStateSnapshot(badSnapshot).ok, false);
  const badReceipt = structuredClone(store.setVisibility('p-roundtrip', false, mockContext));
  badReceipt.before.hidden = 'yes';
  assert.equal(verifyXRPortablePanelReceipt(badReceipt).ok, false);
});
