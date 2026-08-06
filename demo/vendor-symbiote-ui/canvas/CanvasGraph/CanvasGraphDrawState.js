export const CANVAS_GRAPH_BASE_FRAME_MS = 1000 / 60;
const MAX_CANVAS_GRAPH_FRAME_DELTA_MS = 250;

export function resolveCanvasGraphFrameContext(now, previousNow = null) {
  let current = Number(now);
  if (!Number.isFinite(current)) throw new RangeError('CanvasGraph frame time must be finite');
  let firstFrame = !Number.isFinite(previousNow);
  let deltaMs = firstFrame ? CANVAS_GRAPH_BASE_FRAME_MS : Math.max(0, current - previousNow);
  deltaMs = Math.min(deltaMs, MAX_CANVAS_GRAPH_FRAME_DELTA_MS);
  return {
    now: current,
    deltaMs,
    frameStep: deltaMs / CANVAS_GRAPH_BASE_FRAME_MS,
  };
}

export function resolveCanvasGraphFrameEase(ease, frameStep = 1) {
  let amount = Math.max(0, Math.min(1, Number(ease) || 0));
  let step = Math.max(0, Number(frameStep) || 0);
  return 1 - Math.pow(1 - amount, step);
}

export function resolveViewportAnimation(options) {
  let {
    zoom,
    targetZoom,
    panX,
    panY,
    targetPanX,
    targetPanY,
    zoomAnchor,
    viewportEase = 0.15,
    frameStep = 1,
  } = options;
  let baseEase = Math.max(0.015, Math.min(0.35, Number.isFinite(viewportEase) ? viewportEase : 0.15));
  let ease = resolveCanvasGraphFrameEase(baseEase, frameStep);

  let next = {
    zoom,
    panX,
    panY,
    targetPanX,
    targetPanY,
  };

  let zoomAnimating = Math.abs(targetZoom - zoom) > 0.0001;
  if (zoomAnimating) {
    let oldZoom = zoom;
    next.zoom += (targetZoom - zoom) * ease;
    if (zoomAnchor) {
      let { mx, my } = zoomAnchor;
      next.panX = mx - (mx - panX) * (next.zoom / oldZoom);
      next.panY = my - (my - panY) * (next.zoom / oldZoom);
    }
  }

  if (targetPanX !== null) {
    let panDx = targetPanX - next.panX;
    let panDy = targetPanY - next.panY;
    if (Math.abs(panDx) < 0.5 && Math.abs(panDy) < 0.5) {
      next.panX = targetPanX;
      next.panY = targetPanY;
      next.targetPanX = null;
      next.targetPanY = null;
    } else {
      next.panX += panDx * ease;
      next.panY += panDy * ease;
    }
  }

  return next;
}

export function getNextPulseQueue({ pulses = [], nodeId, startTime, duration, waves = 1 }) {
  return [
    ...pulses.filter((pulse) => pulse.id !== nodeId),
    { id: nodeId, startTime, duration, waves },
  ];
}

export function findActiveTransitionMarker(markers = [], nodeId, now) {
  let id = String(nodeId || '').trim();
  if (!id) return null;
  for (let marker of markers || []) {
    if (marker?.toId !== id) continue;
    let duration = Math.max(1, marker.duration || 850);
    let elapsed = now - marker.startTime;
    if (elapsed >= 0 && elapsed < duration) return marker;
  }
  return null;
}

export const CANVAS_GRAPH_LAYER_TARGETS = Object.freeze({
  scale: Object.freeze([1.14, 0.96, 0.88, 0.78, 0.68]),
  opacity: Object.freeze([1, 0.52, 0.24, 0.07, 0.02]),
  blur: Object.freeze([0, 0.4, 1.6, 3.5, 6]),
  parallax: Object.freeze([0, 0.02, 0.045, 0.075, 0.11]),
});

