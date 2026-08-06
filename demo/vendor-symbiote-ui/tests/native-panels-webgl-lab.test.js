import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

let labSource = readFileSync(new URL('../demo/native-panels-webgl-lab.js', import.meta.url), 'utf8');
let labHarnessHtml = readFileSync(new URL('../demo/native-panels-webgl-lab.html', import.meta.url), 'utf8');

test('native panels webgl lab attaches the native renderer group to the rendered scene exactly once', () => {
  let attachments = labSource.match(/scene\.add\(panelRenderer\.group\)/g) || [];
  assert.equal(
    attachments.length,
    1,
    'the rendered Three scene must own panelRenderer.group exactly once, otherwise nothing is drawn',
  );
});

test('native panels webgl lab captures the real layout through a canonical desktop viewport', () => {
  let columns = [...labHarnessHtml.matchAll(/grid-template-columns:\s*([^;]+);/g)]
    .map((match) => match[1].trim().replace(/\s+/g, ' '));
  assert.deepEqual(
    columns,
    ['minmax(0, 1fr) minmax(0, 1fr) 360px'],
    'reference and stage must share equal flexible columns beside the fixed 360px diagnostics panel',
  );
  let referenceRule = /\.reference\s*\{[^}]*\}/.exec(labHarnessHtml)?.[0] || '';
  assert.match(
    referenceRule,
    /overflow:\s*auto;/,
    'the reference column must scroll without shrinking the canonical iframe viewport',
  );
  let frameRule = /#reference-frame\s*\{[^}]*\}/.exec(labHarnessHtml)?.[0] || '';
  assert.match(
    frameRule,
    /width:\s*1280px;/,
    'the iframe must stay above the showcase responsive breakpoint so every layout leaf keeps its desktop position',
  );
  assert.match(
    frameRule,
    /height:\s*720px;/,
    'the canonical viewport height must remain deterministic across outer lab window sizes',
  );
});

