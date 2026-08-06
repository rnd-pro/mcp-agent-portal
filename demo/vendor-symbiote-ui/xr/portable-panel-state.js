function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}


function validatePanelShape(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    throw new Error('Panel must be an object');
  }
  if ('position' in p || 'quaternion' in p || 'size' in p) {
    throw new Error('Flat legacy panel shapes are not supported. Use the canonical and current nested objects.');
  }
  // `hidden` is optional: absent is equivalent to false (pre-close receipts
  // and snapshots carry no visibility field).
  const panelKeys = ['id', 'canonical', 'current', 'portable', 'pinned', 'focused', 'revision', 'sourceMetadata', 'hidden'];
  for (const k of Object.keys(p)) {
    if (!panelKeys.includes(k)) {
      throw new Error(`Unexpected panel field: ${k}`);
    }
  }
  if ('hidden' in p && typeof p.hidden !== 'boolean') {
    throw new Error('Panel hidden must be a boolean when present');
  }
  if (typeof p.id !== 'string' || p.id.length === 0) {
    throw new Error('Panel id must be a non-empty string');
  }
  if (!p.canonical || typeof p.canonical !== 'object' || Array.isArray(p.canonical)) {
    throw new Error('Panel canonical must be a non-null object');
  }
  const subKeys = ['position', 'quaternion', 'size'];
  for (const k of Object.keys(p.canonical)) {
    if (!subKeys.includes(k)) {
      throw new Error(`Unexpected canonical field: ${k}`);
    }
  }
  if (!Array.isArray(p.canonical.position) || p.canonical.position.length !== 3 || p.canonical.position.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new Error('Panel canonical position must be an array of 3 finite numbers');
  }
  if (!Array.isArray(p.canonical.quaternion) || p.canonical.quaternion.length !== 4 || p.canonical.quaternion.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new Error('Panel canonical quaternion must be an array of 4 finite numbers');
  }
  const cqLenSq = p.canonical.quaternion.reduce((sum, v) => sum + v * v, 0);
  if (Math.abs(cqLenSq - 1) > 0.05) {
    throw new Error('Panel canonical quaternion must be normalized');
  }
  if (!Array.isArray(p.canonical.size) || p.canonical.size.length !== 2 || p.canonical.size.some(v => typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) {
    throw new Error('Panel canonical size must be an array of 2 positive numbers');
  }

  if (!p.current || typeof p.current !== 'object' || Array.isArray(p.current)) {
    throw new Error('Panel current must be a non-null object');
  }
  for (const k of Object.keys(p.current)) {
    if (!subKeys.includes(k)) {
      throw new Error(`Unexpected current field: ${k}`);
    }
  }
  if (!Array.isArray(p.current.position) || p.current.position.length !== 3 || p.current.position.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new Error('Panel current position must be an array of 3 finite numbers');
  }
  if (!Array.isArray(p.current.quaternion) || p.current.quaternion.length !== 4 || p.current.quaternion.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new Error('Panel current quaternion must be an array of 4 finite numbers');
  }
  const qLenSq = p.current.quaternion.reduce((sum, v) => sum + v * v, 0);
  if (Math.abs(qLenSq - 1) > 0.05) {
    throw new Error('Panel current quaternion must be normalized');
  }
  if (!Array.isArray(p.current.size) || p.current.size.length !== 2 || p.current.size.some(v => typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) {
    throw new Error('Panel current size must be an array of 2 positive numbers');
  }

  if (typeof p.portable !== 'boolean') {
    throw new Error('Panel portable must be a boolean');
  }
  if (typeof p.pinned !== 'boolean') {
    throw new Error('Panel pinned must be a boolean');
  }
  if (typeof p.focused !== 'boolean') {
    throw new Error('Panel focused must be a boolean');
  }
  if (typeof p.revision !== 'number' || !Number.isInteger(p.revision) || p.revision < 0) {
    throw new Error('Panel revision must be a non-negative integer');
  }
  if (!p.sourceMetadata || typeof p.sourceMetadata !== 'object' || Array.isArray(p.sourceMetadata)) {
    throw new Error('Panel sourceMetadata must be a non-array object');
  }
}

function validateContext(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('Context must be an object');
  }
  if (typeof context.sessionId !== 'string' || context.sessionId.trim().length === 0) {
    throw new Error('Context sessionId must be a non-empty string');
  }
  if (typeof context.startFrameId !== 'string' || context.startFrameId.trim().length === 0) {
    throw new Error('Context startFrameId must be a non-empty string');
  }
  if (typeof context.endFrameId !== 'string' || context.endFrameId.trim().length === 0) {
    throw new Error('Context endFrameId must be a non-empty string');
  }
  if (typeof context.inputSourceId !== 'string' || context.inputSourceId.trim().length === 0) {
    throw new Error('Context inputSourceId must be a non-empty string');
  }
  if (!['controller', 'hand'].includes(context.inputKind)) {
    throw new Error('Context inputKind must be controller or hand');
  }
  if (!['left', 'right', 'none'].includes(context.handedness)) {
    throw new Error('Context handedness must be left, right, or none');
  }
  if (!Array.isArray(context.profiles) || context.profiles.some(p => typeof p !== 'string' || p.trim().length === 0)) {
    throw new Error('Context profiles must be an array of non-empty strings');
  }
  if (typeof context.timestamp !== 'number' || !Number.isFinite(context.timestamp)) {
    throw new Error('Context timestamp must be a finite number');
  }
}

