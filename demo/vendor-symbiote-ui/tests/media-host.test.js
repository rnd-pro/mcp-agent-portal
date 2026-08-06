import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';

class TestCSSStyleSheet {
  replaceSync(text) {
    this.cssText = text;
  }
}

function installSsrDom() {
  let { window } = parseHTML('<!doctype html><html><body></body></html>');
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    customElements: window.customElements,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    KeyboardEvent: window.KeyboardEvent,
    MutationObserver: window.MutationObserver,
    CSSStyleSheet: TestCSSStyleSheet,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
  });
  window.document.adoptedStyleSheets = [];
  Object.defineProperty(window.HTMLElement.prototype, 'adoptedStyleSheets', {
    configurable: true,
    get() {
      return this.__symbioteSsrSheets || [];
    },
    set(value) {
      this.__symbioteSsrSheets = value;
    },
  });
  globalThis.getComputedStyle = (element) => ({
    getPropertyValue(prop) {
      return element.style?.getPropertyValue?.(prop) || '';
    },
  });
  return window;
}

installSsrDom();

const {
  registerMediaProvider,
  getMediaProvider,
  hasMediaProvider,
  listMediaProviders,
  unregisterMediaProvider,
  IMAGE_MEDIA_ADAPTER,
  IMAGE_PROVIDER_KEY,
  YOUTUBE_MEDIA_ADAPTER,
  YOUTUBE_PROVIDER_KEY,
  MediaHost,
} = await import('../ui/media/index.js');
let { resolveSafeMediaUrl } = await import('../ui/media/resolveSafeMediaUrl.js');

async function nextRenderTick() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function youtubeDescriptor(overrides = {}) {
  return {
    kind: 'video',
    poster: 'https://example.test/poster.jpg',
    alt: 'Product demo',
    activation: { provider: 'youtube', videoId: 'dQw4w9WgXcQ' },
    targetIds: [],
    ...overrides,
  };
}

function imageDescriptor(overrides = {}) {
  return {
    kind: 'image',
    poster: 'https://example.test/poster.jpg',
    alt: 'A diagram',
    activation: { provider: 'image', src: 'https://example.test/full.png' },
    targetIds: [],
    ...overrides,
  };
}

function registerCountingProvider(key) {
  let state = {
    mountCount: 0,
    unmountCount: 0,
    activeElement: null,
  };
  registerMediaProvider(key, {
    mount(stage) {
      state.mountCount += 1;
      state.activeElement = document.createElement('div');
      state.activeElement.className = 'fake-player';
      stage.append(state.activeElement);
      return { element: state.activeElement };
    },
    unmount(stage, mountState) {
      state.unmountCount += 1;
      mountState?.element?.remove();
    },
  });
  return state;
}

async function mountHost(descriptor) {
  let host = document.createElement('sn-media-host');
  host.descriptor = descriptor;
  document.body.append(host);
  await nextRenderTick();
  return host;
}

test('media url resolver accepts navigation urls and rejects executable schemes', () => {
  let safeCases = [
    ['https://example.test/watch', 'https://example.test/watch'],
    ['../media/demo.html?mode=preview#frame', '../media/demo.html?mode=preview#frame'],
  ];
  let unsafeCases = [
    'javascript:globalThis.__mediaPwned=1',
    'JaVaScRiPt:globalThis.__mediaPwned=1',
    'java\tscript:globalThis.__mediaPwned=1',
    'java\nscript:globalThis.__mediaPwned=1',
    'data:text/html,<script>globalThis.__mediaPwned=1</script>',
  ];

  for (let [value, expected] of safeCases) {
    assert.equal(resolveSafeMediaUrl(value), expected);
  }
  for (let value of unsafeCases) {
    assert.equal(resolveSafeMediaUrl(value), '');
  }
});

