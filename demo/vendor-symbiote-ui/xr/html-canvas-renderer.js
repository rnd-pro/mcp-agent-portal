import {
  createHtmlInCanvasAdapter,
} from '../canvas/html-in-canvas.js';

const MODE_PRIORITY = Object.freeze(['webgl', 'webgpu', 'canvas2d']);
export const HTML_IN_CANVAS_ORIGIN_TRIAL_HEADER = 'Origin-Trial';
export const XR_HTML_CANVAS_UPLOAD_RECEIPT_VERSION = 'xr-html-canvas-upload-receipt-v1';

function selectMode(support, requestedMode) {
  if (requestedMode && support.modes?.[requestedMode]) return requestedMode;
  return MODE_PRIORITY.find((mode) => support.modes?.[mode]) || null;
}

function targetForMode(target, mode) {
  if (!target) return null;
  if (mode === 'webgl') return target.gl || target.webgl || target;
  if (mode === 'webgpu') return target.queue || target.webgpuQueue || target;
  return target.ctx || target.context || target;
}

function getCanvas2dContext(canvas) {
  return canvas?.getContext?.('2d') || null;
}

function isDirectCanvasChild(canvas, element) {
  if (!canvas || !element) return false;
  return element.parentElement === canvas || element.parentNode === canvas;
}

