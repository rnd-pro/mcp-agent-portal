const SCROLL_SHADOW_SIZE = 'var(--sn-scroll-shadow-size, 14px)';
const SCROLL_FADE_MASK_COLOR = 'var(--sn-scroll-fade-mask-color, var(--sn-sys-on-surface))';
const SCROLL_FADE_AXIS_PROPERTY = '--sn-scroll-fade-axis';
const SCROLL_FADE_MASK_PROPERTY = '--sn-scroll-fade-mask';
const SCROLL_FADE_ACTIVE_MASK_PROPERTY = '--sn-scroll-fade-mask-active';
const SCROLL_FADE_THRESHOLD = 1;

function scrollFadeMask(direction) {
  return `linear-gradient(${direction}, transparent 0, ${SCROLL_FADE_MASK_COLOR} ${SCROLL_SHADOW_SIZE}, ${SCROLL_FADE_MASK_COLOR} calc(100% - ${SCROLL_SHADOW_SIZE}), transparent 100%)`;
}

let observedScrollFadeHosts = new WeakSet();
let scrollFadeResizeObserver = null;
let scrollFadeScanPending = false;

function ownerWindow(node) {
  return node?.ownerDocument?.defaultView || globalThis.window || globalThis;
}

function isElementNode(node) {
  let ElementCtor = ownerWindow(node)?.Element || globalThis.Element;
  return typeof ElementCtor === 'function' && node instanceof ElementCtor;
}

function computedStylesFor(element) {
  let getStyles = ownerWindow(element)?.getComputedStyle || globalThis.getComputedStyle;
  if (typeof getStyles !== 'function') return null;
  let styles = getStyles(element);
  return styles && typeof styles.getPropertyValue === 'function' ? styles : null;
}

function readScrollFadeAxis(element, styles = computedStylesFor(element)) {
  if (!styles) return '';
  let axis = styles.getPropertyValue(SCROLL_FADE_AXIS_PROPERTY).trim();
  if (axis !== 'block' && axis !== 'inline') return '';

  // The axis token inherits, so require the mask chrome emitted by the helper.
  let maskSize = styles.maskSize || styles.webkitMaskSize || '';
  let maskRepeat = styles.maskRepeat || styles.webkitMaskRepeat || '';
  if (!maskSize.includes('100% 100%') || !maskRepeat.includes('no-repeat')) return '';
  return axis;
}

function hasAxisOverflow(element, axis) {
  let inlineOverflow = element.scrollWidth > element.clientWidth + SCROLL_FADE_THRESHOLD;
  let blockOverflow = element.scrollHeight > element.clientHeight + SCROLL_FADE_THRESHOLD;
  return axis === 'inline'
    ? inlineOverflow && !blockOverflow
    : blockOverflow && !inlineOverflow;
}

function updateScrollFadeHost(element) {
  let styles = computedStylesFor(element);
  if (!styles) return;
  let axis = readScrollFadeAxis(element, styles);
  if (axis !== 'block' && axis !== 'inline') return;

  let active = hasAxisOverflow(element, axis);
  let activeMask = styles.getPropertyValue(SCROLL_FADE_ACTIVE_MASK_PROPERTY).trim();
  let nextMask = active && activeMask ? activeMask : 'none';
  if (element.style.getPropertyValue(SCROLL_FADE_MASK_PROPERTY) !== nextMask) {
    element.style.setProperty(SCROLL_FADE_MASK_PROPERTY, nextMask);
  }
  if (element.hasAttribute('data-sn-scroll-fade-active') !== active) {
    element.toggleAttribute('data-sn-scroll-fade-active', active);
  }
}

function updateScrollFadeAncestors(node) {
  let current = isElementNode(node) ? node : node?.parentElement;
  while (current) {
    if (observedScrollFadeHosts.has(current)) updateScrollFadeHost(current);
    let root = current.parentElement ? null : current.getRootNode?.();
    current = current.parentElement || root?.host || null;
  }
}

function observeScrollFadeHost(element) {
  if (observedScrollFadeHosts.has(element)) return;
  let axis = readScrollFadeAxis(element);
  if (axis !== 'block' && axis !== 'inline') return;

  observedScrollFadeHosts.add(element);
  element.addEventListener('scroll', () => updateScrollFadeHost(element), { passive: true });
  scrollFadeResizeObserver?.observe(element);
  updateScrollFadeHost(element);
}

function scanScrollFadeHosts(root = document) {
  if (!root?.querySelectorAll) return;
  if (root.nodeType === 1) observeScrollFadeHost(root);
  for (let element of root.querySelectorAll('*')) {
    observeScrollFadeHost(element);
  }
}

function scheduleScrollFadeScan(root = document) {
  if (scrollFadeScanPending) return;
  scrollFadeScanPending = true;
  let schedule = ownerWindow(root)?.requestAnimationFrame || globalThis.requestAnimationFrame;
  if (typeof schedule !== 'function') {
    scrollFadeScanPending = false;
    scanScrollFadeHosts(root);
    return;
  }
  schedule(() => {
    scrollFadeScanPending = false;
    scanScrollFadeHosts(root);
  });
}

function installScrollFadeController() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__symbioteScrollFadeControllerInstalled) return;
  window.__symbioteScrollFadeControllerInstalled = true;

  scrollFadeResizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver((entries) => {
      for (let entry of entries) updateScrollFadeHost(entry.target);
    })
    : null;

  let MutationObserverCtor = window.MutationObserver || globalThis.MutationObserver;
  if (typeof MutationObserverCtor !== 'function') {
    scheduleScrollFadeScan();
    return;
  }

  let mutationObserver = new MutationObserverCtor((mutations) => {
    for (let mutation of mutations) {
      if (isElementNode(mutation.target)) observeScrollFadeHost(mutation.target);
      updateScrollFadeAncestors(mutation.target);
      for (let node of mutation.addedNodes) {
        if (isElementNode(node)) scanScrollFadeHosts(node);
        updateScrollFadeAncestors(node);
      }
    }
  });

  let start = () => {
    mutationObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
      childList: true,
      subtree: true,
    });
    scheduleScrollFadeScan();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

export function themedScrollFadeStyles(axis = 'block') {
  let mask = axis === 'inline'
    ? scrollFadeMask('to right')
    : scrollFadeMask('to bottom');
  return `
  ${SCROLL_FADE_AXIS_PROPERTY}: ${axis};
  ${SCROLL_FADE_ACTIVE_MASK_PROPERTY}: ${mask};
  ${SCROLL_FADE_MASK_PROPERTY}: none;
  -webkit-mask-image: var(${SCROLL_FADE_MASK_PROPERTY});
  mask-image: var(${SCROLL_FADE_MASK_PROPERTY});
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-mode: alpha;
  mask-mode: alpha;
`;
}

export let themedScrollFadeBlockStyles = themedScrollFadeStyles('block');
export let themedScrollFadeInlineStyles = themedScrollFadeStyles('inline');

installScrollFadeController();