export function resolveGroupOrbitRotationFrame(options) {
  let {
    rotation = 0,
    rotationSpeed = 0,
    hovered = false,
    dragged = false,
    frameStep = 1,
  } = options;

  let targetSpeed = (hovered || dragged) ? 0.025 : 0;
  let step = Math.max(0, Number(frameStep) || 0);
  let decay = Math.pow(0.95, step);
  let nextSpeed = targetSpeed + (rotationSpeed - targetSpeed) * decay;
  let speedSum = targetSpeed * step
    + (rotationSpeed - targetSpeed) * 0.95 * (1 - decay) / 0.05;
  if (Math.abs(nextSpeed) < 0.0001) nextSpeed = 0;

  return {
    rotation: rotation + speedSum,
    rotationSpeed: nextSpeed,
  };
}

export function resolveDeactivationFrame(options) {
  let { deactivating, activeNode, nextActiveNode, layerAnim } = options;
  let settled = Math.abs(layerAnim[0].scale - 1) < 0.01
    && Math.abs(layerAnim[4].scale - 1) < 0.01;

  if (!deactivating || !activeNode || !settled) {
    return {
      activeNode,
      nextActiveNode,
      deactivating,
      deselected: false,
      interactionDepthsChanged: false,
    };
  }

  if (nextActiveNode) {
    return {
      activeNode: nextActiveNode,
      nextActiveNode: null,
      deactivating: false,
      deselected: false,
      interactionDepthsChanged: true,
    };
  }

  return {
    activeNode: null,
    nextActiveNode: null,
    deactivating: false,
    deselected: true,
    interactionDepthsChanged: true,
  };
}

export function resolveCanvasGraphEdgeFocus(options) {
  let {
    edge,
    focusNodeId,
    alpha = 0.5,
    width = 1.5,
  } = options;
  let id = String(focusNodeId || '').trim();
  if (!id) {
    return { active: false, alpha, width };
  }

  let active = edge?.from === id || edge?.to === id;
  if (active) {
    return {
      active,
      alpha: Math.max(alpha, 0.95),
      width: Math.max(width, 2.4),
    };
  }

  return {
    active,
    alpha: Math.min(alpha, 0.16),
    width: Math.min(width, 1),
  };
}

export function getLayerAnimationFrame(options) {
  let { layerAnim, layerTargets, isIdle, inGroupMode, frameStep = 1 } = options;
  let next = {};
  let lerpSpeed = isIdle ? 0.08 : 0.06;

  for (let d = 0; d <= 4; d++) {
    let la = layerAnim[d];
    let tScale = isIdle ? 1 : layerTargets.scale[d];
    let tOpacity = isIdle ? 1 : layerTargets.opacity[d];
    let tParallax = isIdle ? 0 : layerTargets.parallax[d];
    let speed = resolveCanvasGraphFrameEase((inGroupMode && d >= 3) ? 0.3 : lerpSpeed, frameStep);

    next[d] = {
      ...la,
      scale: la.scale + (tScale - la.scale) * speed,
      opacity: la.opacity + (tOpacity - la.opacity) * speed,
      parallax: la.parallax + (tParallax - la.parallax) * speed,
    };
  }

  return next;
}

