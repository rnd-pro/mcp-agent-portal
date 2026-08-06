import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DOCS_NAV_ROUTES,
  normalizeSiteBasePath,
  NOT_FOUND_ROUTE,
  PRIMARY_NAV_ROUTES,
  SITE_ROUTES,
  withSiteBasePath,
} from '../site/routes.js';

const siteDir = path.resolve('_site');

function listHtmlFiles(dir) {
  let files = [];
  for (let entry of fs.readdirSync(dir, { withFileTypes: true })) {
    let entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') files.push(...listHtmlFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) files.push(entryPath);
  }
  return files;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function routeUrl(baseUrl, route) {
  return new URL(route.path.replace(/^\/+/, ''), baseUrl).href;
}

console.log('Validating site at', siteDir);

let manifestPath = path.join(siteDir, 'route-manifest.json');
let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
let expectedRoutes = SITE_ROUTES.map(({ file, path: routePath }) => ({
  file,
  path: routePath,
}));
let expectedHtmlFiles = [
  ...SITE_ROUTES.map((route) => route.file),
  NOT_FOUND_ROUTE.file,
].sort();
let actualHtmlFiles = listHtmlFiles(siteDir)
  .map((file) => path.relative(siteDir, file).split(path.sep).join('/'))
  .sort();

assert.deepEqual(manifest.routes, expectedRoutes, 'route manifest must match site/routes.js');
assert.deepEqual(actualHtmlFiles, expectedHtmlFiles, 'generated HTML must match site/routes.js');
assert.equal(
  manifest.basePath,
  normalizeSiteBasePath(process.env.PAGES_BASE_PATH || '/'),
  'route manifest must record the configured Pages base path'
);
assert.equal(
  SITE_ROUTES.some((route) => route.file === NOT_FOUND_ROUTE.file),
  false,
  '404 must stay outside the published route contract'
);

let sitemap = fs.readFileSync(path.join(siteDir, 'sitemap.xml'), 'utf8');
let sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
let expectedSitemapUrls = SITE_ROUTES.map((route) => routeUrl(manifest.baseUrl, route));
assert.deepEqual(sitemapUrls, expectedSitemapUrls, 'sitemap must match the canonical routes');
assert.doesNotMatch(sitemap, /404\.html/, '404 must not appear in the sitemap');

let robots = fs.readFileSync(path.join(siteDir, 'robots.txt'), 'utf8');
assert.match(
  robots,
  new RegExp(`Sitemap: ${escapeRegExp(new URL('sitemap.xml', manifest.baseUrl).href)}`),
  'robots.txt must reference this Pages deployment sitemap'
);

let shellRoutes = [SITE_ROUTES[0], ...SITE_ROUTES.filter((route) => route.file.startsWith('docs/'))];
for (let shellRoute of shellRoutes) {
  let content = fs.readFileSync(path.join(siteDir, shellRoute.file), 'utf8');
  for (let navRoute of PRIMARY_NAV_ROUTES) {
    let href = withSiteBasePath(manifest.basePath, navRoute);
    assert.match(
      content,
      new RegExp(`href="${escapeRegExp(href)}"`),
      `${shellRoute.file} must link to ${navRoute.id} through the configured base path`
    );
  }

  for (let match of content.matchAll(/(?:href|src)="(\/[^"#]*)"/g)) {
    assert.ok(
      manifest.basePath === '/' || match[1].startsWith(manifest.basePath),
      `${shellRoute.file} contains a root URL outside ${manifest.basePath}: ${match[1]}`
    );
  }

  if (shellRoute.file === 'index.html') {
    assert.match(content, /data-theme-toggle/);
    assert.match(content, /motion-surface/);
    for (const [, motionBody] of content.matchAll(/<div class="[^"]*motion-surface[^"]*">([\s\S]*?)<\/div>/g)) {
      assert.doesNotMatch(motionBody, /<(?:button|input)\b/);
    }
    assert.match(
      content,
      /@media \(max-width: 900px\)[\s\S]*?\.lp-header-nav\s*\{/,
      `${shellRoute.file} must expose the shared progressive mobile header navigation`
    );
  } else {
    assert.match(content, /data-theme-toggle/);
    assert.match(content, /aria-label="Toggle Theme"/);
    assert.match(
      content,
      /@media \(max-width: 900px\)[\s\S]*?\.lp-docs-layout\s*\{[\s\S]*?grid-template-columns:\s*1fr;/,
      `${shellRoute.file} must collapse the docs layout at mobile widths`
    );
  }
}

let docsIndex = fs.readFileSync(path.join(siteDir, 'docs/index.html'), 'utf8');
for (let docsRoute of DOCS_NAV_ROUTES) {
  let href = withSiteBasePath(manifest.basePath, docsRoute);
  assert.match(docsIndex, new RegExp(`href="${escapeRegExp(href)}"`));
}
assert.doesNotMatch(docsIndex, /Showcase Demo Structure/);

let syntheticBasePath = '/owner/library/';
for (let route of SITE_ROUTES) {
  let expectedHref = route.path === '/'
    ? syntheticBasePath
    : `${syntheticBasePath}${route.path.replace(/^\/+/, '')}`;
  assert.equal(
    withSiteBasePath(syntheticBasePath, route),
    expectedHref,
    `synthetic Pages base path must preserve ${route.id}`
  );
}

console.log('Running permanent focused tests for Symbiote UI Native Web Animation...');

import { parseHTML } from 'linkedom';
import { COMPONENTS } from '../manifest/component-registry.js';

const siteTimeline = await import('../_site/timeline.js');
const expectedPhases = ['metadata', 'discover', 'select', 'hydrate', 'ready'];
assert.deepEqual(Object.values(siteTimeline.PHASES), expectedPhases);
assert.equal(siteTimeline.DURATION_MS, 10000);

assert.equal(siteTimeline.clampTime(-500), 0);
assert.equal(siteTimeline.clampTime(12000), siteTimeline.DURATION_MS);
assert.equal(siteTimeline.clampTime(5000), 5000);
assert.throws(() => siteTimeline.clampTime(NaN), TypeError);
assert.throws(() => siteTimeline.clampTime(Infinity), TypeError);

assert.equal(siteTimeline.wrapTime(5000), 5000);
assert.equal(siteTimeline.wrapTime(12500), 2500);
assert.equal(siteTimeline.wrapTime(-2500), 7500);

const expectedDescriptorCount = COMPONENTS.length;
let expectedCapabilityCount = 0;
for (const comp of COMPONENTS) {
  if (comp.contract?.webmcp?.tools) {
    expectedCapabilityCount += comp.contract.webmcp.tools.length;
  }
}

assert.equal(siteTimeline.DESCRIPTOR_COUNT, expectedDescriptorCount);
assert.equal(siteTimeline.CAPABILITY_COUNT, expectedCapabilityCount);

const tMetadata = 1000;
const stateMetadata = siteTimeline.getStateAtTime(tMetadata);
assert.equal(stateMetadata.phase, siteTimeline.PHASES.METADATA);
assert.equal(stateMetadata.statusText, 'Loading Schemas');
assert.equal(stateMetadata.metric, `${expectedDescriptorCount} Descriptors`);

const tDiscover = 3000;
const stateDiscover = siteTimeline.getStateAtTime(tDiscover);
assert.equal(stateDiscover.phase, siteTimeline.PHASES.DISCOVER);
assert.equal(stateDiscover.statusText, 'Querying Manifest');
const progressMid = (3000 - 2000) / (3999 - 2000);
const expectedMidCapabilities = Math.min(Math.floor(progressMid * expectedCapabilityCount) + 1, expectedCapabilityCount);
assert.equal(stateDiscover.metric, `${expectedMidCapabilities} Capabilities`);

const stateDiscStart = siteTimeline.getStateAtTime(2000);
assert.equal(stateDiscStart.phase, siteTimeline.PHASES.DISCOVER);
assert.equal(stateDiscStart.metric, '1 Capabilities');

const stateDiscEnd = siteTimeline.getStateAtTime(3999);
assert.equal(stateDiscEnd.phase, siteTimeline.PHASES.DISCOVER);
assert.equal(stateDiscEnd.metric, `${expectedCapabilityCount} Capabilities`);

for (let t = 2000; t <= 3999; t++) {
  const state = siteTimeline.getStateAtTime(t);
  const match = state.metric.match(/^(\d+) Capabilities$/);
  if (match) {
    const val = parseInt(match[1], 10);
    assert.ok(val <= expectedCapabilityCount);
  }
}

const tSelect = 5000;
const stateSelect = siteTimeline.getStateAtTime(tSelect);
assert.equal(stateSelect.phase, siteTimeline.PHASES.SELECT);
assert.equal(stateSelect.statusText, 'Choosing Elements');
assert.equal(stateSelect.metric, '3/5 Selected');

const tHydrate = 7000;
const stateHydrate = siteTimeline.getStateAtTime(tHydrate);
assert.equal(stateHydrate.phase, siteTimeline.PHASES.HYDRATE);
assert.equal(stateHydrate.statusText, 'Hydrating DOM');
assert.equal(stateHydrate.metric, '50% Hydrated');

const tReady = 9000;
const stateReady = siteTimeline.getStateAtTime(tReady);
assert.equal(stateReady.phase, siteTimeline.PHASES.READY);
assert.equal(stateReady.statusText, 'Workspace Ready');
assert.equal(stateReady.metric, 'Active');

const htmlPath = path.join(siteDir, 'index.html');
const indexHtmlContent = fs.readFileSync(htmlPath, 'utf8');
const { document: landingDocument } = parseHTML(indexHtmlContent);

assert.match(indexHtmlContent, /How it works/);
assert.ok(landingDocument.querySelectorAll('.motion-surface').length >= 3);
for (const motionSurface of landingDocument.querySelectorAll('.motion-surface')) {
  assert.equal(motionSurface.querySelectorAll('button, input, select').length, 0);
}
assert.equal(landingDocument.querySelectorAll('#timeline-seek, .phase-btn, #btn-play-pause, #btn-replay').length, 0);

const animationHtmlContent = fs.readFileSync(path.join(siteDir, 'demo/animation.html'), 'utf8');
const { document } = parseHTML(animationHtmlContent);

assert.ok(fs.existsSync(path.join(siteDir, 'timeline.js')));
assert.ok(fs.existsSync(path.join(siteDir, 'animation.js')));

assert.equal(landingDocument.querySelectorAll('script[type="module"][src$="animation.js"]').length, 0);
assert.ok(document.querySelector('script[type="module"][src$="animation.js"]'));

function getLuminance(hex) {
  let rgb = hex.replace('#', '');
  if (rgb.length === 3) {
    rgb = rgb.split('').map(c => c + c).join('');
  }
  let r = parseInt(rgb.substring(0, 2), 16) / 255;
  let g = parseInt(rgb.substring(2, 4), 16) / 255;
  let b = parseInt(rgb.substring(4, 6), 16) / 255;

  let a = [r, g, b].map(v => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrast(hex1, hex2) {
  let lum1 = getLuminance(hex1);
  let lum2 = getLuminance(hex2);
  let brightest = Math.max(lum1, lum2);
  let darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

const styleTags = Array.from(document.querySelectorAll('style'));
let styleContent = '';
styleTags.forEach(tag => styleContent += tag.textContent);

assert.match(styleContent, /\.scene-visual-area\s*\{[^}]*?overflow-x:\s*auto/i);
assert.doesNotMatch(styleContent, /(html|body|main)[^}]*?min-width:\s*\d{3,}px/i);
assert.match(styleContent, /\.scene-svg\s*\{[^}]*?min-width:\s*480px/i);
assert.doesNotMatch(styleContent, /\.scene-visual-area\s*\{[^}]*?min-width:\s*480px/i);
assert.match(styleContent, /\.timeline-slider\s*\{[^}]*?width:\s*100%/i);
assert.match(styleContent, /\.timeline-slider\s*\{[^}]*?min-width:\s*0/i);
assert.match(styleContent, /\.status-pill\s*\{[^}]*?flex-wrap:\s*wrap/i);
assert.match(styleContent, /\.playback-controls\s*\{[^}]*?flex-wrap:\s*wrap/i);
assert.match(styleContent, /\.scene-visual-area:focus-visible/i);
assert.match(styleContent, /focus-visible/i);

const media375Match = styleContent.match(/@media\s*\(\s*max-width:\s*375px\s*\)\s*\{([\s\S]*?)\n\}/);
assert.ok(media375Match);
const media375Content = media375Match[1];
assert.match(media375Content, /main\s*\{[^}]*?padding:\s*24px\s*12px/i);
assert.match(media375Content, /\.pipeline-section\s*\{[^}]*?padding:\s*16px\s*12px/i);
assert.match(media375Content, /\.scene-dashboard\s*\{[^}]*?padding:\s*8px/i);
assert.match(media375Content, /\.playback-controls\s*\{[^}]*?padding:\s*6px/i);
assert.match(media375Content, /\.status-pill\s*\{[^}]*?padding:\s*4px\s*8px/i);
assert.match(media375Content, /\.timeline-seek-wrapper\s*\{[^}]*?width:\s*100%/i);
assert.match(media375Content, /\.timeline-seek-wrapper\s*\{[^}]*?flex:\s*none/i);
assert.match(media375Content, /\.timeline-seek-wrapper\s*\{[^}]*?min-width:\s*0/i);

const statusPillMatch = styleContent.match(/\.status-pill\s*\{([\s\S]*?)\}/);
assert.ok(statusPillMatch, 'Must find .status-pill style declaration block');
const statusPillCSS = statusPillMatch[1];
const statusBgMatch = statusPillCSS.match(/background:\s*var\(([^)]+)\)/i);
assert.ok(statusBgMatch);
assert.equal(statusBgMatch[1], '--accent-light');
const statusFgMatch = statusPillCSS.match(/color:\s*var\(([^)]+)\)/i);
assert.ok(statusFgMatch);
assert.equal(statusFgMatch[1], '--accent');

const phaseBtnActiveMatch = styleContent.match(/\.phase-btn\.active\s*\{([\s\S]*?)\}/);
assert.ok(phaseBtnActiveMatch, 'Must find .phase-btn.active style declaration block');
const phaseBtnActiveCSS = phaseBtnActiveMatch[1];
const phaseBgMatch = phaseBtnActiveCSS.match(/background:\s*var\(([^)]+)\)/i);
assert.ok(phaseBgMatch);
assert.equal(phaseBgMatch[1], '--accent');
const phaseFgMatch = phaseBtnActiveCSS.match(/color:\s*([#a-zA-Z0-9]+)/i);
assert.ok(phaseFgMatch);
assert.equal(phaseFgMatch[1].toLowerCase(), 'white');

const darkPhaseBtnActiveMatch = styleContent.match(/\[data-theme="dark"\]\s+\.phase-btn\.active\s*\{([\s\S]*?)\}/);
assert.ok(darkPhaseBtnActiveMatch, 'Must find [data-theme="dark"] .phase-btn.active style declaration block');
const darkPhaseBtnActiveCSS = darkPhaseBtnActiveMatch[1];
const darkPhaseFgMatch = darkPhaseBtnActiveCSS.match(/color:\s*var\(([^)]+)\)/i);
assert.ok(darkPhaseFgMatch);
assert.equal(darkPhaseFgMatch[1], '--bg');

const explanationMatch = styleContent.match(/\.status-explanation\s*\{([\s\S]*?)\}/);
assert.ok(explanationMatch);
const explanationCSS = explanationMatch[1];
const explanationFgMatch = explanationCSS.match(/color:\s*var\(([^)]+)\)/i);
assert.ok(explanationFgMatch);
assert.equal(explanationFgMatch[1], '--text-dim');

const rootBlockMatch = styleContent.match(/:root\s*\{([\s\S]*?)\}/);
assert.ok(rootBlockMatch);
const rootBlock = rootBlockMatch[1];

const darkBlockMatch = styleContent.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\}/);
assert.ok(darkBlockMatch);
const darkBlock = darkBlockMatch[1];

function resolveVar(block, varName) {
  const regex = new RegExp(`${escapeRegExp(varName)}:\\s*(#[a-fA-F0-9]+)`);
  return block.match(regex)?.[1];
}

const resolvedLightAccent = resolveVar(rootBlock, '--accent');
const resolvedLightAccentLight = resolveVar(rootBlock, '--accent-light');
const resolvedLightTextDim = resolveVar(rootBlock, '--text-dim');
const resolvedDarkAccent = resolveVar(darkBlock, '--accent');
const resolvedDarkAccentLight = resolveVar(darkBlock, '--accent-light');
const resolvedDarkBg = resolveVar(darkBlock, '--bg');
const resolvedDarkTextDim = resolveVar(darkBlock, '--text-dim');

assert.ok(resolvedLightAccent);
assert.ok(resolvedLightAccentLight);
assert.ok(resolvedLightTextDim);
assert.ok(resolvedDarkAccent);
assert.ok(resolvedDarkAccentLight);
assert.ok(resolvedDarkBg);
assert.ok(resolvedDarkTextDim);

const lightActiveBtnContrast = getContrast('#ffffff', resolvedLightAccent);
assert.ok(lightActiveBtnContrast >= 4.5, `Light active phase-btn contrast: ${lightActiveBtnContrast}`);

const darkActiveBtnContrast = getContrast(resolvedDarkBg, resolvedDarkAccent);
assert.ok(darkActiveBtnContrast >= 4.5, `Dark active phase-btn contrast: ${darkActiveBtnContrast}`);

const lightStatusContrast = getContrast(resolvedLightAccent, resolvedLightAccentLight);
assert.ok(lightStatusContrast >= 4.5, `Light status-pill contrast: ${lightStatusContrast}`);

const darkStatusContrast = getContrast(resolvedDarkAccent, resolvedDarkAccentLight);
assert.ok(darkStatusContrast >= 4.5, `Dark status-pill contrast: ${darkStatusContrast}`);

const lightExplanationContrast = getContrast(resolvedLightTextDim, resolvedLightAccentLight);
assert.ok(lightExplanationContrast >= 4.5, `Light status-explanation contrast: ${lightExplanationContrast}`);

const darkExplanationContrast = getContrast(resolvedDarkTextDim, resolvedDarkAccentLight);
assert.ok(darkExplanationContrast >= 4.5, `Dark status-explanation contrast: ${darkExplanationContrast}`);

console.log('Color Contrast Validation passed.');
console.log('Running Symbiote UI Controller Contract Integration Tests...');

const win = document.defaultView;
let reducedMotionMatches = false;
const activeListeners = new Set();
win.matchMedia = function(query) {
  const listeners = new Set();
  const wrappedMap = new Map();

  const mqObj = {
    matches: reducedMotionMatches,
    addEventListener: (event, cb, options) => {
      let record = { target: mqObj, type: event, listener: cb, options };
      activeListeners.add(record);

      let wrappedListener = cb;
      if (options && options.signal) {
        const signal = options.signal;
        if (signal.aborted) {
          activeListeners.delete(record);
          return;
        }
        wrappedListener = function(...args) {
          if (!signal.aborted) {
            return cb.apply(this, args);
          }
        };
        wrappedMap.set(cb, wrappedListener);
        signal.addEventListener('abort', () => {
          activeListeners.delete(record);
          listeners.delete(wrappedListener);
          wrappedMap.delete(cb);
        });
      }
      listeners.add(wrappedListener);
    },
    removeEventListener: (event, cb) => {
      for (let r of activeListeners) {
        if (r.target === mqObj && r.type === event && r.listener === cb) {
          activeListeners.delete(r);
        }
      }
      let wrappedListener = cb;
      if (wrappedMap.has(cb)) {
        wrappedListener = wrappedMap.get(cb);
        wrappedMap.delete(cb);
      }
      listeners.delete(wrappedListener);
    },
    dispatchEvent: (evt) => {
      listeners.forEach(fn => fn(evt));
    }
  };

  if (query === '(prefers-reduced-motion: reduce)') {
    this._mediaQueryInstance = mqObj;
  }
  return mqObj;
};

win.performance = win.performance || { now: () => Date.now() };

const activeRafHandles = new Set();
let nextRafId = 1;
let rafCount = 0;

win.requestAnimationFrame = (cb) => {
  rafCount++;
  let id = nextRafId++;
  activeRafHandles.add(id);
  let timeoutId = setTimeout(() => {
    activeRafHandles.delete(id);
    cb();
  }, 16);
  win._rafTimeouts = win._rafTimeouts || new Map();
  win._rafTimeouts.set(id, timeoutId);
  return id;
};

win.cancelAnimationFrame = (id) => {
  if (activeRafHandles.has(id)) {
    activeRafHandles.delete(id);
    if (win._rafTimeouts && win._rafTimeouts.has(id)) {
      clearTimeout(win._rafTimeouts.get(id));
      win._rafTimeouts.delete(id);
    }
  }
};

const EventTargetProto = win.EventTarget.prototype;
const originalAdd = EventTargetProto.addEventListener;
const originalRemove = EventTargetProto.removeEventListener;

EventTargetProto.addEventListener = function(type, listener, options) {
  let record = { target: this, type, listener, options };
  activeListeners.add(record);

  let wrappedListener = listener;
  if (options && options.signal) {
    const signal = options.signal;
    if (signal.aborted) {
      activeListeners.delete(record);
      return;
    }

    wrappedListener = function(...args) {
      if (!signal.aborted) {
        return listener.apply(this, args);
      }
    };

    this._wrappedListeners = this._wrappedListeners || new Map();
    this._wrappedListeners.set(listener, wrappedListener);

    signal.addEventListener('abort', () => {
      activeListeners.delete(record);
      originalRemove.call(this, type, wrappedListener, options);
    });
  }

  return originalAdd.call(this, type, wrappedListener, options);
};

EventTargetProto.removeEventListener = function(type, listener, options) {
  for (let r of activeListeners) {
    if (r.target === this && r.type === type && r.listener === listener) {
      activeListeners.delete(r);
    }
  }

  let wrappedListener = listener;
  if (this._wrappedListeners && this._wrappedListeners.has(listener)) {
    wrappedListener = this._wrappedListeners.get(listener);
    this._wrappedListeners.delete(listener);
  }

  return originalRemove.call(this, type, wrappedListener, options);
};

let mainObserverInstance = null;
let mainObserverCallback = null;

const observerCallback = (entries) => {
  if (mainObserverCallback) {
    mainObserverCallback(entries);
  }
};

win.IntersectionObserver = class {
  constructor(cb) {
    this.callback = cb;
    this.connected = true;
    this.isMain = false;
  }
  observe(el) {
    this.observedElement = el;
    if (el.ownerDocument === document) {
      this.isMain = true;
      mainObserverInstance = this;
      mainObserverCallback = this.callback;
    }
  }
  disconnect() {
    this.connected = false;
  }
};

function captureSnapshot(doc) {
  const sceneContainer = doc.getElementById('scene-container');
  const playBtn = doc.getElementById('btn-play-pause');
  const seekSlider = doc.getElementById('timeline-seek');
  const politeAnnouncer = doc.getElementById('polite-announcer');
  const timeDisplay = doc.querySelector('.time-display');
  const pipelineSection = doc.querySelector('.pipeline-section');

  const phaseBtns = Array.from(doc.querySelectorAll('.phase-btn')).map(btn => ({
    id: btn.id || btn.getAttribute('data-phase'),
    active: btn.classList.contains('active'),
    ariaCurrent: btn.getAttribute('aria-current')
  }));

  const iconPath = playBtn ? playBtn.querySelector('path')?.getAttribute('d') : null;

  return {
    pipelineSectionClasses: pipelineSection ? pipelineSection.className : null,
    containerClasses: sceneContainer ? sceneContainer.className : null,
    containerDataPhase: sceneContainer ? sceneContainer.dataset.phase : null,
    seekValue: seekSlider ? seekSlider.value : null,
    seekAriaValueText: seekSlider ? seekSlider.getAttribute('aria-valuetext') : null,
    playBtnText: playBtn ? playBtn.textContent.trim() : null,
    playBtnAriaLabel: playBtn ? playBtn.getAttribute('aria-label') : null,
    playBtnDisabled: playBtn ? playBtn.disabled : null,
    playBtnIconPath: iconPath,
    phaseBtnsState: phaseBtns,
    statusLabel: doc.getElementById('status-label')?.textContent || null,
    statusExplanation: doc.getElementById('status-explanation')?.textContent || null,
    captionPill: doc.getElementById('caption-pill')?.textContent || null,
    valKpiStatus: doc.getElementById('val-kpi-status')?.textContent || null,
    valKpiMetric: doc.getElementById('val-kpi-metric')?.textContent || null,
    timeDisplayContent: timeDisplay ? timeDisplay.textContent || null : null,
    announcerText: politeAnnouncer ? politeAnnouncer.textContent || null : null,
    rafCountState: rafCount,
    activeRafHandlesSize: activeRafHandles.size,
    activeRafHandlesList: Array.from(activeRafHandles),
    serializedDOM: doc.getElementById('scene-container')?.innerHTML || ''
  };
}

import { createSymbioteAnimation } from '../site/animation.js';

reducedMotionMatches = true;
const tempDoc = parseHTML(animationHtmlContent).document;
const tempWin = tempDoc.defaultView;
tempWin.matchMedia = win.matchMedia;
tempWin.performance = win.performance;
tempWin.requestAnimationFrame = win.requestAnimationFrame;
tempWin.cancelAnimationFrame = win.cancelAnimationFrame;
tempWin.IntersectionObserver = win.IntersectionObserver;

const controllerTemp = createSymbioteAnimation(tempDoc);
assert.ok(tempDoc.querySelector('#scene-container').classList.contains('is-paused'));
assert.equal(activeRafHandles.size, 0);
controllerTemp.destroy();

reducedMotionMatches = false;

const pipelineSection = document.querySelector('.pipeline-section');
pipelineSection.classList.remove('js-enhanced');
const sceneContainerEl = document.querySelector('#scene-container');
sceneContainerEl.className = 'interactive-only scene-wrapper';

const getControllerActiveListeners = () => {
  const targets = new Set([
    document.getElementById('btn-play-pause'),
    document.getElementById('btn-replay'),
    document.getElementById('timeline-seek'),
    win,
    document
  ]);
  document.querySelectorAll('.phase-btn').forEach(btn => targets.add(btn));
  return Array.from(activeListeners).filter(r => {
    return targets.has(r.target) || (r.target && typeof r.target.matches === 'boolean');
  });
};

const controller = createSymbioteAnimation(document);
assert.ok(pipelineSection.classList.contains('js-enhanced'));
assert.ok(!sceneContainerEl.classList.contains('is-paused'));
assert.equal(activeRafHandles.size, 1);

controller.pause();
assert.ok(sceneContainerEl.classList.contains('is-paused'));
assert.equal(activeRafHandles.size, 0);

observerCallback([{ isIntersecting: false }]);
assert.ok(sceneContainerEl.classList.contains('is-paused'));
assert.equal(activeRafHandles.size, 0);

observerCallback([{ isIntersecting: true }]);
assert.ok(sceneContainerEl.classList.contains('is-paused'));
assert.equal(activeRafHandles.size, 0);

controller.play();
assert.ok(!sceneContainerEl.classList.contains('is-paused'));
assert.equal(activeRafHandles.size, 1);

reducedMotionMatches = true;
if (win._mediaQueryInstance) {
  win._mediaQueryInstance.dispatchEvent({ matches: true });
}
assert.ok(sceneContainerEl.classList.contains('is-paused'));
assert.equal(activeRafHandles.size, 0);

observerCallback([{ isIntersecting: false }]);
assert.ok(sceneContainerEl.classList.contains('is-paused'));
assert.equal(activeRafHandles.size, 0);

observerCallback([{ isIntersecting: true }]);
assert.ok(sceneContainerEl.classList.contains('is-paused'));
assert.equal(activeRafHandles.size, 0);

reducedMotionMatches = false;
if (win._mediaQueryInstance) {
  win._mediaQueryInstance.dispatchEvent({ matches: false });
}
assert.ok(!sceneContainerEl.classList.contains('is-paused'));
assert.equal(activeRafHandles.size, 1);

Object.defineProperty(document, 'hidden', { value: true, writable: true });
document.dispatchEvent(new win.Event('visibilitychange'));
assert.ok(sceneContainerEl.classList.contains('is-paused'));
assert.equal(activeRafHandles.size, 0);

let pagehideEvent = new win.Event('pagehide');
pagehideEvent.persisted = true;
win.dispatchEvent(pagehideEvent);
assert.ok(sceneContainerEl.classList.contains('is-paused'));
assert.equal(activeRafHandles.size, 0);

let pageshowEvent = new win.Event('pageshow');
pageshowEvent.persisted = true;
win.dispatchEvent(pageshowEvent);
assert.ok(sceneContainerEl.classList.contains('is-paused'));
assert.equal(activeRafHandles.size, 0);

Object.defineProperty(document, 'hidden', { value: false, writable: true });
document.dispatchEvent(new win.Event('visibilitychange'));
assert.ok(!sceneContainerEl.classList.contains('is-paused'));
assert.equal(activeRafHandles.size, 1);

let initialRafCount = rafCount;
controller.play();
controller.play();
let pageshowEventRepeat = new win.Event('pageshow');
pageshowEventRepeat.persisted = true;
win.dispatchEvent(pageshowEventRepeat);
assert.ok(rafCount - initialRafCount <= 1);
assert.ok(activeRafHandles.size <= 1);

const pDoc = parseHTML(animationHtmlContent).document;
const pWin = pDoc.defaultView;
pWin.matchMedia = win.matchMedia;
pWin.performance = win.performance;
pWin.requestAnimationFrame = win.requestAnimationFrame;
pWin.cancelAnimationFrame = win.cancelAnimationFrame;
pWin.IntersectionObserver = win.IntersectionObserver;
const pSec = pDoc.querySelector('.pipeline-section');
pSec.classList.remove('js-enhanced');
createSymbioteAnimation(pDoc);
assert.ok(pSec.classList.contains('js-enhanced'));

let nonPersistedHide = new pWin.Event('pagehide');
nonPersistedHide.persisted = false;
pWin.dispatchEvent(nonPersistedHide);
assert.ok(!pSec.classList.contains('js-enhanced'));

const hydBarEl = document.getElementById('hydration-bar-fill');
controller.seek(5000);
assert.equal(hydBarEl.getAttribute('width'), '0');

controller.seek(7000);
assert.equal(Math.round(parseFloat(hydBarEl.getAttribute('width'))), 60);

controller.seek(9000);
assert.equal(hydBarEl.getAttribute('width'), '120');

controller.seek(5000);
const activeBtn = document.querySelector('.phase-btn.active');
assert.equal(activeBtn.getAttribute('aria-current'), 'step');
assert.equal(activeBtn.getAttribute('data-phase'), siteTimeline.PHASES.SELECT);

const seekSliderInput = document.getElementById('timeline-seek');
assert.equal(seekSliderInput.value, '5000');
assert.equal(seekSliderInput.getAttribute('aria-valuetext'), siteTimeline.formatAccessibleTime(5000));

const politeAnnouncer = document.getElementById('polite-announcer');
assert.ok(politeAnnouncer);
assert.equal(politeAnnouncer.getAttribute('role'), 'status');
assert.equal(politeAnnouncer.getAttribute('aria-live'), 'polite');

const playPauseBtnEl = document.getElementById('btn-play-pause');
controller.play();
assert.ok(!sceneContainerEl.classList.contains('is-paused'));

playPauseBtnEl.dispatchEvent(new win.Event('click'));
assert.ok(sceneContainerEl.classList.contains('is-paused'));
assert.equal(politeAnnouncer.textContent, 'Animation paused');

playPauseBtnEl.dispatchEvent(new win.Event('click'));
assert.ok(!sceneContainerEl.classList.contains('is-paused'));
assert.equal(politeAnnouncer.textContent, 'Animation started');

seekSliderInput.value = '5000';
seekSliderInput.dispatchEvent(new win.Event('input'));
assert.ok(sceneContainerEl.classList.contains('is-paused'));
assert.equal(politeAnnouncer.textContent, 'Seeked to 5.0s, Phase: PRIMITIVE SELECTION');

const phaseBtnsList = document.querySelectorAll('.phase-btn');
phaseBtnsList[3].dispatchEvent(new win.Event('click'));
assert.equal(politeAnnouncer.textContent, 'Selected Phase: UI HYDRATION');

const replayBtnEl = document.getElementById('btn-replay');
replayBtnEl.dispatchEvent(new win.Event('click'));
assert.ok(!sceneContainerEl.classList.contains('is-paused'));
assert.equal(politeAnnouncer.textContent, 'Animation replayed');

const preDestroyActiveListeners = getControllerActiveListeners();
assert.ok(preDestroyActiveListeners.length > 0);

controller.destroy();

assert.ok(!pipelineSection.classList.contains('js-enhanced'));
assert.ok(sceneContainerEl.classList.contains('is-destroyed'));
assert.equal(mainObserverInstance.connected, false);
assert.equal(activeRafHandles.size, 0);

const postDestroyBaseline = captureSnapshot(document);
assert.ok(!postDestroyBaseline.pipelineSectionClasses.includes('js-enhanced'), 'Teardown must restore fallback/no-JS class state on the pipeline parent');
const postDestroyActiveListeners = getControllerActiveListeners();
assert.equal(postDestroyActiveListeners.length, 0);

assert.doesNotThrow(() => {
  controller.destroy();
  controller.destroy();
});

playPauseBtnEl.dispatchEvent(new win.Event('click'));
replayBtnEl.dispatchEvent(new win.Event('click'));
phaseBtnsList[2].dispatchEvent(new win.Event('click'));
seekSliderInput.dispatchEvent(new win.Event('input'));
seekSliderInput.dispatchEvent(new win.Event('focus'));

reducedMotionMatches = true;
if (win._mediaQueryInstance) {
  win._mediaQueryInstance.dispatchEvent({ matches: true });
}
document.dispatchEvent(new win.Event('visibilitychange'));

const pagehidePersisted = new win.Event('pagehide');
pagehidePersisted.persisted = true;
win.dispatchEvent(pagehidePersisted);

const pagehideNonPersisted = new win.Event('pagehide');
pagehideNonPersisted.persisted = false;
win.dispatchEvent(pagehideNonPersisted);

const pageshowPersisted = new win.Event('pageshow');
pageshowPersisted.persisted = true;
win.dispatchEvent(pageshowPersisted);

const pageshowNonPersisted = new win.Event('pageshow');
pageshowNonPersisted.persisted = false;
win.dispatchEvent(pageshowNonPersisted);

if (mainObserverCallback) {
  mainObserverCallback([{ isIntersecting: true }]);
}

const postInteractionSnapshot = captureSnapshot(document);
assert.deepEqual(postInteractionSnapshot, postDestroyBaseline);
assert.equal(rafCount, postDestroyBaseline.rafCountState);
assert.equal(getControllerActiveListeners().length, 0);

const badDoc = parseHTML(`<!doctype html><html><body><div class="pipeline-section"><div id="scene-container"></div></div></body></html>`).document;
assert.throws(() => {
  createSymbioteAnimation(badDoc);
}, Error);
const badSceneParent = badDoc.getElementById('scene-container').parentElement;
assert.ok(!badSceneParent.classList.contains('js-enhanced'));

console.log('All tests passed.');
