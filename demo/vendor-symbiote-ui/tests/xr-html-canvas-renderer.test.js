import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  HTML_IN_CANVAS_RENDERER,
  copyHtmlElementToWebGPUTexture,
  uploadHtmlElementToWebGLTexture,
} from '../canvas/index.js';
import {
  createXRHtmlCanvasRenderer,
  WEBXR_RENDERER,
} from '../xr/index.js';

const RECEIPT_VERSION = 'xr-html-canvas-upload-receipt-v1';

function createUploadSpy(arity, impl = null) {
  let calls = [];
  let spy = function (...args) {
    calls.push(args);
    if (impl) impl(args);
  };
  Object.defineProperty(spy, 'length', { value: arity, configurable: true });
  return { spy, calls };
}

function createCurrentUploadSpy(impl = null) {
  let calls = [];
  function spy(target, internalFormat, element) {
    let args = [...arguments];
    calls.push(args);
    if (impl) impl(args);
  }
  return { spy, calls };
}

function createFakeCanvas(id = 'canvas') {
  return {
    id,
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
  };
}

function createFakePanelElement(canvas) {
  return {
    parentNode: canvas,
    parentElement: canvas,
    style: {},
    dataset: {},
  };
}

function createFakeGl(canvas, upload) {
  return {
    canvas,
    TEXTURE_2D: 0x0DE1,
    RGBA: 0x1908,
    RGBA8: 0x8058,
    SRGB8_ALPHA8: 0x8C43,
    RGBA16F: 0x881A,
    RGBA32F: 0x8814,
    UNSIGNED_BYTE: 0x1401,
    texElementImage2D: upload,
  };
}

function createWebGLPlatform() {
  function WebGLRenderingContext() {}
  WebGLRenderingContext.prototype.texElementImage2D = function () {};
  return { WebGLRenderingContext };
}

function createPreparedRenderer(options = {}) {
  let renderer = createXRHtmlCanvasRenderer({
    globalThis: createWebGLPlatform(),
    mode: 'webgl',
  });
  let canvas = createFakeCanvas('owner-canvas');
  let element = createFakePanelElement(canvas);
  let prepared = renderer.preparePanel(element, { id: 'panel-1' }, {
    canvas: options.withCanvas === false ? undefined : canvas,
  });
  return { renderer, canvas, element, prepared };
}

function assertWebGLFailureReceipt(receipt, panelId, reason) {
  assert.deepEqual(receipt, {
    version: RECEIPT_VERSION,
    panelId,
    mode: 'webgl',
    rendered: false,
    uploaded: false,
    canvasMatch: false,
    width: 512,
    height: 256,
    signature: null,
    reason,
    errorName: null,
  });
}

test('renderPanel rejects a foreign gl.canvas and skips the native upload call', () => {
  let { renderer, element } = createPreparedRenderer();
  let foreignCanvas = createFakeCanvas('foreign-canvas');
  let { spy, calls } = createCurrentUploadSpy();
  let gl = createFakeGl(foreignCanvas, spy);

  let receipt = renderer.renderPanel('panel-1', gl, { width: 512, height: 256 });

  assert.equal(receipt.version, RECEIPT_VERSION);
  assert.equal(receipt.panelId, 'panel-1');
  assert.equal(receipt.rendered, false);
  assert.equal(receipt.uploaded, false);
  assert.equal(receipt.canvasMatch, false);
  assert.equal(receipt.reason, 'canvas-mismatch');
  assert.equal(calls.length, 0);
  assert.equal(element.parentNode.id, 'owner-canvas');
});

test('renderPanel returns a bounded same-canvas upload receipt', () => {
  let { renderer, canvas, element } = createPreparedRenderer();
  let { spy, calls } = createCurrentUploadSpy();
  let gl = createFakeGl(canvas, spy);

  let receipt = renderer.renderPanel('panel-1', gl, { width: 512, height: 256 });

  assert.equal(receipt.version, RECEIPT_VERSION);
  assert.equal(receipt.panelId, 'panel-1');
  assert.equal(receipt.mode, 'webgl');
  assert.equal(receipt.rendered, true);
  assert.equal(receipt.uploaded, true);
  assert.equal(receipt.canvasMatch, true);
  assert.equal(receipt.width, 512);
  assert.equal(receipt.height, 256);
  assert.equal(receipt.signature, 'current');
  assert.equal(receipt.reason, null);
  assert.equal(receipt.element, undefined);
  assert.equal(receipt.canvas, undefined);
  assert.equal(receipt.message, undefined);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [gl.TEXTURE_2D, gl.RGBA8, element]);
});