test('registry exposes built-in providers and never throws on unknown keys', () => {
  assert.ok(getMediaProvider('image'), 'image provider registered');
  assert.ok(getMediaProvider('youtube'), 'youtube provider registered');
  assert.equal(getMediaProvider('does-not-exist'), undefined);
  assert.equal(getMediaProvider(''), undefined);
  assert.equal(getMediaProvider(null), undefined);
  assert.equal(getMediaProvider(42), undefined);
  assert.equal(hasMediaProvider('image'), true);
  assert.equal(hasMediaProvider('nope'), false);

  let keys = listMediaProviders();
  assert.ok(keys.includes(IMAGE_PROVIDER_KEY));
  assert.ok(keys.includes(YOUTUBE_PROVIDER_KEY));
  assert.deepEqual(keys, [...keys].sort(), 'keys are sorted');
});

test('registry register/unregister round-trip', () => {
  let key = 'round-trip-temp';
  let adapter = { mount() {}, unmount() {} };
  assert.equal(hasMediaProvider(key), false);
  registerMediaProvider(key, adapter);
  assert.equal(getMediaProvider(key), adapter);
  assert.equal(hasMediaProvider(key), true);
  assert.equal(unregisterMediaProvider(key), true);
  assert.equal(hasMediaProvider(key), false);
  assert.equal(unregisterMediaProvider(key), false);
});

test('registerMediaProvider rejects invalid keys and adapters', () => {
  assert.throws(() => registerMediaProvider('', { mount() {}, unmount() {} }));
  assert.throws(() => registerMediaProvider('x', null));
  assert.throws(() => registerMediaProvider('x', { mount() {} }));
  assert.throws(() => registerMediaProvider('x', { unmount() {} }));
});

test('initial render is poster-only with a button and zero iframes', async () => {
  let host = await mountHost(youtubeDescriptor());

  let img = host.querySelector('img');
  let button = host.querySelector('button');
  assert.ok(img, 'poster image present');
  assert.equal(img.getAttribute('src'), 'https://example.test/poster.jpg');
  assert.ok(button, 'activation button present');
  assert.ok((button.getAttribute('aria-label') || '').length > 0, 'button has aria-label');
  assert.equal(host.querySelectorAll('iframe').length, 0, 'no iframe before activation');

  host.remove();
});