function getPanelSnapshot(p) {
  if (!p) return null;
  let snapshot = {
    id: p.id,
    canonical: structuredClone(p.canonical),
    current: structuredClone(p.current),
    portable: p.portable,
    pinned: p.pinned,
    focused: p.focused,
    revision: p.revision,
    sourceMetadata: structuredClone(p.sourceMetadata)
  };
  // Sparse on purpose: absent ≡ false, so pre-close consumers that pin the
  // exact snapshot key list keep validating.
  if (p.hidden === true) {
    snapshot.hidden = true;
  }
  return snapshot;
}

export function createXRPortablePanelStore(initialPanels = [], storeOptions = {}) {
  const panels = new Map();
  const canonicals = new Map();
  const receipts = [];
  let sequence = 1;
  let layoutRevision = 0;
  let focusedPanelId = null;

  // Initialize
  for (const p of initialPanels) {
    const normalized = structuredClone(p);
    if (panels.has(normalized.id)) {
      throw new Error(`Duplicate panel id: ${normalized.id}`);
    }
    validatePanelShape(normalized);
    if (normalized.focused) {
      if (focusedPanelId !== null) {
        throw new Error('Multiple focused panels detected');
      }
      focusedPanelId = normalized.id;
    }
    panels.set(normalized.id, normalized);
    canonicals.set(normalized.id, structuredClone(normalized.canonical));
  }

  function makeReceipt(action, panelId, accepted, reason, before, after, ctx) {
    const rSeq = sequence++;
    const phase = accepted ? (['move', 'resize'].includes(action) ? 'settled' : 'applied') : 'rejected';
    const layoutRevisionBefore = layoutRevision;
    if (accepted) {
      layoutRevision++;
    }
    const layoutRevisionAfter = layoutRevision;

    const receipt = {
      version: 'xr-portable-panel-receipt-v1',
      receiptId: `${ctx.sessionId}:${ctx.endFrameId}:${ctx.inputSourceId}:portable:${rSeq}`,
      sequence: rSeq,
      action,
      phase,
      panelId,
      accepted,
      reason: accepted ? null : (reason || 'unknown-error'),
      sessionId: ctx.sessionId,
      startFrameId: ctx.startFrameId,
      endFrameId: ctx.endFrameId,
      timestamp: ctx.timestamp,
      inputSourceId: ctx.inputSourceId,
      inputKind: ctx.inputKind,
      handedness: ctx.handedness,
      profiles: [...ctx.profiles],
      layoutRevisionBefore,
      layoutRevisionAfter,
      before: before ? getPanelSnapshot(before) : null,
      after: after ? getPanelSnapshot(after) : null
    };

    const frozenReceipt = deepFreeze(receipt);
    receipts.push(frozenReceipt);
    if (typeof storeOptions.onReceipt === 'function') {
      storeOptions.onReceipt(frozenReceipt);
    }
    return frozenReceipt;
  }

  const store = {
    focus(panelId, context = {}) {
      validateContext(context);
      if (typeof panelId !== 'string' || panelId.length === 0) {
        throw new Error('panelId must be a non-empty string');
      }
      const p = panels.get(panelId);
      if (!p) {
        throw new Error(`Panel with ID ${panelId} not found`);
      }
      const before = structuredClone(p);

      // Unfocus other panels
      for (const other of panels.values()) {
        if (other.id !== panelId && other.focused) {
          other.focused = false;
          other.revision++;
        }
      }
      p.focused = true;
      p.revision++;
      focusedPanelId = panelId;
      return makeReceipt('focus', panelId, true, null, before, p, context);
    },

    togglePin(panelId, context = {}) {
      validateContext(context);
      if (typeof panelId !== 'string' || panelId.length === 0) {
        throw new Error('panelId must be a non-empty string');
      }
      const p = panels.get(panelId);
      if (!p) {
        throw new Error(`Panel with ID ${panelId} not found`);
      }
      const before = structuredClone(p);
      p.pinned = !p.pinned;
      p.revision++;
      return makeReceipt('pin', panelId, true, null, before, p, context);
    },

    setVisibility(panelId, hidden, context = {}) {
      validateContext(context);
      if (typeof panelId !== 'string' || panelId.length === 0) {
        throw new Error('panelId must be a non-empty string');
      }
      if (typeof hidden !== 'boolean') {
        throw new Error('hidden must be a boolean');
      }
      const p = panels.get(panelId);
      if (!p) {
        throw new Error(`Panel with ID ${panelId} not found`);
      }
      const before = structuredClone(p);
      // Closability is a descriptor-level flag (kept out of the panel shape),
      // so the store consults the host-provided resolver; absent = closable.
      if (hidden === true && typeof storeOptions.isPanelClosable === 'function'
          && storeOptions.isPanelClosable(panelId) === false) {
        return makeReceipt('close', panelId, false, 'panel-not-closable', before, before, context);
      }
      p.hidden = hidden;
      p.revision++;
      return makeReceipt(hidden ? 'close' : 'restore', panelId, true, null, before, p, context);
    },

    reset(panelId, context = {}) {
      validateContext(context);
      if (typeof panelId !== 'string' || panelId.length === 0) {
        throw new Error('panelId must be a non-empty string');
      }
      const p = panels.get(panelId);
      if (!p) {
        throw new Error(`Panel with ID ${panelId} not found`);
      }
      const canonical = canonicals.get(panelId);
      if (!canonical) {
        throw new Error(`Canonical for panel ${panelId} not found`);
      }
      const before = structuredClone(p);
      p.current.position = [...canonical.position];
      p.current.quaternion = [...canonical.quaternion];
      p.current.size = [...canonical.size];
      p.pinned = false;
      p.focused = false;
      p.revision++;
      if (focusedPanelId === panelId) {
        focusedPanelId = null;
      }
      return makeReceipt('reset', panelId, true, null, before, p, context);
    },

    settleMove(panelId, position, quaternion, context = {}) {
      validateContext(context);
      if (typeof panelId !== 'string' || panelId.length === 0) {
        throw new Error('panelId must be a non-empty string');
      }
      const p = panels.get(panelId);
      if (!p) {
        throw new Error(`Panel with ID ${panelId} not found`);
      }

      if (!Array.isArray(position) || position.length !== 3 || position.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        throw new Error('Panel position must be an array of 3 finite numbers');
      }
      if (!Array.isArray(quaternion) || quaternion.length !== 4 || quaternion.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        throw new Error('Panel quaternion must be an array of 4 finite numbers');
      }
      const qLenSq = quaternion.reduce((sum, v) => sum + v * v, 0);
      if (Math.abs(qLenSq - 1) > 0.05) {
        throw new Error('Panel quaternion must be normalized');
      }

      const before = structuredClone(p);

      if (!p.portable) {
        return makeReceipt('move', panelId, false, 'panel-not-portable', before, before, context);
      }
      if (p.pinned) {
        return makeReceipt('move', panelId, false, 'panel-pinned', before, before, context);
      }

      p.current.position = [...position];
      p.current.quaternion = [...quaternion];
      p.revision++;
      return makeReceipt('move', panelId, true, null, before, p, context);
    },

    settleResize(panelId, size, context = {}) {
      validateContext(context);
      if (typeof panelId !== 'string' || panelId.length === 0) {
        throw new Error('panelId must be a non-empty string');
      }
      const p = panels.get(panelId);
      if (!p) {
        throw new Error(`Panel with ID ${panelId} not found`);
      }

      if (!Array.isArray(size) || size.length !== 2 || size.some(v => typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) {
        throw new Error('Panel size must be an array of 2 positive numbers');
      }

      const before = structuredClone(p);

      if (!p.portable) {
        return makeReceipt('resize', panelId, false, 'panel-not-portable', before, before, context);
      }
      if (p.pinned) {
        return makeReceipt('resize', panelId, false, 'panel-pinned', before, before, context);
      }

      p.current.size = [...size];
      p.revision++;
      return makeReceipt('resize', panelId, true, null, before, p, context);
    },

    getSnapshot() {
      const sortedPanels = Array.from(panels.values())
        .map(p => getPanelSnapshot(p))
        .sort((a, b) => {
          if (a.id < b.id) return -1;
          if (a.id > b.id) return 1;
          return 0;
        });
      const snapshot = {
        version: 'xr-portable-panel-state-v1',
        layoutRevision,
        focusedPanelId,
        panels: sortedPanels
      };
      return deepFreeze(snapshot);
    },

    getReceipts() {
      return deepFreeze([...receipts]);
    },

    serialize() {
      return store.getSnapshot();
    },

    restore(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') {
        throw new Error('Snapshot must be an object');
      }
      if (snapshot.version !== 'xr-portable-panel-state-v1') {
        throw new Error('Invalid snapshot version');
      }
      if (!Array.isArray(snapshot.panels)) {
        throw new Error('Snapshot panels must be an array');
      }
      if (typeof snapshot.layoutRevision !== 'number' || !Number.isInteger(snapshot.layoutRevision) || snapshot.layoutRevision < 0) {
        throw new Error('Invalid layoutRevision');
      }
      if (snapshot.layoutRevision < layoutRevision) {
        throw new Error('Stale layout revision');
      }

      const seenIds = new Set();
      let restoredFocusedId = null;
      let restoredFocusedCount = 0;

      for (const p of snapshot.panels) {
        validatePanelShape(p);
        if (seenIds.has(p.id)) {
          throw new Error(`Duplicate panel id: ${p.id}`);
        }
        seenIds.add(p.id);

        const current = panels.get(p.id);
        if (!current) {
          throw new Error(`Unknown panel ID: ${p.id}`);
        }
        if (p.revision < current.revision) {
          throw new Error(`Stale panel revision for panel: ${p.id}`);
        }
        if (!deepEqual(p.canonical, current.canonical)) {
          throw new Error(`Canonical changes not allowed for panel: ${p.id}`);
        }
        if (!deepEqual(p.sourceMetadata, current.sourceMetadata)) {
          throw new Error(`Source metadata changes not allowed for panel: ${p.id}`);
        }
        if (p.focused) {
          restoredFocusedCount++;
          restoredFocusedId = p.id;
        }
      }

      for (const currentId of panels.keys()) {
        if (!seenIds.has(currentId)) {
          throw new Error(`Missing panel ID: ${currentId}`);
        }
      }

      if (snapshot.focusedPanelId !== restoredFocusedId) {
        throw new Error('Focus coherence error');
      }
      if (restoredFocusedCount > 1) {
        throw new Error('Multiple focused panels');
      }
      if (restoredFocusedId !== null && restoredFocusedCount === 0) {
        throw new Error('Focus coherence error: focusedPanelId is set but no panel is focused');
      }
      if (restoredFocusedId === null && restoredFocusedCount > 0) {
        throw new Error('Focus coherence error: panels have focus but focusedPanelId is null');
      }

      panels.clear();
      layoutRevision = snapshot.layoutRevision;
      focusedPanelId = snapshot.focusedPanelId;

      for (const p of snapshot.panels) {
        panels.set(p.id, structuredClone(p));
        if (!canonicals.has(p.id)) {
          canonicals.set(p.id, structuredClone(p.canonical));
        }
      }
      return true;
    }
  };

  return store;
}