test('native panels webgl lab keeps measured windows independently draggable through the shared spatial controller', () => {
  assert.match(
    labSource,
    /import\s*\{\s*createSpatialDragController\s*\}\s*from\s*'\.\.\/xr\/spatial-drag-controller\.js';/,
    'window dragging must reuse the shared ray-plane controller',
  );
  assert.match(labSource, /let windowDragOffsets = new Map\(\)/);
  assert.match(labSource, /resolveNativePanelPresentationPosition\([\s\S]*windowDragOffsets\.get\(panel\.id\)/);
  assert.match(labSource, /canvas\.setPointerCapture\(event\.pointerId\)/);
  assert.match(labSource, /canvas\.addEventListener\('pointercancel', cancelPointerDrag\)/);
  assert.match(labSource, /function canStartWindowDrag\(hit\)/);
  assert.match(labSource, /let resizeState = null/);
  assert.match(labSource, /hit\.actionId === 'resize-window'/);
  assert.match(labSource, /panelRenderer\.previewPanelSize\(/);
  assert.match(labSource, /prepareResponsivePanelCaptureHost\(/);
  assert.match(labSource, /updateResponsivePanelResizeTarget\(/);
  assert.match(labSource, /captureResponsivePanelSnapshot\(/);
  assert.match(labSource, /panelRenderer\.replacePanel\(/);
  assert.match(labSource, /isResponsivePanelResizeContextStale\(/);
  assert.match(labSource, /responsiveCapture/);
  assert.ok(!labSource.includes('setPanelScale'), 'window content must never use transform scaling');
  assert.match(labSource, /panel\.relativeRect\?\.width <= COLLAPSED_WINDOW_GRAB_MAX_RATIO/);
  assert.match(labSource, /windows:\s*windowDiagnostics\(\)/);
  assert.match(labSource, /primitive\.hit\?\.intent/);
  assert.match(labHarnessHtml, /id="window-gap"/);
  assert.match(labHarnessHtml, /id="reset-windows"/);
});

test('native panels webgl lab publishes only the newest full capture revision', () => {
  let start = labSource.indexOf('async function captureAndMount(token, revisions)');
  let end = labSource.indexOf('function scheduleLateFontRedraw()', start);
  let body = labSource.slice(start, end);
  let finalRevisionGuard = body.indexOf("revisions.dataRevision !== lab.dataRevision");
  let firstPublish = body.indexOf('snapshot = nextSnapshot');

  assert.ok(finalRevisionGuard > body.indexOf('await recaptureResponsivePanel('));
  assert.ok(finalRevisionGuard < firstPublish);
  assert.match(body, /token !== captureToken/);
  assert.match(body, /return false/);
});

test('native panels webgl lab rechecks resize revisions immediately before panel replacement', () => {
  let start = labSource.indexOf('async function commitResponsiveWindowSize(');
  let end = labSource.indexOf('async function commitWindowSize(', start);
  let body = labSource.slice(start, end);
  let recapture = body.indexOf('await recaptureResponsivePanel(');
  let staleCheck = body.indexOf('isResponsivePanelResizeContextStale(');
  let replacement = body.indexOf('panelRenderer.replacePanel(');

  assert.ok(recapture > 0);
  assert.ok(staleCheck > recapture);
  assert.ok(replacement > staleCheck);
  assert.match(body, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
});

test('native panels webgl lab controls consume the same cascade theme roles as provider controls', () => {
  assert.match(labHarnessHtml, /--sn-field-control-bg/);
  assert.match(labHarnessHtml, /--sn-field-control-border/);
  assert.match(labHarnessHtml, /--sn-slider-track-bg/);
  assert.match(labHarnessHtml, /--sn-slider-focus-ring/);
  assert.match(labHarnessHtml, /--sn-sys-state-hover-mix/);
  assert.match(labHarnessHtml, /Global cascade theme/);
});

test('native panels webgl lab mirrors one global cascade state across outer controls and the reference', () => {
  let setThemeBody = /function setTheme\(name\) \{([\s\S]*?)\n\}/.exec(labSource)?.[1] || '';
  assert.equal(
    (setThemeBody.match(/applyCascadeTheme\(/g) || []).length,
    1,
    'the theme selector writes one owning root and lets the theme event mirror the reference',
  );
  assert.match(labSource, /source:\s*'native-panel-lab-theme-mirror'/);
  assert.match(labSource, /notify:\s*false/);
  assert.match(labSource, /if \(themeSyncing/);
});

test('native panels webgl lab relays each header intent to its own DOM control via the capture contract', () => {
  assert.match(
    labSource,
    /import\s*\{[^}]*\bresolveHeaderControlSelector\b[^}]*\}\s*from\s*'\.\.\/xr\/dom-spatial-capture\.js';/,
    'the relay must resolve header intents through the capture contract, not a local selector fork',
  );
  assert.match(labSource, /resolveHeaderControlSelector\(intent\)/);
  assert.ok(
    !labSource.includes("'.panel-menu-toggle'"),
    'the relay must not hardcode the panel menu toggle selector',
  );
  assert.ok(
    !labSource.includes("'.type-btn'"),
    'the relay must not hardcode the type button selector',
  );
});

test('native panels webgl lab normalizes browser-resolved theme colors before they reach Three', () => {
  assert.match(
    labSource,
    /import\s*\{[^}]*\bcreateCanvasColorNormalizer\b[^}]*\}\s*from\s*'\.\.\/xr\/dom-spatial-capture\.js';/,
    'theme role normalization reuses the capture seam canvas normalizer',
  );
  assert.match(labSource, /function normalizeThemeRoles\(/);
  assert.match(labSource, /lab\.unsupportedColors = normalizeThemeRoles\(theme, doc\)/);
  assert.match(labSource, /lab\.unsupportedColors = normalizeThemeRoles\(theme, document\)/);
  assert.match(labSource, /unsupportedColors/);
});

test('native panels webgl lab loads the self-hosted provider Material Symbols stylesheet in the outer document', () => {
  assert.match(
    labHarnessHtml,
    /<link[^>]*rel="stylesheet"[^>]*href="\.\.\/icons\/material-symbols\.css"[^>]*>/,
    'the outer lab document owns raster canvases, so it must load the provider icon font stylesheet',
  );
});

test('native panels webgl lab awaits the provider icon font and issues one late-readiness redraw', () => {
  assert.match(labSource, /document\.fonts/, 'font readiness uses the FontFaceSet of the outer document');
  assert.match(labSource, /Material Symbols Outlined/, 'the awaited family is the provider icon font');
  assert.match(labSource, /fonts\.check\(/, 'readiness is checked explicitly, not assumed');
  assert.match(labSource, /refreshTextures\(\)/, 'a late font readiness triggers one explicit quality redraw');
});

test('native panels webgl lab exposes the text quality report and appearance refresh surface', () => {
  assert.match(labSource, /getTextQualityReport\(\)/, 'the lab report surfaces the renderer text quality report');
  assert.match(
    labSource,
    /refreshAppearance\(compiled, \{ theme \}\)/,
    'dark/light recapture goes through the appearance-refresh seam',
  );
  assert.match(
    labSource,
    /geometry-invalidated/,
    'geometry-invalidated appearance refreshes fall back to an intentional remount',
  );
});

test('native panels webgl lab passes product classes only through the generic surfaceSelectors option', () => {
  assert.match(
    labSource,
    /const REAL_SURFACE_SELECTORS = Object\.freeze\(\[/,
    'the lab declares its structural surface selectors as explicit data',
  );
  assert.match(
    labSource,
    /surfaceSelectors:\s*REAL_SURFACE_SELECTORS/,
    'capture options carry structural surfaces through the generic surfaceSelectors seam',
  );
  assert.ok(
    !labSource.includes("'.project-panel-intro strong'") && !labSource.includes('textSelectors: REAL_TEXT_SELECTORS'),
    'product classes no longer appear in textSelectors',
  );
});

test('native panels webgl lab computes IR and visual parity with a composite ok', () => {
  assert.match(
    labSource,
    /import\s*\{[^}]*\bcreateSpatialVisualParityReport\b[^}]*\}\s*from\s*'\.\.\/xr\/spatial-visual-parity\.js';/,
    'visual parity comes from the provider contract module',
  );
  assert.match(
    labSource,
    /createSpatialVisualParityReport\(\s*paritySnapshot,\s*panelRenderer\.getAppearanceReport\(\),?\s*\)/,
    'visual parity compares the responsive snapshot composition against the renderer appearance sample',
  );
  assert.match(labSource, /responsiveParityByPanel/);
  assert.match(
    labSource,
    /ok:\s*ir\.ok\s*&&\s*visual\.ok/,
    'the lab headline passes only when IR parity and visual parity both pass',
  );
  assert.match(labSource, /ir:/, 'the IR subreport is exposed');
  assert.match(labSource, /visual:/, 'the visual subreport is exposed');
});

test('native panels webgl lab relays the tree collapse intent through the capture contract', () => {
  assert.match(
    labSource,
    /import\s*\{[^}]*\bSPATIAL_TREE_CONTROLS\b[^}]*\}\s*from\s*'\.\.\/xr\/dom-spatial-capture\.js';/,
    'tree control selectors resolve through the capture contract, not a local selector fork',
  );
  assert.ok(
    !labSource.includes("'.sn-tree-panel-collapse'"),
    'the relay must not hardcode the tree collapse selector',
  );
});