function finiteDimension(value) {
  let number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function createUploadReceipt(panelId, record, renderOptions, result = {}) {
  let rendered = result.rendered === true;
  return {
    version: XR_HTML_CANVAS_UPLOAD_RECEIPT_VERSION,
    panelId,
    mode: 'webgl',
    rendered,
    uploaded: rendered,
    canvasMatch: result.canvasMatch === true,
    width: finiteDimension(renderOptions.width ?? record.element?.offsetWidth),
    height: finiteDimension(renderOptions.height ?? record.element?.offsetHeight),
    signature: result.signature || null,
    reason: result.reason || null,
    errorName: result.errorName || null,
  };
}

function createOriginTrialSummary(options = {}) {
  return {
    name: 'html-in-canvas',
    status: options.originTrialStatus || 'origin-trial',
    chromeMilestoneRange: options.chromeMilestoneRange || '148-150',
    localTestBrowser: options.localTestBrowser || 'Chrome Canary 149+',
    requiredFlag: options.requiredFlag || 'CanvasDrawElement',
    flagUrl: options.flagUrl || 'chrome://flags/#canvas-draw-element',
    source: options.source || 'https://developer.chrome.com/blog/html-in-canvas-origin-trial',
  };
}

export function createXRHtmlCanvasEnablementSummary(root = globalThis, options = {}) {
  let document = root?.document || root;
  let metas = [];
  if (document?.querySelectorAll) {
    metas = [...document.querySelectorAll('meta')].filter((meta) =>
      String(meta.getAttribute?.('http-equiv') || '').toLowerCase() === 'origin-trial');
  }
  let originTrialMetaCount = metas.length;
  let originTrialMetaPresent = originTrialMetaCount > 0;
  let originTrialTokenPresent = options.originTrialTokenPresent;
  if (originTrialTokenPresent == null) {
    originTrialTokenPresent = metas.some((meta) => String(meta.getAttribute?.('content') || '').trim().length > 0);
  }

  return {
    version: 'xr-html-in-canvas-enablement-v1',
    secureContext: root?.isSecureContext !== false,
    originTrialMetaPresent,
    originTrialMetaCount,
    originTrialTokenPresent: Boolean(originTrialTokenPresent),
    originTrialConfigured: Boolean(originTrialTokenPresent),
    requiredFlag: options.requiredFlag || 'CanvasDrawElement',
    flagUrl: options.flagUrl || 'chrome://flags/#canvas-draw-element',
    source: options.source || 'https://developer.chrome.com/blog/html-in-canvas-origin-trial',
  };
}

export function createXRHtmlCanvasDiagnostics(support = {}, options = {}) {
  let apis = support.apis || {};
  let modes = support.modes || {};
  let requiredFlag = options.requiredFlag || 'CanvasDrawElement';
  let enablement = options.enablement || support.enablement || createXRHtmlCanvasEnablementSummary(null, options);
  let renderTargetAvailable = Boolean(modes.canvas2d || modes.offscreen2d || modes.webgl || modes.webgpu);
  let textureUploadAvailable = Boolean(modes.webgl || modes.webgpu);
  let blockingMissing = [];
  let missing = [];
  if (!apis.layoutSubtreeAvailable) missing.push('layoutsubtree');
  if (!renderTargetAvailable) missing.push('render-target-api');
  if (!apis.requestPaintAvailable) missing.push('requestPaint');
  if (!apis.canvas2dDrawAvailable) missing.push('drawElementImage');
  if (!modes.webgl) missing.push('texElementImage2D');
  if (!modes.webgpu) missing.push('copyElementImageToTexture');
  if (!apis.layoutSubtreeAvailable) blockingMissing.push('layoutsubtree');
  if (!renderTargetAvailable) blockingMissing.push('render-target-api');

  let supported = Boolean(support.supported && !blockingMissing.length);
  let availability = supported
    ? textureUploadAvailable ? 'texture-ready' : 'canvas-ready'
    : renderTargetAvailable ? 'missing-layout-subtree'
    : enablement.originTrialTokenPresent ? 'origin-trial-token-present-api-missing'
    : 'origin-trial-or-flag-required';

  return {
    name: 'xr-html-in-canvas-diagnostics',
    supported,
    availability,
    mode: support.preferredMode || null,
    fallback: support.fallback || 'dom-overlay',
    requiredFlag,
    originTrial: createOriginTrialSummary({ ...options, requiredFlag }),
    enablement,
    renderTargetAvailable,
    textureUploadAvailable,
    apis: {
      layoutsubtree: Boolean(apis.layoutSubtreeAvailable),
      drawElementImage: Boolean(apis.canvas2dDrawAvailable),
      paintEvent: Boolean(apis.requestPaintAvailable),
      webglTextureUpload: Boolean(modes.webgl),
      webgpuTextureCopy: Boolean(modes.webgpu),
      elementTransform: Boolean(apis.elementTransformAvailable),
    },
    missing,
    blockingMissing,
    optionalMissing: missing.filter((item) => !blockingMissing.includes(item)),
    missingCore: blockingMissing,
    missingTexture: missing.filter((item) => item === 'texElementImage2D' || item === 'copyElementImageToTexture'),
    recommendation: blockingMissing.length ? `enable-${requiredFlag}` : 'use-html-in-canvas',
  };
}

export function createXRHtmlCanvasHeaderDiagnostics(response = null, options = {}) {
  let originTrialHeader = options.originTrialHeader || HTML_IN_CANVAS_ORIGIN_TRIAL_HEADER;
  let diagnosticHeaderName = options.diagnosticHeader || options.diagnosticHeaderName || null;
  let headers = response?.headers || null;
  let ok = response?.ok;
  let status = response?.status;
  let originTrialPresent = Boolean(headers?.has?.(originTrialHeader));
  let diagnosticHeader = diagnosticHeaderName ? headers?.get?.(diagnosticHeaderName) || null : null;
  let error = null;
  if (ok === false) {
    error = `status-${status}`;
  }

  return {
    version: 'xr-html-in-canvas-header-diagnostics-v1',
    checked: true,
    originTrialHeader,
    originTrialPresent,
    present: originTrialPresent,
    diagnosticHeaderName,
    diagnosticHeader,
    status: Number.isFinite(Number(status)) ? Number(status) : null,
    ok: ok == null ? null : Boolean(ok),
    error,
  };
}

function resolveHeaderProbeUrl(urlSource, options = {}) {
  let baseUrl = options.baseUrl || options.location?.href || globalThis?.location?.href || 'http://localhost/';
  if (typeof urlSource === 'string') {
    return new URL(urlSource, baseUrl);
  }
  if (urlSource?.href) {
    return new URL(urlSource.href, baseUrl);
  }
  let pathname = urlSource?.pathname || options.location?.pathname || globalThis?.location?.pathname || '/';
  let search = urlSource?.search || options.location?.search || globalThis?.location?.search || '';
  return new URL(`${pathname}${search}`, baseUrl);
}

export async function readXRHtmlCanvasOriginTrialHeaderStatus(urlSource = null, options = {}) {
  let fetchImpl = options.fetch || globalThis?.fetch;
  if (typeof fetchImpl !== 'function') {
    return {
      version: 'xr-html-in-canvas-header-diagnostics-v1',
      checked: true,
      originTrialHeader: options.originTrialHeader || HTML_IN_CANVAS_ORIGIN_TRIAL_HEADER,
      originTrialPresent: false,
      present: false,
      diagnosticHeaderName: options.diagnosticHeader || options.diagnosticHeaderName || null,
      diagnosticHeader: null,
      status: null,
      ok: null,
      error: 'fetch-unavailable',
    };
  }

  try {
    let url = resolveHeaderProbeUrl(urlSource, options);
    let response = await fetchImpl(`${url.pathname}${url.search}`, {
      method: 'HEAD',
      cache: 'no-store',
    });
    return createXRHtmlCanvasHeaderDiagnostics(response, options);
  } catch (error) {
    return {
      version: 'xr-html-in-canvas-header-diagnostics-v1',
      checked: true,
      originTrialHeader: options.originTrialHeader || HTML_IN_CANVAS_ORIGIN_TRIAL_HEADER,
      originTrialPresent: false,
      present: false,
      diagnosticHeaderName: options.diagnosticHeader || options.diagnosticHeaderName || null,
      diagnosticHeader: null,
      status: null,
      ok: false,
      error: error?.message || 'origin-trial-header-check-failed',
    };
  }
}

export function createXRPanelTextureSourceSummary(panel = {}, prepareResult = {}, support = {}, options = {}) {
  let diagnostics = support.diagnostics || createXRHtmlCanvasDiagnostics(support, options);
  let requestedMode = prepareResult.mode || support.preferredMode || diagnostics.mode || null;
  let prepared = prepareResult.prepared === true;
  let supported = prepareResult.supported === true || Boolean(prepared && requestedMode && requestedMode !== 'unsupported');
  let reason = prepareResult.reason || (supported ? null : diagnostics.recommendation || 'html-in-canvas-unsupported');
  let source = 'unsupported';
  if (supported) {
    source = 'html-in-canvas';
  } else if (options.allowMaterialFallback !== false) {
    source = 'provider-material-fallback';
  }
  return {
    version: 'xr-panel-texture-source-v1',
    panelId: panel.id || null,
    source,
    mode: requestedMode || 'unsupported',
    prepared,
    supported,
    reason,
    fallback: source !== 'html-in-canvas',
    strict: options.allowMaterialFallback === false,
    missing: diagnostics.missing || [],
    blockingMissing: diagnostics.blockingMissing || [],
  };
}

function normalizeTextureBridgeRecord(record = {}) {
  let source = record.summary?.source || record.source || null;
  let ok = record.ok === true && source === 'html-in-canvas';
  return {
    panelId: record.panelId || record.summary?.panelId || null,
    stage: record.stage || (ok ? 'three-material-applied' : 'html-in-canvas-support'),
    source,
    mode: record.summary?.mode || null,
    ok,
    reason: record.reason || record.summary?.reason || null,
    textureApplied: record.textureApplied === true,
    support: record.support || null,
  };
}

function normalizeTextureResolverRecord(record = {}) {
  return {
    panelId: record.panelId || null,
    stage: record.stage || null,
    ok: record.ok === true,
    reason: record.reason || null,
    textureApplied: record.textureApplied === true,
    width: Number.isFinite(Number(record.width)) ? Number(record.width) : null,
    height: Number.isFinite(Number(record.height)) ? Number(record.height) : null,
    mode: record.mode || null,
  };
}

function textureRequiredApi(diagnostics = {}, record = null) {
  let blockingMissing = record?.support?.blockingMissing || diagnostics.blockingMissing;
  if (Array.isArray(blockingMissing) && blockingMissing.length) return [...blockingMissing];
  let recommendation = record?.support?.recommendation || diagnostics.recommendation;
  return recommendation ? [recommendation] : [];
}

export function createXRTextureDebugModeSummary(options = {}) {
  let requested = String(options.requestedMode || options.texture || options.mode || '').trim().toLowerCase();
  let defaultMode = String(options.defaultMode || 'strict').trim().toLowerCase();
  let mode = requested || defaultMode;
  if (mode === '1' || mode === 'true' || mode === 'required') mode = 'strict';
  if (mode === '0' || mode === 'false' || mode === 'visible' || mode === 'material') mode = 'fallback';
  if (mode !== 'strict' && mode !== 'fallback') mode = defaultMode === 'fallback' ? 'fallback' : 'strict';
  let strict = mode === 'strict';

  return {
    version: 'xr-texture-debug-mode-v1',
    mode,
    strict,
    requireTextureUpload: strict,
    hideStrictTextureFailures: strict,
    allowMaterialFallback: !strict,
    queryValue: strict ? 'strict' : 'fallback',
    label: strict ? 'strict texture validation' : 'material fallback visible',
    reason: strict ? 'validate-live-html-textures' : 'inspect-world-space-layout-without-live-textures',
  };
}

export function createXRTextureGateSummary(options = {}) {
  let records = Array.isArray(options.records) ? options.records.map(normalizeTextureBridgeRecord) : [];
  let resolverState = options.resolverState || null;
  let resolverRecords = Array.isArray(options.resolverRecords)
    ? options.resolverRecords.map(normalizeTextureResolverRecord)
    : Array.isArray(resolverState?.records) ? resolverState.records.map(normalizeTextureResolverRecord) : [];
  let support = options.support || {};
  let diagnostics = support.diagnostics || createXRHtmlCanvasDiagnostics(support, options);
  let debugMode = options.debugMode ? createXRTextureDebugModeSummary(options.debugMode) : null;
  let strict = options.strict == null ? debugMode?.strict === true : options.strict === true;
  let total = records.length || Math.max(0, Number(options.panelCount) || 0);
  let ready = records.length
    ? records.filter((record) => record.ok).length
    : diagnostics.supported === true ? total : 0;
  let firstBlockingRecord = records.find((record) => !record.ok) || null;
  let blocked = strict && total > 0 && ready !== total;
  let reason = blocked
    ? firstBlockingRecord?.reason || options.reason || (diagnostics.supported ? 'html-in-canvas-required' : 'html-in-canvas-unsupported')
    : null;
  let stage = firstBlockingRecord?.stage || (diagnostics.supported ? 'html-in-canvas-ready' : 'html-in-canvas-support');

  return {
    version: 'xr-texture-gate-summary-v1',
    strict,
    debugMode,
    total,
    ready,
    blocked,
    reason,
    stage,
    requiredApi: textureRequiredApi(diagnostics, firstBlockingRecord),
    bridgeVersion: options.bridgeVersion || null,
    bridgeStages: records,
    resolverVersion: options.resolverVersion || resolverState?.version || null,
    resolverTextures: Number.isFinite(Number(options.resolverTextures ?? resolverState?.textureCount))
      ? Number(options.resolverTextures ?? resolverState?.textureCount)
      : resolverRecords.filter((record) => record.textureApplied).length,
    resolverStages: resolverRecords,
  };
}

export function createXRHtmlCanvasRenderer(options = {}) {
  let adapter = createHtmlInCanvasAdapter({ globalThis: options.globalThis || globalThis });
  let panels = new Map();
  let lastMode = selectMode(adapter.support, options.mode);
  let lastRender = null;

  function getSupport() {
    let enablement = createXRHtmlCanvasEnablementSummary(options.globalThis || globalThis, options);
    let support = {
      ...adapter.support,
      preferredMode: selectMode(adapter.support, options.mode),
      enablement,
    };
    return {
      ...support,
      diagnostics: createXRHtmlCanvasDiagnostics(support, { ...options, enablement }),
    };
  }

  function getState() {
    return {
      supported: adapter.support.supported,
      preferredMode: lastMode,
      prepared: panels.size,
      panelIds: [...panels.keys()],
      lastRender,
    };
  }

  function preparePanel(panelElement, panel, prepareOptions = {}) {
    if (!panelElement || !panel?.id) {
      return { prepared: false, reason: 'missing-panel-element' };
    }
    let mode = selectMode(adapter.support, prepareOptions.mode || options.mode);
    if (mode && prepareOptions.canvas && !isDirectCanvasChild(prepareOptions.canvas, panelElement)) {
      return {
        prepared: false,
        panelId: panel.id,
        mode,
        supported: false,
        reason: 'panel-outside-canvas-direct-child',
      };
    }
    if (panelElement && typeof MutationObserver === 'function') {
      if (panelElement._snObserver) {
        panelElement._snObserver.disconnect();
        if (panelElement._snDebounceTimeout) clearTimeout(panelElement._snDebounceTimeout);
      }
      let debounceTimeout = null;
      let observer = new MutationObserver(() => {
        if (debounceTimeout) clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
          panelElement._snDebounceTimeout = null;
          let nextKey = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          panelElement.dataset.textureKey = nextKey;
          panelElement.setAttribute('data-texture-key', nextKey);
          if (prepareOptions.canvas) {
            adapter.requestPaint(prepareOptions.canvas);
          }
        }, 150);
        panelElement._snDebounceTimeout = debounceTimeout;
      });
      observer.observe(panelElement, {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
      });
      panelElement._snObserver = observer;
      panelElement._snDebounceTimeout = debounceTimeout;
    }

    panels.set(panel.id, {
      panel,
      element: panelElement,
      mode,
      canvas: prepareOptions.canvas || null,
    });
    lastMode = mode;
    if (prepareOptions.canvas) {
      adapter.setupCanvas(prepareOptions.canvas);
      adapter.requestPaint(prepareOptions.canvas);
    }
    return {
      prepared: true,
      panelId: panel.id,
      mode: mode || 'unsupported',
      supported: Boolean(mode),
      reason: mode ? null : 'html-in-canvas-unsupported',
      canvas: prepareOptions.canvas || null,
    };
  }

  function finishWebGLFailure(panelId, record, renderOptions, reason) {
    let receipt = createUploadReceipt(
      panelId,
      record || { element: null },
      renderOptions,
      { rendered: false, reason },
    );
    lastMode = 'webgl';
    lastRender = receipt;
    return receipt;
  }

  function renderPanel(panelId, target, renderOptions = {}) {
    let record = panels.get(panelId);
    let requestedMode = renderOptions.mode || record?.mode || options.mode || null;
    if (!record) {
      if (requestedMode === 'webgl') {
        return finishWebGLFailure(panelId, null, renderOptions, 'panel-not-prepared');
      }
      lastRender = { panelId, rendered: false, reason: 'panel-not-prepared' };
      return lastRender;
    }
    let mode = selectMode(adapter.support, requestedMode);
    if (!mode) {
      if (requestedMode === 'webgl') {
        return finishWebGLFailure(panelId, record, renderOptions, 'html-in-canvas-unsupported');
      }
      lastMode = 'unsupported';
      lastRender = {
        panelId,
        rendered: false,
        mode: 'unsupported',
        reason: 'html-in-canvas-unsupported',
      };
      return lastRender;
    }

    let targetHandle = targetForMode(target, mode);
    if (!targetHandle) {
      if (mode === 'webgl') {
        return finishWebGLFailure(panelId, record, renderOptions, 'missing-render-target');
      }
      lastMode = mode;
      lastRender = { panelId, rendered: false, mode, reason: 'missing-render-target' };
      return lastRender;
    }

    lastMode = mode;
    if (mode === 'webgl') {
      let receipt = uploadPanelToWebGLTexture(panelId, record, targetHandle, renderOptions);
      lastRender = receipt;
      return receipt;
    }
    let result = null;
    if (mode === 'webgpu') {
      result = adapter.copyWebGPUTexture(targetHandle, record.element, renderOptions);
    } else {
      result = adapter.draw2d(targetHandle, record.element, renderOptions);
    }
    lastRender = { panelId, ...result };
    return result;
  }

  function uploadPanelToWebGLTexture(panelId, record, gl, renderOptions) {
    let contextCanvas = gl?.canvas || null;
    let result = null;
    if (!record.canvas) {
      result = { rendered: false, reason: 'missing-prepared-canvas' };
    } else if (!contextCanvas) {
      result = { rendered: false, reason: 'missing-context-canvas' };
    } else if (contextCanvas !== record.canvas || !isDirectCanvasChild(record.canvas, record.element)) {
      result = { rendered: false, reason: 'canvas-mismatch' };
    } else {
      result = adapter.uploadWebGLTexture(gl, record.element, renderOptions);
    }
    return createUploadReceipt(panelId, record, renderOptions, result);
  }

  function renderPanelPreview(panelId, canvas, renderOptions = {}) {
    let record = panels.get(panelId);
    if (!record) {
      return { rendered: false, mode: 'canvas2d', reason: 'panel-not-prepared' };
    }
    if (!adapter.support.modes.canvas2d) {
      return { rendered: false, mode: 'canvas2d', reason: 'html-in-canvas-unsupported' };
    }
    let ctx = getCanvas2dContext(canvas);
    if (!ctx) {
      return { rendered: false, mode: 'canvas2d', reason: 'missing-canvas2d-context' };
    }
    if (!isDirectCanvasChild(canvas, record.element)) {
      return {
        rendered: false,
        mode: 'canvas2d',
        reason: 'panel-outside-canvas-direct-child',
        panelId,
      };
    }
    adapter.setupCanvas(canvas);
    let result = null;
    try {
      result = adapter.draw2d(ctx, record.element, {
        syncTransform: false,
        ...renderOptions,
        x: renderOptions.x ?? 0,
        y: renderOptions.y ?? 0,
      });
    } catch (error) {
      result = {
        rendered: false,
        mode: 'canvas2d',
        reason: error?.name || 'html-canvas-preview-render-failed',
        message: error?.message || '',
      };
    }
    adapter.requestPaint(canvas);
    lastMode = 'canvas2d';
    lastRender = {
      panelId,
      preview: true,
      ...result,
    };
    return lastRender;
  }

  return {
    preparePanel,
    renderPanel,
    renderPanelPreview,
    getSupport,
    getState,
  };
}
