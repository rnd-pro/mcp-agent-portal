export const HTML_IN_CANVAS_RENDERER_NAME = 'html-in-canvas';

export const HTML_IN_CANVAS_APIS = Object.freeze({
  layoutSubtreeAttribute: 'layoutsubtree',
  paintEvent: 'paint',
  canvas2dDraw: 'drawElementImage',
  elementCapture: 'captureElementImage',
  webglTextureUpload: 'texElementImage2D',
  webgpuTextureCopy: 'copyElementImageToTexture',
  elementTransform: 'getElementTransform',
  requestPaint: 'requestPaint',
});

export const HTML_IN_CANVAS_RENDERER = Object.freeze({
  name: HTML_IN_CANVAS_RENDERER_NAME,
  status: 'experimental',
  specifier: 'symbiote-ui/ui',
  description: 'Experimental DOM-to-canvas renderer adapter for packaged Chromium hosts and origin-trial browsers.',
  modes: ['canvas2d', 'offscreen2d', 'webgl', 'webgpu'],
  fallback: 'dom-overlay',
  requiredCanvasAttribute: HTML_IN_CANVAS_APIS.layoutSubtreeAttribute,
  capabilities: [
    'dom-content-in-canvas',
    'interactive-canvas-ui',
    'accessible-canvas-ui',
    'text-selection',
    'native-form-controls',
    'offscreen-worker-snapshots',
    'canvas-texture-upload',
    'webgl-upload-signature-detection',
    'webgpu-copy-signature-detection',
    'feature-detected-fallback',
  ],
  apis: HTML_IN_CANVAS_APIS,
});

function hasFn(source, name) {
  return typeof source?.[name] === 'function';
}

function getPrototype(target, name) {
  return target?.[name]?.prototype || null;
}

function supportsLayoutSubtree(target) {
  let canvasProto = getPrototype(target, 'HTMLCanvasElement');
  if (canvasProto && 'layoutSubtree' in canvasProto) return true;
  let canvas = target?.document?.createElement?.('canvas');
  return Boolean(canvas && 'layoutSubtree' in canvas);
}

export function getHtmlInCanvasSupport(target = globalThis) {
  let canvas2dProto = getPrototype(target, 'CanvasRenderingContext2D');
  let offscreen2dProto = getPrototype(target, 'OffscreenCanvasRenderingContext2D');
  let webglProto = getPrototype(target, 'WebGLRenderingContext');
  let webgl2Proto = getPrototype(target, 'WebGL2RenderingContext');
  let gpuQueueProto = getPrototype(target, 'GPUQueue');
  let canvasProto = getPrototype(target, 'HTMLCanvasElement');
  let offscreenCanvasProto = getPrototype(target, 'OffscreenCanvas');

  let canvas2d = hasFn(canvas2dProto, HTML_IN_CANVAS_APIS.canvas2dDraw);
  let offscreen2d = hasFn(offscreen2dProto, HTML_IN_CANVAS_APIS.canvas2dDraw);
  let webgl = hasFn(webglProto, HTML_IN_CANVAS_APIS.webglTextureUpload) ||
    hasFn(webgl2Proto, HTML_IN_CANVAS_APIS.webglTextureUpload);
  let webgpu = hasFn(gpuQueueProto, HTML_IN_CANVAS_APIS.webgpuTextureCopy);
  let elementCapture = hasFn(canvasProto, HTML_IN_CANVAS_APIS.elementCapture);
  let elementTransform = hasFn(canvasProto, HTML_IN_CANVAS_APIS.elementTransform) ||
    hasFn(offscreenCanvasProto, HTML_IN_CANVAS_APIS.elementTransform);
  let requestPaint = hasFn(canvasProto, HTML_IN_CANVAS_APIS.requestPaint);

  return {
    name: HTML_IN_CANVAS_RENDERER_NAME,
    status: 'experimental',
    supported: canvas2d || offscreen2d || webgl || webgpu,
    fallback: HTML_IN_CANVAS_RENDERER.fallback,
    modes: {
      canvas2d,
      offscreen2d,
      webgl,
      webgpu,
    },
    apis: {
      ...HTML_IN_CANVAS_APIS,
      canvas2dDrawAvailable: canvas2d,
      offscreen2dDrawAvailable: offscreen2d,
      webglTextureUploadAvailable: webgl,
      webgpuTextureCopyAvailable: webgpu,
      elementCaptureAvailable: elementCapture,
      elementTransformAvailable: elementTransform,
      requestPaintAvailable: requestPaint,
      layoutSubtreeAvailable: supportsLayoutSubtree(target),
    },
  };
}

export function setupHtmlInCanvas(canvas) {
  if (!canvas || typeof canvas.setAttribute !== 'function') return false;
  canvas.setAttribute(HTML_IN_CANVAS_APIS.layoutSubtreeAttribute, '');
  return true;
}