test('renderPanel rejects an element moved out of the owning canvas', () => {
  let { renderer, canvas, element } = createPreparedRenderer();
  let { spy, calls } = createCurrentUploadSpy();
  let gl = createFakeGl(canvas, spy);
  let movedCanvas = createFakeCanvas('moved-canvas');
  element.parentNode = movedCanvas;
  element.parentElement = movedCanvas;

  let receipt = renderer.renderPanel('panel-1', gl, { width: 512, height: 256 });

  assert.equal(receipt.version, RECEIPT_VERSION);
  assert.equal(receipt.rendered, false);
  assert.equal(receipt.uploaded, false);
  assert.equal(receipt.canvasMatch, false);
  assert.equal(receipt.reason, 'canvas-mismatch');
  assert.equal(calls.length, 0);
});

test('renderPanel returns structured data when the native upload throws', () => {
  let { renderer, canvas } = createPreparedRenderer();
  let { spy } = createCurrentUploadSpy(() => {
    throw Object.assign(new Error('native rejected the source'), { name: 'InvalidStateError' });
  });
  let gl = createFakeGl(canvas, spy);

  let receipt = renderer.renderPanel('panel-1', gl, { width: 512, height: 256 });

  assert.equal(receipt.version, RECEIPT_VERSION);
  assert.equal(receipt.rendered, false);
  assert.equal(receipt.uploaded, false);
  assert.equal(receipt.canvasMatch, true);
  assert.equal(receipt.reason, 'upload-failed');
  assert.equal(receipt.errorName, 'InvalidStateError');
  assert.equal(receipt.message, undefined);
});

test('renderPanel reports a missing prepared canvas without a native call', () => {
  let { renderer, prepared } = createPreparedRenderer({ withCanvas: false });
  assert.equal(prepared.prepared, true);
  let { spy, calls } = createCurrentUploadSpy();
  let gl = createFakeGl(createFakeCanvas('any-canvas'), spy);

  let receipt = renderer.renderPanel('panel-1', gl, { width: 512, height: 256 });

  assert.equal(receipt.version, RECEIPT_VERSION);
  assert.equal(receipt.rendered, false);
  assert.equal(receipt.uploaded, false);
  assert.equal(receipt.reason, 'missing-prepared-canvas');
  assert.equal(calls.length, 0);
});

test('renderPanel returns a complete WebGL receipt when the panel is not prepared', () => {
  let { renderer } = createPreparedRenderer();

  let receipt = renderer.renderPanel('missing-panel', null, { width: 512, height: 256 });

  assertWebGLFailureReceipt(receipt, 'missing-panel', 'panel-not-prepared');
  assert.deepEqual(renderer.getState().lastRender, receipt);
});

test('renderPanel returns a complete WebGL receipt when no render target is provided', () => {
  let { renderer } = createPreparedRenderer();

  let receipt = renderer.renderPanel('panel-1', null, { width: 512, height: 256 });

  assertWebGLFailureReceipt(receipt, 'panel-1', 'missing-render-target');
  assert.deepEqual(renderer.getState().lastRender, receipt);
});

test('renderPanel returns a complete WebGL receipt when HTML-in-Canvas is unsupported', () => {
  let renderer = createXRHtmlCanvasRenderer({ globalThis: {}, mode: 'webgl' });
  let canvas = createFakeCanvas('owner-canvas');
  let element = createFakePanelElement(canvas);
  renderer.preparePanel(element, { id: 'panel-1' }, { canvas });

  let receipt = renderer.renderPanel('panel-1', {}, { width: 512, height: 256 });

  assertWebGLFailureReceipt(receipt, 'panel-1', 'html-in-canvas-unsupported');
  assert.deepEqual(renderer.getState().lastRender, receipt);
});

test('uploadHtmlElementToWebGLTexture selects the current 3-argument signature', () => {
  let canvas = createFakeCanvas();
  let element = createFakePanelElement(canvas);
  let { spy, calls } = createCurrentUploadSpy();
  let gl = createFakeGl(canvas, spy);

  let result = uploadHtmlElementToWebGLTexture(gl, element);

  assert.equal(result.rendered, true);
  assert.equal(result.mode, 'webgl');
  assert.equal(result.signature, 'current');
  assert.equal(result.canvasMatch, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [gl.TEXTURE_2D, gl.RGBA8, element]);
});

test('uploadHtmlElementToWebGLTexture forwards valid config through the current native signature', () => {
  let canvas = createFakeCanvas();
  let element = createFakePanelElement(canvas);
  let { spy, calls } = createCurrentUploadSpy();
  let gl = createFakeGl(canvas, spy);
  let config = {
    sx: 0,
    sy: 0,
    swidth: 128,
    sheight: 64,
    width: 256,
    height: 128,
  };

  let result = uploadHtmlElementToWebGLTexture(gl, element, { config });

  assert.equal(result.rendered, true);
  assert.equal(result.signature, 'current');
  assert.equal(spy.length, 3);
  assert.deepEqual(calls[0], [gl.TEXTURE_2D, gl.RGBA8, element, config]);
});

