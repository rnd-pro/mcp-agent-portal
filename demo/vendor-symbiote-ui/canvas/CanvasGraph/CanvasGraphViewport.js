export const MIN_CANVAS_GRAPH_ZOOM = 0.02;
export const MAX_CANVAS_GRAPH_ZOOM = 5;
export const MAX_ZOOM_OUT_FIT_MULTIPLIER = 4;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveArcControl(start, route, target) {
  return route * 2 - (start + target) / 2;
}

function resolveQuadraticArc(start, route, target, progress) {
  let t = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  let inverse = 1 - t;
  let control = resolveArcControl(start, route, target);
  return inverse * inverse * start + 2 * inverse * t * control + t * t * target;
}

export function resolveCanvasGraphTransitionProgress(progress) {
  let t = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function createFocusTransitionClock(explicitStartTime) {
  let hasExplicitStart = Number.isFinite(explicitStartTime);
  let start = hasExplicitStart ? Number(explicitStartTime) : null;
  let last = null;
  return {
    resolveStart(now) {
      let current = Number(now);
      if (start === null) start = current;
      if (!hasExplicitStart && last !== null && current > last) {
        let delta = current - last;
        if (delta > 64) start += delta - 64;
      }
      if (last === null || current > last) last = current;
      return start;
    },
  };
}

export function alignSampledRouteEndpoints(points, start, end) {
  if (!Array.isArray(points) || points.length < 2 || !start || !end) return points;
  let first = points[0];
  let last = points.at(-1);
  let startDx = start.x - first.x;
  let startDy = start.y - first.y;
  let endDx = end.x - last.x;
  let endDy = end.y - last.y;
  let cumulative = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    cumulative.push(total);
  }
  return points.map((point, i) => {
    let progress = total > 0 ? cumulative[i] / total : i / (points.length - 1);
    return {
      x: point.x + startDx * (1 - progress) + endDx * progress,
      y: point.y + startDy * (1 - progress) + endDy * progress,
    };
  });
}

export function resolveCanvasGraphTransitionDuration({
  transitionMs,
  duration,
  transitionMarkerMs,
  routeDistance = 0,
  distanceScale = 1,
  speed = 900,
  minMs = 620,
  maxMs = 1800,
  fallbackMs = 680,
  motionScale = 1,
  disabled = false,
} = {}) {
  if (disabled) return 0;
  let explicitMs = Number(transitionMs);
  if (!Number.isFinite(explicitMs)) explicitMs = Number(duration);
  if (!Number.isFinite(explicitMs)) explicitMs = Number(transitionMarkerMs);

  let safeMin = Number.isFinite(minMs) ? Math.max(0, minMs) : 620;
  let safeMax = Number.isFinite(maxMs) ? Math.max(safeMin, maxMs) : 1800;
  let safeSpeed = Number.isFinite(speed) ? Math.max(1, speed) : 900;
  let scaledDistance = Math.max(0, Number(routeDistance) || 0)
    * Math.max(0, Number.isFinite(distanceScale) ? distanceScale : 1);
  let resolved = Number.isFinite(explicitMs)
    ? Math.max(0, explicitMs)
    : clamp(
        scaledDistance > 0 ? (scaledDistance / safeSpeed) * 1000 : fallbackMs,
        safeMin,
        safeMax
      );
  let scale = Number.isFinite(motionScale) ? Math.max(0, motionScale) : 1;
  return Math.max(0, resolved * scale);
}

export function viewportToCameraCenter(viewport, rect) {
  let zoom = Number.isFinite(viewport?.zoom) && viewport.zoom > 0 ? viewport.zoom : 1;
  return {
    x: ((rect?.width || 0) / 2 - (viewport?.panX || 0)) / zoom,
    y: ((rect?.height || 0) / 2 - (viewport?.panY || 0)) / zoom,
  };
}

export function cameraCenterToViewport(center, zoom, rect) {
  let safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : MIN_CANVAS_GRAPH_ZOOM;
  return {
    zoom: safeZoom,
    panX: (rect?.width || 0) / 2 - (center?.x || 0) * safeZoom,
    panY: (rect?.height || 0) / 2 - (center?.y || 0) * safeZoom,
  };
}

