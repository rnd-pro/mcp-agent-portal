/**
 * @file xr/meta-window-chrome.js
 * @description Renderer-neutral Meta Horizon window-chrome drawing helpers.
 * Canvas access is deferred until a texture is requested, so the module stays
 * safe to import from Node and SSR entrypoints.
 */

export const META_WINDOW_CHROME_VERSION = 'meta-window-chrome-v1';

const CORNER_FLIPS = Object.freeze({
  northWest: [1, 1],
  northEast: [-1, 1],
  southEast: [-1, -1],
  southWest: [1, -1],
});

function canvasFor(width, height, createCanvas) {
  if (typeof createCanvas === 'function') {
    let canvas = createCanvas(width, height);
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
      return canvas;
    }
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    let canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  return null;
}

function roundedRect(context, x, y, width, height, radius) {
  let r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawGlyph(context, action, centerX, centerY, size, color) {
  let radius = size / 2;
  context.save();
  context.translate(centerX - radius, centerY - radius);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = Math.max(2, size * 0.075);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (action === 'pin') {
    context.beginPath();
    context.arc(radius, radius - size * 0.08, size * 0.105, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(radius, radius + size * 0.04);
    context.lineTo(radius, radius + size * 0.24);
    context.stroke();
  } else if (action === 'reset') {
    context.beginPath();
    context.arc(radius, radius, size * 0.2, Math.PI * 0.12, Math.PI * 1.62);
    context.stroke();
    let angle = Math.PI * 1.62;
    let x = radius + Math.cos(angle) * size * 0.2;
    let y = radius + Math.sin(angle) * size * 0.2;
    context.beginPath();
    context.moveTo(x - size * 0.09, y - size * 0.015);
    context.lineTo(x, y);
    context.lineTo(x + size * 0.025, y - size * 0.1);
    context.stroke();
  } else if (action === 'close') {
    let arm = size * 0.14;
    context.beginPath();
    context.moveTo(radius - arm, radius - arm);
    context.lineTo(radius + arm, radius + arm);
    context.moveTo(radius + arm, radius - arm);
    context.lineTo(radius - arm, radius + arm);
    context.stroke();
  } else {
    let inset = size * 0.27;
    let arm = size * 0.12;
    context.beginPath();
    context.moveTo(inset + arm, inset);
    context.lineTo(inset, inset);
    context.lineTo(inset, inset + arm);
    context.moveTo(size - inset - arm, inset);
    context.lineTo(size - inset, inset);
    context.lineTo(size - inset, inset + arm);
    context.moveTo(inset, size - inset - arm);
    context.lineTo(inset, size - inset);
    context.lineTo(inset + arm, size - inset);
    context.moveTo(size - inset - arm, size - inset);
    context.lineTo(size - inset, size - inset);
    context.lineTo(size - inset, size - inset - arm);
    context.stroke();
  }
  context.restore();
}

function truncate(context, value, width) {
  let text = String(value || 'Window');
  if (typeof context.measureText !== 'function') return text;
  while (text.length > 1 && context.measureText(text).width > width) {
    text = `${text.slice(0, -2)}…`;
  }
  return text;
}

function drawControlBar(context, width, height, options) {
  let background = options.background || '#f5f5f5';
  let foreground = options.foreground || '#202020';
  let actions = Array.isArray(options.actions) ? options.actions : ['reset', 'fullscreen', 'pin', 'close'];
  let inset = height * 0.07;
  roundedRect(context, inset, inset, width - inset * 2, height - inset * 2, height / 2);
  context.fillStyle = background;
  context.fill();

  let actionWidth = height * 0.88;
  let actionArea = actions.length * actionWidth + height * 0.12;
  context.fillStyle = foreground;
  context.font = `600 ${Math.round(height * 0.29)}px Inter, -apple-system, BlinkMacSystemFont, sans-serif`;
  context.textBaseline = 'middle';
  let labelLeft = height * 0.45;
  let labelWidth = Math.max(0, width - labelLeft - actionArea - height * 0.24);
  context.fillText(truncate(context, options.title, labelWidth), labelLeft, height / 2);

  actions.forEach((action, index) => {
    let centerX = width - height * 0.28 - actionWidth * (actions.length - index - 0.5);
    if (action === options.activeAction) {
      context.globalAlpha = 0.12;
      context.beginPath();
      context.arc(centerX, height / 2, height * 0.34, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    }
    drawGlyph(context, action, centerX, height / 2, height * 0.72, foreground);
  });
}

function drawCorner(context, width, height, handle, color) {
  let [flipX, flipY] = CORNER_FLIPS[handle] || [1, 1];
  context.save();
  context.translate(width / 2, height / 2);
  context.scale(flipX, flipY);
  context.translate(-width / 2, -height / 2);
  context.strokeStyle = color;
  context.lineWidth = width * 0.105;
  context.lineCap = 'round';
  let inset = width * 0.14;
  let arm = width * 0.48;
  let radius = width * 0.24;
  context.beginPath();
  context.moveTo(inset + arm, inset);
  context.arcTo(inset, inset, inset, inset + arm, radius);
  context.lineTo(inset, inset + arm);
  context.stroke();
  context.restore();
}

function drawEdge(context, width, height, edge, color) {
  context.save();
  if (edge === 'west' || edge === 'east') {
    context.translate(width / 2, height / 2);
    context.rotate(Math.PI / 2);
    context.translate(-height / 2, -width / 2);
    [width, height] = [height, width];
  }
  context.fillStyle = color;
  roundedRect(context, width * 0.12, height * 0.34, width * 0.76, height * 0.32, height * 0.16);
  context.fill();
  context.restore();
}

function drawGrabStrip(context, width, height, color) {
  context.fillStyle = color;
  let stripWidth = width * 0.24;
  let stripHeight = height * 0.13;
  roundedRect(
    context,
    (width - stripWidth) / 2,
    (height - stripHeight) / 2,
    stripWidth,
    stripHeight,
    stripHeight / 2,
  );
  context.fill();
}

/**
 * Creates a transparent CanvasTexture for the Meta Horizon-style window shell.
 *
 * @param {Object} THREE Host Three namespace.
 * @param {'grab-strip'|'control-bar'|'corner'|'edge'} kind Visual kind.
 * @param {Object} [options] Drawing and theme options.
 * @returns {Object|null} CanvasTexture when canvas APIs are available.
 */
export function createMetaWindowChromeTexture(THREE, kind, options = {}) {
  if (typeof THREE?.CanvasTexture !== 'function') return null;
  let dimensions = kind === 'control-bar' || kind === 'grab-strip'
    ? [768, 128]
    : kind === 'edge' ? [256, 64] : [160, 160];
  let canvas = canvasFor(dimensions[0], dimensions[1], options.createCanvas);
  let context = canvas?.getContext?.('2d');
  if (!context) return null;
  context.clearRect(0, 0, dimensions[0], dimensions[1]);
  if (kind === 'grab-strip') {
    drawGrabStrip(context, dimensions[0], dimensions[1], options.color || '#fff');
  } else if (kind === 'control-bar') {
    drawControlBar(context, dimensions[0], dimensions[1], options);
  } else if (kind === 'corner') {
    drawCorner(context, dimensions[0], dimensions[1], options.handle, options.color || '#fff');
  } else if (kind === 'edge') {
    drawEdge(context, dimensions[0], dimensions[1], options.edge, options.color || '#fff');
  }
  let texture = new THREE.CanvasTexture(canvas);
  if ('anisotropy' in texture) texture.anisotropy = Math.max(1, Math.min(8, Number(options.anisotropy || 4)));
  texture.needsUpdate = true;
  return texture;
}
