import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';

let rvfcCallbacks = new WeakMap();

class TestCSSStyleSheet {
  replaceSync(text) {
    this.cssText = text;
  }
}

function installSsrDom() {
  let { window } = parseHTML('<!doctype html><html><body></body></html>');
  let assigned = {
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
  };
  let previous = new Map();
  for (let key of Object.keys(assigned)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  Object.assign(globalThis, assigned);
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
  window.HTMLElement.prototype.requestVideoFrameCallback = function requestVideoFrameCallback(callback) {
    let list = rvfcCallbacks.get(this) || [];
    let handle = (list.at(-1)?.handle || 0) + 1;
    list.push({ handle, callback });
    rvfcCallbacks.set(this, list);
    return handle;
  };
  window.HTMLElement.prototype.cancelVideoFrameCallback = function cancelVideoFrameCallback(handle) {
    let list = rvfcCallbacks.get(this) || [];
    rvfcCallbacks.set(this, list.filter((entry) => entry.handle !== handle));
  };
  return () => {
    for (let [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    rvfcCallbacks = new WeakMap();
  };
}

function pendingFrames(video) {
  return (rvfcCallbacks.get(video) || []).length;
}

function presentFrame(video, metadata = {}) {
  let list = rvfcCallbacks.get(video) || [];
  rvfcCallbacks.set(video, []);
  for (let { callback } of list) callback(metadata.presentationTime ?? 0, metadata);
}

async function nextRenderTick() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('VideoPlayer drives timeline progress from the frame clock, not timeupdate', async () => {
  let restore = installSsrDom();
  try {
    await import('../display/VideoPlayer/VideoPlayer.js');
    let el = document.createElement('sn-video-player');
    document.body.append(el);
    await nextRenderTick();

    let video = el.ref.video;
    video.duration = 4;
    assert.equal(pendingFrames(video), 1, 'the frame clock registers exactly one callback on connect');

    presentFrame(video, { mediaTime: 2, presentedFrames: 60, width: 1920, height: 1080 });
    assert.equal(el.ref.timeDisplay.textContent, '0:02 / 0:04');
    assert.equal(el.ref.scrubBar.value, '50');
    assert.equal(pendingFrames(video), 1, 'a fresh frame callback is re-queued');

    // A coarse timeupdate must not move authoritative per-frame progress.
    video.currentTime = 3.5;
    video.dispatchEvent(new Event('timeupdate'));
    await nextRenderTick();
    assert.equal(el.ref.timeDisplay.textContent, '0:02 / 0:04');
    assert.equal(el.ref.scrubBar.value, '50');

    el.remove();
    await nextRenderTick();
    assert.equal(pendingFrames(video), 0, 'disconnect cancels the pending frame callback');

    // A stale frame delivered after disconnect must not publish.
    presentFrame(video, { mediaTime: 3.9 });
    assert.equal(el.ref.timeDisplay.textContent, '0:02 / 0:04');
  } finally {
    restore();
  }
});
