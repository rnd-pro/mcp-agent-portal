/**
 * @file xr/three-native-panel-renderer.js
 * @description Browser-capable Three adapter for compiled native panel scenes. The host
 * injects the THREE namespace; this module never imports Three and never touches the DOM
 * at module-evaluation time. Text is rendered through small CanvasTexture label planes
 * (native text planes, not HTML-in-Canvas or DOM capture).
 * @module symbiote-ui/xr/three-native-panel-renderer
 */

import {
  NATIVE_PANEL_LAYERS,
  NATIVE_PANEL_LAYOUT_VERSION,
  createNativePanelLayerOffsets,
} from './native-panel-layout.js';
import { createXRPanelFrame } from './panel-frame.js';
import { createMetaWindowChromeTexture } from './meta-window-chrome.js';

const FALLBACK_PIXELS_PER_METER = 1200;
const MEASURED_TEXTURE_POLICY = 'measured-source-css';
const FALLBACK_TEXTURE_POLICY = 'fallback-meter-policy';
const DEFAULT_MAX_TEXTURE_SIZE = 2048;
const MAX_ANISOTROPY = 8;
const DEFAULT_ICON_FONT_FAMILY = 'Material Symbols Outlined';
const TEXT_QUALITY_REPORT_VERSION = 'native-panel-text-quality-v1';
export const NATIVE_PANEL_APPEARANCE_VERSION = 'native-panel-appearance-v1';
const HOVER_HIT_OPACITY = 0.2;
const SELECTED_HIT_OPACITY = 0.32;

