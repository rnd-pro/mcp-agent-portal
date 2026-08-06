const DEFAULT_OVERLAY_Z_BASE = 20000;
const DEFAULT_OVERLAY_Z_TIER = 'global';

let overlayZCounters = new Map([[DEFAULT_OVERLAY_Z_TIER, DEFAULT_OVERLAY_Z_BASE]]);
let overlayHomes = new WeakMap();

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function toNumber(value, fallback = 0) {
  let number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

function readOverlayBase(element) {
  if (typeof getComputedStyle !== 'function' || !element) return DEFAULT_OVERLAY_Z_BASE;
  let value = getComputedStyle(element).getPropertyValue('--sn-overlay-z-base').trim();
  let number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : DEFAULT_OVERLAY_Z_BASE;
}

function readOverlayTier(element) {
  if (typeof getComputedStyle !== 'function' || !element) return DEFAULT_OVERLAY_Z_TIER;
  let value = getComputedStyle(element).getPropertyValue('--sn-overlay-z-tier').trim();
  return value || DEFAULT_OVERLAY_Z_TIER;
}

function readCssNumber(element, name, fallback = 0) {
  if (!element || typeof getComputedStyle !== 'function') return fallback;
  return toNumber(getComputedStyle(element).getPropertyValue(name), fallback);
}

function normalizeRect(rect = null) {
  if (!rect) return null;
  let left = toNumber(rect.left ?? rect.x, 0);
  let top = toNumber(rect.top ?? rect.y, 0);
  let width = toNumber(rect.width, toNumber(rect.right, left) - left);
  let height = toNumber(rect.height, toNumber(rect.bottom, top) - top);
  let right = toNumber(rect.right, left + width);
  let bottom = toNumber(rect.bottom, top + height);
  return { left, top, right, bottom, width: Math.max(0, width), height: Math.max(0, height) };
}

function rectFromTarget(target, fallback = null) {
  if (!target) return fallback;
  if (typeof target.getBoundingClientRect === 'function') {
    return normalizeRect(target.getBoundingClientRect());
  }
  return normalizeRect(target) || fallback;
}

function viewportRect() {
  let width = typeof window !== 'undefined' ? window.innerWidth || 0 : 0;
  let height = typeof window !== 'undefined' ? window.innerHeight || 0 : 0;
  return { left: 0, top: 0, right: width, bottom: height, width, height };
}

function isHidden(element) {
  return !element || element.hidden || element.hasAttribute?.('hidden');
}

function normalizeOverlayItem(overlay, index = 0) {
  if (!overlay) return null;
  if (overlay.element) return { ...overlay, index, element: overlay.element };
  return { index, element: overlay };
}

function visibleOverlayItems(overlays = []) {
  return Array.from(overlays || [])
    .map((overlay, index) => normalizeOverlayItem(overlay, index))
    .filter((item) => item?.element && !isHidden(item.element));
}

function intersects(a, b) {
  return Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
}

function shiftedRect(rect, top, left) {
  return {
    ...rect,
    top,
    left,
    right: left + rect.width,
    bottom: top + rect.height,
  };
}

function clearOverlayElement(element) {
  if (!element?.style) return;
  element.removeAttribute?.('data-overlay-stack-item');
  element.removeAttribute?.('data-overlay-stack-index');
  element.removeAttribute?.('data-overlay-stack-placement');
  element.style.removeProperty('top');
  element.style.removeProperty('left');
  element.style.removeProperty('inset');
  element.style.removeProperty('position');
  element.style.removeProperty('z-index');
}

function collectCustomProperties(style) {
  let names = new Set();
  if (!style) return names;
  for (let i = 0; i < style.length; i += 1) {
    let name = style.item?.(i) || style[i];
    if (typeof name === 'string' && name.startsWith('--sn-')) {
      names.add(name);
    }
  }
  return names;
}

export function nextOverlayZIndex(element = null) {
  let tier = readOverlayTier(element);
  let base = readOverlayBase(element);
  let current = overlayZCounters.get(tier) ?? base;
  let next = Math.max(current, base) + 1;
  overlayZCounters.set(tier, next);
  return next;
}

export function bringOverlayToFront(element) {
  let zIndex = nextOverlayZIndex(element);
  if (element?.style) {
    element.style.zIndex = String(zIndex);
    element.setAttribute?.('data-overlay-z', String(zIndex));
    element.setAttribute?.('data-overlay-tier', readOverlayTier(element));
  }
  return zIndex;
}

export function resetOverlayStack(value = DEFAULT_OVERLAY_Z_BASE) {
  overlayZCounters = new Map([[DEFAULT_OVERLAY_Z_TIER, Number.isFinite(value) ? value : DEFAULT_OVERLAY_Z_BASE]]);
}

export function measureOverlayStackReserve({
  anchor,
  overlays = [],
  placement = 'block-start',
} = {}) {
  let anchorRect = rectFromTarget(anchor);
  if (!anchorRect) return 0;
  let visible = visibleOverlayItems(overlays)
    .map((item) => rectFromTarget(item.element))
    .filter(Boolean);
  if (!visible.length) return 0;

  if (placement === 'block-end') {
    let maxBottom = Math.max(...visible.map((rect) => rect.bottom));
    return Math.max(0, Math.ceil(maxBottom - anchorRect.bottom));
  }

  let minTop = Math.min(...visible.map((rect) => rect.top));
  return Math.max(0, Math.ceil(anchorRect.top - minTop));
}

export function clearOverlayStack(overlays = [], {
  reserveTarget = null,
  reserveProperty = '--sn-chat-overlay-stack-reserve',
} = {}) {
  for (let item of Array.from(overlays || []).map((overlay, index) => normalizeOverlayItem(overlay, index))) {
    clearOverlayElement(item?.element);
  }
  reserveTarget?.style?.setProperty(reserveProperty, '0px');
  return { visible: 0, reserveBlockSize: 0, rects: [] };
}

export function layoutOverlayStack({
  anchor,
  overlays = [],
  container = null,
  avoid = [],
  placement = 'block-start',
  align = 'center',
  gap = null,
  viewportGutter = null,
  reserveTarget = null,
  reserveProperty = '--sn-chat-overlay-stack-reserve',
} = {}) {
  if (typeof window === 'undefined') {
    return { visible: 0, reserveBlockSize: 0, rects: [] };
  }

  let anchorRect = rectFromTarget(anchor);
  if (!anchorRect) return clearOverlayStack(overlays, { reserveTarget, reserveProperty });

  let allItems = Array.from(overlays || []).map((overlay, index) => normalizeOverlayItem(overlay, index)).filter(Boolean);
  let stackItems = allItems.filter((item) => item?.element && !isHidden(item.element));
  for (let item of allItems) {
    if (!stackItems.includes(item)) clearOverlayElement(item.element);
  }
  if (!stackItems.length) return clearOverlayStack(overlays, { reserveTarget, reserveProperty });

  let containerRect = rectFromTarget(container, viewportRect()) || viewportRect();
  let firstElement = stackItems[0].element;
  let resolvedGap = gap ?? readCssNumber(firstElement, '--sn-overlay-stack-gap', 8);
  let resolvedGutter = viewportGutter ?? readCssNumber(firstElement, '--sn-overlay-stack-viewport-gutter', 16);
  let avoidRects = Array.from(avoid || [])
    .filter((element) => element && !isHidden(element))
    .map((element) => rectFromTarget(element))
    .filter(Boolean);
  let cursor = placement === 'block-end'
    ? anchorRect.bottom + resolvedGap
    : anchorRect.top - resolvedGap;
  let baseZ = readOverlayBase(firstElement);
  let rects = [];

  stackItems.forEach((item, index) => {
    let element = item.element;
    element.style.position = 'fixed';
    element.style.inset = 'auto';
    element.style.zIndex = String(baseZ + 5 + index);
    element.setAttribute('data-overlay-stack-item', '');
    element.setAttribute('data-overlay-stack-index', String(index));
    element.setAttribute('data-overlay-stack-placement', placement);

    let measured = rectFromTarget(element) || { width: 0, height: 0 };
    let width = measured.width || element.offsetWidth || 0;
    let height = measured.height || element.offsetHeight || 0;
    let minLeft = containerRect.left + resolvedGutter;
    let maxLeft = containerRect.right - width - resolvedGutter;
    let itemAnchorRect = rectFromTarget(item.anchor, anchorRect) || anchorRect;
    let itemAlign = item.align || align;
    let left = itemAlign === 'start'
      ? itemAnchorRect.left
      : itemAlign === 'end'
        ? itemAnchorRect.right - width
        : itemAnchorRect.left + ((itemAnchorRect.width - width) / 2);
    left += toNumber(item.inlineOffset, 0);
    left = clamp(left, minLeft, maxLeft);

    let top = placement === 'block-end' ? cursor : cursor - height;
    let rect = shiftedRect({ width, height }, top, left);
    for (let avoidRect of avoidRects) {
      if (!intersects(rect, avoidRect)) continue;
      top = placement === 'block-end'
        ? avoidRect.bottom + resolvedGap
        : avoidRect.top - resolvedGap - height;
      rect = shiftedRect({ width, height }, top, left);
    }

    top = placement === 'block-end'
      ? clamp(top, containerRect.top + resolvedGutter, containerRect.bottom - height - resolvedGutter)
      : clamp(top, containerRect.top + resolvedGutter, containerRect.bottom - height - resolvedGutter);
    rect = shiftedRect({ width, height }, top, left);

    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;

    if (item.caretTarget) {
      let caretTargetRect = rectFromTarget(item.caretTarget);
      if (caretTargetRect) {
        let property = item.caretProperty || '--sn-overlay-caret-inline';
        let inset = caretTargetRect.left + (caretTargetRect.width / 2) - left;
        element.style.setProperty(property, `${Math.round(clamp(inset, 0, width))}px`);
      }
    }

    rects.push({ element, ...rect });
    cursor = placement === 'block-end' ? rect.bottom + resolvedGap : rect.top - resolvedGap;
  });

  let reserveBlockSize = measureOverlayStackReserve({ anchor: anchorRect, overlays: stackItems, placement });
  reserveTarget?.style?.setProperty(reserveProperty, `${reserveBlockSize}px`);
  return { visible: stackItems.length, reserveBlockSize, rects };
}

export function syncOverlayTheme(element, themeSource) {
  if (!element?.style || !themeSource || typeof getComputedStyle !== 'function') return;

  let computed = getComputedStyle(themeSource);
  let inline = themeSource.style;
  let names = new Set([
    ...collectCustomProperties(computed),
    ...collectCustomProperties(inline),
  ]);

  for (let name of names) {
    let value = computed.getPropertyValue(name).trim() || inline?.getPropertyValue(name)?.trim();
    if (value) element.style.setProperty(name, value);
  }
}

export function mountOverlayToDocument(element, themeSource = element?.parentElement) {
  let body = element?.ownerDocument?.body;
  if (!element || !body) return false;

  if (!overlayHomes.has(element)) {
    overlayHomes.set(element, {
      parent: element.parentNode,
      nextSibling: element.nextSibling,
    });
  }

  syncOverlayTheme(element, themeSource);
  element.toggleAttribute('data-overlay-portal', true);
  if (element.parentNode !== body) body.appendChild(element);
  return true;
}

export function restoreOverlayHome(element) {
  let home = overlayHomes.get(element);
  if (!element || !home?.parent) return false;

  if (home.nextSibling?.parentNode === home.parent) {
    home.parent.insertBefore(element, home.nextSibling);
  } else {
    home.parent.appendChild(element);
  }
  element.removeAttribute('data-overlay-portal');
  overlayHomes.delete(element);
  return true;
}