export function resolveFocusFrame(options) {
  let {
    activeNode,
    deactivating,
    activePosition,
    infoPanel,
    canvasRect,
    dpr,
    zoom,
    panX,
    panY,
    focusX,
    focusY,
    focusActive,
    vcx,
    vcy,
    frameStep = 1,
  } = options;
  let activeEase = resolveCanvasGraphFrameEase(0.12, frameStep);
  let idleEase = resolveCanvasGraphFrameEase(0.08, frameStep);

  let next = {
    focusX,
    focusY,
    focusActive,
    dragDeltaX: 0,
    dragDeltaY: 0,
    targetPanX: null,
    targetPanY: null,
    centeredForNode: infoPanel?._centeredForNode,
  };

  if (activeNode && !deactivating && !activePosition) {
    return next;
  }

  if (activeNode && !deactivating) {
    if (infoPanel?._centeredForNode !== activeNode.id && infoPanel.totalExtent > 0) {
      next.centeredForNode = activeNode.id;
      let panelOffsetX = infoPanel.totalExtent / 2;
      let panelOffsetY = infoPanel.totalExtentY / 2;
      if (canvasRect?.width > 0) {
        next.targetPanX = canvasRect.width / 2 - (activePosition.x + panelOffsetX) * zoom;
        next.targetPanY = canvasRect.height / 2 - (activePosition.y + panelOffsetY) * zoom;
      }
    }

    let targetFX = dpr * zoom * activePosition.x + dpr * panX;
    let targetFY = dpr * zoom * activePosition.y + dpr * panY;
    if (!focusActive) {
      next.focusX = targetFX;
      next.focusY = targetFY;
      next.focusActive = true;
    } else {
      next.focusX += (targetFX - focusX) * activeEase;
      next.focusY += (targetFY - focusY) * activeEase;
    }
    next.dragDeltaX = next.focusX - vcx;
    next.dragDeltaY = next.focusY - vcy;
    return next;
  }

  next.focusX += (vcx - focusX) * idleEase;
  next.focusY += (vcy - focusY) * idleEase;
  next.dragDeltaX = next.focusX - vcx;
  next.dragDeltaY = next.focusY - vcy;
  if (Math.abs(next.dragDeltaX) < 1 && Math.abs(next.dragDeltaY) < 1) {
    next.focusActive = false;
    next.dragDeltaX = 0;
    next.dragDeltaY = 0;
  }

  return next;
}

export function getDepthGroupsFrame(options) {
  let { edges, nodes, activeNode, dragNode, hoverNode } = options;
  let groups = {
    0: { edges: [], nodes: [] },
    1: { edges: [], nodes: [] },
    2: { edges: [], nodes: [] },
    3: { edges: [], nodes: [] },
    4: { edges: [], nodes: [] },
  };
  let focusNodes = [];

  for (let edge of edges) {
    groups[edge.targetDepth !== undefined ? edge.targetDepth : 4].edges.push(edge);
  }

  for (let node of nodes) {
    if (node === activeNode || node === dragNode || node === hoverNode) {
      focusNodes.push(node);
    } else {
      groups[node.targetDepth !== undefined ? node.targetDepth : 4].nodes.push(node);
    }
  }

  for (let node of focusNodes) {
    groups[node.targetDepth !== undefined ? node.targetDepth : 4].nodes.push(node);
  }

  return groups;
}

export const CANVAS_GRAPH_RENDER_SNAPSHOT_KIND = 'canvas-graph-render';
export const CANVAS_GRAPH_RENDER_SNAPSHOT_VERSION = 3;

function snapshotFail(label) {
  throw new TypeError(`Invalid CanvasGraph render snapshot: ${label}`);
}

function requireFinite(value, label) {
  if (!Number.isFinite(value)) snapshotFail(label);
  return value;
}

function requireCanvasDimension(value, label) {
  let dimension = requireFinite(value, label);
  if (!Number.isInteger(dimension) || dimension < 0) snapshotFail(label);
  return dimension;
}

function requirePositive(value, label) {
  let number = requireFinite(value, label);
  if (number <= 0) snapshotFail(label);
  return number;
}

function requireNonNegative(value, label) {
  let number = requireFinite(value, label);
  if (number < 0) snapshotFail(label);
  return number;
}

function requireUnit(value, label) {
  let number = requireFinite(value, label);
  if (number < 0 || number > 1) snapshotFail(label);
  return number;
}

function nullableFinite(value, label) {
  if (value === undefined || value === null) return null;
  return requireFinite(value, label);
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') snapshotFail(label);
  return value;
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) snapshotFail(label);
  return value;
}

function cleanSnapshotId(value) {
  let id = typeof value === 'string' ? value.trim() : '';
  return id || null;
}

function requireSnapshotId(value, label) {
  let id = cleanSnapshotId(value);
  if (!id) snapshotFail(label);
  return id;
}

function optionalSnapshotId(value, label) {
  if (value === undefined || value === null || value === '') return null;
  return requireSnapshotId(value, label);
}

function normalizeVec(value, label) {
  let source = requirePlainObject(value, label);
  return {
    x: requireFinite(source.x, `${label}.x`),
    y: requireFinite(source.y, `${label}.y`),
  };
}