test('uploadHtmlElementToWebGLTexture accepts every current Chromium internal format', () => {
  let canvas = createFakeCanvas();
  let element = createFakePanelElement(canvas);
  let { spy, calls } = createCurrentUploadSpy();
  let gl = createFakeGl(canvas, spy);

  for (let internalFormat of [gl.RGBA8, gl.SRGB8_ALPHA8, gl.RGBA16F, gl.RGBA32F]) {
    let result = uploadHtmlElementToWebGLTexture(gl, element, { internalFormat });
    assert.equal(result.rendered, true);
    assert.equal(result.signature, 'current');
  }

  assert.deepEqual(calls.map((args) => args[1]), [
    gl.RGBA8,
    gl.SRGB8_ALPHA8,
    gl.RGBA16F,
    gl.RGBA32F,
  ]);
});

test('uploadHtmlElementToWebGLTexture rejects invalid current formats and config before upload', () => {
  let invalidCases = [
    { options: { internalFormat: 0x1908 }, reason: 'invalid-internal-format' },
    { options: { config: { sx: 0 } }, reason: 'invalid-current-config' },
    { options: { config: { width: 256 } }, reason: 'invalid-current-config' },
    { options: { config: { colorSpace: 'srgb' } }, reason: 'invalid-current-config' },
  ];

  for (let invalidCase of invalidCases) {
    let canvas = createFakeCanvas();
    let element = createFakePanelElement(canvas);
    let { spy, calls } = createCurrentUploadSpy();
    let gl = createFakeGl(canvas, spy);
    let result = uploadHtmlElementToWebGLTexture(gl, element, invalidCase.options);

    assert.equal(result.rendered, false);
    assert.equal(result.signature, 'current');
    assert.equal(result.reason, invalidCase.reason);
    assert.equal(result.canvasMatch, true);
    assert.equal(calls.length, 0);
  }
});

test('uploadHtmlElementToWebGLTexture selects the flag-era six-argument signature', () => {
  let canvas = createFakeCanvas();
  let element = createFakePanelElement(canvas);
  let { spy, calls } = createUploadSpy(6);
  let gl = createFakeGl(canvas, spy);

  let result = uploadHtmlElementToWebGLTexture(gl, element, { level: 0 });

  assert.equal(result.rendered, true);
  assert.equal(result.signature, 'flag-era');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element]);
});

test('uploadHtmlElementToWebGLTexture rejects non-canonical flag-era format overrides', () => {
  let canvas = createFakeCanvas();
  let element = createFakePanelElement(canvas);
  let { spy, calls } = createUploadSpy(6);
  let gl = createFakeGl(canvas, spy);

  let result = uploadHtmlElementToWebGLTexture(gl, element, { internalFormat: gl.RGBA8 });

  assert.equal(result.rendered, false);
  assert.equal(result.signature, 'flag-era');
  assert.equal(result.reason, 'invalid-legacy-format-combination');
  assert.equal(result.canvasMatch, true);
  assert.equal(calls.length, 0);
});

test('uploadHtmlElementToWebGLTexture rejects a four-parameter native shape', () => {
  let canvas = createFakeCanvas();
  let element = createFakePanelElement(canvas);
  let { spy, calls } = createUploadSpy(4);
  let gl = createFakeGl(canvas, spy);

  let result = uploadHtmlElementToWebGLTexture(gl, element);

  assert.equal(result.rendered, false);
  assert.equal(result.signature, null);
  assert.equal(result.reason, 'unsupported-signature');
  assert.equal(result.arity, 4);
  assert.equal(calls.length, 0);
});

test('uploadHtmlElementToWebGLTexture reports unknown arity as structured unsupported data', () => {
  let canvas = createFakeCanvas();
  let element = createFakePanelElement(canvas);
  let { spy, calls } = createUploadSpy(5);
  let gl = createFakeGl(canvas, spy);

  let result = uploadHtmlElementToWebGLTexture(gl, element);

  assert.equal(result.rendered, false);
  assert.equal(result.mode, 'webgl');
  assert.equal(result.reason, 'unsupported-signature');
  assert.equal(result.arity, 5);
  assert.equal(calls.length, 0);
});

test('uploadHtmlElementToWebGLTexture rejects an element outside the gl canvas', () => {
  let canvas = createFakeCanvas('owner-canvas');
  let foreignCanvas = createFakeCanvas('foreign-canvas');
  let element = createFakePanelElement(foreignCanvas);
  let { spy, calls } = createCurrentUploadSpy();
  let gl = createFakeGl(canvas, spy);

  let result = uploadHtmlElementToWebGLTexture(gl, element);

  assert.equal(result.rendered, false);
  assert.equal(result.reason, 'canvas-mismatch');
  assert.equal(result.canvasMatch, false);
  assert.equal(calls.length, 0);
});