function roundMetric(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

const THREE_SAFE_COLOR_FUNCTIONS = Object.freeze(['rgb', 'rgba', 'hsl', 'hsla']);

/**
 * Splits a computed CSS color into a THREE-safe RGB string plus an alpha channel.
 * Passing an `rgba(...)` string straight into THREE.Color only warns and drops the
 * alpha, so roles that resolve to alpha-bearing CSS colors are normalized here:
 * RGB goes to `material.color`, alpha goes to `opacity`/`transparent` semantics.
 * Function-notation colors THREE cannot parse at all (`oklch()`, `lab()`,
 * `color(...)`, unresolved `var(...)`, …) are flagged via `unsupported` instead of
 * being forwarded; callers must report them in diagnostics and skip `color.set`.
 *
 * @param {*} value - Theme role color.
 * @returns {{color: *, alpha: number|null, unsupported?: string}} Normalized color
 *   and clamped alpha, or `unsupported` with the offending value.
 */
function normalizeCssColor(value) {
  if (typeof value !== 'string') return { color: value, alpha: null };
  let match = /^\s*rgba?\(\s*([^()]+?)\s*\)\s*$/i.exec(value);
  if (!match) {
    let fn = /^\s*([a-z-]+)\(/i.exec(value);
    if (fn && !THREE_SAFE_COLOR_FUNCTIONS.includes(fn[1].toLowerCase())) {
      return { color: null, alpha: null, unsupported: value.trim() };
    }
    return { color: value, alpha: null };
  }
  let parts = match[1].split(',').map((part) => part.trim());
  if (parts.length < 3) return { color: value, alpha: null };
  let color = `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
  if (parts.length < 4) return { color, alpha: null };
  let alpha = Number.parseFloat(parts[3]);
  return {
    color,
    alpha: Number.isFinite(alpha) ? Math.min(Math.max(alpha, 0), 1) : null,
  };
}

function assertThreeNamespace(THREE) {
  let missing = ['Group', 'Mesh', 'PlaneGeometry', 'MeshBasicMaterial']
    .filter((key) => typeof THREE?.[key] !== 'function');
  if (missing.length) {
    throw new Error(
      `createThreeNativePanelRenderer requires a host-injected THREE namespace with ${missing.join(', ')}. ` +
      'Call createThreeNativePanelRenderer(THREE, options) with the host Three.js module.',
    );
  }
}

function assertTheme(theme, owner) {
  if (!theme || typeof theme !== 'object' || !theme.roles || typeof theme.roles !== 'object') {
    throw new Error(
      `${owner} requires a theme with resolved semantic roles. ` +
      'Capture one with createNativePanelThemeSnapshot() from xr/theme-bridge.js.',
    );
  }
}

function resolveTexturePixelRatio(value) {
  let number = Number(value ?? globalThis.devicePixelRatio ?? 1);
  if (!Number.isFinite(number) || number <= 0) return 1;
  return Math.min(Math.max(number, 0.5), 2);
}

function resolveMaxTextureSize(value) {
  let number = Number(value ?? DEFAULT_MAX_TEXTURE_SIZE);
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_MAX_TEXTURE_SIZE;
  return Math.floor(number);
}

function resolveAnisotropy(value) {
  let number = Number(value ?? 1);
  if (!Number.isFinite(number) || number < 1) return 1;
  return Math.min(number, MAX_ANISOTROPY);
}

function truncateWithEllipsis(context, text, maxWidth) {
  if (typeof context.measureText !== 'function') return text;
  if (context.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && context.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

/**
 * Creates a native panel renderer over a host-supplied THREE namespace.
 *
 * @param {Object} THREE - Host-injected Three.js namespace.
 * @param {Object} [options]
 * @param {string} [options.threeRevision] - Published Three revision for diagnostics.
 * @param {Function} [options.createLabelPlane] - `(THREE, primitive, theme) => Mesh` label factory.
 * @param {Function} [options.updateLabelPlane] - `(mesh, primitive, theme) => void` label refresh.
 * @param {Function} [options.createIconPlane] - `(THREE, primitive, theme) => Mesh` icon factory.
 * @param {Function} [options.updateIconPlane] - `(mesh, primitive, theme) => void` icon refresh.
 * @param {Function} [options.createCanvas] - Raster canvas factory for generated planes.
 * @param {Object} [options.fonts] - FontFaceSet-like `{ check(spec, sample?) }` readiness source.
 * @param {number} [options.texturePixelRatio] - Bounded texture DPR override (clamped to 0.5..2).
 * @param {number} [options.maxTextureSize] - Host/WebGL texture cap; defaults to 2048.
 * @param {number} [options.anisotropy] - Texture anisotropy; capped at 8.
 * @param {string} [options.iconFontFamily] - Icon font fallback family for uncaptured primitives.
 * @returns {Object} Renderer controller.
 */
export function createThreeNativePanelRenderer(THREE, options = {}) {
  assertThreeNamespace(THREE);
  let root = new THREE.Group();
  root.userData = { kind: 'native-panel-root' };
  let unitPlane = new THREE.PlaneGeometry(1, 1);
  let panelGroups = new Map();
  let panelChromeGroups = new Map();
  let panelPreviewSizes = new Map();
  let panelPreviewSurfaces = new Map();
  let panelPreviewVisibility = new Map();
  let panelPreviewHiddenCounts = new Map();
  let layerGroups = new Map();
  let primitiveObjects = new Map();
  let frameGroups = new Map();
  let interactive = [];
  let roleMaterials = new Map();
  let materialRecords = [];
  let labelPlanes = [];
  let iconPlanes = [];
  let theme = null;
  let explode = 0;
  let hoveredId = null;
  let selectedId = null;
  let builds = 0;
  let themeUpdates = 0;
  let appearanceRefreshes = 0;
  let panelReplacements = 0;
  let disposed = false;
  let unsupportedColorValues = new Map();
  let mountedScene = null;
  let mountedPrimitives = new Map();
  let materialColors = new WeakMap();
  let borderMaterials = new Map();
  let texturePixelRatio = resolveTexturePixelRatio(options.texturePixelRatio);
  let maxTextureSize = resolveMaxTextureSize(options.maxTextureSize);
  let anisotropy = resolveAnisotropy(options.anisotropy);

  function chromeRect(zone, size) {
    let width = Number(size[0]);
    let height = Number(size[1]);
    let zoneWidth = Number(zone.width) * width;
    let zoneHeight = Number(zone.height) * height;
    return {
      width: zoneWidth,
      height: zoneHeight,
      x: -width / 2 + Number(zone.x) * width + zoneWidth / 2,
      y: height / 2 - Number(zone.y) * height - zoneHeight / 2,
    };
  }

  function chromeTitle(panel) {
    return panel.primitives.find((primitive) => primitive.id.endsWith('/content/title'))?.text
      || panel.title
      || panel.id;
  }

  function chromeMesh(panel, frame, zone, metadata) {
    let size = frame.size;
    let rect = chromeRect(zone, size);
    let geometry = new THREE.PlaneGeometry(rect.width, rect.height);
    let material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: metadata.opacity ?? 1,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      map: metadata.texture || null,
    });
    let mesh = new THREE.Mesh(geometry, material);
    mesh.name = `sn-native-window-${metadata.name}`;
    mesh.position.set(rect.x, rect.y, metadata.z ?? 0.012);
    mesh.renderOrder = 48;
    mesh.userData = {
      kind: 'window-chrome',
      control: metadata.control || null,
      panelId: panel.id,
      primitiveId: `${panel.id}/window-chrome/${metadata.name}`,
      actionId: metadata.actionId || null,
      targetId: metadata.targetId || panel.id,
      operation: metadata.operation || null,
      handle: metadata.handle || null,
      baseOpacity: metadata.opacity ?? 1,
      hoverOpacity: metadata.hoverOpacity ?? 1,
      chromeVisual: metadata.chromeVisual === true,
      collapsedTexture: metadata.collapsedTexture || null,
      expandedTexture: metadata.expandedTexture || null,
    };
    interactive.push(mesh);
    return mesh;
  }

  function buildWindowChrome(panel, panelGroup) {
    if (panel.role === 'layout-control') return;
    let size = panelPreviewSizes.get(panel.id) || panel.size;
    let frame = createXRPanelFrame(panel, { panelSizeMeters: size });
    frame.size = size;
    let chrome = new THREE.Group();
    chrome.userData = { kind: 'window-chrome-group', panelId: panel.id };
    let background = theme.roles['on-surface'] || theme.roles.text || '#fafafa';
    let foreground = theme.roles.surface || theme.roles['surface-raised'] || '#202020';
    let actions = Object.keys(frame.zones.actions);
    let barTexture = createMetaWindowChromeTexture(THREE, 'control-bar', {
      createCanvas: options.createCanvas,
      anisotropy,
      title: chromeTitle(panel),
      actions,
      activeAction: panelGroup.userData.pinned ? 'pin' : null,
      background,
      foreground,
    });
    let stripTexture = createMetaWindowChromeTexture(THREE, 'grab-strip', {
      createCanvas: options.createCanvas,
      anisotropy,
      color: background,
    });
    chrome.add(chromeMesh(panel, frame, frame.zones.controlBar, {
      name: 'control-bar',
      actionId: 'drag-panel',
      operation: 'move',
      texture: stripTexture,
      collapsedTexture: stripTexture,
      expandedTexture: barTexture,
      chromeVisual: true,
    }));
    for (let [handle, zone] of Object.entries(frame.zones.resize)) {
      chrome.add(chromeMesh(panel, frame, zone, {
        name: `resize-${handle}`,
        actionId: 'resize-window',
        operation: 'resize',
        handle,
        opacity: 0,
        hoverOpacity: 1,
        texture: createMetaWindowChromeTexture(THREE, 'corner', {
          createCanvas: options.createCanvas,
          anisotropy,
          handle,
          color: background,
        }),
        chromeVisual: true,
      }));
    }
    for (let [handle, zone] of Object.entries(frame.zones.edges)) {
      chrome.add(chromeMesh(panel, frame, zone, {
        name: `edge-${handle}`,
        actionId: 'drag-panel',
        operation: 'move',
        handle,
        opacity: 0,
        hoverOpacity: 1,
        texture: createMetaWindowChromeTexture(THREE, 'edge', {
          createCanvas: options.createCanvas,
          anisotropy,
          edge: handle,
          color: background,
        }),
        chromeVisual: true,
      }));
    }
    for (let [action, zone] of Object.entries(frame.zones.actions)) {
      chrome.add(chromeMesh(panel, frame, zone, {
        name: `action-${action}`,
        actionId: `window-${action}`,
        operation: 'action',
        handle: action,
        opacity: 0,
        z: 0.014,
      }));
    }
    panelChromeGroups.set(panel.id, chrome);
    panelGroup.add(chrome);
  }

  function reportUnsupportedColor(value) {
    unsupportedColorValues.set(value, (unsupportedColorValues.get(value) || 0) + 1);
  }

  function setGuardedColor(material, value) {
    let { color, unsupported } = normalizeCssColor(value);
    if (unsupported !== undefined) {
      reportUnsupportedColor(unsupported);
      return;
    }
    material.color.set(color);
    materialColors.set(material, color);
  }

  function applyRoleColor(material, value) {
    let { color, alpha, unsupported } = normalizeCssColor(value);
    if (unsupported !== undefined) {
      reportUnsupportedColor(unsupported);
    } else {
      material.color.set(color);
      materialColors.set(material, color);
    }
    if (alpha !== null && alpha < 1) {
      material.opacity = alpha;
      material.transparent = true;
    } else {
      material.opacity = 1;
      material.transparent = false;
    }
  }

  function registerMaterial(material, role) {
    let record = { material, role };
    materialRecords.push(record);
    return record;
  }

  function roleMaterial(role) {
    if (!roleMaterials.has(role)) {
      let material = new THREE.MeshBasicMaterial();
      applyRoleColor(material, theme.roles[role] || theme.roles.surface);
      roleMaterials.set(role, material);
      registerMaterial(material, role).shared = true;
    }
    return roleMaterials.get(role);
  }

  function dedicatedMaterial(role, extra = {}) {
    let material = new THREE.MeshBasicMaterial(extra);
    let record = registerMaterial(material, role);
    record.dedicated = true;
    if (extra.opacity !== undefined) {
      // Explicitly invisible materials (for example hit regions) own their
      // opacity; theme alpha must not corrupt it.
      record.explicitOpacity = true;
      setGuardedColor(material, theme.roles[role] || theme.roles.accent);
    } else {
      applyRoleColor(material, theme.roles[role] || theme.roles.accent);
    }
    return material;
  }

  function applyResolvedStyle(material, background) {
    let { color, alpha, unsupported } = normalizeCssColor(background);
    if (unsupported !== undefined) {
      reportUnsupportedColor(unsupported);
      return;
    }
    material.color.set(color);
    materialColors.set(material, color);
    if (alpha !== null && alpha < 1) {
      material.opacity = alpha;
      material.transparent = true;
    }
  }

  function resolvedStyleMaterial(style) {
    let material = new THREE.MeshBasicMaterial();
    let record = registerMaterial(material, null);
    record.dedicated = true;
    record.resolvedStyle = true;
    applyResolvedStyle(material, style.background);
    return material;
  }

  function planTexturePixels(primitive) {
    let bounds = primitive.bounds;
    let source = primitive.sourcePixels;
    if (source && Number(source.width) > 0 && Number(source.height) > 0) {
      let ratio = Math.min(texturePixelRatio, maxTextureSize / source.width, maxTextureSize / source.height);
      let width = Math.max(2, Math.round(source.width * ratio));
      let height = Math.max(2, Math.round(source.height * ratio));
      return {
        policy: MEASURED_TEXTURE_POLICY,
        sourceCss: { width: roundMetric(source.width), height: roundMetric(source.height) },
        width,
        height,
        ratio: width / source.width,
        pixelsPerMeter: roundMetric(width / bounds.width),
      };
    }
    let width = Math.max(2, Math.round(bounds.width * FALLBACK_PIXELS_PER_METER));
    let height = Math.max(2, Math.round(bounds.height * FALLBACK_PIXELS_PER_METER));
    return {
      policy: FALLBACK_TEXTURE_POLICY,
      sourceCss: null,
      width,
      height,
      ratio: null,
      pixelsPerMeter: roundMetric(width / bounds.width),
    };
  }

  function configureColorTexture(texture) {
    if (THREE.LinearFilter !== undefined) {
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
    }
    texture.generateMipmaps = false;
    texture.anisotropy = anisotropy;
    if (THREE.SRGBColorSpace !== undefined) texture.colorSpace = THREE.SRGBColorSpace;
  }

  function createRasterCanvas() {
    if (typeof options.createCanvas === 'function') return options.createCanvas();
    if (typeof document === 'undefined') {
      throw new Error(
        'three-native-panel-renderer needs a browser document to build CanvasTexture planes; ' +
        'provide options.createCanvas or options.createLabelPlane when running outside a browser.',
      );
    }
    return document.createElement('canvas');
  }

  function resolveFontSet() {
    if (options.fonts) return options.fonts;
    return typeof document === 'undefined' ? null : document.fonts;
  }

  function checkFontReady(fontSpec, sample) {
    let fonts = resolveFontSet();
    if (typeof fonts?.check !== 'function') return null;
    try {
      return Boolean(sample === undefined ? fonts.check(fontSpec) : fonts.check(fontSpec, sample));
    } catch {
      return null;
    }
  }

  function applyOptionalCanvasControls(context, style, font, unsupported) {
    if (font.letterSpacing) {
      if ('letterSpacing' in context) {
        context.letterSpacing = font.letterSpacing;
      } else {
        unsupported.push('letter-spacing');
      }
    }
    if (style.direction) {
      if ('direction' in context) {
        context.direction = style.direction;
      } else {
        unsupported.push('direction');
      }
    }
  }

  function qualityRecord(entry, kind, plan, fontReady, unsupportedControls, glyphMisses = []) {
    entry.quality = {
      primitiveId: entry.primitive.id,
      kind,
      policy: plan.policy,
      sourceCss: plan.sourceCss,
      width: plan.width,
      height: plan.height,
      pixelsPerMeter: plan.pixelsPerMeter,
      bytes: plan.width * plan.height * 4,
      fontReady,
      glyphMisses,
      unsupportedControls,
    };
  }

  function drawLabelCanvas(entry) {
    let { canvas, primitive } = entry;
    let plan = planTexturePixels(primitive);
    canvas.width = plan.width;
    canvas.height = plan.height;
    let context = canvas.getContext('2d');
    let style = primitive.style || {};
    let font = style.font || {};
    let metricScale = (theme.metrics?.fontSize || 13) / 13;
    let fontPx = font.size && plan.sourceCss
      ? Math.max(6, Math.round(Number.parseFloat(font.size) * plan.ratio))
      : font.sizeRatio
        ? Math.max(6, Math.round(canvas.height * font.sizeRatio))
        : Math.max(8, Math.round(canvas.height * 0.52 * metricScale));
    let family = font.family || theme.metrics?.fontFamily || 'system-ui, sans-serif';
    let fontSpec = `${font.style || 'normal'} ${font.weight || 600} ${fontPx}px ${family}`;
    let role = primitive.kind === 'label' ? primitive.themeRole : 'text';
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = fontSpec;
    context.fillStyle = style.color || theme.roles[role] || theme.roles.text;
    entry.drawnColor = context.fillStyle;
    context.textAlign = primitive.align === 'center' ? 'center' : primitive.align === 'end' ? 'right' : 'left';
    let unsupported = [];
    applyOptionalCanvasControls(context, style, font, unsupported);
    let fontReady = checkFontReady(fontSpec);
    context.save();
    context.beginPath();
    context.rect(0, 0, canvas.width, canvas.height);
    context.clip();
    let inset = Math.round(canvas.height * 0.22);
    let x = primitive.align === 'center' ? canvas.width / 2 : primitive.align === 'end' ? canvas.width - inset : inset;
    if (primitive.multiline) {
      context.textBaseline = 'top';
      let lineHeight = font.lineHeight && plan.sourceCss
        ? Math.max(1, Math.round(Number.parseFloat(font.lineHeight) * plan.ratio))
        : Math.max(fontPx * 1.45, 1);
      let lines = String(primitive.text ?? '').split('\n');
      lines.forEach((line, index) => {
        context.fillText(line, x, Math.round(canvas.height * 0.06 + index * lineHeight));
      });
    } else {
      context.textBaseline = 'middle';
      let text = String(primitive.text ?? '');
      if (style.textOverflow === 'ellipsis') {
        let availableWidth = primitive.align === 'center'
          ? canvas.width - inset * 2 - 4
          : primitive.align === 'end'
            ? x - 4
            : canvas.width - x - 4;
        text = truncateWithEllipsis(context, text, availableWidth);
      }
      context.fillText(text, x, canvas.height / 2);
    }
    context.restore();
    entry.texture.needsUpdate = true;
    qualityRecord(entry, 'label', plan, fontReady, unsupported);
  }

  function drawIconCanvas(entry) {
    let { canvas, primitive } = entry;
    let plan = planTexturePixels(primitive);
    canvas.width = plan.width;
    canvas.height = plan.height;
    let context = canvas.getContext('2d');
    let style = primitive.style || {};
    let font = style.font || {};
    let fontPx = font.size && plan.sourceCss
      ? Math.max(6, Math.round(Number.parseFloat(font.size) * plan.ratio))
      : Math.max(8, Math.round(canvas.height * 0.8));
    let family = font.family || options.iconFontFamily || DEFAULT_ICON_FONT_FAMILY;
    let fontSpec = `${font.style || 'normal'} ${font.weight || 400} ${fontPx}px ${family}`;
    let glyph = String(primitive.icon ?? '');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = fontSpec;
    context.fillStyle = style.color || theme.roles[primitive.themeRole] || theme.roles.text;
    entry.drawnColor = context.fillStyle;
    context.textAlign = 'center';
    let unsupported = [];
    applyOptionalCanvasControls(context, style, font, unsupported);
    let fontReady = checkFontReady(fontSpec, glyph);
    context.save();
    context.beginPath();
    context.rect(0, 0, canvas.width, canvas.height);
    context.clip();
    context.textBaseline = 'middle';
    context.fillText(glyph, canvas.width / 2, canvas.height / 2);
    context.restore();
    entry.texture.needsUpdate = true;
    qualityRecord(entry, 'icon', plan, fontReady, unsupported,
      fontReady === false && glyph ? [{ primitiveId: primitive.id, glyph }] : []);
  }

  function defaultCreateTexturePlane() {
    let canvas = createRasterCanvas();
    let texture = new THREE.CanvasTexture(canvas);
    configureColorTexture(texture);
    let material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    return { mesh: new THREE.Mesh(unitPlane, material), canvas, texture, material, generated: true };
  }

  function hostCustomQuality(entry, kind) {
    entry.quality = {
      primitiveId: entry.primitive.id,
      kind,
      policy: 'host-custom',
      sourceCss: null,
      width: null,
      height: null,
      pixelsPerMeter: null,
      bytes: 0,
      fontReady: null,
      glyphMisses: [],
      unsupportedControls: [],
    };
  }

  function buildLabelPlane(primitive) {
    let entry = options.createLabelPlane
      ? { mesh: options.createLabelPlane(THREE, primitive, theme), primitive, generated: false }
      : { ...defaultCreateTexturePlane(), primitive };
    if (!entry.mesh) {
      throw new Error(`options.createLabelPlane returned no mesh for primitive "${primitive.id}".`);
    }
    entry.primitiveId = primitive.id;
    entry.sourcePrimitiveId = primitive.sourcePrimitiveId || primitive.id;
    entry.controlText = Boolean(primitive.sourcePrimitiveId);
    if (entry.generated) {
      drawLabelCanvas(entry);
    } else {
      hostCustomQuality(entry, 'label');
    }
    labelPlanes.push(entry);
    let mesh = entry.mesh;
    mesh.position.set(primitive.bounds.x, primitive.bounds.y, primitive.z + 0.0002);
    mesh.scale.set(primitive.bounds.width, primitive.bounds.height, 1);
    mesh.userData = {
      kind: 'label-text',
      panelId: primitive.panelId,
      primitiveId: primitive.id,
      sourcePrimitiveId: entry.sourcePrimitiveId,
      layer: primitive.layer,
    };
    return mesh;
  }

  function buildIconPlane(primitive) {
    let entry = options.createIconPlane
      ? { mesh: options.createIconPlane(THREE, primitive, theme), primitive, generated: false }
      : { ...defaultCreateTexturePlane(), primitive };
    if (!entry.mesh) {
      throw new Error(`options.createIconPlane returned no mesh for primitive "${primitive.id}".`);
    }
    entry.primitiveId = primitive.id;
    entry.sourcePrimitiveId = primitive.id;
    if (entry.generated) {
      drawIconCanvas(entry);
    } else {
      hostCustomQuality(entry, 'icon');
    }
    iconPlanes.push(entry);
    let mesh = entry.mesh;
    mesh.position.set(primitive.bounds.x, primitive.bounds.y, primitive.z + 0.0002);
    mesh.scale.set(primitive.bounds.width, primitive.bounds.height, 1);
    mesh.userData = {
      kind: 'icon',
      panelId: primitive.panelId,
      primitiveId: primitive.id,
      layer: primitive.layer,
    };
    return mesh;
  }

  function createFrameGroup(primitive) {
    let group = new THREE.Group();
    group.visible = false;
    let thickness = primitive.thickness || 0.002;
    let { x, y, width, height } = primitive.bounds;
    let segments = [
      { x, y: y + height / 2 - thickness / 2, width, height: thickness },
      { x, y: y - height / 2 + thickness / 2, width, height: thickness },
      { x: x - width / 2 + thickness / 2, y, width: thickness, height },
      { x: x + width / 2 - thickness / 2, y, width: thickness, height },
    ];
    for (let segment of segments) {
      let mesh = new THREE.Mesh(unitPlane, roleMaterial(primitive.themeRole));
      mesh.position.set(segment.x, segment.y, primitive.z);
      mesh.scale.set(segment.width, segment.height, 1);
      group.add(mesh);
    }
    group.userData = {
      kind: 'frame',
      panelId: primitive.panelId,
      primitiveId: primitive.id,
      layer: primitive.layer,
    };
    return group;
  }

  function addBorderEdges(mesh, primitive) {
    let border = primitive.style?.border;
    if (!border || !(border.width > 0)) return;
    let { width, height } = primitive.bounds;
    if (!(width > 0) || !(height > 0)) return;
    let thickness = Math.min(border.width, width / 2, height / 2);
    let material = new THREE.MeshBasicMaterial({ depthWrite: false });
    let record = registerMaterial(material, null);
    record.dedicated = true;
    applyResolvedStyle(material, border.color);
    let tx = thickness / width;
    let ty = thickness / height;
    let edges = [
      { x: 0, y: 0.5 - ty / 2, sx: 1, sy: ty },
      { x: 0, y: -0.5 + ty / 2, sx: 1, sy: ty },
      { x: -0.5 + tx / 2, y: 0, sx: tx, sy: 1 - 2 * ty },
      { x: 0.5 - tx / 2, y: 0, sx: tx, sy: 1 - 2 * ty },
    ];
    for (let edge of edges) {
      let edgeMesh = new THREE.Mesh(unitPlane, material);
      edgeMesh.position.set(edge.x, edge.y, 0.0001);
      edgeMesh.scale.set(edge.sx, edge.sy, 1);
      edgeMesh.userData = { kind: 'border-edge' };
      mesh.add(edgeMesh);
    }
    borderMaterials.set(primitive.id, material);
  }

  function buildPrimitive(panel, primitive, layerGroup) {
    let object;
    if (primitive.visible === false) {
      object = new THREE.Group();
      object.visible = false;
      object.userData = {
        kind: primitive.kind,
        control: primitive.control || null,
        panelId: panel.id,
        primitiveId: primitive.id,
        layer: primitive.layer,
        actionId: primitive.hit?.actionId || null,
        targetId: primitive.hit?.targetId || null,
      };
      primitiveObjects.set(primitive.id, object);
      layerGroup.add(object);
      return;
    }
    if (primitive.kind === 'frame') {
      object = createFrameGroup(primitive);
      frameGroups.set(panel.id, object);
    } else {
      let isHitRegion = primitive.kind === 'control' && primitive.control === 'hit';
      let hasResolvedStyle = Boolean(primitive.style?.background);
      let material;
      if (primitive.kind === 'control') {
        material = isHitRegion
          ? dedicatedMaterial(primitive.themeRole, { transparent: true, opacity: 0, depthWrite: false })
          : hasResolvedStyle
            ? resolvedStyleMaterial(primitive.style)
            : dedicatedMaterial(primitive.themeRole);
      } else if (primitive.kind === 'label' || primitive.kind === 'icon') {
        material = null;
      } else if (primitive.transparent) {
        material = dedicatedMaterial(primitive.themeRole, { transparent: true, opacity: 0, depthWrite: false });
      } else {
        material = hasResolvedStyle ? resolvedStyleMaterial(primitive.style) : roleMaterial(primitive.themeRole);
      }
      if (primitive.kind === 'label') {
        object = buildLabelPlane({ ...primitive, panelId: panel.id });
      } else if (primitive.kind === 'icon') {
        object = buildIconPlane({ ...primitive, panelId: panel.id });
      } else {
        object = new THREE.Mesh(unitPlane, material);
        object.position.set(primitive.bounds.x, primitive.bounds.y, primitive.z);
        object.scale.set(primitive.bounds.width, primitive.bounds.height, 1);
        if (primitive.kind === 'edge') object.rotation.z = primitive.angle || 0;
        object.userData = {
          kind: primitive.kind,
          control: primitive.control || null,
          panelId: panel.id,
          primitiveId: primitive.id,
          layer: primitive.layer,
          themeRole: primitive.themeRole,
          resolvedStyle: hasResolvedStyle || null,
          actionId: primitive.hit?.actionId || null,
          targetId: primitive.hit?.targetId || null,
        };
        if (!isHitRegion && primitive.style?.border) addBorderEdges(object, primitive);
        if (primitive.text) {
          let labelMesh = buildLabelPlane({
            ...primitive,
            kind: 'label',
            panelId: panel.id,
            id: `${primitive.id}/text`,
            sourcePrimitiveId: primitive.id,
          });
          layerGroup.add(labelMesh);
        }
      }
    }
    if (primitive.hit) interactive.push(object);
    primitiveObjects.set(primitive.id, object);
    layerGroup.add(object);
  }

  function buildPanel(panel) {
    let panelGroup = new THREE.Group();
    panelGroup.position.set(panel.position[0], panel.position[1], panel.position[2]);
    panelGroup.userData = { kind: 'native-panel', panelId: panel.id, family: panel.family };
    let contentGroup = new THREE.Group();
    contentGroup.userData = { kind: 'native-panel-content', panelId: panel.id };
    panelGroup.add(contentGroup);
    let perPanelLayers = new Map();
    for (let layer of NATIVE_PANEL_LAYERS) {
      let layerGroup = new THREE.Group();
      layerGroup.position.set(0, 0, 0);
      layerGroup.userData = { kind: 'native-panel-layer', panelId: panel.id, layer };
      perPanelLayers.set(layer, layerGroup);
      contentGroup.add(layerGroup);
    }
    for (let primitive of panel.primitives) {
      buildPrimitive(panel, primitive, perPanelLayers.get(primitive.layer));
    }
    panelGroups.set(panel.id, panelGroup);
    layerGroups.set(panel.id, perPanelLayers);
    buildWindowChrome(panel, panelGroup);
    root.add(panelGroup);
  }

  function disposeObjectTree(object) {
    object.traverse((node) => {
      if (node.geometry && node.geometry !== unitPlane) {
        node.geometry.dispose?.();
      }
      if (node.userData?.expandedTexture && node.userData.expandedTexture !== node.material?.map) {
        node.userData.expandedTexture.dispose?.();
      }
      if (node.material && !isSharedMaterial(node.material)) {
        node.material.map?.dispose?.();
        node.material.dispose?.();
      }
    });
  }

  function isSharedMaterial(material) {
    for (let shared of roleMaterials.values()) {
      if (shared === material) return true;
    }
    return false;
  }

  function clearPanels() {
    for (let panelGroup of panelGroups.values()) {
      disposeObjectTree(panelGroup);
      root.remove(panelGroup);
    }
    panelGroups.clear();
    panelChromeGroups.clear();
    panelPreviewSizes.clear();
    panelPreviewSurfaces.clear();
    panelPreviewVisibility.clear();
    panelPreviewHiddenCounts.clear();
    layerGroups.clear();
    primitiveObjects.clear();
    frameGroups.clear();
    borderMaterials.clear();
    interactive = [];
    labelPlanes = [];
    iconPlanes = [];
    materialRecords = materialRecords.filter((record) => record.shared);
  }

  function indexPrimitives(scene) {
    let map = new Map();
    for (let panel of scene.panels) {
      for (let primitive of panel.primitives || []) {
        map.set(primitive.id, primitive);
      }
    }
    return map;
  }

  function redrawPlanes() {
    for (let entry of labelPlanes) {
      if (entry.generated) {
        drawLabelCanvas(entry);
      } else {
        options.updateLabelPlane?.(entry.mesh, entry.primitive, theme);
      }
    }
    for (let entry of iconPlanes) {
      if (entry.generated) {
        drawIconCanvas(entry);
      } else {
        options.updateIconPlane?.(entry.mesh, entry.primitive, theme);
      }
    }
  }

  function selectedPanelId() {
    return selectedId ? selectedId.split('/')[0] : null;
  }

  function applyInteraction() {
    if (!theme) return;
    for (let object of interactive) {
      let isHovered = object.userData.primitiveId === hoveredId;
      let isSelected = object.userData.primitiveId === selectedId;
      if (object.userData.kind === 'window-chrome') {
        if (object.userData.chromeVisual) {
          object.material.opacity = isHovered
            ? object.userData.hoverOpacity
            : object.userData.baseOpacity;
          if (object.userData.expandedTexture) {
            let chromePrefix = `${object.userData.panelId}/window-chrome/`;
            let expanded = hoveredId === object.userData.primitiveId
              || (hoveredId?.startsWith(chromePrefix) && hoveredId.includes('/action-'));
            object.material.map = expanded
              ? object.userData.expandedTexture
              : object.userData.collapsedTexture;
          }
        } else {
          object.material.opacity = 0;
        }
        continue;
      }
      if (object.userData.control === 'hit') {
        object.material.opacity = isSelected ? SELECTED_HIT_OPACITY : isHovered ? HOVER_HIT_OPACITY : 0;
        setGuardedColor(object.material, theme.roles.accent);
      } else {
        if (object.userData.resolvedStyle) continue;
        let role = isHovered || isSelected ? 'accent' : object.userData.themeRole;
        setGuardedColor(object.material, theme.roles[role] || theme.roles.accent);
      }
    }
    let selectedPanel = selectedPanelId();
    for (let [panelId, frameGroup] of frameGroups) {
      frameGroup.visible = Boolean(selectedPanel) && panelId === selectedPanel;
    }
  }

  function mount(compiledScene, mountOptions = {}) {
    if (disposed) {
      throw new Error('three-native-panel-renderer has been disposed; create a new renderer to mount again.');
    }
    if (compiledScene?.version !== NATIVE_PANEL_LAYOUT_VERSION || !Array.isArray(compiledScene.panels)) {
      throw new Error(
        `mount requires a ${NATIVE_PANEL_LAYOUT_VERSION} scene from compileNativePanelPrimitives().`,
      );
    }
    let nextTheme = mountOptions.theme || theme;
    assertTheme(nextTheme, 'mount');
    theme = nextTheme;
    unsupportedColorValues = new Map();
    clearPanels();
    for (let panel of compiledScene.panels) {
      buildPanel(panel);
    }
    mountedScene = compiledScene;
    mountedPrimitives = indexPrimitives(compiledScene);
    builds += 1;
    applyExplode();
    applyInteraction();
  }

  function replacePanel(compiledScene, panelId) {
    if (disposed) {
      throw new Error(
        'three-native-panel-renderer has been disposed; create a new renderer to replace a panel.',
      );
    }
    if (compiledScene?.version !== NATIVE_PANEL_LAYOUT_VERSION || !Array.isArray(compiledScene.panels)) {
      throw new Error(
        `replacePanel requires a ${NATIVE_PANEL_LAYOUT_VERSION} scene from compileNativePanelPrimitives().`,
      );
    }
    let nextPanel = compiledScene.panels.find((panel) => panel.id === panelId);
    let previous = panelGroups.get(panelId);
    if (!nextPanel || !previous) {
      throw new Error(`replacePanel could not resolve mounted panel "${panelId}".`);
    }

    let previousObjects = new Set();
    let previousMaterials = new Set();
    previous.traverse((object) => {
      previousObjects.add(object);
      if (Array.isArray(object.material)) {
        for (let material of object.material) previousMaterials.add(material);
      } else if (object.material) {
        previousMaterials.add(object.material);
      }
    });
    let presentation = {
      position: [previous.position.x, previous.position.y, previous.position.z],
      rotation: [previous.rotation.x, previous.rotation.y, previous.rotation.z],
      scale: [previous.scale.x, previous.scale.y, previous.scale.z],
      visible: previous.visible,
      pinned: Boolean(previous.userData.pinned),
    };

    cancelPanelSizePreview(panelId);
    let registries = {
      panelGroups: new Map(panelGroups),
      panelChromeGroups: new Map(panelChromeGroups),
      layerGroups: new Map(layerGroups),
      primitiveObjects: new Map(primitiveObjects),
      frameGroups: new Map(frameGroups),
      borderMaterials: new Map(borderMaterials),
      interactive: [...interactive],
      materialRecords: [...materialRecords],
      labelPlanes: [...labelPlanes],
      iconPlanes: [...iconPlanes],
    };
    try {
      buildPanel(nextPanel);
    } catch (error) {
      let failedPanel = panelGroups.get(panelId);
      if (failedPanel && failedPanel !== previous) {
        root.remove(failedPanel);
        disposeObjectTree(failedPanel);
      } else {
        let previousObjects = new Set(registries.primitiveObjects.values());
        for (let object of primitiveObjects.values()) {
          if (!previousObjects.has(object)) disposeObjectTree(object);
        }
        let previousPlanes = new Set([
          ...registries.labelPlanes.map((entry) => entry.mesh),
          ...registries.iconPlanes.map((entry) => entry.mesh),
        ]);
        for (let entry of [...labelPlanes, ...iconPlanes]) {
          if (!previousPlanes.has(entry.mesh)) disposeObjectTree(entry.mesh);
        }
      }
      for (let record of materialRecords) {
        if (!registries.materialRecords.includes(record) && !record.shared) {
          record.material.map?.dispose?.();
          record.material.dispose?.();
        }
      }
      panelGroups = registries.panelGroups;
      panelChromeGroups = registries.panelChromeGroups;
      layerGroups = registries.layerGroups;
      primitiveObjects = registries.primitiveObjects;
      frameGroups = registries.frameGroups;
      borderMaterials = registries.borderMaterials;
      interactive = registries.interactive;
      materialRecords = registries.materialRecords;
      labelPlanes = registries.labelPlanes;
      iconPlanes = registries.iconPlanes;
      throw error;
    }
    let replacement = panelGroups.get(panelId);
    replacement.position.set(...presentation.position);
    replacement.rotation.x = presentation.rotation[0];
    replacement.rotation.y = presentation.rotation[1];
    replacement.rotation.z = presentation.rotation[2];
    replacement.scale.set(...presentation.scale);
    replacement.visible = presentation.visible;
    replacement.userData.pinned = presentation.pinned;

    interactive = interactive.filter((object) => !previousObjects.has(object));
    labelPlanes = labelPlanes.filter((entry) => !previousObjects.has(entry.mesh));
    iconPlanes = iconPlanes.filter((entry) => !previousObjects.has(entry.mesh));
    materialRecords = materialRecords.filter((record) => (
      record.shared || !previousMaterials.has(record.material)
    ));
    for (let [id, object] of primitiveObjects) {
      if (previousObjects.has(object)) primitiveObjects.delete(id);
    }
    for (let [id, group] of frameGroups) {
      if (previousObjects.has(group)) frameGroups.delete(id);
    }
    for (let [id, material] of borderMaterials) {
      if (previousMaterials.has(material)) borderMaterials.delete(id);
    }

    root.remove(previous);
    disposeObjectTree(previous);
    mountedScene = compiledScene;
    mountedPrimitives = indexPrimitives(compiledScene);
    panelReplacements += 1;
    applyExplode();
    applyInteraction();
    return {
      ok: true,
      panelId,
      preservedTransform: true,
    };
  }

  function recolorRoleMaterials() {
    for (let record of materialRecords) {
      let color = theme.roles[record.role];
      if (color === undefined) continue;
      if (record.explicitOpacity) {
        setGuardedColor(record.material, color);
      } else {
        applyRoleColor(record.material, color);
      }
    }
  }

  function updateTheme(nextTheme) {
    if (disposed) {
      throw new Error('three-native-panel-renderer has been disposed; create a new renderer to update themes.');
    }
    assertTheme(nextTheme, 'updateTheme');
    theme = nextTheme;
    themeUpdates += 1;
    unsupportedColorValues = new Map();
    recolorRoleMaterials();
    redrawPlanes();
    for (let panel of mountedScene?.panels || []) updateWindowChromeTextures(panel.id);
    applyInteraction();
  }

  function refreshTextures() {
    if (disposed) {
      throw new Error('three-native-panel-renderer has been disposed; create a new renderer to refresh textures.');
    }
    redrawPlanes();
  }

  function refreshPlaneEntry(entry) {
    let source = mountedPrimitives.get(entry.sourcePrimitiveId);
    if (!source) return;
    entry.primitive = entry.controlText
      ? { ...source, kind: 'label', id: `${source.id}/text`, panelId: entry.primitive.panelId }
      : source;
  }

  function refreshAppearance(compiledScene, refreshOptions = {}) {
    if (disposed) {
      throw new Error('three-native-panel-renderer has been disposed; create a new renderer to refresh appearance.');
    }
    if (compiledScene?.version !== NATIVE_PANEL_LAYOUT_VERSION || !Array.isArray(compiledScene.panels)) {
      throw new Error(
        `refreshAppearance requires a ${NATIVE_PANEL_LAYOUT_VERSION} scene from compileNativePanelPrimitives().`,
      );
    }
    let nextTheme = refreshOptions.theme || theme;
    assertTheme(nextTheme, 'refreshAppearance');
    if (!mountedScene) {
      return { ok: false, reason: 'geometry-invalidated', changed: ['<scene>'] };
    }
    let changed = [];
    let oldPanels = new Map(mountedScene.panels.map((panel) => [panel.id, panel]));
    if (compiledScene.panels.length !== mountedScene.panels.length) changed.push('<panels>');
    for (let panel of compiledScene.panels) {
      let old = oldPanels.get(panel.id);
      if (!old) {
        changed.push(panel.id);
        continue;
      }
      if (JSON.stringify(old.position) !== JSON.stringify(panel.position)
        || JSON.stringify(old.size) !== JSON.stringify(panel.size)
        || JSON.stringify(old.rotation) !== JSON.stringify(panel.rotation)) {
        changed.push(panel.id);
      }
    }
    let nextPrimitives = indexPrimitives(compiledScene);
    for (let [id, primitive] of nextPrimitives) {
      let old = mountedPrimitives.get(id);
      if (!old) {
        changed.push(id);
        continue;
      }
      if (old.kind !== primitive.kind
        || old.layer !== primitive.layer
        || old.bounds.x !== primitive.bounds.x
        || old.bounds.y !== primitive.bounds.y
        || old.bounds.width !== primitive.bounds.width
        || old.bounds.height !== primitive.bounds.height
        || old.style?.font?.size !== primitive.style?.font?.size
        || old.style?.font?.family !== primitive.style?.font?.family
        || Boolean(old.style?.border) !== Boolean(primitive.style?.border)
        || old.style?.border?.width !== primitive.style?.border?.width) {
        changed.push(id);
      }
    }
    for (let id of mountedPrimitives.keys()) {
      if (!nextPrimitives.has(id)) changed.push(id);
    }
    if (changed.length) {
      return { ok: false, reason: 'geometry-invalidated', changed };
    }
    theme = nextTheme;
    appearanceRefreshes += 1;
    unsupportedColorValues = new Map();
    mountedScene = compiledScene;
    mountedPrimitives = nextPrimitives;
    recolorRoleMaterials();
    for (let [id, object] of primitiveObjects) {
      if (!object.userData.resolvedStyle) continue;
      let background = nextPrimitives.get(id)?.style?.background;
      if (background) {
        applyResolvedStyle(object.material, background);
      } else {
        applyRoleColor(object.material, theme.roles[object.userData.themeRole] || theme.roles.surface);
      }
    }
    for (let [id, material] of borderMaterials) {
      let border = nextPrimitives.get(id)?.style?.border;
      if (border) applyResolvedStyle(material, border.color);
    }
    for (let entry of labelPlanes) refreshPlaneEntry(entry);
    for (let entry of iconPlanes) refreshPlaneEntry(entry);
    redrawPlanes();
    applyInteraction();
    return {
      ok: true,
      refreshed: {
        panels: compiledScene.panels.length,
        primitives: nextPrimitives.size,
        redrawn: labelPlanes.length + iconPlanes.length,
      },
    };
  }

  function applyExplode() {
    let offsets = createNativePanelLayerOffsets(explode);
    for (let perPanelLayers of layerGroups.values()) {
      for (let [layer, group] of perPanelLayers) {
        group.position.z = offsets[layer];
      }
    }
  }

  function setLayerExplode(value) {
    let amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`setLayerExplode requires a non-negative finite meter value, got ${JSON.stringify(value)}.`);
    }
    explode = amount;
    applyExplode();
  }

  function setHovered(primitiveId) {
    hoveredId = primitiveId || null;
    applyInteraction();
  }

  function setSelected(primitiveId) {
    selectedId = primitiveId || null;
    applyInteraction();
  }

  function refreshWindowChrome(panelId) {
    let panel = mountedScene?.panels?.find((candidate) => candidate.id === panelId);
    let panelGroup = panelGroups.get(panelId);
    if (!panel || !panelGroup || panel.role === 'layout-control') return false;
    let previous = panelChromeGroups.get(panelId);
    if (previous) {
      let previousObjects = new Set();
      previous.traverse((node) => previousObjects.add(node));
      interactive = interactive.filter((object) => !previousObjects.has(object));
      disposeObjectTree(previous);
      panelGroup.remove(previous);
    }
    buildWindowChrome(panel, panelGroup);
    applyInteraction();
    return true;
  }

  function layoutWindowChrome(panelId) {
    let panel = mountedScene?.panels?.find((candidate) => candidate.id === panelId);
    let chrome = panelChromeGroups.get(panelId);
    if (!panel || !chrome || panel.role === 'layout-control') return false;
    let size = panelPreviewSizes.get(panelId) || panel.size;
    let frame = createXRPanelFrame(panel, { panelSizeMeters: size });
    frame.size = size;
    for (let object of chrome.children) {
      let zone = object.name.endsWith('control-bar')
        ? frame.zones.controlBar
        : object.name.includes('resize-')
          ? frame.zones.resize[object.userData.handle]
          : object.name.includes('edge-')
            ? frame.zones.edges[object.userData.handle]
            : object.name.includes('action-')
              ? frame.zones.actions[object.userData.handle]
              : null;
      if (!zone) continue;
      let rect = chromeRect(zone, size);
      object.geometry.dispose?.();
      object.geometry = new THREE.PlaneGeometry(rect.width, rect.height);
      object.position.set(rect.x, rect.y, object.position.z);
    }
    return true;
  }

  function updateWindowChromeTextures(panelId) {
    let panel = mountedScene?.panels?.find((candidate) => candidate.id === panelId);
    let panelGroup = panelGroups.get(panelId);
    let chrome = panelChromeGroups.get(panelId);
    if (!panel || !panelGroup || !chrome) return false;
    let background = theme.roles.text || '#fafafa';
    let foreground = theme.roles.surface || '#202020';
    let frame = createXRPanelFrame(panel, {
      panelSizeMeters: panelPreviewSizes.get(panelId) || panel.size,
    });
    let actions = Object.keys(frame.zones.actions);
    for (let object of chrome.children) {
      let name = object.name || '';
      let texture = null;
      if (name.endsWith('control-bar')) {
        let expandedTexture = createMetaWindowChromeTexture(THREE, 'control-bar', {
          createCanvas: options.createCanvas,
          anisotropy,
          title: chromeTitle(panel),
          actions,
          activeAction: panelGroup.userData.pinned ? 'pin' : null,
          background,
          foreground,
        });
        let collapsedTexture = createMetaWindowChromeTexture(THREE, 'grab-strip', {
          createCanvas: options.createCanvas,
          anisotropy,
          color: background,
        });
        object.userData.expandedTexture?.dispose?.();
        object.userData.expandedTexture = expandedTexture;
        object.userData.collapsedTexture = collapsedTexture;
        texture = collapsedTexture;
      } else if (name.includes('resize-')) {
        texture = createMetaWindowChromeTexture(THREE, 'corner', {
          createCanvas: options.createCanvas,
          anisotropy,
          handle: object.userData.handle,
          color: background,
        });
      } else if (name.includes('edge-')) {
        texture = createMetaWindowChromeTexture(THREE, 'edge', {
          createCanvas: options.createCanvas,
          anisotropy,
          edge: object.userData.handle,
          color: background,
        });
      }
      if (texture) {
        object.material.map?.dispose?.();
        object.material.map = texture;
        object.material.needsUpdate = true;
      }
    }
    return true;
  }

  function previewPanelSize(panelId, size) {
    let panel = mountedScene?.panels?.find((candidate) => candidate.id === panelId);
    let panelGroup = panelGroups.get(panelId);
    if (!panel || !panelGroup || !Array.isArray(size) || size.length !== 2) return false;
    let width = Number(size[0]);
    let height = Number(size[1]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return false;
    }
    let targetSize = [width, height];
    let surface = panelPreviewSurfaces.get(panelId);
    if (!surface) {
      surface = new THREE.Mesh(
        new THREE.PlaneGeometry(targetSize[0], targetSize[1]),
        roleMaterial('surface'),
      );
      surface.name = 'sn-native-window-resize-preview';
      surface.position.set(0, 0, -0.002);
      surface.userData = { kind: 'window-resize-preview', panelId };
      panelPreviewSurfaces.set(panelId, surface);
      panelGroup.add(surface);
    } else {
      surface.geometry.dispose?.();
      surface.geometry = new THREE.PlaneGeometry(targetSize[0], targetSize[1]);
    }
    panelPreviewSizes.set(panelId, targetSize);
    let content = panelGroup.children.find((child) => (
      child.userData?.kind === 'native-panel-content'
    ));
    let visibility = panelPreviewVisibility.get(panelId);
    if (!visibility) {
      visibility = new Map();
      content?.traverse((object) => {
        if (object.userData?.primitiveId) visibility.set(object, object.visible !== false);
      });
      panelPreviewVisibility.set(panelId, visibility);
    }
    let hidden = 0;
    for (let [object, baselineVisible] of visibility) {
      let primitiveId = object.userData.sourcePrimitiveId || object.userData.primitiveId;
      let primitive = mountedPrimitives.get(primitiveId);
      if (!primitive) {
        object.visible = baselineVisible;
        continue;
      }
      let bounds = primitive.bounds;
      let contained = bounds.x - bounds.width / 2 >= -targetSize[0] / 2
        && bounds.x + bounds.width / 2 <= targetSize[0] / 2
        && bounds.y - bounds.height / 2 >= -targetSize[1] / 2
        && bounds.y + bounds.height / 2 <= targetSize[1] / 2;
      object.visible = baselineVisible && contained;
      if (baselineVisible && !contained) hidden += 1;
    }
    panelPreviewHiddenCounts.set(panelId, hidden);
    layoutWindowChrome(panelId);
    return true;
  }

  function cancelPanelSizePreview(panelId) {
    let panelGroup = panelGroups.get(panelId);
    let surface = panelPreviewSurfaces.get(panelId);
    let hadPreview = panelPreviewSizes.delete(panelId);
    let visibility = panelPreviewVisibility.get(panelId);
    if (visibility) {
      for (let [object, baselineVisible] of visibility) object.visible = baselineVisible;
      panelPreviewVisibility.delete(panelId);
    }
    panelPreviewHiddenCounts.delete(panelId);
    if (surface) {
      surface.geometry.dispose?.();
      panelGroup?.remove(surface);
      panelPreviewSurfaces.delete(panelId);
    }
    if (hadPreview) layoutWindowChrome(panelId);
    return hadPreview;
  }

  function resolveIntersection(intersection) {
    let object = intersection?.object || null;
    let fallbackPanelId = null;
    while (object) {
      if (object.userData?.primitiveId && object.userData?.kind !== 'label-text') {
        let resolved = {
          panelId: object.userData.panelId,
          primitiveId: object.userData.primitiveId,
          actionId: object.userData.actionId || null,
          targetId: object.userData.targetId || null,
          layer: object.userData.layer || null,
          kind: object.userData.kind || null,
          operation: object.userData.operation || null,
          handle: object.userData.handle || null,
          distance: intersection.distance ?? null,
        };
        if (intersection.uv) {
          resolved.point = {
            x: roundMetric(intersection.uv.x),
            y: roundMetric(1 - intersection.uv.y),
          };
        }
        return resolved;
      }
      if (object.userData?.panelId && !fallbackPanelId) fallbackPanelId = object.userData.panelId;
      object = object.parent;
    }
    return fallbackPanelId
      ? { panelId: fallbackPanelId, primitiveId: null, actionId: null, targetId: null, layer: null, kind: null }
      : null;
  }

  function getTextQualityReport() {
    let textures = [...labelPlanes, ...iconPlanes]
      .map((entry) => entry.quality)
      .filter(Boolean);
    let unsupportedControls = [...new Set(textures.flatMap((entry) => entry.unsupportedControls))].sort();
    let glyphMisses = textures.flatMap((entry) => entry.glyphMisses);
    let readiness = textures.map((entry) => entry.fontReady);
    let ready = readiness.length > 0 && readiness.every((value) => value === true)
      ? true
      : readiness.some((value) => value === false)
        ? false
        : null;
    let compiledIcons = 0;
    let hiddenIcons = 0;
    for (let panel of mountedScene?.panels || []) {
      for (let primitive of panel.primitives || []) {
        if (primitive.kind !== 'icon') continue;
        compiledIcons += 1;
        if (primitive.visible === false) hiddenIcons += 1;
      }
    }
    let capturedIcons = mountedScene?.counts?.byKind?.icon ?? compiledIcons;
    return {
      version: TEXT_QUALITY_REPORT_VERSION,
      policy: {
        measured: MEASURED_TEXTURE_POLICY,
        fallback: FALLBACK_TEXTURE_POLICY,
        pixelRatio: texturePixelRatio,
        maxTextureSize,
        fallbackPixelsPerMeter: FALLBACK_PIXELS_PER_METER,
      },
      sampling: {
        minFilter: THREE.LinearFilter !== undefined ? 'LinearFilter' : 'default',
        magFilter: THREE.LinearFilter !== undefined ? 'LinearFilter' : 'default',
        mipmaps: false,
        anisotropy,
        colorSpace: THREE.SRGBColorSpace !== undefined ? 'srgb' : 'default',
      },
      fonts: {
        ready,
        iconFamily: options.iconFontFamily || DEFAULT_ICON_FONT_FAMILY,
      },
      unsupportedControls,
      glyphMisses,
      icons: {
        captured: capturedIcons,
        compiled: compiledIcons,
        drawn: iconPlanes.length,
        coverage: compiledIcons ? (iconPlanes.length + hiddenIcons) / compiledIcons : 1,
      },
      textures,
      memory: {
        textures: textures.length,
        bytes: textures.reduce((sum, entry) => sum + entry.bytes, 0),
      },
    };
  }

  function meshAppearanceEntry(id, object) {
    let source = mountedPrimitives.get(id);
    let material = object.material || null;
    let borderMaterial = borderMaterials.get(id) || null;
    return {
      id,
      panelId: object.userData.panelId ?? null,
      spatialNodeId: source?.spatialNodeId ?? null,
      kind: source?.kind ?? object.userData.kind ?? null,
      control: object.userData.control ?? null,
      layer: object.userData.layer ?? null,
      visible: object.visible !== false && (material ? material.opacity > 0 : true),
      color: material ? (materialColors.get(material) ?? null) : null,
      opacity: material ? material.opacity : 1,
      transparent: material ? material.transparent === true : false,
      resolvedStyle: object.userData.resolvedStyle === true,
      border: borderMaterial
        ? {
          width: source?.style?.border?.width ?? null,
          color: materialColors.get(borderMaterial) ?? null,
          opacity: borderMaterial.opacity,
        }
        : null,
    };
  }

  function planeAppearanceEntry(entry) {
    let source = mountedPrimitives.get(entry.sourcePrimitiveId);
    let mesh = entry.mesh;
    return {
      id: entry.primitiveId,
      panelId: mesh.userData.panelId ?? null,
      spatialNodeId: source?.spatialNodeId ?? null,
      kind: entry.quality?.kind ?? (mesh.userData.kind === 'icon' ? 'icon' : 'label'),
      control: null,
      layer: mesh.userData.layer ?? null,
      visible: mesh.visible !== false,
      color: entry.drawnColor ?? null,
      opacity: 1,
      transparent: true,
      resolvedStyle: Boolean(source?.style?.color),
      border: null,
    };
  }

  function getAppearanceReport() {
    let previousHovered = hoveredId;
    let previousSelected = selectedId;
    hoveredId = null;
    selectedId = null;
    applyInteraction();
    let primitives = [];
    for (let [id, object] of primitiveObjects) {
      if (object.userData.kind === 'frame') continue;
      if (object.userData.kind === 'label-text' || object.userData.kind === 'icon') continue;
      primitives.push(meshAppearanceEntry(id, object));
    }
    for (let entry of [...labelPlanes, ...iconPlanes]) {
      primitives.push(planeAppearanceEntry(entry));
    }
    hoveredId = previousHovered;
    selectedId = previousSelected;
    applyInteraction();
    return {
      version: NATIVE_PANEL_APPEARANCE_VERSION,
      scale: mountedScene?.spatialSnapshot?.scale ?? null,
      panels: panelGroups.size,
      hovered: previousHovered,
      selected: previousSelected,
      primitives,
    };
  }

  function getDiagnostics() {
    return {
      version: 'three-native-panel-renderer-v1',
      threeRevision: options.threeRevision || THREE.REVISION || null,
      themeRevision: theme?.revision ?? null,
      themeUpdates,
      builds,
      appearanceRefreshes,
      panelReplacements,
      explode,
      panels: panelGroups.size,
      layerGroups: panelGroups.size * NATIVE_PANEL_LAYERS.length,
      primitives: primitiveObjects.size,
      interactive: interactive.length,
      labels: labelPlanes.length,
      materials: materialRecords.length,
      hovered: hoveredId,
      selected: selectedId,
      resizePreviews: Object.fromEntries(
        [...panelPreviewSizes].map(([panelId, size]) => [panelId, [...size]]),
      ),
      resizePreviewHidden: Object.fromEntries(panelPreviewHiddenCounts),
      unsupportedColors: [...unsupportedColorValues.entries()].map(([value, count]) => ({ value, count })),
    };
  }

  function dispose() {
    clearPanels();
    for (let material of roleMaterials.values()) {
      material.map?.dispose?.();
      material.dispose?.();
    }
    roleMaterials.clear();
    materialRecords = [];
    unitPlane.dispose?.();
    root.removeFromParent?.();
    root.clear?.();
    disposed = true;
  }

  return {
    group: root,
    mount,
    replacePanel,
    updateTheme,
    refreshAppearance,
    refreshTextures,
    setLayerExplode,
    setHovered,
    setSelected,
    previewPanelSize,
    cancelPanelSizePreview,
    refreshPanelChrome: refreshWindowChrome,
    getInteractiveObjects: () => [...interactive],
    getPanelObject: (panelId) => panelGroups.get(panelId) || null,
    getPrimitiveObject: (primitiveId) => primitiveObjects.get(primitiveId) || null,
    resolveIntersection,
    getDiagnostics,
    getTextQualityReport,
    getAppearanceReport,
    dispose,
  };
}
