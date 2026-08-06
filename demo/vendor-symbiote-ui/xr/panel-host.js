import { createXRPanelContentViewport } from './layout-projection.js';
import { createXRPanelPointerTarget, resolveXRHitMap } from './pointer.js';
import { freezeSpatialValue } from './spatial-contract.js';

function defaultComponentResolver(name) {
  return name;
}

function defaultPropsResolver(node = {}, panel = {}) {
  return {
    ...(panel.state || {}),
    ...(node.props || {}),
  };
}

function toKebabName(value) {
  return String(value || '').trim();
}

function applyAttributes(element, attrs = {}) {
  for (let [name, value] of Object.entries(attrs || {})) {
    if (value === false || value == null) continue;
    if (value === true) {
      element.setAttribute(name, '');
    } else {
      element.setAttribute(name, String(value));
    }
  }
}

function applyProps(element, props = {}) {
  for (let [name, value] of Object.entries(props || {})) {
    element[name] = value;
  }
}

function applyThemeScope(element, node = {}, panel = {}) {
  let scope = node.theme?.name || node.themeScope || panel.themeScope;
  if (scope) {
    element.dataset.themeScope = scope;
    element.setAttribute('data-theme-scope', scope);
  }
}

function setStyleProperty(element, name, value) {
  if (!element?.style) return;
  if (typeof element.style.setProperty === 'function') {
    element.style.setProperty(name, value);
    return;
  }
  element.style[name] = value;
}

function applyPanelViewport(element, panel) {
  let viewport = panel.contentViewport || createXRPanelContentViewport(panel);
  setStyleProperty(element, '--sn-xr-content-width', `${viewport.width}px`);
  setStyleProperty(element, '--sn-xr-content-height', `${viewport.height}px`);
  setStyleProperty(element, '--sn-xr-content-scale', String(viewport.scale));
  setStyleProperty(element, '--sn-xr-panel-meter-width', `${panel.size?.[0] || 0}m`);
  setStyleProperty(element, '--sn-xr-panel-meter-height', `${panel.size?.[1] || 0}m`);
  setStyleProperty(element, 'width', `${viewport.width}px`);
  setStyleProperty(element, 'height', `${viewport.height}px`);
  return viewport;
}

function appendChildren(host, node, context) {
  for (let child of node.children || []) {
    host.append(createComponentElement(child, context));
  }
}

function fallbackElement(documentRef, panel, reason) {
  let element = documentRef.createElement('section');
  element.className = 'sn-xr-panel-fallback';
  element.dataset.reason = reason;
  element.textContent = `XR panel fallback: ${reason}`;
  element.setAttribute('role', 'note');
  return element;
}

function resolveComponentTarget(node, panel, context) {
  let requested = node.component || panel.component || panel.panelType;
  let resolved = context.componentResolver(requested, node, panel);
  if (typeof resolved === 'string') {
    return { tagName: toKebabName(resolved), ComponentClass: null };
  }
  if (typeof resolved === 'function') {
    return { tagName: toKebabName(resolved.tagName || node.component || panel.component), ComponentClass: resolved };
  }
  if (resolved && typeof resolved === 'object') {
    return {
      tagName: toKebabName(resolved.tagName || resolved.name || node.component || panel.component),
      ComponentClass: typeof resolved.ComponentClass === 'function' ? resolved.ComponentClass : null,
    };
  }
  return { tagName: '', ComponentClass: null };
}

function createComponentElement(node, context, panel = node) {
  let documentRef = context.document;
  let target = resolveComponentTarget(node, panel, context);
  if (!target.tagName) {
    return fallbackElement(documentRef, panel, 'component-unresolved');
  }
  if (
    target.ComponentClass &&
    typeof context.customElements?.define === 'function' &&
    !context.customElements.get(target.tagName)
  ) {
    context.customElements.define(target.tagName, target.ComponentClass);
  }

  let element = documentRef.createElement(target.tagName);
  applyProps(element, context.propsResolver(node, panel));
  applyAttributes(element, node.attrs);
  applyThemeScope(element, node, panel);
  if (Array.isArray(node.children) && node.children.length) {
    appendChildren(element, node, context);
  }
  return element;
}

function createContext(options = {}) {
  let documentRef = options.document || globalThis.document;
  if (!documentRef?.createElement) {
    throw new Error('createXRPanelHost requires a document with createElement().');
  }
  return {
    document: documentRef,
    globalThis: options.globalThis || documentRef.defaultView || globalThis,
    customElements: options.customElements || documentRef.defaultView?.customElements || globalThis.customElements,
    componentResolver: options.componentResolver || defaultComponentResolver,
    propsResolver: options.propsResolver || defaultPropsResolver,
  };
}

function createHostEvent(context, type, detail) {
  let EventCtor = context.globalThis?.CustomEvent;
  if (typeof EventCtor === 'function') {
    return new EventCtor(type, { bubbles: true, composed: true, detail });
  }
  return {
    type,
    bubbles: true,
    composed: true,
    detail,
  };
}

