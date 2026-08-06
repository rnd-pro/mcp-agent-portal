function numberOr(value, fallback) {
  let number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizePoint(point = {}) {
  // Chrome lives outside the window (Horizon-style), so frame points are NOT
  // clamped to the window UV square; the chrome hit surface supplies
  // coordinates beyond [0, 1].
  return {
    x: numberOr(point.x, 0),
    y: numberOr(point.y, 0),
  };
}

function bool(value) {
  return value === true;
}

export function computeXRPanelChromeLayout(sizeMeters = [0.8, 0.45], options = {}) {
  // Meta Horizon window chrome keeps a constant physical size: corner resize
  // brackets and edge grab handles sit outside the panel, while one unified
  // control bar floats below it. Zones remain normalized for shared hit tests.
  let size = Array.isArray(sizeMeters) ? sizeMeters : [0.8, 0.45];
  let width = Math.max(0.05, numberOr(size[0], 0.8));
  let height = Math.max(0.05, numberOr(size[1], 0.45));
  let handleMeters = clamp(numberOr(options.handleSizeMeters, 0.044), 0.016, 0.12);
  let handleSizeU = handleMeters / width;
  let handleSizeV = handleMeters / height;
  let barHeightMeters = clamp(numberOr(options.footerHeightMeters, 0.048), 0.024, 0.2);
  let barWidthMeters = clamp(numberOr(options.controlBarWidthMeters, 0.31), 0.22, 0.52);
  let barWidth = Math.min(0.9, barWidthMeters / width);
  let footerHeight = barHeightMeters / height;
  let footerGap = clamp(numberOr(options.footerGapMeters, 0.018), 0.006, 0.05) / height;
  let footerTop = 1 + footerGap;
  let barLeft = (1 - barWidth) / 2;
  let actionSize = clamp(numberOr(options.actionSizeMeters, 0.038), 0.02, 0.08) / width;
  let edgeLengthMeters = clamp(numberOr(options.edgeLengthMeters, 0.07), 0.04, 0.12);
  let edgeDepthMeters = clamp(numberOr(options.edgeHitDepthMeters, 0.036), 0.024, 0.06);
  let edgeGapMeters = clamp(numberOr(options.edgeGapMeters, 0.009), 0.003, 0.024);
  let edgeLengthU = edgeLengthMeters / width;
  let edgeLengthV = edgeLengthMeters / height;
  let edgeDepthU = edgeDepthMeters / width;
  let edgeDepthV = edgeDepthMeters / height;
  let edgeGapU = edgeGapMeters / width;
  let edgeGapV = edgeGapMeters / height;
  let actionOrder = ['reset', 'fullscreen', 'pin'];
  if (options.closable !== false) actionOrder.push('close');
  let actions = {};
  actionOrder.forEach((action, index) => {
    actions[action] = {
      x: barLeft + barWidth - actionSize * (actionOrder.length - index),
      y: footerTop,
      width: actionSize,
      height: footerHeight,
    };
  });
  let moveWidth = Math.max(actionSize, barWidth - actionSize * actionOrder.length);
  return {
    controlBar: { x: barLeft, y: footerTop, width: barWidth, height: footerHeight },
    move: { x: barLeft, y: footerTop, width: moveWidth, height: footerHeight },
    content: { x: 0, y: 0, width: 1, height: 1 },
    resize: {
      northWest: { x: -handleSizeU / 2, y: -handleSizeV / 2, width: handleSizeU, height: handleSizeV },
      northEast: { x: 1 - handleSizeU / 2, y: -handleSizeV / 2, width: handleSizeU, height: handleSizeV },
      southEast: { x: 1 - handleSizeU / 2, y: 1 - handleSizeV / 2, width: handleSizeU, height: handleSizeV },
      southWest: { x: -handleSizeU / 2, y: 1 - handleSizeV / 2, width: handleSizeU, height: handleSizeV },
    },
    edges: {
      north: { x: 0.5 - edgeLengthU / 2, y: -edgeGapV - edgeDepthV, width: edgeLengthU, height: edgeDepthV },
      east: { x: 1 + edgeGapU, y: 0.5 - edgeLengthV / 2, width: edgeDepthU, height: edgeLengthV },
      south: { x: 0.5 - edgeLengthU / 2, y: 1 + edgeGapV, width: edgeLengthU, height: edgeDepthV },
      west: { x: -edgeGapU - edgeDepthU, y: 0.5 - edgeLengthV / 2, width: edgeDepthU, height: edgeLengthV },
    },
    actions,
  };
}

export function createXRPanelFrame(panel = {}, options = {}) {
  // Horizon-OS-style chrome, placed OUTSIDE the window like the native shell:
  // the handlebar and window actions float in a band below the window, and
  // the resize grips straddle the corners. Content owns the full window UV
  // square; the chrome hit surface supplies out-of-window coordinates.
  let sizeMeters = Array.isArray(options.panelSizeMeters)
    ? options.panelSizeMeters
    : (Array.isArray(panel.size) ? panel.size : [0.8, 0.45]);
  let state = options.state || panel.state || {};
  return {
    version: 'xr-panel-frame-v1',
    panelId: String(panel.id || ''),
    component: panel.component || panel.panelType || 'panel',
    tokens: {
      background: 'var(--sn-xr-panel-bg)',
      border: 'var(--sn-xr-panel-border)',
      radius: 'var(--sn-xr-panel-radius)',
      shadow: 'var(--sn-xr-panel-shadow)',
      pointer: 'var(--sn-xr-pointer-color)',
    },
    zones: computeXRPanelChromeLayout(sizeMeters, {
      ...options,
      closable: options.closable === false ? false : panel.closable,
    }),
    state: {
      hovered: bool(state.hovered || options.hovered),
      selected: bool(state.selected || options.selected),
      dragging: bool(state.dragging || options.dragging),
      resizing: bool(state.resizing || options.resizing),
      pinned: bool(state.pinned || options.pinned),
    },
  };
}

function contains(zone, point) {
  return point.x >= zone.x &&
    point.x <= zone.x + zone.width &&
    point.y >= zone.y &&
    point.y <= zone.y + zone.height;
}

export function hitTestXRPanelFrame(frameOrPanel = {}, point = {}, options = {}) {
  let frame = frameOrPanel.version === 'xr-panel-frame-v1'
    ? frameOrPanel
    : createXRPanelFrame(frameOrPanel, options);
  let normalizedPoint = normalizePoint(point);

  for (let [action, zone] of Object.entries(frame.zones.actions || {})) {
    if (contains(zone, normalizedPoint)) {
      return {
        version: 'xr-panel-frame-target-v1',
        panelId: frame.panelId,
        zone: 'action',
        action,
        operation: 'action',
        handle: null,
        point: normalizedPoint,
      };
    }
  }

  for (let [handle, zone] of Object.entries(frame.zones.resize || {})) {
    if (contains(zone, normalizedPoint)) {
      return {
        version: 'xr-panel-frame-target-v1',
        panelId: frame.panelId,
        zone: 'resize',
        action: null,
        operation: 'resize',
        handle,
        point: normalizedPoint,
      };
    }
  }

  for (let [handle, zone] of Object.entries(frame.zones.edges || {})) {
    if (contains(zone, normalizedPoint)) {
      return {
        version: 'xr-panel-frame-target-v1',
        panelId: frame.panelId,
        zone: 'edge',
        action: null,
        operation: 'move',
        handle,
        point: normalizedPoint,
      };
    }
  }

  if (contains(frame.zones.move, normalizedPoint)) {
    return {
      version: 'xr-panel-frame-target-v1',
      panelId: frame.panelId,
      zone: 'move',
      action: null,
      operation: 'move',
      handle: null,
      point: normalizedPoint,
    };
  }

  if (contains(frame.zones.content, normalizedPoint)) {
    return {
      version: 'xr-panel-frame-target-v1',
      panelId: frame.panelId,
      zone: 'content',
      action: null,
      operation: options.defaultContentOperation || 'focus',
      handle: null,
      point: normalizedPoint,
    };
  }

  // Outside the window and outside every chrome zone: no target at all.
  return null;
}
