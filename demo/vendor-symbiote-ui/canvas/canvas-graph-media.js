/* eslint-env browser */
/**
 * Reusable, provider-neutral poster/badge drawing for the CanvasGraph render
 * path. Reads the same normalized `node.params.media` descriptor as the DOM
 * GraphNode and draws a lightweight poster clipped to the node dot plus a
 * media-kind badge. It never mounts a player or iframe — activation stays the
 * existing graph selection intent.
 *
 * @module symbiote-ui/canvas/canvas-graph-media
 */

import { isMediaDescriptor } from '../graph/media-descriptor.js';

/** @enum {string} */
export const CANVAS_MEDIA_IMAGE_STATUS = Object.freeze({
  loading: 'loading',
  ready: 'ready',
  error: 'error',
});

/**
 * Return the normalized media descriptor carried by a graph node, or null when
 * the node has no activatable media.
 * @param {{ params?: { media?: unknown } }} node
 * @returns {object|null}
 */
export function getCanvasGraphNodeMedia(node) {
  let media = node?.params?.media;
  return isMediaDescriptor(media) ? media : null;
}

/**
 * Lazy, deduplicated poster image cache. Loads each URL once and invokes the
 * ready callback when an image resolves so the host can wake its draw loop.
 */
export class CanvasGraphMediaImages {
  /** @type {Map<string, { status: string, image: HTMLImageElement|null }>} */
  #entries = new Map();

  /** @type {((url: string) => void)|null} */
  #onSettled;

  /** @param {(url: string) => void} [onSettled] */
  constructor(onSettled) {
    this.#onSettled = typeof onSettled === 'function' ? onSettled : null;
  }

  /**
   * Resolve the cache entry for a poster URL, starting a load on first request.
   * @param {string} url
   * @returns {{ status: string, image: HTMLImageElement|null }}
   */
  resolve(url) {
    let key = String(url || '');
    if (!key) return { status: CANVAS_MEDIA_IMAGE_STATUS.error, image: null };

    let existing = this.#entries.get(key);
    if (existing) return existing;

    let entry = { status: CANVAS_MEDIA_IMAGE_STATUS.loading, image: null };
    this.#entries.set(key, entry);

    if (typeof Image === 'undefined') {
      entry.status = CANVAS_MEDIA_IMAGE_STATUS.error;
      return entry;
    }

    let image = new Image();
    image.decoding = 'async';
    image.crossOrigin = 'anonymous';
    image.addEventListener('load', () => {
      entry.status = CANVAS_MEDIA_IMAGE_STATUS.ready;
      entry.image = image;
      this.#onSettled?.(key);
    }, { once: true });
    image.addEventListener('error', () => {
      entry.status = CANVAS_MEDIA_IMAGE_STATUS.error;
      this.#onSettled?.(key);
    }, { once: true });
    image.src = key;
    return entry;
  }

  /** Drop all cached entries. */
  clear() {
    this.#entries.clear();
  }
}

/**
 * Draw an image into a box using object-fit semantics (`cover` or `contain`).
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} image
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {string} [fit='cover']
 */
export function drawCanvasGraphImageFit(ctx, image, x, y, w, h, fit = 'cover') {
  let iw = image.naturalWidth || image.width;
  let ih = image.naturalHeight || image.height;
  if (!iw || !ih || w <= 0 || h <= 0) return;

  let scale = fit === 'contain' ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
  let dw = iw * scale;
  let dh = ih * scale;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/**
 * Draw a node poster clipped to its circular dot. Returns true when a ready
 * poster image was drawn, false when the caller should fall back to the icon.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} options
 * @param {object} options.descriptor - normalized media descriptor
 * @param {number} options.x
 * @param {number} options.y
 * @param {number} options.radius
 * @param {CanvasGraphMediaImages} options.images
 * @param {number} [options.layerOpacity=1]
 * @returns {boolean}
 */
export function drawCanvasGraphNodeMedia(ctx, { descriptor, x, y, radius, images, layerOpacity = 1 }) {
  if (!descriptor || !descriptor.poster || radius <= 0 || !images) return false;

  let entry = images.resolve(descriptor.poster);
  if (entry.status !== CANVAS_MEDIA_IMAGE_STATUS.ready || !entry.image) return false;

  ctx.save();
  ctx.globalAlpha *= layerOpacity;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  drawCanvasGraphImageFit(
    ctx,
    entry.image,
    x - radius,
    y - radius,
    radius * 2,
    radius * 2,
    descriptor.fit === 'contain' ? 'contain' : 'cover'
  );
  ctx.restore();
  return true;
}

/**
 * Draw a compact media-kind badge pill under the node dot. Skipped when the
 * node is too small on screen to render a readable label.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} options
 * @param {string} options.kind
 * @param {number} options.x
 * @param {number} options.y
 * @param {number} options.radius
 * @param {number} options.zoom
 * @param {[number, number, number]} options.bgRgb
 * @param {[number, number, number]} options.textRgb
 * @param {number} [options.layerOpacity=1]
 * @returns {boolean}
 */
export function drawCanvasGraphMediaBadge(ctx, { kind, x, y, radius, zoom, bgRgb, textRgb, layerOpacity = 1 }) {
  let label = String(kind || '').trim().toUpperCase();
  let screenRadius = radius * zoom;
  if (!label || screenRadius < 18) return false;

  let fontSize = Math.max(7, Math.min(radius * 0.34, 11 / Math.max(0.45, zoom)));
  ctx.save();
  ctx.font = `700 ${fontSize}px var(--sn-font, system-ui, sans-serif)`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let textW = ctx.measureText(label).width;
  let padX = fontSize * 0.5;
  let pillW = textW + padX * 2;
  let pillH = fontSize + fontSize * 0.5;
  let pillX = x - pillW / 2;
  let pillY = y + radius - pillH * 0.5;
  let corner = pillH / 2;

  ctx.globalAlpha *= layerOpacity;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, corner);
  ctx.fillStyle = `rgba(${bgRgb[0]},${bgRgb[1]},${bgRgb[2]},0.82)`;
  ctx.fill();
  ctx.fillStyle = `rgba(${textRgb[0]},${textRgb[1]},${textRgb[2]},1)`;
  ctx.fillText(label, x, pillY + pillH / 2 + 0.5);
  ctx.restore();
  return true;
}
