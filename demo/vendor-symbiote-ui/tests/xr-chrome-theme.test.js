import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE_REAL from 'three';

import {
  XR_CHROME_TOKEN_BINDINGS,
  XR_DEFAULT_DESIGN_TOKENS,
  XR_DESIGN_TOKENS_VERSION,
  normalizeXRDesignTokenColor,
  resolveXRDesignTokens,
  xrDesignTokenColorNumber,
} from '../xr/chrome-theme.js';
import { DEFAULT_PROVIDER_THEME } from '../themes/default-provider.js';
import {
  computeXRPanelChromeLayout,
  createXRPanelFrame,
  hitTestXRPanelFrame,
} from '../xr/panel-frame.js';
import { createXRThreeWebXRAdapter } from '../xr/three-webxr-adapter.js';

function zoneCenter(zone) {
  return { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
}

test('default XR design tokens resolve concrete colors from the provider theme', () => {
  let tokens = XR_DEFAULT_DESIGN_TOKENS;
  assert.equal(tokens.version, XR_DESIGN_TOKENS_VERSION);
  // Anchors of the default-provider cascade: hue 218 / chroma 89% / lit 68%.
  assert.deepEqual({ ...tokens.colors }, {
    accent: '#659af6',
    onSurface: '#fafafa',
    onSurfaceDim: '#acacac',
    success: '#30f336',
    warning: '#f3a735',
    danger: '#f34135',
    surface: '#1a1a1a',
    surfacePanel: '#272727',
    outline: 'rgba(250, 250, 250, 0.1)',
  });
  assert.equal(tokens.typography.fontFamily, "'Inter', -apple-system, BlinkMacSystemFont, sans-serif");
  // Every role names its source token so consumers can trace the mapping.
  assert.equal(tokens.bindings.colors.accent, '--sn-sys-accent');
  assert.equal(XR_CHROME_TOKEN_BINDINGS.surfacePanel, '--sn-sys-surface-panel');
});

test('tokens re-resolve from a re-themed source instead of hardcoded values', () => {
  let rethemed = {
    ...DEFAULT_PROVIDER_THEME,
    tokens: {
      ...DEFAULT_PROVIDER_THEME.tokens,
      '--sn-theme-hue': '300',
      '--sn-theme-bg-lightness': '20%',
    },
  };
  let tokens = resolveXRDesignTokens(rethemed);
  assert.notEqual(tokens.colors.accent, XR_DEFAULT_DESIGN_TOKENS.colors.accent);
  assert.equal(tokens.colors.accent, normalizeXRDesignTokenColor('hsl(300 89% 68%)'));
  assert.equal(tokens.colors.surface, '#333333');
  // A bare token map (no ThemeDefinition wrapper) resolves identically.
  let bare = resolveXRDesignTokens(DEFAULT_PROVIDER_THEME.tokens);
  assert.deepEqual({ ...bare.colors }, { ...XR_DEFAULT_DESIGN_TOKENS.colors });
});

test('color normalization keeps alpha, passes literals through, and leaves css-only expressions', () => {
  assert.equal(normalizeXRDesignTokenColor('hsl(0 0% 98% / 0.1)'), 'rgba(250, 250, 250, 0.1)');
  assert.equal(normalizeXRDesignTokenColor('rgb(10, 20, 30)'), '#0a141e');
  assert.equal(normalizeXRDesignTokenColor('#AbC123'), '#AbC123');
  assert.equal(
    normalizeXRDesignTokenColor('color-mix(in oklab, #fff 50%, transparent)'),
    'color-mix(in oklab, #fff 50%, transparent)',
  );
  assert.equal(normalizeXRDesignTokenColor(''), '');
  assert.equal(xrDesignTokenColorNumber('#659af6'), 0x659af6);
  assert.equal(xrDesignTokenColorNumber('rgba(1, 2, 3, 0.5)'), null);
});

test('three adapter chrome visuals default to the resolved design tokens', () => {
  let adapter = createXRThreeWebXRAdapter({ THREE: THREE_REAL });
  let result = adapter.setScene({
    id: 'scene-chrome-tokens',
    panels: [
      { id: 'p-plain', position: [0, 0, 0], rotation: [0, 0, 0], size: [0.8, 0.45] },
      { id: 'p-pinned', position: [1, 0, 0], rotation: [0, 0, 0], size: [0.8, 0.45], pinned: true },
    ],
  }, { mode: 'immersive-ar' });
  assert.equal(result.ok, true);

  let accent = xrDesignTokenColorNumber(XR_DEFAULT_DESIGN_TOKENS.colors.accent);
  let onSurface = xrDesignTokenColorNumber(XR_DEFAULT_DESIGN_TOKENS.colors.onSurface);
  let success = xrDesignTokenColorNumber(XR_DEFAULT_DESIGN_TOKENS.colors.success);
  let surfacePanel = xrDesignTokenColorNumber(XR_DEFAULT_DESIGN_TOKENS.colors.surfacePanel);

  let mesh = adapter.getPanelMesh('p-plain');
  let visuals = mesh.userData.panelFrameVisuals;
  assert.equal(visuals.ok, true);
  let byName = Object.fromEntries(visuals.objects.map((object) => [object.name, object]));
  assert.equal(byName['sn-xr-panel-frame-control-bar'].material.color.getHex(), onSurface);
  assert.equal(byName['sn-xr-panel-frame-resize-northWest'].material.color.getHex(), onSurface);
  assert.equal(byName['sn-xr-panel-frame-edge-north'].material.color.getHex(), onSurface);
  assert.equal(byName['sn-xr-panel-frame-action-close'].material.color.getHex(), onSurface);
  assert.equal(byName['sn-xr-panel-frame-action-pin'].material.color.getHex(), onSurface);
  // Panel material fallback also comes from the surface token now.
  assert.equal(mesh.material.color.getHex(), surfacePanel);

  let pinned = adapter.getPanelMesh('p-pinned');
  let pinnedPin = pinned.userData.panelFrameVisuals.objects
    .find((object) => object.name === 'sn-xr-panel-frame-action-pin');
  assert.equal(pinnedPin.material.color.getHex(), success);
});

test('explicit chrome color options still win over the token defaults', () => {
  let adapter = createXRThreeWebXRAdapter({ THREE: THREE_REAL });
  let result = adapter.setScene({
    id: 'scene-chrome-override',
    panels: [{ id: 'p-custom', position: [0, 0, 0], rotation: [0, 0, 0], size: [0.8, 0.45] }],
  }, { mode: 'immersive-ar', panelFrameVisuals: { headerColor: 0x123456, handleColor: 0x654321 } });
  assert.equal(result.ok, true);
  let visuals = adapter.getPanelMesh('p-custom').userData.panelFrameVisuals;
  let byName = Object.fromEntries(visuals.objects.map((object) => [object.name, object]));
  assert.equal(byName['sn-xr-panel-frame-control-bar'].material.color.getHex(), 0x123456);
  assert.equal(byName['sn-xr-panel-frame-resize-northWest'].material.color.getHex(), 0x654321);
});

test('chrome controls keep proportional sizes and matching hit zones across panel sizes', () => {
  let meterOptions = {
    handleSizeMeters: 0.024,
    footerHeightMeters: 0.035,
    actionSizeMeters: 0.030,
    footerGapMeters: 0.008,
  };
  for (let size of [[0.5, 0.28], [0.8, 0.45], [1.6, 0.9]]) {
    let layout = computeXRPanelChromeLayout(size, meterOptions);
    let frame = createXRPanelFrame({ id: 'p', size }, meterOptions);
    assert.deepEqual(frame.zones, layout);

    // Constant physical size: UV zone * panel size is size-independent, so the
    // controls scale proportionally in UV as the panel resizes.
    assert.ok(Math.abs(layout.move.height * size[1] - 0.035) < 1e-9);
    assert.ok(Math.abs(layout.actions.close.width * size[0] - 0.030) < 1e-9);
    assert.ok(Math.abs(layout.resize.northWest.width * size[0] - 0.024) < 1e-9);
    assert.ok(Math.abs(layout.resize.southEast.height * size[1] - 0.024) < 1e-9);

    // Hit zones track the same layout: every control's own center hits it.
    for (let [handle, zone] of Object.entries(layout.resize)) {
      let hit = hitTestXRPanelFrame(frame, zoneCenter(zone));
      assert.equal(hit?.zone, 'resize', `${handle} grip must stay hittable at ${size}`);
      assert.equal(hit?.handle, handle);
    }
    for (let [handle, zone] of Object.entries(layout.edges)) {
      let hit = hitTestXRPanelFrame(frame, zoneCenter(zone));
      assert.equal(hit?.zone, 'edge', `${handle} edge handle must stay hittable at ${size}`);
      assert.equal(hit?.handle, handle);
      assert.equal(hit?.operation, 'move');
    }
    for (let [action, zone] of Object.entries(layout.actions)) {
      let hit = hitTestXRPanelFrame(frame, zoneCenter(zone));
      assert.equal(hit?.zone, 'action', `${action} button must stay hittable at ${size}`);
      assert.equal(hit?.action, action);
    }
    assert.equal(hitTestXRPanelFrame(frame, zoneCenter(layout.move))?.zone, 'move');
    assert.equal(hitTestXRPanelFrame(frame, { x: 0.5, y: 0.5 })?.zone, 'content');
    // Grips straddle the window corners at every size (out-of-window chrome).
    assert.ok(layout.resize.northWest.x < 0 && layout.resize.northWest.y < 0);
    assert.ok(layout.resize.southEast.x + layout.resize.southEast.width > 1);
  }
});