function normalizeViewportLike(value) {
  if (!value || typeof value !== 'object') return null;
  if (!Number.isFinite(value.zoom) || !Number.isFinite(value.panX) || !Number.isFinite(value.panY)) {
    return null;
  }
  let normalized = { zoom: value.zoom, panX: value.panX, panY: value.panY };
  if (Number.isFinite(value.viewportEase)) normalized.viewportEase = value.viewportEase;
  if (typeof value.animate === 'boolean') normalized.animate = value.animate;
  return normalized;
}

function normalizeIdVecPairs(source, label) {
  requirePlainObject(source, label);
  let pairs = [];
  for (let [key, value] of Object.entries(source)) {
    pairs.push([requireSnapshotId(key, `${label}.id`), normalizeVec(value, `${label}.${key}`)]);
  }
  return pairs;
}

function normalizeTransitionMarker(raw) {
  requirePlainObject(raw, 'transitionMarker');
  let fromId = requireSnapshotId(raw.fromId, 'transitionMarker.fromId');
  let toId = requireSnapshotId(raw.toId, 'transitionMarker.toId');
  if (!Array.isArray(raw.path)) snapshotFail('transitionMarker.path');
  let path = raw.path.map((id, index) => requireSnapshotId(id, `transitionMarker.path[${index}]`));

  let marker = {
    fromId,
    toId,
    path,
    startTime: requireFinite(raw.startTime, 'transitionMarker.startTime'),
    duration: requirePositive(raw.duration, 'transitionMarker.duration'),
  };

  if (raw.pendingActivation !== undefined && raw.pendingActivation !== null) {
    marker.pendingActivation = requireSnapshotId(raw.pendingActivation, 'transitionMarker.pendingActivation');
  }

  for (let key of ['pendingViewport', 'initialViewport', 'routeViewport']) {
    if (raw[key] === undefined || raw[key] === null) continue;
    let viewport = normalizeViewportLike(raw[key]);
    if (!viewport) snapshotFail(`transitionMarker.${key}`);
    marker[key] = viewport;
  }
  for (let key of ['initialCenter', 'routeCenter', 'targetCenter', 'targetCenterOffset']) {
    if (raw[key] === undefined || raw[key] === null) continue;
    marker[key] = normalizeVec(raw[key], `transitionMarker.${key}`);
  }
  if (raw.pendingPulse !== undefined && raw.pendingPulse !== null) {
    requirePlainObject(raw.pendingPulse, 'transitionMarker.pendingPulse');
    let duration = requirePositive(raw.pendingPulse.duration, 'transitionMarker.pendingPulse.duration');
    let waves = requirePositive(raw.pendingPulse.waves, 'transitionMarker.pendingPulse.waves');
    marker.pendingPulse = { duration, waves };
  }
  return marker;
}