test('activation mounts exactly one hardened youtube iframe', async () => {
  let host = await mountHost(youtubeDescriptor());
  host.activate();
  await nextRenderTick();

  let frames = host.querySelectorAll('iframe');
  assert.equal(frames.length, 1, 'exactly one iframe after activation');
  let frame = frames[0];
  assert.ok(frame.getAttribute('src').startsWith('https://www.youtube-nocookie.com/embed/'));
  assert.equal(frame.getAttribute('loading'), 'lazy');
  assert.equal(frame.getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin');
  assert.equal(frame.getAttribute('allow'), 'encrypted-media; picture-in-picture');
  assert.equal(frame.getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-presentation');
  assert.ok((frame.getAttribute('title') || '').length > 0, 'iframe has a title');

  host.remove();
});

test('activating twice keeps exactly one active adapter', async () => {
  let host = await mountHost(youtubeDescriptor());
  host.activate();
  await nextRenderTick();
  host.activate();
  await nextRenderTick();
  assert.equal(host.querySelectorAll('iframe').length, 1, 'still exactly one iframe');
  host.remove();
});

test('clicking the activation button mounts the adapter', async () => {
  let host = await mountHost(youtubeDescriptor());
  let button = host.querySelector('button');
  button.dispatchEvent(new window.Event('click', { bubbles: true }));
  await nextRenderTick();
  assert.equal(host.querySelectorAll('iframe').length, 1);
  host.remove();
});

function keydown(key) {
  let event = new window.Event('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'key', { value: key });
  return event;
}

test('button activates on Enter and Space keydown', async () => {
  for (let key of ['Enter', ' ']) {
    let host = await mountHost(youtubeDescriptor());
    let button = host.querySelector('button');
    button.dispatchEvent(keydown(key));
    await nextRenderTick();
    assert.equal(host.querySelectorAll('iframe').length, 1, `activated on ${key}`);
    host.remove();
  }
});

test('setting a new descriptor unmounts the active adapter and returns to poster', async () => {
  let host = await mountHost(youtubeDescriptor());
  host.activate();
  await nextRenderTick();
  assert.equal(host.querySelectorAll('iframe').length, 1);

  host.descriptor = imageDescriptor();
  await nextRenderTick();
  assert.equal(host.querySelectorAll('iframe').length, 0, 'previous iframe removed');
  assert.ok(host.querySelector('button'), 'back to poster state');

  host.remove();
});

test('disconnect unmounts the active adapter', async () => {
  let host = await mountHost(youtubeDescriptor());
  host.activate();
  await nextRenderTick();
  assert.equal(host.querySelectorAll('iframe').length, 1);

  host.remove();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(host.querySelectorAll('iframe').length, 0, 'iframe removed on disconnect');
});

test('unknown provider degrades to poster and external link without throwing', async () => {
  let host = await mountHost(youtubeDescriptor({ activation: { provider: 'nope', url: 'https://example.test/watch' } }));
  assert.doesNotThrow(() => host.activate());
  await nextRenderTick();
  assert.equal(host.querySelectorAll('iframe').length, 0, 'no iframe for unknown provider');
  let link = host.querySelector('a');
  assert.ok(link, 'external link rendered');
  assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(link.getAttribute('target'), '_blank');
  host.remove();
});

test('unknown-provider fallback rejects executable external urls', async () => {
  for (let url of [
    'javascript:globalThis.__mediaPwned=1',
    'data:text/html,<script>globalThis.__mediaPwned=1</script>',
  ]) {
    let host = await mountHost(youtubeDescriptor({
      poster: '',
      activation: { provider: 'nope', url },
    }));
    host.activate();
    await nextRenderTick();
    assert.equal(host.querySelector('a'), null, `external link rejected for ${url.split(':')[0]}`);
    host.remove();
  }
});

test('unknown-provider fallback preserves safe relative external urls', async () => {
  let host = await mountHost(youtubeDescriptor({
    poster: '',
    activation: { provider: 'nope', url: '../media/demo.html?mode=preview#frame' },
  }));
  host.activate();
  await nextRenderTick();
  assert.equal(
    host.querySelector('a')?.getAttribute('href'),
    '../media/demo.html?mode=preview#frame'
  );
  host.remove();
});

test('adapter mount failure degrades to fallback without throwing', async () => {
  let key = 'throwing-temp';
  registerMediaProvider(key, {
    mount() {
      throw new Error('boom');
    },
    unmount() {},
  });
  let host = await mountHost(youtubeDescriptor({ activation: { provider: key, url: 'https://example.test/x' } }));
  assert.doesNotThrow(() => host.activate());
  await nextRenderTick();
  assert.equal(host.querySelectorAll('iframe').length, 0);
  assert.ok(host.querySelector('a'), 'fallback link rendered');
  host.remove();
  unregisterMediaProvider(key);
});

test('missing or invalid descriptor renders gracefully', async () => {
  let host = document.createElement('sn-media-host');
  document.body.append(host);
  await nextRenderTick();
  assert.doesNotThrow(() => host.activate());
  assert.equal(host.querySelectorAll('iframe').length, 0);

  host.descriptor = { not: 'a descriptor' };
  await nextRenderTick();
  assert.doesNotThrow(() => host.activate());
  assert.equal(host.querySelectorAll('iframe').length, 0);
  host.remove();
});

test('youtube id sanitization blocks injection and falls back', async () => {
  let host = await mountHost(youtubeDescriptor({
    activation: { provider: 'youtube', videoId: 'abc"><script>', url: 'https://example.test/watch' },
  }));
  host.activate();
  await nextRenderTick();
  assert.equal(host.querySelectorAll('iframe').length, 0, 'no iframe for malformed id');
  assert.ok(host.querySelector('a'), 'fallback link present');
  host.remove();
});

test('youtube fallback rejects executable external urls', () => {
  for (let url of [
    'JaVaScRiPt:globalThis.__mediaPwned=1',
    'data:text/html,<script>globalThis.__mediaPwned=1</script>',
  ]) {
    let container = document.createElement('div');
    YOUTUBE_MEDIA_ADAPTER.mount(container, {
      kind: 'video',
      poster: '',
      alt: 'Unsafe video',
      activation: { provider: 'youtube', videoId: 'invalid id', url },
    });
    assert.equal(container.querySelector('a'), null, `external link rejected for ${url.split(':')[0]}`);
  }
});

test('youtube adapter resolves ids from watch and short urls', () => {
  let container = document.createElement('div');
  let state = YOUTUBE_MEDIA_ADAPTER.mount(container, {
    kind: 'video',
    alt: 'From URL',
    activation: { provider: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  });
  let frame = container.querySelector('iframe');
  assert.ok(frame);
  assert.equal(frame.getAttribute('src'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
  YOUTUBE_MEDIA_ADAPTER.unmount(container, state);
  assert.equal(container.querySelectorAll('iframe').length, 0);
});

test('image adapter mounts a lazy img with resolved src and alt', () => {
  let container = document.createElement('div');
  let state = IMAGE_MEDIA_ADAPTER.mount(container, imageDescriptor());
  let img = container.querySelector('img');
  assert.ok(img);
  assert.equal(img.getAttribute('src'), 'https://example.test/full.png');
  assert.equal(img.getAttribute('alt'), 'A diagram');
  assert.equal(img.getAttribute('loading'), 'lazy');
  assert.equal(img.getAttribute('decoding'), 'async');
  IMAGE_MEDIA_ADAPTER.unmount(container, state);
  assert.equal(container.querySelectorAll('img').length, 0);
});

// Readiness: `activate()` may be called before the render lifecycle has populated
// refs/stage. In this env Symbiote upgrades and renders inline templates
// synchronously on connection, so the deterministic not-ready window is *before*
// connection (or while render is paused). No timer/rAF is used for fulfillment —
// the pending request is fulfilled by the framework `renderCallback` hook.

test('activation requested before readiness is deferred, then fulfilled by the render lifecycle', async () => {
  let host = document.createElement('sn-media-host');
  host.descriptor = youtubeDescriptor();

  host.activate();
  assert.equal(host.querySelectorAll('iframe').length, 0, 'not mounted before the stage exists');

  document.body.append(host);
  await nextRenderTick();
  assert.equal(host.querySelectorAll('iframe').length, 1, 'pending activation fulfilled by renderCallback');

  host.remove();
});

test('descriptor replacement cancels a pending activation', async () => {
  let host = document.createElement('sn-media-host');
  host.descriptor = youtubeDescriptor();
  host.activate();

  host.descriptor = imageDescriptor();
  document.body.append(host);
  await nextRenderTick();

  assert.equal(host.querySelectorAll('iframe').length, 0, 'stale youtube activation was cancelled');
  assert.ok(host.querySelector('button'), 'host is in poster state for the new descriptor');

  host.remove();
});

test('disconnect cancels a pending activation', async () => {
  let host = document.createElement('sn-media-host');
  host.pauseRender = true;
  host.descriptor = youtubeDescriptor();
  document.body.append(host);

  host.activate();
  assert.equal(host.querySelectorAll('iframe').length, 0, 'deferred while render is paused');

  host.remove();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(host.querySelectorAll('iframe').length, 0, 'nothing mounted late after disconnect');
});

test('rapid reselect A->B activates only the current host', async () => {
  let hostA = document.createElement('sn-media-host');
  hostA.descriptor = youtubeDescriptor();
  hostA.activate();
  hostA.remove();

  let hostB = document.createElement('sn-media-host');
  hostB.descriptor = youtubeDescriptor({ activation: { provider: 'youtube', videoId: '9bZkp7q19f0' } });
  document.body.append(hostB);
  hostB.activate();
  await nextRenderTick();

  assert.equal(hostA.querySelectorAll('iframe').length, 0, 'superseded host A never mounts');
  assert.equal(hostB.querySelectorAll('iframe').length, 1, 'exactly the current host B activates');

  hostB.remove();
});

test('retains active adapter across layout reparenting', async () => {
  let key = 'counting-fake';

  try {
    let provider = registerCountingProvider(key);

    let host = await mountHost({
      kind: 'video',
      poster: 'https://example.test/poster.jpg',
      alt: 'Fake Video',
      activation: { provider: key },
    });
    let destination = document.createElement('section');
    document.body.append(destination);

    host.activate();
    await nextRenderTick();
    let stage = host.ref.stage;
    let activeElement = provider.activeElement;

    assert.equal(provider.mountCount, 1);
    assert.equal(provider.unmountCount, 0);
    assert.equal(stage.querySelector('.fake-player'), activeElement);

    destination.append(host);
    await nextRenderTick();

    assert.equal(provider.mountCount, 1);
    assert.equal(provider.unmountCount, 0);
    assert.equal(host.ref.stage, stage);
    assert.equal(stage.querySelector('.fake-player'), activeElement);
    assert.equal(host.hasAttribute('data-activated'), true);

    host.remove();
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(provider.unmountCount, 1);

    destination.remove();
  } finally {
    unregisterMediaProvider(key);
  }
});

test('terminal disconnect restores an activatable poster after reconnect', async () => {
  let key = 'counting-reconnect-fake';

  try {
    let provider = registerCountingProvider(key);
    let host = await mountHost({
      kind: 'video',
      poster: 'https://example.test/poster.jpg',
      alt: 'Reconnect Video',
      activation: { provider: key },
    });
    host.activate();
    await nextRenderTick();

    host.remove();
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(provider.unmountCount, 1);
    assert.equal(host.hasAttribute('data-activated'), false);
    assert.equal(host.ref.poster.hidden, false);
    assert.equal(host.ref.stage.childElementCount, 0);

    document.body.append(host);
    await nextRenderTick();
    host.ref.button.dispatchEvent(new window.Event('click', { bubbles: true }));
    await nextRenderTick();

    assert.equal(provider.mountCount, 2);
    assert.equal(host.hasAttribute('data-activated'), true);
    assert.equal(host.ref.stage.querySelector('.fake-player'), provider.activeElement);

    host.remove();
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(provider.unmountCount, 2);
  } finally {
    unregisterMediaProvider(key);
  }
});

test('terminal disconnect tears down the active adapter exactly once', async () => {
  let key = 'counting-terminal-disconnect-fake';

  try {
    let provider = registerCountingProvider(key);
    let host = await mountHost({
      kind: 'video',
      poster: 'https://example.test/poster.jpg',
      alt: 'Terminal Disconnect Video',
      activation: { provider: key },
    });
    host.activate();
    await nextRenderTick();

    host.remove();
    await new Promise((resolve) => setTimeout(resolve, 150));

    assert.equal(provider.mountCount, 1);
    assert.equal(provider.unmountCount, 1);
    assert.equal(host.hasAttribute('data-activated'), false);
    assert.equal(host.ref.poster.hidden, false);
    assert.equal(host.ref.stage.childElementCount, 0);
  } finally {
    unregisterMediaProvider(key);
  }
});

test('MediaHost public methods are agent-readable in all metadata views', async () => {
  let [{ getComponent }, customElementsSource] = await Promise.all([
    import('../manifest/component-registry.js'),
    readFile(new URL('../custom-elements.json', import.meta.url), 'utf8'),
  ]);
  let component = getComponent('sn-media-host');
  let declaration = JSON.parse(customElementsSource).modules
    .flatMap((module) => module.declarations || [])
    .find((item) => item.tagName === 'sn-media-host');
  let expected = ['activate'];

  assert.deepEqual(component.contract.methods.map((method) => method.name), expected);
  assert.deepEqual(declaration.members.filter((member) => member.kind === 'method').map((method) => method.name), expected);
  assert.deepEqual(declaration.contract.methods.map((method) => method.name), expected);
  assert.deepEqual(declaration.metadata.contract.methods.map((method) => method.name), expected);
});

test('MediaHost is exported and registered', () => {
  assert.equal(typeof MediaHost, 'function');
  assert.ok(customElements.get('sn-media-host'), 'sn-media-host is defined');
});
