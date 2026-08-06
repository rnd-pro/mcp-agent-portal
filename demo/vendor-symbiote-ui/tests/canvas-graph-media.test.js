import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CANVAS_MEDIA_IMAGE_STATUS,
  CanvasGraphMediaImages,
  getCanvasGraphNodeMedia,
  drawCanvasGraphImageFit,
  drawCanvasGraphNodeMedia,
  drawCanvasGraphMediaBadge,
} from '../canvas/canvas-graph-media.js';
import { normalizeMediaDescriptor } from '../graph/media-descriptor.js';

function makeCtx() {
  let calls = [];
  let ctx = {
    globalAlpha: 1,
    calls,
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    beginPath() { calls.push(['beginPath']); },
    closePath() { calls.push(['closePath']); },
    arc(...a) { calls.push(['arc', ...a]); },
    clip() { calls.push(['clip']); },
    roundRect(...a) { calls.push(['roundRect', ...a]); },
    fill() { calls.push(['fill']); },
    fillText(...a) { calls.push(['fillText', ...a]); },
    measureText(text) { return { width: String(text).length * 6 }; },
    drawImage(...a) { calls.push(['drawImage', ...a]); },
  };
  return ctx;
}

test('getCanvasGraphNodeMedia returns the descriptor only for activatable media', () => {
  let descriptor = normalizeMediaDescriptor({ kind: 'video', poster: 'p.jpg', activation: { provider: 'youtube' } });
  assert.equal(getCanvasGraphNodeMedia({ params: { media: descriptor } }), descriptor);
  assert.equal(getCanvasGraphNodeMedia({ params: { media: { kind: 'video' } } }), null);
  assert.equal(getCanvasGraphNodeMedia({ params: {} }), null);
  assert.equal(getCanvasGraphNodeMedia({}), null);
  assert.equal(getCanvasGraphNodeMedia(null), null);
});

test('drawCanvasGraphImageFit applies cover and contain object-fit math', () => {
  let image = { naturalWidth: 100, naturalHeight: 50 };

  let cover = makeCtx();
  drawCanvasGraphImageFit(cover, image, 0, 0, 200, 200, 'cover');
  let coverDraw = cover.calls.find((c) => c[0] === 'drawImage');
  assert.deepEqual(coverDraw.slice(2), [-100, 0, 400, 200]);

  let contain = makeCtx();
  drawCanvasGraphImageFit(contain, image, 0, 0, 200, 200, 'contain');
  let containDraw = contain.calls.find((c) => c[0] === 'drawImage');
  assert.deepEqual(containDraw.slice(2), [0, 50, 200, 100]);
});

test('drawCanvasGraphNodeMedia clips to the dot and draws only a ready poster', () => {
  let descriptor = normalizeMediaDescriptor({ kind: 'gallery', poster: 'p.jpg', fit: 'contain', activation: { provider: 'ims' } });
  let image = { naturalWidth: 40, naturalHeight: 40 };

  let loadingCtx = makeCtx();
  let drewLoading = drawCanvasGraphNodeMedia(loadingCtx, {
    descriptor, x: 10, y: 10, radius: 20, layerOpacity: 1,
    images: { resolve: () => ({ status: CANVAS_MEDIA_IMAGE_STATUS.loading, image: null }) },
  });
  assert.equal(drewLoading, false);
  assert.equal(loadingCtx.calls.some((c) => c[0] === 'drawImage'), false, 'no poster drawn while loading (icon fallback)');

  let readyCtx = makeCtx();
  let drewReady = drawCanvasGraphNodeMedia(readyCtx, {
    descriptor, x: 10, y: 10, radius: 20, layerOpacity: 1,
    images: { resolve: () => ({ status: CANVAS_MEDIA_IMAGE_STATUS.ready, image }) },
  });
  assert.equal(drewReady, true);
  assert.ok(readyCtx.calls.some((c) => c[0] === 'clip'), 'poster is clipped to the node dot');
  assert.ok(readyCtx.calls.some((c) => c[0] === 'drawImage'), 'poster image drawn');
  assert.equal(readyCtx.calls.some((c) => c[0] === 'iframe'), false);
});

test('drawCanvasGraphMediaBadge renders only when the node is large enough on screen', () => {
  let big = makeCtx();
  let drewBig = drawCanvasGraphMediaBadge(big, {
    kind: 'video', x: 0, y: 0, radius: 30, zoom: 1, bgRgb: [0, 0, 0], textRgb: [255, 255, 255],
  });
  assert.equal(drewBig, true);
  assert.ok(big.calls.some((c) => c[0] === 'fillText' && c[1] === 'VIDEO'), 'badge label drawn upper-cased');

  let small = makeCtx();
  let drewSmall = drawCanvasGraphMediaBadge(small, {
    kind: 'video', x: 0, y: 0, radius: 6, zoom: 1, bgRgb: [0, 0, 0], textRgb: [255, 255, 255],
  });
  assert.equal(drewSmall, false);
  assert.equal(small.calls.length, 0, 'nothing drawn for tiny nodes');
});

test('CanvasGraphMediaImages loads each url once and notifies on settle', () => {
  let created = [];
  class FakeImage {
    constructor() { this.listeners = {}; created.push(this); }
    addEventListener(type, cb) { this.listeners[type] = cb; }
    set src(value) { this._src = value; }
    get src() { return this._src; }
  }
  let priorImage = globalThis.Image;
  globalThis.Image = FakeImage;
  try {
    let settled = [];
    let cache = new CanvasGraphMediaImages((url) => settled.push(url));

    let first = cache.resolve('poster.jpg');
    assert.equal(first.status, CANVAS_MEDIA_IMAGE_STATUS.loading);
    assert.equal(created.length, 1);

    let again = cache.resolve('poster.jpg');
    assert.equal(again, first, 'same url is deduplicated');
    assert.equal(created.length, 1);

    created[0].listeners.load();
    assert.equal(first.status, CANVAS_MEDIA_IMAGE_STATUS.ready);
    assert.equal(first.image, created[0]);
    assert.deepEqual(settled, ['poster.jpg']);

    let bad = cache.resolve('broken.jpg');
    created[1].listeners.error();
    assert.equal(bad.status, CANVAS_MEDIA_IMAGE_STATUS.error);
    assert.deepEqual(settled, ['poster.jpg', 'broken.jpg']);

    assert.deepEqual(cache.resolve(''), { status: CANVAS_MEDIA_IMAGE_STATUS.error, image: null });
  } finally {
    globalThis.Image = priorImage;
  }
});