export function resolveCanvasGraphCameraArc({
  startCenter,
  routeCenter,
  targetCenter,
  startZoom,
  routeZoom,
  targetZoom,
  rect,
  progress = 0,
  minZoom = MIN_CANVAS_GRAPH_ZOOM,
  maxZoom = MAX_CANVAS_GRAPH_ZOOM,
} = {}) {
  let arcProgress = resolveCanvasGraphTransitionProgress(progress);
  let safeStartZoom = Number.isFinite(startZoom) && startZoom > 0
    ? startZoom
    : MIN_CANVAS_GRAPH_ZOOM;
  let safeRouteZoom = Number.isFinite(routeZoom) && routeZoom > 0
    ? routeZoom
    : safeStartZoom;
  let safeTargetZoom = Number.isFinite(targetZoom) && targetZoom > 0
    ? targetZoom
    : safeStartZoom;
  let center = {
    x: resolveQuadraticArc(startCenter?.x || 0, routeCenter?.x || 0, targetCenter?.x || 0, arcProgress),
    y: resolveQuadraticArc(startCenter?.y || 0, routeCenter?.y || 0, targetCenter?.y || 0, arcProgress),
  };
  let logZoom = resolveQuadraticArc(
    Math.log(safeStartZoom),
    Math.log(safeRouteZoom),
    Math.log(safeTargetZoom),
    arcProgress
  );
  let zoom = clamp(
    Math.exp(logZoom),
    Number.isFinite(minZoom) ? minZoom : MIN_CANVAS_GRAPH_ZOOM,
    Number.isFinite(maxZoom) ? maxZoom : MAX_CANVAS_GRAPH_ZOOM
  );
  return cameraCenterToViewport(center, zoom, rect);
}

export function resolveFitPadding(padding, rect) {
  let requested = Number.isFinite(padding) ? padding : 0;
  let minSide = Math.min(rect?.width || 0, rect?.height || 0);
  if (minSide <= 0) return Math.max(0, requested);
  let maxPadding = Math.max(12, minSide * 0.32);
  return Math.max(0, Math.min(requested, maxPadding));
}

export function resolveFrameFitZoom(frame, rect, padding = 0) {
  if (!frame || !rect || rect.width === 0 || rect.height === 0) return MIN_CANVAS_GRAPH_ZOOM;
  let graphW = frame.maxX - frame.minX || 1;
  let graphH = frame.maxY - frame.minY || 1;
  return Math.min(
    Math.max(1, rect.width - padding * 2) / graphW,
    Math.max(1, rect.height - padding * 2) / graphH
  );
}

export function resolveCanvasGraphViewportFit({
  frame,
  rect,
  padding = 0,
  minZoom = MIN_CANVAS_GRAPH_ZOOM,
  maxZoom = 2,
} = {}) {
  let fitPadding = resolveFitPadding(padding, rect);
  let zoom = clamp(
    resolveFrameFitZoom(frame, rect, fitPadding),
    Number.isFinite(minZoom) ? minZoom : MIN_CANVAS_GRAPH_ZOOM,
    Number.isFinite(maxZoom) ? maxZoom : 2
  );
  let cx = frame ? (frame.minX + frame.maxX) / 2 : 0;
  let cy = frame ? (frame.minY + frame.maxY) / 2 : 0;
  return {
    zoom,
    panX: (rect?.width || 0) / 2 - cx * zoom,
    panY: (rect?.height || 0) / 2 - cy * zoom,
    padding: fitPadding,
  };
}

export function resolveCanvasGraphMinZoom({
  frame,
  rect,
  padding = 0,
  visibleNodeCount = 0,
} = {}) {
  if (visibleNodeCount <= 1) return MIN_CANVAS_GRAPH_ZOOM;
  let fitPadding = resolveFitPadding(padding, rect);
  let fitZoom = resolveFrameFitZoom(frame, rect, fitPadding);
  if (!Number.isFinite(fitZoom) || fitZoom <= 0) return MIN_CANVAS_GRAPH_ZOOM;
  return Math.max(
    MIN_CANVAS_GRAPH_ZOOM,
    Math.min(MAX_CANVAS_GRAPH_ZOOM, fitZoom / MAX_ZOOM_OUT_FIT_MULTIPLIER)
  );
}