export function requestHtmlInCanvasPaint(canvas) {
  if (hasFn(canvas, HTML_IN_CANVAS_APIS.requestPaint)) {
    canvas.requestPaint();
    return true;
  }
  return false;
}

export function getHtmlInCanvasChangedElements(event) {
  if (!event || !Array.isArray(event.changedElements)) return [];
  return event.changedElements;
}

export function captureHtmlElementImage(canvas, element) {
  if (!hasFn(canvas, HTML_IN_CANVAS_APIS.elementCapture)) {
    return { captured: false, reason: 'unsupported' };
  }
  return {
    captured: true,
    elementImage: canvas[HTML_IN_CANVAS_APIS.elementCapture](element),
  };
}

export function closeHtmlElementImage(elementImage) {
  if (!hasFn(elementImage, 'close')) return false;
  elementImage.close();
  return true;
}

export function drawHtmlElement2d(ctx, element, options = {}) {
  if (!hasFn(ctx, HTML_IN_CANVAS_APIS.canvas2dDraw)) {
    return { rendered: false, mode: 'canvas2d', signature: null, reason: 'unsupported' };
  }

  let args = Array.isArray(options.rect)
    ? [element, ...options.rect.map((value) => Number(value))]
    : [element, Number(options.x ?? 0), Number(options.y ?? 0)];
  if (options.width != null && options.height != null) {
    args.push(Number(options.width), Number(options.height));
  }

  let transform = ctx[HTML_IN_CANVAS_APIS.canvas2dDraw](...args);
  if (options.syncTransform !== false && transform && element?.style) {
    element.style.transform = transform.toString();
  }

  return { rendered: true, mode: 'canvas2d', signature: 'current', reason: null, transform };
}

function isDirectCanvasChild(canvas, element) {
  if (!canvas || !element) return false;
  return element.parentElement === canvas || element.parentNode === canvas;
}

const CURRENT_WEBGL_INTERNAL_FORMATS = Object.freeze({
  RGBA8: 0x8058,
  SRGB8_ALPHA8: 0x8C43,
  RGBA16F: 0x881A,
  RGBA32F: 0x8814,
});

const CURRENT_WEBGL_CONFIG_KEYS = Object.freeze([
  'sx',
  'sy',
  'swidth',
  'sheight',
  'width',
  'height',
]);

function webglEnum(gl, name) {
  return gl?.[name] ?? CURRENT_WEBGL_INTERNAL_FORMATS[name];
}

function isCurrentWebGLInternalFormat(gl, value) {
  return Object.keys(CURRENT_WEBGL_INTERNAL_FORMATS)
    .some((name) => value === webglEnum(gl, name));
}

function normalizeCurrentWebGLConfig(config) {
  if (config === undefined) return { config: undefined };
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { reason: 'invalid-current-config' };
  }

  let keys = Object.keys(config);
  if (keys.some((key) => !CURRENT_WEBGL_CONFIG_KEYS.includes(key))) {
    return { reason: 'invalid-current-config' };
  }

  let sourceKeys = ['sx', 'sy', 'swidth', 'sheight'];
  let sourceCount = sourceKeys.filter((key) => key in config).length;
  let destinationCount = ['width', 'height'].filter((key) => key in config).length;
  if ((sourceCount !== 0 && sourceCount !== sourceKeys.length)
    || (destinationCount !== 0 && destinationCount !== 2)) {
    return { reason: 'invalid-current-config' };
  }

  return { config: { ...config } };
}

function resolveTexElementImageCall(gl, upload, element, options) {
  let arity = Number(upload.length);
  if (arity === 3) {
    let target = options.target ?? gl.TEXTURE_2D;
    let internalFormat = options.internalFormat ?? webglEnum(gl, 'RGBA8');
    if (!isCurrentWebGLInternalFormat(gl, internalFormat)) {
      return { signature: 'current', reason: 'invalid-internal-format' };
    }
    let normalizedConfig = normalizeCurrentWebGLConfig(options.config);
    if (normalizedConfig.reason) {
      return { signature: 'current', reason: normalizedConfig.reason };
    }
    let args = normalizedConfig.config === undefined
      ? [target, internalFormat, element]
      : [target, internalFormat, element, normalizedConfig.config];
    return { signature: 'current', args };
  }
  if (arity === 6) {
    let canonical = {
      target: gl.TEXTURE_2D,
      level: 0,
      internalFormat: gl.RGBA,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
    };
    if ((options.target !== undefined && options.target !== canonical.target)
      || (options.level !== undefined && options.level !== canonical.level)
      || (options.internalFormat !== undefined && options.internalFormat !== canonical.internalFormat)
      || (options.format !== undefined && options.format !== canonical.format)
      || (options.type !== undefined && options.type !== canonical.type)
      || options.config !== undefined) {
      return { signature: 'flag-era', reason: 'invalid-legacy-format-combination' };
    }
    return {
      signature: 'flag-era',
      args: [
        canonical.target,
        canonical.level,
        canonical.internalFormat,
        canonical.format,
        canonical.type,
        element,
      ],
    };
  }
  return { signature: null, reason: 'unsupported-signature' };
}