export function verifyXRPortablePanelReceipt(receipt) {
  const reasons = [];

  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return deepFreeze({ ok: false, reasons: ['Receipt must be an object'] });
  }

  // 1. Check strict keys presence
  const requiredKeys = [
    'version', 'receiptId', 'sequence', 'action', 'phase', 'panelId', 'accepted',
    'reason', 'sessionId', 'startFrameId', 'endFrameId', 'timestamp', 'inputSourceId',
    'inputKind', 'handedness', 'profiles', 'layoutRevisionBefore', 'layoutRevisionAfter',
    'before', 'after'
  ];
  for (const k of requiredKeys) {
    if (!(k in receipt)) {
      reasons.push(`Missing field: ${k}`);
    }
  }
  for (const k of Object.keys(receipt)) {
    if (!requiredKeys.includes(k)) {
      reasons.push(`Unexpected field: ${k}`);
    }
  }

  // 2. Validate basic types
  if (receipt.version !== 'xr-portable-panel-receipt-v1') {
    reasons.push(`Invalid version: ${receipt.version}`);
  }
  if (typeof receipt.receiptId !== 'string' || receipt.receiptId.length === 0) {
    reasons.push('receiptId must be a non-empty string');
  }
  if (typeof receipt.sequence !== 'number' || !Number.isInteger(receipt.sequence) || receipt.sequence < 1) {
    reasons.push('sequence must be a positive integer');
  }
  if (!['focus', 'pin', 'reset', 'move', 'resize', 'close', 'restore'].includes(receipt.action)) {
    reasons.push(`Invalid action: ${receipt.action}`);
  }
  if (!['applied', 'settled', 'rejected'].includes(receipt.phase)) {
    reasons.push(`Invalid phase: ${receipt.phase}`);
  }
  if (typeof receipt.panelId !== 'string' || receipt.panelId.length === 0) {
    reasons.push('panelId must be a non-empty string');
  }
  if (typeof receipt.accepted !== 'boolean') {
    reasons.push('accepted must be a boolean');
  }
  if (receipt.accepted) {
    if (receipt.reason !== null) {
      reasons.push('reason must be null when accepted is true');
    }
    if (['move', 'resize'].includes(receipt.action)) {
      if (receipt.phase !== 'settled') {
        reasons.push('phase must be settled for accepted move/resize');
      }
    } else {
      if (receipt.phase !== 'applied') {
        reasons.push('phase must be applied for accepted discrete actions');
      }
    }
    if (typeof receipt.layoutRevisionBefore === 'number' && typeof receipt.layoutRevisionAfter === 'number') {
      if (receipt.layoutRevisionAfter !== receipt.layoutRevisionBefore + 1) {
        reasons.push('layoutRevisionAfter must be layoutRevisionBefore + 1 when accepted');
      }
    }
  } else {
    if (typeof receipt.reason !== 'string' || receipt.reason.length === 0) {
      reasons.push('reason must be a non-empty string when accepted is false');
    }
    if (receipt.phase !== 'rejected') {
      reasons.push('phase must be rejected when accepted is false');
    }
    if (typeof receipt.layoutRevisionBefore === 'number' && typeof receipt.layoutRevisionAfter === 'number') {
      if (receipt.layoutRevisionAfter !== receipt.layoutRevisionBefore) {
        reasons.push('layoutRevisionAfter must equal layoutRevisionBefore when rejected');
      }
    }
  }

  if (typeof receipt.sessionId !== 'string' || receipt.sessionId.length === 0) {
    reasons.push('sessionId must be a non-empty string');
  }
  if (typeof receipt.startFrameId !== 'string' || receipt.startFrameId.length === 0) {
    reasons.push('startFrameId must be a non-empty string');
  }
  if (typeof receipt.endFrameId !== 'string' || receipt.endFrameId.length === 0) {
    reasons.push('endFrameId must be a non-empty string');
  }
  if (typeof receipt.timestamp !== 'number' || !Number.isFinite(receipt.timestamp)) {
    reasons.push('timestamp must be a finite number');
  }
  if (typeof receipt.inputSourceId !== 'string' || receipt.inputSourceId.length === 0) {
    reasons.push('inputSourceId must be a non-empty string');
  }
  if (!['controller', 'hand'].includes(receipt.inputKind)) {
    reasons.push('inputKind must be controller or hand');
  }
  if (!['left', 'right', 'none'].includes(receipt.handedness)) {
    reasons.push('handedness must be left, right, or none');
  }
  if (!Array.isArray(receipt.profiles) || receipt.profiles.some(p => typeof p !== 'string' || p.trim().length === 0)) {
    reasons.push('profiles must be an array of non-empty strings');
  }
  if (typeof receipt.layoutRevisionBefore !== 'number' || !Number.isInteger(receipt.layoutRevisionBefore) || receipt.layoutRevisionBefore < 0) {
    reasons.push('layoutRevisionBefore must be a non-negative integer');
  }
  if (typeof receipt.layoutRevisionAfter !== 'number' || !Number.isInteger(receipt.layoutRevisionAfter) || receipt.layoutRevisionAfter < 0) {
    reasons.push('layoutRevisionAfter must be a non-negative integer');
  }

  // 3. Conformed receiptId check
  if (typeof receipt.receiptId === 'string' && typeof receipt.sessionId === 'string' && typeof receipt.endFrameId === 'string' && typeof receipt.inputSourceId === 'string' && typeof receipt.sequence === 'number') {
    const expectedReceiptId = `${receipt.sessionId}:${receipt.endFrameId}:${receipt.inputSourceId}:portable:${receipt.sequence}`;
    if (receipt.receiptId !== expectedReceiptId) {
      reasons.push('receiptId does not conform to the required format');
    }
  }

  // Helper to validate sub-state shape in before/after
  function validateReceiptSubState(name, sub) {
    if (!sub || typeof sub !== 'object' || Array.isArray(sub)) {
      reasons.push(`${name} must be a non-null object`);
      return;
    }
    if ('position' in sub || 'quaternion' in sub || 'size' in sub) {
      reasons.push(`Flat legacy panel shape in ${name}`);
    }
    // `hidden` is optional on sub-states: receipts written before the close
    // action existed carry no visibility field (absent ≡ false).
    const subKeys = ['id', 'canonical', 'current', 'portable', 'pinned', 'focused', 'revision', 'sourceMetadata'];
    const allowedSubKeys = [...subKeys, 'hidden'];
    for (const k of Object.keys(sub)) {
      if (!allowedSubKeys.includes(k)) {
        reasons.push(`Unexpected field in ${name}: ${k}`);
      }
    }
    for (const k of subKeys) {
      if (!(k in sub)) {
        reasons.push(`Missing field in ${name}: ${k}`);
      }
    }
    if ('hidden' in sub && typeof sub.hidden !== 'boolean') {
      reasons.push(`${name} hidden must be a boolean when present`);
    }
    if (typeof sub.id !== 'string' || sub.id.length === 0) {
      reasons.push(`${name} id must be a non-empty string`);
    }
    if (typeof sub.portable !== 'boolean') {
      reasons.push(`${name} portable must be a boolean`);
    }
    if (typeof sub.pinned !== 'boolean') {
      reasons.push(`${name} pinned must be a boolean`);
    }
    if (typeof sub.focused !== 'boolean') {
      reasons.push(`${name} focused must be a boolean`);
    }
    if (typeof sub.revision !== 'number' || !Number.isInteger(sub.revision) || sub.revision < 0) {
      reasons.push(`${name} revision must be a non-negative integer`);
    }
    if (!sub.sourceMetadata || typeof sub.sourceMetadata !== 'object' || Array.isArray(sub.sourceMetadata)) {
      reasons.push(`${name} sourceMetadata must be a non-array object`);
    }

    // Canonical
    if (!sub.canonical || typeof sub.canonical !== 'object' || Array.isArray(sub.canonical)) {
      reasons.push(`${name} canonical must be a non-null object`);
    } else {
      const can = sub.canonical;
      const canKeys = ['position', 'quaternion', 'size'];
      for (const k of Object.keys(can)) {
        if (!canKeys.includes(k)) {
          reasons.push(`Unexpected field in ${name} canonical: ${k}`);
        }
      }
      if (!Array.isArray(can.position) || can.position.length !== 3 || can.position.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        reasons.push(`${name} canonical position must be 3 finite numbers`);
      }
      if (!Array.isArray(can.quaternion) || can.quaternion.length !== 4 || can.quaternion.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        reasons.push(`${name} canonical quaternion must be 4 finite numbers`);
      } else {
        const lenSq = can.quaternion.reduce((sum, v) => sum + v * v, 0);
        if (Math.abs(lenSq - 1) > 0.05) {
          reasons.push(`${name} canonical quaternion must be a unit quaternion`);
        }
      }
      if (!Array.isArray(can.size) || can.size.length !== 2 || can.size.some(v => typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) {
        reasons.push(`${name} canonical size must be 2 positive numbers`);
      }
    }

    // Current
    if (!sub.current || typeof sub.current !== 'object' || Array.isArray(sub.current)) {
      reasons.push(`${name} current must be a non-null object`);
    } else {
      const cur = sub.current;
      const curKeys = ['position', 'quaternion', 'size'];
      for (const k of Object.keys(cur)) {
        if (!curKeys.includes(k)) {
          reasons.push(`Unexpected field in ${name} current: ${k}`);
        }
      }
      if (!Array.isArray(cur.position) || cur.position.length !== 3 || cur.position.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        reasons.push(`${name} current position must be 3 finite numbers`);
      }
      if (!Array.isArray(cur.quaternion) || cur.quaternion.length !== 4 || cur.quaternion.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        reasons.push(`${name} current quaternion must be 4 finite numbers`);
      } else {
        const lenSq = cur.quaternion.reduce((sum, v) => sum + v * v, 0);
        if (Math.abs(lenSq - 1) > 0.05) {
          reasons.push(`${name} current quaternion must be a unit quaternion`);
        }
      }
      if (!Array.isArray(cur.size) || cur.size.length !== 2 || cur.size.some(v => typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) {
        reasons.push(`${name} current size must be 2 positive numbers`);
      }
    }
  }

  if (receipt.before === null || receipt.before === undefined) {
    reasons.push('before state is required and must be a non-null object');
  } else {
    validateReceiptSubState('before', receipt.before);
  }

  if (receipt.after === null || receipt.after === undefined) {
    reasons.push('after state is required and must be a non-null object');
  } else {
    validateReceiptSubState('after', receipt.after);
  }

  // If rejected, before and after must be deeply identical (if they are present)
  if (!receipt.accepted && receipt.before && receipt.after && reasons.length === 0) {
    if (!deepEqual(receipt.before, receipt.after)) {
      reasons.push('Rejected receipt must have identical before and after states');
    }
  }

  return deepFreeze({
    ok: reasons.length === 0,
    reasons
  });
}

export function verifyXRPortablePanelStateSnapshot(snapshot, options = {}) {
  const reasons = [];

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return deepFreeze({ ok: false, reasons: ['Snapshot must be an object'] });
  }

  const requiredKeys = ['version', 'layoutRevision', 'focusedPanelId', 'panels'];
  for (const k of requiredKeys) {
    if (!(k in snapshot)) {
      reasons.push(`Missing snapshot field: ${k}`);
    }
  }
  for (const k of Object.keys(snapshot)) {
    if (!requiredKeys.includes(k)) {
      reasons.push(`Unexpected snapshot field: ${k}`);
    }
  }

  if (snapshot.version !== 'xr-portable-panel-state-v1') {
    reasons.push(`Invalid version: ${snapshot.version}`);
  }
  if (typeof snapshot.layoutRevision !== 'number' || snapshot.layoutRevision < 0 || !Number.isInteger(snapshot.layoutRevision)) {
    reasons.push('layoutRevision must be a non-negative integer');
  }
  if (snapshot.focusedPanelId !== null && typeof snapshot.focusedPanelId !== 'string') {
    reasons.push('focusedPanelId must be a string or null');
  }
  if (!Array.isArray(snapshot.panels)) {
    reasons.push('panels must be an array');
    return deepFreeze({ ok: false, reasons });
  }

  const seenIds = new Set();
  let focusedCount = 0;
  let focusedIdMatches = false;

  for (let idx = 0; idx < snapshot.panels.length; idx++) {
    const p = snapshot.panels[idx];
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      reasons.push(`Panel at index ${idx} is not an object`);
      continue;
    }

    // Check flat legacy shape
    if ('position' in p || 'quaternion' in p || 'size' in p) {
      reasons.push(`Flat legacy panel shape in panel ${p.id || idx}`);
    }

    // `hidden` is optional on panel entries (absent ≡ false) so snapshots
    // written before the close action existed still verify.
    const panelKeys = ['id', 'canonical', 'current', 'portable', 'pinned', 'focused', 'revision', 'sourceMetadata'];
    const allowedPanelKeys = [...panelKeys, 'hidden'];
    for (const k of Object.keys(p)) {
      if (!allowedPanelKeys.includes(k)) {
        reasons.push(`Unexpected panel field in panel ${p.id || idx}: ${k}`);
      }
    }
    for (const k of panelKeys) {
      if (!(k in p)) {
        reasons.push(`Missing panel field in panel ${p.id || idx}: ${k}`);
      }
    }
    if ('hidden' in p && typeof p.hidden !== 'boolean') {
      reasons.push(`Panel ${p.id || idx} hidden must be a boolean when present`);
    }

    if (typeof p.id !== 'string' || p.id.length === 0) {
      reasons.push(`Panel at index ${idx} has invalid ID`);
      continue;
    }

    if (seenIds.has(p.id)) {
      reasons.push(`Duplicate panel ID: ${p.id}`);
    }
    seenIds.add(p.id);

    if (p.focused) {
      focusedCount++;
      if (p.id === snapshot.focusedPanelId) {
        focusedIdMatches = true;
      }
    }

    // Validate canonical & current
    if (!p.canonical || typeof p.canonical !== 'object' || Array.isArray(p.canonical)) {
      reasons.push(`Panel ${p.id} canonical must be a non-null object`);
    } else {
      const can = p.canonical;
      const canKeys = ['position', 'quaternion', 'size'];
      for (const k of Object.keys(can)) {
        if (!canKeys.includes(k)) {
          reasons.push(`Unexpected canonical field in panel ${p.id}: ${k}`);
        }
      }
      if (!Array.isArray(can.position) || can.position.length !== 3 || can.position.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        reasons.push(`Panel ${p.id} canonical position must be 3 finite numbers`);
      }
      if (!Array.isArray(can.quaternion) || can.quaternion.length !== 4 || can.quaternion.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        reasons.push(`Panel ${p.id} canonical quaternion must be 4 finite numbers`);
      } else {
        const lenSq = can.quaternion.reduce((sum, v) => sum + v * v, 0);
        if (Math.abs(lenSq - 1) > 0.05) {
          reasons.push(`Panel ${p.id} canonical quaternion must be a unit quaternion`);
        }
      }
      if (!Array.isArray(can.size) || can.size.length !== 2 || can.size.some(v => typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) {
        reasons.push(`Panel ${p.id} canonical size must be 2 positive numbers`);
      }
    }
    if (!p.current || typeof p.current !== 'object' || Array.isArray(p.current)) {
      reasons.push(`Panel ${p.id} current must be a non-null object`);
    } else {
      const cur = p.current;
      const curKeys = ['position', 'quaternion', 'size'];
      for (const k of Object.keys(cur)) {
        if (!curKeys.includes(k)) {
          reasons.push(`Unexpected current field in panel ${p.id}: ${k}`);
        }
      }
      if (!Array.isArray(cur.position) || cur.position.length !== 3 || cur.position.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        reasons.push(`Panel ${p.id} current position must be 3 finite numbers`);
      }
      if (!Array.isArray(cur.quaternion) || cur.quaternion.length !== 4 || cur.quaternion.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        reasons.push(`Panel ${p.id} current quaternion must be 4 finite numbers`);
      } else {
        const lenSq = cur.quaternion.reduce((sum, v) => sum + v * v, 0);
        if (Math.abs(lenSq - 1) > 0.05) {
          reasons.push(`Panel ${p.id} current quaternion must be a unit quaternion`);
        }
      }
      if (!Array.isArray(cur.size) || cur.size.length !== 2 || cur.size.some(v => typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) {
        reasons.push(`Panel ${p.id} current size must be 2 positive numbers`);
      }
    }

    if (typeof p.portable !== 'boolean') {
      reasons.push(`Panel ${p.id} portable must be a boolean`);
    }
    if (typeof p.pinned !== 'boolean') {
      reasons.push(`Panel ${p.id} pinned must be a boolean`);
    }
    if (typeof p.focused !== 'boolean') {
      reasons.push(`Panel ${p.id} focused must be a boolean`);
    }
    if (typeof p.revision !== 'number' || p.revision < 0 || !Number.isInteger(p.revision)) {
      reasons.push(`Panel ${p.id} revision must be a non-negative integer`);
    }
    if (!p.sourceMetadata || typeof p.sourceMetadata !== 'object' || Array.isArray(p.sourceMetadata)) {
      reasons.push(`Panel ${p.id} sourceMetadata must be a non-array object`);
    }
  }

  // Focus consistency checks
  if (snapshot.focusedPanelId !== null) {
    if (!seenIds.has(snapshot.focusedPanelId)) {
      reasons.push(`focusedPanelId '${snapshot.focusedPanelId}' not found in panels list`);
    }
    if (focusedCount !== 1) {
      reasons.push(`Exactly one panel should be focused when focusedPanelId is set (found ${focusedCount})`);
    }
    if (!focusedIdMatches) {
      reasons.push(`focusedPanelId '${snapshot.focusedPanelId}' does not match the focused panel`);
    }
  } else {
    if (focusedCount !== 0) {
      reasons.push(`No panels should be focused when focusedPanelId is null (found ${focusedCount})`);
    }
  }

  // Options checks (options.expectedLayoutRevision, options.previousSnapshot)
  if (options) {
    if (typeof options.expectedLayoutRevision === 'number') {
      if (snapshot.layoutRevision !== options.expectedLayoutRevision) {
        reasons.push(`layoutRevision mismatch: expected ${options.expectedLayoutRevision}, got ${snapshot.layoutRevision}`);
      }
    }
    if (options.previousSnapshot) {
      const prev = options.previousSnapshot;
      if (snapshot.layoutRevision < prev.layoutRevision) {
        reasons.push(`layoutRevision is stale: current ${snapshot.layoutRevision} < previous ${prev.layoutRevision}`);
      }
      for (const p of snapshot.panels) {
        const prevPanel = prev.panels?.find(x => x.id === p.id);
        if (prevPanel) {
          if (p.revision < prevPanel.revision) {
            reasons.push(`Panel ${p.id} revision is stale: current ${p.revision} < previous ${prevPanel.revision}`);
          }
        }
      }
    }
  }

  return deepFreeze({
    ok: reasons.length === 0,
    reasons
  });
}
