const XR_THEME_TOKEN_MAP = Object.freeze({
  panelBackground: '--sn-xr-panel-bg',
  panelBorder: '--sn-xr-panel-border',
  panelRadius: '--sn-xr-panel-radius',
  panelShadow: '--sn-xr-panel-shadow',
  pointerColor: '--sn-xr-pointer-color',
  textColor: '--sn-sys-on-surface',
  mutedTextColor: '--sn-sys-on-surface-dim',
  motionDuration: '--sn-duration-fast',
  motionEasing: '--sn-ease-standard',
  gap: '--sn-layout-resizer-size',
});

const XR_THEME_FALLBACKS = Object.freeze({
  '--sn-xr-panel-bg': 'var(--sn-sys-surface-panel)',
  '--sn-xr-panel-border': 'var(--sn-sys-outline)',
  '--sn-xr-panel-radius': 'var(--sn-node-radius)',
  '--sn-xr-panel-shadow': 'var(--sn-node-shadow)',
  '--sn-xr-pointer-color': 'var(--sn-sys-accent)',
  '--sn-sys-on-surface': 'var(--sn-sys-on-surface)',
  '--sn-sys-on-surface-dim': 'var(--sn-sys-on-surface-dim)',
  '--sn-duration-fast': '120ms',
  '--sn-ease-standard': 'ease',
  '--sn-layout-resizer-size': '6px',
});

function resolveThemeRoot(rootOrDocument) {
  if (!rootOrDocument) return null;
  if (rootOrDocument.documentElement) return rootOrDocument.documentElement;
  return rootOrDocument;
}

function readCssToken(root, cssVar, computedStyle) {
  if (!root || !computedStyle) return XR_THEME_FALLBACKS[cssVar] || '';
  let value = computedStyle.getPropertyValue(cssVar).trim();
  return value || XR_THEME_FALLBACKS[cssVar] || '';
}

function resolveCssProperty(root, cssVar, property) {
  let documentRef = root?.ownerDocument || root?.documentElement?.ownerDocument || null;
  let parent = documentRef?.body || root;
  if (!documentRef?.createElement || !parent?.append || typeof globalThis.getComputedStyle !== 'function') return '';
  let probe = documentRef.createElement('span');
  probe.style.position = 'absolute';
  probe.style.pointerEvents = 'none';
  probe.style.opacity = '0';
  probe.style[property] = `var(${cssVar})`;
  parent.append(probe);
  let value = globalThis.getComputedStyle(probe).getPropertyValue(property).trim();
  probe.remove?.();
  return value;
}

export function createXRThemeSnapshot(rootOrDocument = globalThis.document, options = {}) {
  let root = resolveThemeRoot(rootOrDocument);
  let computedStyle = root && typeof globalThis.getComputedStyle === 'function'
    ? globalThis.getComputedStyle(root)
    : null;
  let tokens = {};

  for (let cssVar of Object.values(XR_THEME_TOKEN_MAP)) {
    tokens[cssVar] = readCssToken(root, cssVar, computedStyle);
  }

  return {
    version: 'xr-theme-snapshot-v1',
    themeScope: options.themeScope || root?.dataset?.themeScope || 'default-provider',
    tokens,
    material: {
      background: tokens['--sn-xr-panel-bg'],
      backgroundColor: resolveCssProperty(root, '--sn-xr-panel-bg', 'background-color') || tokens['--sn-xr-panel-bg'],
      border: tokens['--sn-xr-panel-border'],
      borderColor: resolveCssProperty(root, '--sn-xr-panel-border', 'border-color') || tokens['--sn-xr-panel-border'],
      radius: tokens['--sn-xr-panel-radius'],
      shadow: tokens['--sn-xr-panel-shadow'],
      pointer: tokens['--sn-xr-pointer-color'],
      pointerColor: resolveCssProperty(root, '--sn-xr-pointer-color', 'color') || tokens['--sn-xr-pointer-color'],
      text: tokens['--sn-sys-on-surface'],
      textColor: resolveCssProperty(root, '--sn-sys-on-surface', 'color') || tokens['--sn-sys-on-surface'],
      textDim: tokens['--sn-sys-on-surface-dim'],
      textDimColor: resolveCssProperty(root, '--sn-sys-on-surface-dim', 'color') || tokens['--sn-sys-on-surface-dim'],
      gap: tokens['--sn-layout-resizer-size'],
      motion: {
        duration: tokens['--sn-duration-fast'],
        easing: tokens['--sn-ease-standard'],
      },
    },
  };
}

