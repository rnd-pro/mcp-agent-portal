import fs from 'fs';
import test from 'node:test';
import assert from 'node:assert';
import path from 'path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseHTML } from 'linkedom';

class TestCSSStyleSheet {
  replaceSync(text) {
    this.cssText = text;
  }
}

// The node-canvas entrypoint registers its custom elements once per process
// against the registry present at first import, so canvas harness tests share
// a single window and registry.
let canvasWindow = null;
function getCanvasWindow() {
  if (!canvasWindow) {
    ({ window: canvasWindow } = parseHTML('<!doctype html><html><body></body></html>'));
    canvasWindow.document.adoptedStyleSheets = [];
  }
  return canvasWindow;
}

function installCanvasDom() {
  const window = getCanvasWindow();
  const globalNames = [
    'window', 'document', 'HTMLElement', 'Element', 'customElements', 'Node', 'Event', 'CustomEvent',
    'MutationObserver', 'CSSStyleSheet', 'localStorage', 'getComputedStyle',
    'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout',
  ];
  const originalDescriptors = new Map(
    globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const activeTimers = new Set();
  const trackTimer = (callback, delay) => {
    const handle = originalSetTimeout(() => {
      activeTimers.delete(handle);
      callback();
    }, delay);
    activeTimers.add(handle);
    return handle;
  };
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    customElements: window.customElements,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    MutationObserver: window.MutationObserver,
    CSSStyleSheet: TestCSSStyleSheet,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    getComputedStyle: window.getComputedStyle || (() => ({ transitionDuration: '0s', animationDuration: '0s' })),
    setTimeout: (callback, delay, ...args) => trackTimer(() => callback(...args), delay),
    clearTimeout: (handle) => {
      activeTimers.delete(handle);
      originalClearTimeout(handle);
    },
    requestAnimationFrame: (callback) => trackTimer(() => callback(Date.now()), 0),
    cancelAnimationFrame: (handle) => {
      activeTimers.delete(handle);
      originalClearTimeout(handle);
    },
  });
  window.document.adoptedStyleSheets = [];
  return {
    window,
    restore() {
      for (const handle of activeTimers) {
        originalClearTimeout(handle);
      }
      activeTimers.clear();
      for (const [name, descriptor] of originalDescriptors) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}

test('site-completion: docs use route-scoped Symbiote UI bundles', () => {
  const gettingStarted = fs.readFileSync('_site/docs/getting-started/index.html', 'utf8');
  const guide = fs.readFileSync('_site/docs/guide/index.html', 'utf8');
  const enhanceSource = fs.readFileSync('node_modules/library-pages/client/code-blocks.js', 'utf8');

  assert.match(gettingStarted, /<script[^>]+src=["']?[^ >]*\/docs\/node-preview\/index\.js/);
  assert.doesNotMatch(gettingStarted, /<script[^>]+src=["']?[^ >]*\/docs\/index\.js/);
  assert.match(guide, /<script[^>]+src=["']?[^ >]*\/docs\/index\.js/);
  assert.doesNotMatch(guide, /<script[^>]+src=["']?[^ >]*\/docs\/node-preview\/index\.js/);
  assert.ok(
    enhanceSource.indexOf('fallback.replaceWith(enhanced)') > -1 &&
    enhanceSource.indexOf('fallback.replaceWith(enhanced)') < enhanceSource.indexOf('enhanced.setContent('),
    'CodeBlock content is set after the component is connected',
  );
});

test('site-completion: header search is a local keyboard-accessible dialog', () => {
  const landing = fs.readFileSync('_site/index.html', 'utf8');
  const gettingStarted = fs.readFileSync('_site/docs/getting-started/index.html', 'utf8');

  for (const page of [landing, gettingStarted]) {
    assert.match(page, /data-search-trigger/, 'Page exposes a search trigger button');
    assert.match(page, /<dialog[^>]+data-search-dialog/, 'Page embeds the local search dialog');
  }
  assert.match(landing, /\/symbiote-engine\/client\/index\.js/, 'Landing loads the shared library-pages client entry');

  // The keyboard behavior itself is package-tested; here we only assert composition.
  execSync('node --check _site/client/index.js');
});

test('site-completion: node preview loads Material Symbols from the local icons stylesheet', async () => {
  // DOM harness is justified: stylesheet autoload and element upgrade exist only in a DOM document/registry.
  const source = fs.readFileSync('site/docs/node-preview/index.js', 'utf8');
  assert.match(
    source,
    /import \{ configureMaterialSymbols \} from 'symbiote-ui\/canvas\/node-canvas';/,
    'Preview imports configureMaterialSymbols only from the narrow node-canvas entrypoint',
  );
  assert.doesNotMatch(source, /from 'symbiote-ui\/ui'/, 'Preview never imports the broad symbiote-ui/ui aggregate');
  const configureIndex = source.indexOf('configureMaterialSymbols({');
  assert.ok(configureIndex > -1, 'Preview configures Material Symbols loading');
  assert.match(
    source,
    /hrefBuilder: \(\) => '\.\.\/\.\.\/icons\/material-symbols\.css'/,
    'Preview points Material Symbols at the locally copied icons stylesheet',
  );
  assert.ok(
    configureIndex < source.indexOf("document.createElement('node-canvas')"),
    'Icon loading is configured before the preview creates canvas elements',
  );

  let dom = null;
  try {
    dom = installCanvasDom();
    document.body.innerHTML = `
      <div class="node-preview">
        <div class="node-preview-stage" data-node-preview>
          <div class="node-preview-fallback">Source &rarr; Double</div>
        </div>
      </div>`;

    const moduleUrl = pathToFileURL(path.join(process.cwd(), 'site/docs/node-preview/index.js'));
    await import(`${moduleUrl.href}?test=${Date.now()}`);

    const stage = document.querySelector('[data-node-preview]');
    const previewRoot = stage.closest('.node-preview');
    let ready = false;
    for (let attempt = 0; attempt < 100 && !ready; attempt += 1) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      ready = previewRoot.classList.contains('is-ready');
    }
    assert.ok(ready, 'Node preview reached its ready lifecycle state');

    const managedLink = document.querySelector('link[data-sn-material-symbols="managed"]');
    assert.ok(managedLink, 'Preview appends the managed Material Symbols stylesheet');
    assert.equal(
      managedLink.getAttribute('href'),
      '../../icons/material-symbols.css',
      'Managed stylesheet resolves to the locally copied icons asset, never an external font host',
    );

    const GraphNodeComponent = customElements.get('graph-node');
    const nodes = [...stage.querySelectorAll('graph-node')];
    assert.equal(nodes.length, 2, 'Preview renders two graph nodes');
    assert.deepEqual(
      nodes.map((node) => node.getAttribute('node-label')).sort(),
      ['Double', 'Source'],
      'Preview renders the two labeled model nodes',
    );
    for (const node of nodes) {
      assert.ok(node instanceof GraphNodeComponent, 'graph-node upgraded');
      assert.ok(node.querySelector('.sn-node-header'), 'graph-node rendered its header');
      assert.ok(node.textContent.trim().length > 0, 'graph-node renders non-empty content');
    }
  } finally {
    if (dom) {
      const { configureMaterialSymbols } = await import('symbiote-ui/canvas/node-canvas');
      configureMaterialSymbols({ autoload: true, hrefBuilder: null });
      document.querySelectorAll('link[data-sn-material-symbols="managed"]').forEach((link) => link.remove());
      document.body.innerHTML = '';
      dom.restore();
    }
  }
});

test('site-completion: node preview upgrades graph-node from the narrow canvas import', async () => {
  // DOM harness is justified: element registration and upgrade exist only in a DOM registry.
  const dom = installCanvasDom();

  try {
    await import('symbiote-ui/canvas/node-canvas');
    const GraphNodeComponent = customElements.get('graph-node');
    assert.ok(GraphNodeComponent, 'narrow node-canvas import registers graph-node');

    const node = document.createElement('graph-node');
    node._nodeData = {
      id: 'source',
      label: 'Source',
      category: 'default',
      icon: '',
      shape: 'rect',
      type: 'docs/source',
      params: {},
      inputs: {},
      outputs: { value: { name: 'value', type: 'number', label: 'value' } },
      controls: {},
    };
    node.setAttribute('node-id', 'source');
    node.setAttribute('node-label', 'Source');
    document.body.append(node);
    await Promise.resolve();
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));

    assert.ok(node instanceof GraphNodeComponent, 'appended graph-node upgraded');
    assert.ok(node.querySelector('.sn-node-header'), 'graph-node rendered its header');
    assert.ok(node.textContent.trim().length > 0, 'graph-node preview renders non-empty content');

    node.remove();
    await Promise.resolve();
  } finally {
    dom.restore();
  }
});

test('site-completion: a chapter reveal is applied once on its first intersection', async () => {
  const originalDescriptors = new Map(
    ['document', 'matchMedia', 'IntersectionObserver']
      .map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  const classes = new Set();
  const chapter = {
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
    },
  };
  let intersectionCallback;
  const unobserved = [];

  globalThis.document = {
    documentElement: { classList: chapter.classList },
    querySelectorAll: () => [chapter],
  };
  globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {} });
  globalThis.IntersectionObserver = class {
    constructor(callback) { intersectionCallback = callback; }
    observe() {}
    unobserve(element) { unobserved.push(element); }
    disconnect() {}
  };

  try {
    const moduleUrl = pathToFileURL(path.join(process.cwd(), 'site/animation/index.js'));
    await import(`${moduleUrl.href}?test=${Date.now()}`);
    intersectionCallback([{ isIntersecting: true, target: chapter }]);
    assert.ok(classes.has('is-revealed'), 'first intersection reveals the chapter');
    assert.deepEqual(unobserved, [chapter], 'a revealed chapter is unobserved');

    intersectionCallback([{ isIntersecting: false, target: chapter }]);
    intersectionCallback([{ isIntersecting: true, target: chapter }]);
    assert.deepEqual(unobserved, [chapter], 'repeat intersections do not re-consume the chapter');
    assert.ok(classes.has('is-enhanced'), 'motion enhancement is flagged on the document root');
  } finally {
    for (const [name, descriptor] of originalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test('site-completion: animation delays and durations', async (t) => {
  const builtHtmlPath = path.join(process.cwd(), '_site', 'index.html');
  const sourceHtmlJsPath = path.join(process.cwd(), 'site', 'index.html.js');

  const content = fs.existsSync(builtHtmlPath)
    ? fs.readFileSync(builtHtmlPath, 'utf8')
    : fs.readFileSync(sourceHtmlJsPath, 'utf8');

  function parseTime(str) {
    if (!str) return 0;
    const m = str.trim().match(/^(-?\d*\.?\d+)(s|ms)$/i);
    if (!m) return 0;
    const val = parseFloat(m[1]);
    return m[2].toLowerCase() === 'ms' ? val / 1000 : val;
  }

  // 1. Parse every landing animation: shorthand
  const animationRegex = /animation:\s*([^;}<]+)/ig;
  let match;
  let animations = [];
  while ((match = animationRegex.exec(content)) !== null) {
    const anim = match[1].trim();
    if (anim && anim !== 'none') {
      animations.push(anim);
    }
  }

  for (const anim of animations) {
    const parts = anim.split(/\s+/);
    const times = parts.filter(p => /^(-?\d*\.?\d+)(s|ms)$/i.test(p));

    let duration = 0;
    let delay = 0;
    if (times.length > 0) duration = parseTime(times[0]);
    if (times.length > 1) delay = parseTime(times[1]);

    if (anim.includes('infinite')) {
      // Continuous loops are the shared reference motion language and must
      // come from the package-owned lp-* keyframes with a bounded cycle.
      assert.ok(/(^|\s)lp-[a-z-]+/.test(anim), `Infinite animation must use a shared lp-* keyframe: ${anim}`);
      assert.ok(duration > 0 && duration <= 6, `Infinite loop cycle should be within 6s. Found ${duration}s in: ${anim}`);
      continue;
    }

    const positiveDelay = Math.max(0, delay);
    assert.ok(
      duration + positiveDelay <= 4,
      `duration + positive delay should be <= 4s. Found ${duration}s + ${positiveDelay}s in: ${anim}`
    );
  }

  function extractDelay(identifier) {
    let foundDelay = null;

    // Strategy 1: Check CSS rules
    const cssRegex = new RegExp(`${identifier}[^\\{\\}<>]+\\{([^\\}]+)\\}`, 'ig');
    let m;
    while ((m = cssRegex.exec(content)) !== null) {
      const block = m[1];
      const delayMatch = block.match(/animation-delay:\s*([^;]+)/i);
      if (delayMatch) {
        foundDelay = parseTime(delayMatch[1]);
      }
      const animMatch = block.match(/animation:\s*([^;]+)/i);
      if (animMatch && animMatch[1].trim() !== 'none') {
        const parts = animMatch[1].trim().split(/\s+/);
        const times = parts.filter(p => /^(-?\d*\.?\d+)(s|ms)$/i.test(p));
        if (times.length > 1 && foundDelay === null) {
          foundDelay = parseTime(times[1]);
        } else if (times.length === 1 && foundDelay === null) {
          foundDelay = 0;
        }
      }
    }

    // Strategy 2: Check HTML inline styles
    const htmlRegex = new RegExp(`<[^>]*${identifier}[^>]*>`, 'ig');
    while ((m = htmlRegex.exec(content)) !== null) {
      const tag = m[0];
      const delayMatch = tag.match(/style="[^"]*animation-delay:\s*([^;"]+)/i);
      if (delayMatch) {
        foundDelay = parseTime(delayMatch[1]);
      }
      const animMatch = tag.match(/style="[^"]*animation:\s*([^;"]+)/i);
      if (animMatch && animMatch[1].trim() !== 'none') {
        const parts = animMatch[1].trim().split(/\s+/);
        const times = parts.filter(p => /^(-?\d*\.?\d+)(s|ms)$/i.test(p));
        if (times.length > 1 && foundDelay === null) {
          foundDelay = parseTime(times[1]);
        } else if (times.length === 1 && foundDelay === null) {
          foundDelay = 0;
        }
      }
    }

    return foundDelay;
  }

  void extractDelay;

  // Entrance accents settle through delayed transitions, not keyframe loops.
  assert.match(
    content,
    /data-motion-accent="?slide-right"?\][^{}]*\{[^}]*transition:\s*transform[^}]*\}/,
    'Slide accents settle through a transform transition',
  );

  // The cache-branch scene de-emphasizes the reuse route while both routes
  // share the continuous reference dash loop.
  assert.match(
    content,
    /data-route="?reuse"?\]\s*\{[^}]*opacity:\s*0?\.\d+/,
    'Reuse route is visually de-emphasized',
  );
  assert.match(
    content,
    /data-route="?execute"?\][^{}]*\{(?=[^}]*lp-dash-flow)(?=[^}]*infinite)/,
    'Route dashes flow continuously through the shared lp-dash-flow loop',
  );

  // Reduced motion restores full static visibility.
  assert.match(
    content,
    /prefers-reduced-motion:\s*reduce[\s\S]*data-route="?execute"?\][\s\S]*?opacity:\s*1/,
    'Reduced motion restores static route visibility',
  );
});
