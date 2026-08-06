function numberOr(value, fallback) {
  let number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundMetric(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function vectorPatch(value, fallback = [], length = 3) {
  if (Array.isArray(value)) {
    return value.slice(0, length).map((item) => roundMetric(numberOr(item, 0)));
  }
  if (value && typeof value === 'object') {
    return ['x', 'y', 'z'].slice(0, length).map((key, index) => roundMetric(numberOr(value[key], fallback[index] ?? 0)));
  }
  return fallback.length ? fallback.slice(0, length) : null;
}

function normalizePoint(point = {}) {
  return {
    x: clamp(numberOr(point.x, 0), 0, 1),
    y: clamp(numberOr(point.y, 0), 0, 1),
  };
}

function normalizeRect(rect = {}) {
  return {
    x: clamp(numberOr(rect.x, 0), 0, 1),
    y: clamp(numberOr(rect.y, 0), 0, 1),
    width: clamp(numberOr(rect.width, 1), 0.04, 1),
    height: clamp(numberOr(rect.height, 1), 0.04, 1),
  };
}

function rectFromPanel(panel = {}) {
  return normalizeRect(panel.relativeRect || panel.layoutNode?.layout?.rect || { x: 0, y: 0, width: 1, height: 1 });
}

function moveRect(rect, delta, options = {}) {
  let minWidth = numberOr(options.minWidth, 0.04);
  let minHeight = numberOr(options.minHeight, 0.04);
  let width = clamp(rect.width, minWidth, 1);
  let height = clamp(rect.height, minHeight, 1);
  return {
    x: roundMetric(clamp(rect.x + delta.x, 0, 1 - width)),
    y: roundMetric(clamp(rect.y + delta.y, 0, 1 - height)),
    width: roundMetric(width),
    height: roundMetric(height),
  };
}

function resizeRect(rect, delta, options = {}) {
  let minWidth = numberOr(options.minWidth, 0.08);
  let minHeight = numberOr(options.minHeight, 0.08);
  let handle = String(options.handle || options.frameTarget?.handle || 'southEast');
  let left = /west/i.test(handle);
  let right = /east/i.test(handle) || !left;
  let top = /north/i.test(handle);
  let bottom = /south/i.test(handle) || !top;
  let x = rect.x;
  let y = rect.y;
  let width = rect.width;
  let height = rect.height;
  if (right) width = clamp(rect.width + delta.x, minWidth, 1 - rect.x);
  if (bottom) height = clamp(rect.height + delta.y, minHeight, 1 - rect.y);
  if (left) {
    let nextX = clamp(rect.x + delta.x, 0, rect.x + rect.width - minWidth);
    width = clamp(rect.width + rect.x - nextX, minWidth, 1);
    x = nextX;
  }
  if (top) {
    let nextY = clamp(rect.y + delta.y, 0, rect.y + rect.height - minHeight);
    height = clamp(rect.height + rect.y - nextY, minHeight, 1);
    y = nextY;
  }
  return {
    x: roundMetric(x),
    y: roundMetric(y),
    width: roundMetric(width),
    height: roundMetric(height),
  };
}

function resolveGestureMode(options = {}) {
  if (options.frameTarget?.operation === 'resize') return 'resize';
  if (options.frameTarget?.operation === 'move') return 'move';
  if (options.mode === 'resize' || options.operation === 'resize') return 'resize';
  if (options.mode === 'move' || options.operation === 'move') return 'move';
  return 'read-only';
}

export function createXRPanelGestureState(options = {}) {
  let panel = options.panel || {};
  let frameTarget = options.frameTarget || options.pointerEvent?.frameTarget || null;
  let startPointer = normalizePoint(options.pointerEvent?.point || options.point);
  let startRect = normalizeRect(options.relativeRect || panel.relativeRect || rectFromPanel(panel));
  return {
    version: 'xr-panel-gesture-v1',
    mode: resolveGestureMode(options),
    status: options.status || 'ready',
    layoutId: String(options.layoutId || ''),
    panelId: String(options.panelId || panel.id || options.nodeId || ''),
    nodeId: String(options.nodeId || panel.layoutNode?.id || panel.id || ''),
    component: panel.component || panel.panelType || '',
    startPoint: startPointer,
    point: startPointer,
    startRect,
    relativeRect: startRect,
    contentPoint: options.pointerEvent?.contentPoint || null,
    delta: { x: 0, y: 0 },
    operation: resolveGestureMode(options),
    frameTarget,
    handle: options.handle || frameTarget?.handle || null,
  };
}

export function updateXRPanelGesture(state = {}, pointerEvent = {}, options = {}) {
  let point = normalizePoint(pointerEvent.point);
  let startPoint = normalizePoint(state.startPoint);
  let delta = {
    x: roundMetric(point.x - startPoint.x),
    y: roundMetric(point.y - startPoint.y),
  };
  let operation = resolveGestureMode({ ...state, ...options });
  let startRect = normalizeRect(state.startRect || state.relativeRect);
  let relativeRect = operation === 'resize'
    ? resizeRect(startRect, delta, {
      ...options,
      handle: options.handle || state.handle,
      frameTarget: options.frameTarget || state.frameTarget,
    })
    : operation === 'move'
      ? moveRect(startRect, delta, options)
      : startRect;

  return {
    ...state,
    mode: operation,
    status: pointerEvent.buttons?.primary || options.active ? 'dragging' : 'select',
    point,
    contentPoint: pointerEvent.contentPoint || state.contentPoint || null,
    delta,
    relativeRect,
    operation,
    frameTarget: options.frameTarget || state.frameTarget || null,
    handle: options.handle || state.handle || null,
  };
}

export function createXRLayoutTransactionFromGesture(state = {}, options = {}) {
  if (!state.nodeId || !state.layoutId) {
    return null;
  }
  if (state.operation !== 'move' && state.operation !== 'resize') {
    return null;
  }
  if (!state.delta || (state.delta.x === 0 && state.delta.y === 0)) {
    return null;
  }
  return {
    version: 'project-transaction-v1',
    id: options.id || `tx:xr-layout:${state.layoutId}:${state.nodeId}`,
    targetProject: options.targetProject || null,
    operations: [{
      type: 'layout.updateNode',
      layout: state.layoutId,
      nodeId: state.nodeId,
      patch: {
        layout: {
          rect: state.relativeRect,
        },
      },
    }],
    metadata: {
      source: 'symbiote-ui/xr',
      gesture: {
        panelId: state.panelId,
        operation: state.operation,
        handle: state.handle || null,
        delta: state.delta,
        contentPoint: state.contentPoint,
      },
    },
  };
}

export function createXRLayoutTransactionFromPanelPose(state = {}, options = {}) {
  let layoutId = String(options.layoutId || state.layoutId || '');
  let nodeId = String(options.nodeId || state.nodeId || state.panelId || '');
  let panelId = String(state.panelId || nodeId || '');
  let pose = state.pose && typeof state.pose === 'object' ? state.pose : state;
  let position = vectorPatch(pose.position);
  let rotation = vectorPatch(pose.rotation, state.rotation);
  let size = vectorPatch(pose.size, state.size, 2);
  if (!layoutId || !nodeId || !position) {
    return null;
  }
  let xr = { position };
  if (rotation) xr.rotation = rotation;
  if (size) xr.size = size;
  return {
    version: 'project-transaction-v1',
    id: options.id || `tx:xr-pose:${layoutId}:${nodeId}`,
    targetProject: options.targetProject || null,
    operations: [{
      type: 'layout.updateNode',
      layout: layoutId,
      nodeId,
      patch: {
        props: { xr },
      },
    }],
    metadata: {
      source: 'symbiote-ui/xr',
      gesture: {
        panelId,
        operation: state.operation || state.frameTarget?.operation || 'move',
        handle: state.handle || state.frameTarget?.handle || null,
        frameTarget: state.frameTarget || null,
      },
    },
  };
}