export function uploadHtmlElementToWebGLTexture(gl, element, options = {}) {
  let upload = gl?.[HTML_IN_CANVAS_APIS.webglTextureUpload];
  if (typeof upload !== 'function') {
    return { rendered: false, mode: 'webgl', signature: null, reason: 'unsupported' };
  }
  let canvas = gl.canvas || null;
  if (!canvas) {
    return { rendered: false, mode: 'webgl', signature: null, reason: 'missing-context-canvas', canvasMatch: false };
  }
  if (!isDirectCanvasChild(canvas, element)) {
    return { rendered: false, mode: 'webgl', signature: null, reason: 'canvas-mismatch', canvasMatch: false };
  }

  let call = resolveTexElementImageCall(gl, upload, element, options);
  if (call.reason) {
    return {
      rendered: false,
      mode: 'webgl',
      signature: call.signature,
      reason: call.reason,
      ...(call.reason === 'unsupported-signature' ? { arity: Number(upload.length) } : {}),
      canvasMatch: true,
    };
  }

  try {
    upload.apply(gl, call.args);
  } catch (error) {
    return {
      rendered: false,
      mode: 'webgl',
      reason: 'upload-failed',
      errorName: error?.name || 'Error',
      signature: call.signature,
      canvasMatch: true,
    };
  }
  return { rendered: true, mode: 'webgl', signature: call.signature, reason: null, canvasMatch: true };
}

export function copyHtmlElementToWebGPUTexture(queue, element, options = {}) {
  let copy = queue?.[HTML_IN_CANVAS_APIS.webgpuTextureCopy];
  if (typeof copy !== 'function') {
    return { rendered: false, mode: 'webgpu', signature: null, reason: 'unsupported' };
  }
  if (!options.destination) {
    return { rendered: false, mode: 'webgpu', signature: null, reason: 'missing-destination' };
  }
  if (Number(copy.length) !== 2) {
    return {
      rendered: false,
      mode: 'webgpu',
      signature: null,
      reason: 'unsupported-signature',
      arity: Number(copy.length),
    };
  }

  try {
    let source = element && typeof element === 'object' && 'source' in element
      ? { ...element }
      : { source: element };
    let destination = options.destination
      && typeof options.destination === 'object'
      && 'destination' in options.destination
      ? { ...options.destination }
      : { destination: options.destination };
    let copySize = options.copySize ?? options.size;
    if (copySize !== undefined) {
      let width = Array.isArray(copySize) ? copySize[0] : copySize?.width;
      let height = Array.isArray(copySize) ? copySize[1] : copySize?.height;
      if (width === undefined || height === undefined) {
        return { rendered: false, mode: 'webgpu', signature: 'current', reason: 'invalid-current-config' };
      }
      destination.width = width;
      destination.height = height;
    }
    copy.call(queue, source, destination);
    return { rendered: true, mode: 'webgpu', signature: 'current', reason: null };
  } catch (error) {
    return {
      rendered: false,
      mode: 'webgpu',
      signature: 'current',
      reason: 'copy-failed',
      errorName: error?.name || 'Error',
    };
  }
}

export function getHtmlElementCanvasTransform(canvas, element, matrix) {
  if (!hasFn(canvas, HTML_IN_CANVAS_APIS.elementTransform)) return null;
  return canvas[HTML_IN_CANVAS_APIS.elementTransform](element, matrix) || null;
}

export function createHtmlInCanvasAdapter(options = {}) {
  let target = options.globalThis || globalThis;
  let support = getHtmlInCanvasSupport(target);

  return {
    ...HTML_IN_CANVAS_RENDERER,
    support,
    canRender(mode = 'canvas2d') {
      return Boolean(support.modes[mode]);
    },
    setupCanvas: setupHtmlInCanvas,
    requestPaint: requestHtmlInCanvasPaint,
    getChangedElements: getHtmlInCanvasChangedElements,
    captureElementImage: captureHtmlElementImage,
    closeElementImage: closeHtmlElementImage,
    draw2d: drawHtmlElement2d,
    uploadWebGLTexture: uploadHtmlElementToWebGLTexture,
    copyWebGPUTexture: copyHtmlElementToWebGPUTexture,
    getElementTransform: getHtmlElementCanvasTransform,
  };
}