export function applyXRThemeToPanel(panel, themeSnapshot) {
  let snapshot = themeSnapshot || createXRThemeSnapshot(null);
  return {
    ...panel,
    themeScope: panel.themeScope || snapshot.themeScope,
    material: {
      ...snapshot.material,
      ...(panel.material || {}),
    },
  };
}

export function getXRThemeTokenMap() {
  return { ...XR_THEME_TOKEN_MAP };
}

const NATIVE_PANEL_THEME_TOKEN_MAP = Object.freeze({
  surface: '--sn-sys-surface-panel',
  'surface-raised': '--sn-sys-surface-raised',
  'surface-sunken': '--sn-sys-surface-sunken',
  text: '--sn-sys-on-surface',
  'text-dim': '--sn-sys-on-surface-dim',
  outline: '--sn-sys-outline',
  accent: '--sn-sys-accent',
  success: '--sn-sys-success',
  warning: '--sn-sys-warning',
  danger: '--sn-sys-danger',
});

const NATIVE_PANEL_METRIC_TOKEN_MAP = Object.freeze({
  fontSize: '--sn-font-size',
  labelSize: '--sn-text-xs',
  radius: '--sn-node-radius',
  density: '--sn-sys-density',
});

const NATIVE_PANEL_METRIC_FALLBACKS = Object.freeze({
  fontSize: 13,
  labelSize: 11,
  radius: 6,
  density: 1,
});

function resolveColorRole(root, cssVar, computedStyle) {
  let resolved = resolveCssProperty(root, cssVar, 'color');
  return resolved || readCssToken(root, cssVar, computedStyle);
}

function resolveMetricNumber(root, cssVar, property, computedStyle, fallback) {
  let probed = property ? resolveCssProperty(root, cssVar, property) : '';
  let raw = probed || readCssToken(root, cssVar, computedStyle);
  let value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Captures semantic native-panel theme roles and numeric layout/type metrics from the
 * computed cascade at the given root.
 *
 * @param {Document|Element} [rootOrDocument] - Cascade theme owner.
 * @param {Object} [options]
 * @param {number} [options.revision] - Host-tracked theme revision for diagnostics.
 * @param {string} [options.themeScope] - Theme scope label.
 * @returns {Object} `native-panel-theme-v1` snapshot with `roles` and `metrics`.
 */
export function createNativePanelThemeSnapshot(rootOrDocument = globalThis.document, options = {}) {
  let root = resolveThemeRoot(rootOrDocument);
  let computedStyle = root && typeof globalThis.getComputedStyle === 'function'
    ? globalThis.getComputedStyle(root)
    : null;
  let roles = {};
  let metrics = {};
  let tokens = {};

  for (let [role, cssVar] of Object.entries(NATIVE_PANEL_THEME_TOKEN_MAP)) {
    roles[role] = resolveColorRole(root, cssVar, computedStyle);
    tokens[cssVar] = readCssToken(root, cssVar, computedStyle);
  }
  for (let [metric, cssVar] of Object.entries(NATIVE_PANEL_METRIC_TOKEN_MAP)) {
    let property = metric === 'density' ? null : 'width';
    metrics[metric] = resolveMetricNumber(root, cssVar, property, computedStyle, NATIVE_PANEL_METRIC_FALLBACKS[metric]);
  }

  return {
    version: 'native-panel-theme-v1',
    themeScope: options.themeScope || root?.dataset?.themeScope || 'default-provider',
    revision: Number.isFinite(Number(options.revision)) ? Number(options.revision) : 0,
    roles,
    metrics,
    tokens,
  };
}

export function getNativePanelThemeTokenMap() {
  return { ...NATIVE_PANEL_THEME_TOKEN_MAP };
}