function buildNormalizedRenderSnapshot(raw) {
  requirePlainObject(raw, 'root');
  if (raw.kind !== CANVAS_GRAPH_RENDER_SNAPSHOT_KIND) snapshotFail('kind');
  if (raw.version !== CANVAS_GRAPH_RENDER_SNAPSHOT_VERSION) snapshotFail('version');
  let renderMode = requireSnapshotId(raw.renderMode, 'renderMode');
  let surfaceSource = requirePlainObject(raw.surface, 'surface');
  let surface = {
    backingWidth: requireCanvasDimension(surfaceSource.backingWidth, 'surface.backingWidth'),
    backingHeight: requireCanvasDimension(surfaceSource.backingHeight, 'surface.backingHeight'),
    cssWidth: requireNonNegative(surfaceSource.cssWidth, 'surface.cssWidth'),
    cssHeight: requireNonNegative(surfaceSource.cssHeight, 'surface.cssHeight'),
    dpr: requirePositive(surfaceSource.dpr, 'surface.dpr'),
  };
  let graphSource = requirePlainObject(raw.graph, 'graph');
  if (!Array.isArray(graphSource.nodeIds) || !Array.isArray(graphSource.edges)) snapshotFail('graph identity');
  let nodeIds = graphSource.nodeIds.map((id, index) => requireSnapshotId(id, `graph.nodeIds[${index}]`));
  if (new Set(nodeIds).size !== nodeIds.length) snapshotFail('graph.nodeIds duplicate');
  let graphEdges = graphSource.edges.map((edge, index) => {
    requirePlainObject(edge, `graph.edges[${index}]`);
    if (edge.index !== index) snapshotFail(`graph.edges[${index}].index`);
    return {
      index,
      from: requireSnapshotId(edge.from, `graph.edges[${index}].from`),
      to: requireSnapshotId(edge.to, `graph.edges[${index}].to`),
    };
  });

  let viewportSource = requirePlainObject(raw.viewport, 'viewport');
  let viewport = {
    zoom: requirePositive(viewportSource.zoom, 'viewport.zoom'),
    panX: requireFinite(viewportSource.panX, 'viewport.panX'),
    panY: requireFinite(viewportSource.panY, 'viewport.panY'),
    targetZoom: requirePositive(viewportSource.targetZoom, 'viewport.targetZoom'),
    targetPanX: nullableFinite(viewportSource.targetPanX, 'viewport.targetPanX'),
    targetPanY: nullableFinite(viewportSource.targetPanY, 'viewport.targetPanY'),
    viewportEase: requireUnit(viewportSource.viewportEase, 'viewport.viewportEase'),
    zoomAnchor: null,
  };
  if (viewportSource.zoomAnchor !== undefined && viewportSource.zoomAnchor !== null) {
    let zoomAnchor = requirePlainObject(viewportSource.zoomAnchor, 'viewport.zoomAnchor');
    viewport.zoomAnchor = {
      mx: requireFinite(zoomAnchor.mx, 'viewport.zoomAnchor.mx'),
      my: requireFinite(zoomAnchor.my, 'viewport.zoomAnchor.my'),
    };
  }

  let focusSource = requirePlainObject(raw.focus, 'focus');
  let focus = {
    focusX: requireFinite(focusSource.focusX, 'focus.focusX'),
    focusY: requireFinite(focusSource.focusY, 'focus.focusY'),
    focusActive: requireBoolean(focusSource.focusActive, 'focus.focusActive'),
    prevDragDeltaX: requireFinite(focusSource.prevDragDeltaX, 'focus.prevDragDeltaX'),
    prevDragDeltaY: requireFinite(focusSource.prevDragDeltaY, 'focus.prevDragDeltaY'),
    orientationParallaxEnabled: requireBoolean(focusSource.orientationParallaxEnabled, 'focus.orientationParallaxEnabled'),
    orientationParallaxX: requireFinite(focusSource.orientationParallaxX, 'focus.orientationParallaxX'),
    orientationParallaxY: requireFinite(focusSource.orientationParallaxY, 'focus.orientationParallaxY'),
    orientationParallaxTargetX: requireFinite(focusSource.orientationParallaxTargetX, 'focus.orientationParallaxTargetX'),
    orientationParallaxTargetY: requireFinite(focusSource.orientationParallaxTargetY, 'focus.orientationParallaxTargetY'),
  };

  let layerAnimSource = requirePlainObject(raw.layerAnim, 'layerAnim');
  let layerAnim = {};
  for (let d = 0; d <= 4; d++) {
    let la = requirePlainObject(layerAnimSource[d], `layerAnim[${d}]`);
    layerAnim[d] = {
      scale: requirePositive(la.scale, `layerAnim[${d}].scale`),
      opacity: requireUnit(la.opacity, `layerAnim[${d}].opacity`),
      parallax: requireFinite(la.parallax, `layerAnim[${d}].parallax`),
    };
  }

  let nodeAnimSource = requirePlainObject(raw.nodeAnim, 'nodeAnim');
  let nodeAnim = [];
  for (let [key, value] of Object.entries(nodeAnimSource)) {
    let id = requireSnapshotId(key, 'nodeAnim.id');
    requirePlainObject(value, `nodeAnim.${id}`);
    nodeAnim.push([id, {
      aScale: requirePositive(value.aScale, `nodeAnim.${id}.aScale`),
      aGlow: requireUnit(value.aGlow, `nodeAnim.${id}.aGlow`),
      aRot: requireFinite(value.aRot, `nodeAnim.${id}.aRot`),
      aRotSpeed: requireFinite(value.aRotSpeed, `nodeAnim.${id}.aRotSpeed`),
    }]);
  }

  if (!Array.isArray(raw.edgeAnim)) snapshotFail('edgeAnim');
  let edgeAnim = [];
  for (let [index, entry] of raw.edgeAnim.entries()) {
    requirePlainObject(entry, `edgeAnim[${index}]`);
    if (entry.index !== index) snapshotFail(`edgeAnim[${index}].index`);
    edgeAnim.push({
      index,
      from: requireSnapshotId(entry.from, `edgeAnim[${index}].from`),
      to: requireSnapshotId(entry.to, `edgeAnim[${index}].to`),
      aAlpha: requireUnit(entry.aAlpha, `edgeAnim[${index}].aAlpha`),
      aWidth: requirePositive(entry.aWidth, `edgeAnim[${index}].aWidth`),
    });
  }

  let interactionSource = requirePlainObject(raw.interaction, 'interaction');
  let interaction = {
    activeNodeId: optionalSnapshotId(interactionSource.activeNodeId, 'interaction.activeNodeId'),
    nextActiveNodeId: optionalSnapshotId(interactionSource.nextActiveNodeId, 'interaction.nextActiveNodeId'),
    hoverNodeId: optionalSnapshotId(interactionSource.hoverNodeId, 'interaction.hoverNodeId'),
    dragNodeId: optionalSnapshotId(interactionSource.dragNodeId, 'interaction.dragNodeId'),
    currentGroupId: optionalSnapshotId(interactionSource.currentGroupId, 'interaction.currentGroupId'),
    deactivating: requireBoolean(interactionSource.deactivating, 'interaction.deactivating'),
    menuAnim: requireUnit(interactionSource.menuAnim, 'interaction.menuAnim'),
    hoverAction: typeof interactionSource.hoverAction === 'string'
      ? interactionSource.hoverAction
      : snapshotFail('interaction.hoverAction'),
  };

  if (!Array.isArray(raw.pulses)) snapshotFail('pulses');
  let pulses = raw.pulses.map((pulse, index) => {
    requirePlainObject(pulse, `pulses[${index}]`);
    return {
      id: requireSnapshotId(pulse.id, `pulses[${index}].id`),
      startTime: requireFinite(pulse.startTime, `pulses[${index}].startTime`),
      duration: requirePositive(pulse.duration, `pulses[${index}].duration`),
      waves: requirePositive(pulse.waves, `pulses[${index}].waves`),
    };
  });

  if (!Array.isArray(raw.nodeAppearances)) snapshotFail('nodeAppearances');
  let nodeAppearances = raw.nodeAppearances.map((appearance, index) => {
    requirePlainObject(appearance, `nodeAppearances[${index}]`);
    return {
      id: requireSnapshotId(appearance.id, `nodeAppearances[${index}].id`),
      startTime: requireFinite(appearance.startTime, `nodeAppearances[${index}].startTime`),
      duration: requirePositive(appearance.duration, `nodeAppearances[${index}].duration`),
    };
  });

  if (!Array.isArray(raw.transitionMarkers)) snapshotFail('transitionMarkers');
  let transitionMarkers = raw.transitionMarkers.map(normalizeTransitionMarker);

  let infoPanelSource = requirePlainObject(raw.infoPanel, 'infoPanel');
  if (!Array.isArray(infoPanelSource.lines)) snapshotFail('infoPanel.lines');
  let lines = infoPanelSource.lines.map((line, index) => {
    requirePlainObject(line, `infoPanel.lines[${index}]`);
    if (typeof line.text !== 'string') snapshotFail(`infoPanel.lines[${index}].text`);
    return {
      text: line.text,
      revealed: requireCanvasDimension(line.revealed, `infoPanel.lines[${index}].revealed`),
    };
  });
  if (lines.some((line) => line.revealed > line.text.length)) snapshotFail('infoPanel.lines.revealed');
  let infoPanel = {
    nodeId: optionalSnapshotId(infoPanelSource.nodeId, 'infoPanel.nodeId'),
    lines,
    opacity: requireUnit(infoPanelSource.opacity, 'infoPanel.opacity'),
    startTime: requireFinite(infoPanelSource.startTime, 'infoPanel.startTime'),
    totalExtent: requireNonNegative(infoPanelSource.totalExtent, 'infoPanel.totalExtent'),
    totalExtentY: requireNonNegative(infoPanelSource.totalExtentY, 'infoPanel.totalExtentY'),
    centeredForNode: optionalSnapshotId(infoPanelSource.centeredForNode, 'infoPanel.centeredForNode'),
  };

  let metaSource = requirePlainObject(raw.meta, 'meta');
  let meta = {
    idleFrames: Math.max(0, Math.floor(requireFinite(metaSource.idleFrames, 'meta.idleFrames'))),
    lastAlpha: requireFinite(metaSource.lastAlpha, 'meta.lastAlpha'),
    frameCount: Math.max(0, Math.floor(requireFinite(metaSource.frameCount, 'meta.frameCount'))),
    tickCount: Math.max(0, Math.floor(requireFinite(metaSource.tickCount, 'meta.tickCount'))),
    layoutSettled: requireBoolean(metaSource.layoutSettled, 'meta.layoutSettled'),
    lastRenderTime: nullableFinite(metaSource.lastRenderTime, 'meta.lastRenderTime'),
  };

  return {
    renderMode,
    surface,
    graph: { nodeIds, edges: graphEdges },
    viewport,
    focus,
    layerAnim,
    positions: normalizeIdVecPairs(raw.positions, 'positions'),
    smoothPositions: normalizeIdVecPairs(raw.smoothPositions, 'smoothPositions'),
    nodeAnim,
    edgeAnim,
    interaction,
    pulses,
    nodeAppearances,
    transitionMarkers,
    infoPanel,
    meta,
  };
}

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
export function normalizeCanvasGraphRenderSnapshot(raw) {
  try {
    return buildNormalizedRenderSnapshot(raw);
  } catch {
    return null;
  }
}