test('uploadHtmlElementToWebGLTexture reports a missing gl canvas as structured data', () => {
  let canvas = createFakeCanvas();
  let element = createFakePanelElement(canvas);
  let { spy, calls } = createCurrentUploadSpy();
  let gl = createFakeGl(null, spy);

  let result = uploadHtmlElementToWebGLTexture(gl, element);

  assert.equal(result.rendered, false);
  assert.equal(result.reason, 'missing-context-canvas');
  assert.equal(calls.length, 0);
});

test('uploadHtmlElementToWebGLTexture keeps the unsupported-api structured result', () => {
  let canvas = createFakeCanvas();
  let element = createFakePanelElement(canvas);

  let result = uploadHtmlElementToWebGLTexture({ canvas }, element);

  assert.deepEqual(result, { rendered: false, mode: 'webgl', signature: null, reason: 'unsupported' });
});

test('copyHtmlElementToWebGPUTexture uses the current two-dictionary signature', () => {
  let calls = [];
  function copyElementImageToTexture(source, destination) {
    calls.push([source, destination]);
  }
  let queue = { copyElementImageToTexture };
  let element = { id: 'panel' };
  let textureDestination = { texture: { id: 'texture' } };

  let result = copyHtmlElementToWebGPUTexture(queue, element, {
    destination: textureDestination,
    copySize: [512, 256],
  });

  assert.equal(copyElementImageToTexture.length, 2);
  assert.deepEqual(result, {
    rendered: true,
    mode: 'webgpu',
    signature: 'current',
    reason: null,
  });
  assert.deepEqual(calls, [[
    { source: element },
    { destination: textureDestination, width: 512, height: 256 },
  ]]);
});

test('copyHtmlElementToWebGPUTexture preserves current source and destination dictionaries', () => {
  let calls = [];
  function copyElementImageToTexture(source, destination) {
    calls.push([source, destination]);
  }
  let queue = { copyElementImageToTexture };
  let panel = { id: 'panel' };
  let source = { source: panel, sx: 0, sy: 0, swidth: 100, sheight: 50 };
  let destination = { destination: { texture: {} }, width: 200, height: 100 };

  let result = copyHtmlElementToWebGPUTexture(queue, source, { destination });

  assert.equal(result.rendered, true);
  assert.deepEqual(calls, [[source, destination]]);
});

test('copyHtmlElementToWebGPUTexture rejects invalid signatures and copy sizes before copying', () => {
  let calls = [];
  function copyElementImageToTexture(source, destination, copySize) {
    calls.push([source, destination, copySize]);
  }
  let unsupported = copyHtmlElementToWebGPUTexture(
    { copyElementImageToTexture },
    { id: 'panel' },
    { destination: { texture: {} } },
  );
  assert.deepEqual(unsupported, {
    rendered: false,
    mode: 'webgpu',
    signature: null,
    reason: 'unsupported-signature',
    arity: 3,
  });
  assert.equal(calls.length, 0);

  function currentCopy(source, destination) {
    calls.push([source, destination]);
  }
  let invalidSize = copyHtmlElementToWebGPUTexture(
    { copyElementImageToTexture: currentCopy },
    { id: 'panel' },
    { destination: { texture: {} }, copySize: [512] },
  );
  assert.equal(invalidSize.rendered, false);
  assert.equal(invalidSize.signature, 'current');
  assert.equal(invalidSize.reason, 'invalid-current-config');
  assert.equal(calls.length, 0);
});

test('copyHtmlElementToWebGPUTexture returns bounded current-copy failures', () => {
  function copyElementImageToTexture(source, destination) {
    throw Object.assign(new Error('copy failed'), { name: 'OperationError' });
  }
  let result = copyHtmlElementToWebGPUTexture(
    { copyElementImageToTexture },
    { id: 'panel' },
    { destination: { texture: {} } },
  );

  assert.deepEqual(result, {
    rendered: false,
    mode: 'webgpu',
    signature: 'current',
    reason: 'copy-failed',
    errorName: 'OperationError',
  });
});

test('renderer metadata declares the ownership gate, receipt, and signature detection capabilities', () => {
  assert.ok(WEBXR_RENDERER.capabilities.includes('xr-html-canvas-ownership-gate'));
  assert.ok(WEBXR_RENDERER.capabilities.includes('xr-html-canvas-upload-receipt'));
  assert.ok(HTML_IN_CANVAS_RENDERER.capabilities.includes('webgl-upload-signature-detection'));
  assert.ok(HTML_IN_CANVAS_RENDERER.capabilities.includes('webgpu-copy-signature-detection'));
});