function createPointerDomEvent(context, pointerEvent, target) {
  let EventCtor = context.globalThis?.PointerEvent;
  if (typeof EventCtor !== 'function') return null;
  return new EventCtor(pointerEvent.type || 'pointermove', {
    bubbles: false,
    composed: false,
    clientX: target.contentPoint.x,
    clientY: target.contentPoint.y,
    buttons: pointerEvent.buttons?.primary ? 1 : 0,
    button: pointerEvent.buttons?.primary ? 0 : -1,
    pointerType: pointerEvent.source === 'mouse-fallback' ? 'mouse' : 'xr',
    isPrimary: true,
  });
}

export function createXRPanelHost(options = {}) {
  let context = createContext(options);
  let panels = new Map();
  let scene = null;
  let themeSnapshot = options.themeSnapshot || null;
  let dispatchDepth = 0;
  let activeFocusPanelId = null;
  let pendingSelections = new Map();

  function getState() {
    return {
      scene,
      themeSnapshot,
      mounted: panels.size,
      panelIds: [...panels.keys()],
      activeFocusPanelId,
      pendingSelectionSourceIds: [...pendingSelections.keys()],
    };
  }

  function setScene(nextScene, sceneOptions = {}) {
    scene = nextScene || null;
    themeSnapshot = sceneOptions.themeSnapshot || themeSnapshot || null;
    panels.clear();
    activeFocusPanelId = null;
    pendingSelections.clear();
    return getState();
  }

  function getPanelState(record) {
    return record.panel;
  }

  function mountPanel(panel, container) {
    if (!panel || !container?.replaceChildren) {
      throw new Error('mountPanel(panel, container) requires a panel and a DOM container.');
    }

    let node = panel.layoutNode || panel;
    let element = createComponentElement(node, context, panel);
    element.dataset.xrPanelId = panel.id;
    element.classList.add('sn-xr-panel-live-root');
    let contentViewport = applyPanelViewport(element, panel);
    applyPanelViewport(container, { ...panel, contentViewport });
    container.replaceChildren(element);

    panels.set(panel.id, {
      panel,
      container,
      element,
      contentViewport,
      focused: false,
    });
    return element;
  }

  function unmountPanel(panelId) {
    let record = panels.get(panelId);
    if (!record) return false;
    if (record.element?._snObserver) {
      record.element._snObserver.disconnect();
      if (record.element._snDebounceTimeout) clearTimeout(record.element._snDebounceTimeout);
    }
    record.container.replaceChildren();
    panels.delete(panelId);
    for (let [sourceId, pending] of pendingSelections) {
      if (pending.panelId === panelId) pendingSelections.delete(sourceId);
    }
    if (activeFocusPanelId === panelId) {
      activeFocusPanelId = null;
    }
    return true;
  }

  function getPanelElement(panelId) {
    return panels.get(panelId)?.element || null;
  }

  function focusPanel(panelId) {
    let record = panels.get(panelId);
    if (!record) return false;

    if (activeFocusPanelId && activeFocusPanelId !== panelId) {
      let prevRecord = panels.get(activeFocusPanelId);
      if (prevRecord) {
        prevRecord.focused = false;
        prevRecord.element.classList.remove('sn-xr-panel-focused');
        prevRecord.container.classList.remove('sn-xr-panel-focused');
        prevRecord.element.dispatchEvent(createHostEvent(context, 'xr-panel-blur', {
          panelId: activeFocusPanelId,
        }));
      }
    }

    activeFocusPanelId = panelId;
    record.focused = true;
    record.element.classList.add('sn-xr-panel-focused');
    record.container.classList.add('sn-xr-panel-focused');

    record.element.dispatchEvent(createHostEvent(context, 'xr-panel-focus', {
      panelId,
    }));
    return true;
  }

  function cleanup() {
    for (let panelId of [...panels.keys()]) {
      unmountPanel(panelId);
    }
    panels.clear();
    activeFocusPanelId = null;
    pendingSelections.clear();
    scene = null;
  }

  function resolveInteraction(pointerEvent, record, options) {
    let hitMap = options.hitMap || record.panel.hitMap || null;
    let sourceId = pointerEvent.sourceId || null;
    let sessionId = pointerEvent.sessionId || options.sessionId || null;
    let frame = pointerEvent.frame || options.frame || null;
    if (!sourceId) return { ok: false, reason: 'missing-source-id', target: null, contentPoint: null };
    if (!sessionId) return { ok: false, reason: 'missing-session-id', target: null, contentPoint: null };
    return resolveXRHitMap(pointerEvent.point, hitMap, {
      panelId: record.panel.id,
      contentHash: options.contentHash || record.panel.contentHash,
      revision: options.revision ?? record.panel.revision,
      sessionId,
      frame,
      pointSpace: 'normalized',
      maximumFrameAge: options.maximumFrameAge,
      maximumAgeMs: options.maximumAgeMs,
    });
  }

  function beginSelection(pointerEvent, record, options) {
    let resolved = resolveInteraction(pointerEvent, record, options);
    if (!resolved.ok) return resolved;
    let receipt = freezeSpatialValue({
      sessionId: pointerEvent.sessionId || options.sessionId,
      sourceId: pointerEvent.sourceId,
      panelId: record.panel.id,
      targetId: resolved.target.id,
      action: resolved.target.action,
      contentHash: options.contentHash || record.panel.contentHash,
      revision: options.revision ?? record.panel.revision,
      startFrameId: (pointerEvent.frame || options.frame).id,
      startSequence: (pointerEvent.frame || options.frame).sequence,
      startTime: (pointerEvent.frame || options.frame).time,
    });
    pendingSelections.set(receipt.sourceId, receipt);
    return { ...resolved, receipt };
  }

  function endSelection(pointerEvent, record, options) {
    let sourceId = pointerEvent.sourceId || null;
    let pending = pendingSelections.get(sourceId);
    pendingSelections.delete(sourceId);
    if (!pending) return { ok: false, reason: 'selectstart-missing', target: null, contentPoint: null };
    let resolved = resolveInteraction(pointerEvent, record, options);
    if (!resolved.ok) return resolved;
    let frame = pointerEvent.frame || options.frame;
    let contentHash = options.contentHash || record.panel.contentHash;
    let revision = options.revision ?? record.panel.revision;
    let sessionId = pointerEvent.sessionId || options.sessionId;
    let duration = frame.time - pending.startTime;
    let maximumDurationMs = Number.isFinite(options.maximumInteractionDurationMs)
      ? options.maximumInteractionDurationMs
      : 1_000;
    if (
      pending.sessionId !== sessionId ||
      pending.sourceId !== sourceId ||
      pending.panelId !== record.panel.id ||
      pending.targetId !== resolved.target.id ||
      pending.contentHash !== contentHash ||
      pending.revision !== revision ||
      frame.sequence < pending.startSequence ||
      duration < 0 || duration > maximumDurationMs
    ) {
      return { ok: false, reason: 'selection-mismatch', target: null, contentPoint: resolved.contentPoint };
    }
    let receipt = freezeSpatialValue({
      ...pending,
      endFrameId: frame.id,
      endSequence: frame.sequence,
      endTime: frame.time,
      durationMs: duration,
    });
    record.element.dispatchEvent(createHostEvent(context, 'xr-panel-action', {
      panelId: record.panel.id,
      targetId: resolved.target.id,
      action: resolved.target.action,
      contentPoint: resolved.contentPoint,
      receipt,
    }));
    return { ...resolved, receipt };
  }

  function dispatchPointerEvent(pointerEvent, options = {}) {
    if (!pointerEvent) return { ok: false, reason: 'missing-pointer-event' };
    let panelId = pointerEvent.targetId || pointerEvent.panelId;
    if (dispatchDepth > 0) {
      return { ok: false, reason: 'pointer-dispatch-reentrant', panelId };
    }
    let record = panels.get(panelId);
    if (!record?.element?.dispatchEvent) {
      return { ok: false, reason: 'panel-not-mounted', panelId };
    }

    if (
      pointerEvent.type === 'pointerdown' ||
      pointerEvent.type === 'selectstart' ||
      pointerEvent.type === 'click' ||
      pointerEvent.buttons?.primary
    ) {
      focusPanel(panelId);
    }

    let currentPanel = getPanelState(record);
    let target = createXRPanelPointerTarget({
      panelId,
      point: pointerEvent.point,
      panel: currentPanel,
    }, {
      ...options,
      contentViewport: record.contentViewport,
      source: pointerEvent.source,
    });

    let detail = {
      ...pointerEvent,
      targetId: panelId,
      contentPoint: target.contentPoint,
      contentViewport: target.contentViewport,
    };

    let domEvent = createPointerDomEvent(context, detail, target);
    dispatchDepth += 1;
    try {
      if (domEvent) {
        domEvent.xrPanelPointer = detail;
        record.element.dispatchEvent(domEvent);
      }
      record.element.dispatchEvent(createHostEvent(context, 'xr-panel-pointer', detail));

      let interaction = null;
      if (pointerEvent.type === 'selectstart') interaction = beginSelection(pointerEvent, record, options);
      else if (pointerEvent.type === 'selectend') interaction = endSelection(pointerEvent, record, options);
      else if (pointerEvent.type === 'selectcancel' || pointerEvent.type === 'pointercancel') {
        pendingSelections.delete(pointerEvent.sourceId);
        interaction = { ok: false, reason: 'selection-cancelled', target: null, contentPoint: null };
      }
      detail.interaction = interaction;
    } finally {
      dispatchDepth -= 1;
    }

    return {
      ok: true,
      panelId,
      target,
      dispatched: domEvent ? [detail.type, 'xr-panel-pointer'] : ['xr-panel-pointer'],
      interaction: detail.interaction || null,
    };
  }

  return {
    setScene,
    mountPanel,
    unmountPanel,
    getPanelElement,
    dispatchPointerEvent,
    focusPanel,
    cleanup,
    getState,
  };
}