export function resolveIdleFrame(options) {
  let {
    targetZoom,
    zoom,
    dragDeltaX,
    dragDeltaY,
    prevDragDeltaX,
    prevDragDeltaY,
    layerAnim,
    isIdle,
    layerTargets,
    lastAlpha,
    dragNode,
    isPanning,
    deactivating,
    targetPanX,
    infoPanel,
    nodeAppearancesActive = false,
    pulsesActive = false,
    statusAnimationsActive = false,
    idleFrames,
    frameStep = 1,
  } = options;

  let zoomSettled = Math.abs(targetZoom - zoom) < 0.001;
  let focusMovement = Math.abs(dragDeltaX - prevDragDeltaX) + Math.abs(dragDeltaY - prevDragDeltaY);
  let focusSettled = focusMovement < 0.1;
  let layerTarget = isIdle ? 1 : layerTargets.scale[0];
  let layerSettled = layerAnim[0] && Math.abs(layerAnim[0].scale - layerTarget) < 0.005;
  let workerActive = lastAlpha > 0.001;
  let hasDrag = !!dragNode || isPanning;
  let hasActiveAnim = deactivating;
  let hasPanAnim = targetPanX !== null;
  let infoPanelAnimating = infoPanel.opacity > 0.01
    && (infoPanel.opacity < 0.99 || infoPanel.lines.some((line) => line.revealed < line.text.length));

  let shouldIdle = zoomSettled
    && focusSettled
    && layerSettled
    && !workerActive
    && !hasDrag
    && !hasActiveAnim
    && !hasPanAnim
    && !nodeAppearancesActive
    && !pulsesActive
    && !statusAnimationsActive
    && !infoPanelAnimating;

  let nextIdleFrames = shouldIdle ? idleFrames + Math.max(0, frameStep) : 0;
  return {
    idleFrames: nextIdleFrames,
    prevDragDeltaX: dragDeltaX,
    prevDragDeltaY: dragDeltaY,
    shouldStop: nextIdleFrames > 3,
  };
}
