import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import {
  createLiveCaptionTrack,
  inspectLiveCaptionOverflow,
  LiveCaptionController,
} from '../ui/live-captions.js';

function turns() {
  return [
    {
      cueId: 'intro',
      id: 'legacy-intro',
      index: 41,
      speaker: 'guide',
      text: 'Caption test one',
      startSec: 0,
      endSec: 1,
      wordTimings: [
        { text: 'Caption', startSec: 0.1, endSec: 0.35 },
        { text: 'test', startSec: 0.35, endSec: 0.6 },
        { text: 'one', startSec: 0.6, endSec: 0.9 },
      ],
    },
    {
      cueId: 'result',
      speaker: 'ops',
      text: 'Caption test two',
      startSec: 1,
      endSec: 2,
    },
  ];
}

function track(options = {}) {
  return createLiveCaptionTrack(turns(), {
    width: 1280,
    height: 720,
    captionStyle: { preset: 'youtube' },
    ...options,
  });
}

test('live captions remain Node-safe while retaining the engine track contract', () => {
  let originalDocument = globalThis.document;
  delete globalThis.document;
  try {
    let controller = new LiveCaptionController({ track: track() });
    assert.equal(controller.track.schemaVersion, 'caption-presentation-track-v2');
    assert.equal(controller.update(0.2).cueId, 'intro');
    assert.doesNotThrow(() => controller.dispose());
  } finally {
    globalThis.document = originalDocument;
  }
});

test('authored live turns require real timing and reject ad hoc tracks', () => {
  assert.throws(() => createLiveCaptionTrack([
    { cueId: 'missing-timing', speaker: 'guide', text: 'Missing timing', durationMs: 1000 },
  ], { width: 1280, height: 720 }), /requires explicit start and end timing/);
  assert.throws(() => new LiveCaptionController({
    track: { cues: [{ text: 'legacy' }] },
  }), /caption-presentation-track-v2/);
});

test('live captions require explicit cueId and reject legacy identity aliases', () => {
  let base = { speaker: 'guide', text: 'Canonical identity', startSec: 0, endSec: 1 };
  assert.throws(
    () => createLiveCaptionTrack([{ ...base, id: 'legacy-id' }], { width: 1280, height: 720 }),
    /requires a non-empty cueId/,
  );
  assert.throws(
    () => createLiveCaptionTrack([{ ...base, index: 7 }], { width: 1280, height: 720 }),
    /requires a non-empty cueId/,
  );
  assert.throws(
    () => createLiveCaptionTrack([{ ...base, cueId: '   ' }], { width: 1280, height: 720 }),
    /requires a non-empty cueId/,
  );

  let result = createLiveCaptionTrack([{
    ...base,
    cueId: 'caption:canonical-live',
    id: 'legacy-id',
    index: 7,
  }], { width: 1280, height: 720 });
  assert.equal(result.cues[0].cueId, 'caption:canonical-live');
});

test('live captions use the rendered five-word cue cadence for timed authored speech', () => {
  let text = 'Now the workspace explains the result without hiding the active input.';
  let tokens = text.split(/\s+/);
  let result = createLiveCaptionTrack([{
    cueId: 'guide-result',
    speaker: 'guide',
    text,
    startSec: 0,
    endSec: 4,
    wordTimings: tokens.map((token, index) => ({
      text: token,
      startSec: (index * 4) / tokens.length,
      endSec: ((index + 1) * 4) / tokens.length,
    })),
  }], {
    width: 1080,
    height: 1920,
    captionStyle: { preset: 'tiktok' },
  });

  assert.deepEqual(result.cues.map((cue) => cue.cueId), [
    'guide-result',
    'guide-result:2',
    'guide-result:3',
  ]);
  assert.equal(result.cues.map((cue) => cue.text).join(' '), text);
  assert.equal(result.cues[0].startSec, 0);
  assert.equal(result.cues.at(-1).endSec, 4);
  assert.ok(result.cues.every((cue) => cue.wordTimings.length <= 5));
  assert.ok(result.cues.every((cue) => cue.wrappedLines.length <= result.profile.maxLines));
});

test('engine placement moves live captions away from attention regions', () => {
  let result = track({
    avoidRegions: [
      { id: 'active-editor', kind: 'attention', x: 0, y: 420, width: 1280, height: 300 },
    ],
  });

  assert.equal(result.profile.preset, 'youtube');
  assert.equal(result.cues[0].placement.zone, 'top');
  assert.deepEqual(result.cues[0].decisionEvidence.activeAvoidRegionIds, ['active-editor']);
});

test('live visual, karaoke, and accessibility output use the same placement track', () => {
  let { window } = parseHTML('<!doctype html><html><body><div id="container"></div></body></html>');
  let container = window.document.getElementById('container');
  container.getBoundingClientRect = () => ({ width: 640, height: 360 });
  let changes = [];
  let changedFrames = [];
  let placementTrack = track({
    avoidRegions: [
      { id: 'active-editor', kind: 'attention', x: 0, y: 420, width: 1280, height: 300 },
    ],
  });
  let controller = new LiveCaptionController({
    container,
    document: window.document,
    track: placementTrack,
    onCueChange: (cue, frame) => {
      changes.push(cue.cueId);
      changedFrames.push({
        timeSec: frame.timeSec,
        visualText: frame.visualElement.textContent,
        accessibleText: frame.ariaLiveElement.textContent,
        overflow: frame.overflowEvidence.overflow,
      });
    },
  });
  let visual = container.querySelector('.sn-live-captions-visual');
  let announcer = container.querySelector('.sn-live-captions-sr-only');

  assert.equal(visual.getAttribute('aria-hidden'), 'true');
  assert.equal(announcer.getAttribute('aria-live'), 'polite');
  assert.equal(announcer.getAttribute('aria-atomic'), 'true');

  controller.update(0.2);
  let cue = placementTrack.cues[0];
  assert.equal(visual.style.display, 'block');
  assert.equal(visual.style.left, `${cue.measuredRect.x * 0.5}px`);
  assert.equal(visual.style.top, `${cue.measuredRect.y * 0.5}px`);
  assert.equal(visual.style.width, `${cue.measuredRect.width * 0.5}px`);
  assert.equal(visual.style.fontSize, `${cue.fontSize * 0.5}px`);
  assert.equal(visual.style.lineHeight, `${cue.lineHeight * 0.5}px`);
  assert.equal(visual.style.fontWeight, '700');
  assert.match(visual.textContent, /GUIDE: Caption test one/);
  assert.equal(visual.querySelectorAll('.sn-live-captions-word-active').length, 1);
  assert.equal(announcer.textContent, 'guide: Caption test one');
  assert.deepEqual(changes, ['intro']);
  assert.deepEqual(changedFrames, [{
    timeSec: 0.2,
    visualText: 'GUIDE: Caption test one',
    accessibleText: 'guide: Caption test one',
    overflow: false,
  }]);

  controller.update(0.5);
  assert.equal(announcer.textContent, 'guide: Caption test one');
  assert.deepEqual(changes, ['intro']);

  controller.update(2.5);
  assert.equal(visual.style.display, 'none');
  controller.update(0.2);
  assert.deepEqual(changes, ['intro', 'intro']);

  controller.dispose();
  assert.ok(window.document.getElementById('container'));
  assert.equal(container.querySelector('.sn-live-captions-visual'), null);
  assert.equal(container.style.position, '');
});

test('live captions render the cue-level font selected for a narrow safe shelf', () => {
  let { window } = parseHTML('<!doctype html><html><body><div id="container"></div></body></html>');
  let container = window.document.getElementById('container');
  container.getBoundingClientRect = () => ({ width: 1080, height: 1080 });
  let placementTrack = createLiveCaptionTrack([{
    cueId: 'proof-explain-map:caption-3',
    speaker: 'ops',
    text: 'double-clicking empty space to',
    startSec: 0,
    endSec: 2,
  }], {
    width: 1080,
    height: 1080,
    captionStyle: { preset: 'square', fontSize: 43 },
    safeInsets: { top: 54, right: 54, bottom: 54, left: 54 },
    avoidRegions: [
      { id: 'focus', kind: 'focus', x: 54, y: 109, width: 667.609, height: 917, startSec: 0, endSec: 2 },
      { id: 'action', kind: 'action', x: 54, y: 109, width: 667.609, height: 917, startSec: 0, endSec: 2 },
      { id: 'annotation', kind: 'annotation', x: 733.609, y: 109, width: 120, height: 40, startSec: 0, endSec: 2 },
      { id: 'chrome', kind: 'persistent-chrome', x: 0, y: 0, width: 1080, height: 110, startSec: 0, endSec: 2 },
      { id: 'player', kind: 'critical-control', x: 771.609, y: 794.5, width: 291.391, height: 118, startSec: 0, endSec: 2 },
      { id: 'composer', kind: 'critical-control', x: 755.609, y: 935, width: 323.391, height: 144, startSec: 0, endSec: 2 },
    ],
  });
  let cue = placementTrack.cues[0];
  let controller = new LiveCaptionController({
    container,
    document: window.document,
    track: placementTrack,
  });

  controller.update(0.5);
  let visual = container.querySelector('.sn-live-captions-visual');
  assert.equal(placementTrack.profile.fontSize, 43);
  assert.equal(cue.fontSize, 41);
  assert.equal(visual.style.fontSize, '41px');
  assert.equal(visual.style.lineHeight, '53px');
  assert.deepEqual(
    [...visual.querySelectorAll('.sn-live-captions-line')].map((line) => line.textContent),
    ['OPS:', 'double-clicking', 'empty space', 'to'],
  );
  controller.dispose();
});

test('live caption overflow inspection reports clipped lines and vertical content', () => {
  let result = inspectLiveCaptionOverflow({
    clientHeight: 120,
    scrollHeight: 150,
    querySelectorAll() {
      return [
        { textContent: 'fits', clientWidth: 320, scrollWidth: 300 },
        { textContent: 'interaction', clientWidth: 320, scrollWidth: 343 },
      ];
    },
  });

  assert.equal(result.overflow, true);
  assert.equal(result.widthOverflow, true);
  assert.equal(result.heightOverflow, true);
  assert.deepEqual(result.lines.map((line) => line.overflow), [false, true]);
});

test('evidence-only captions emit rendered cue hooks without painting pixels', () => {
  let { window } = parseHTML('<!doctype html><html><body><div id="container"></div></body></html>');
  let container = window.document.getElementById('container');
  container.getBoundingClientRect = () => ({ width: 1280, height: 720 });
  let observed = null;
  let controller = new LiveCaptionController({
    container,
    document: window.document,
    track: track(),
    visualEnabled: false,
    onCueChange(cue, frame) {
      observed = {
        cueId: cue.cueId,
        timeSec: frame.timeSec,
        visualText: frame.visualElement.textContent,
        accessibleText: frame.ariaLiveElement.textContent,
      };
    },
  });

  controller.update(0.2);
  assert.equal(container.querySelector('.sn-live-captions-visual').style.display, 'none');
  assert.deepEqual(observed, {
    cueId: 'intro',
    timeSec: 0.2,
    visualText: 'GUIDE: Caption test one',
    accessibleText: 'guide: Caption test one',
  });
  controller.dispose();
});

test('cue lookahead selects the next caption while reporting and rendering actual media time', () => {
  let { window } = parseHTML('<!doctype html><html><body><div id="container"></div></body></html>');
  let container = window.document.getElementById('container');
  container.getBoundingClientRect = () => ({ width: 1280, height: 720 });
  let observed = null;
  let controller = new LiveCaptionController({
    container,
    document: window.document,
    track: track(),
    cueLookaheadSec: 0.05,
    onCueChange(cue, frame) {
      observed = { cueId: cue.cueId, timeSec: frame.timeSec };
    },
  });

  assert.equal(controller.update(0.97).cueId, 'result');
  assert.deepEqual(observed, { cueId: 'result', timeSec: 0.97 });
  assert.equal(container.querySelector('.sn-live-captions-word-past'), null);
  assert.throws(
    () => new LiveCaptionController({ track: track(), cueLookaheadSec: -0.01 }),
    /cueLookaheadSec must be a finite non-negative number/,
  );
  controller.dispose();
});

test('setTrack atomically replaces live cue geometry and clock cleanup is scoped', () => {
  let { window } = parseHTML('<!doctype html><html><body><div id="container"></div></body></html>');
  let container = window.document.getElementById('container');
  container.getBoundingClientRect = () => ({ width: 1080, height: 1920 });
  let listener = null;
  let removed = null;
  let clock = {
    currentTimeSec: 0.2,
    addEventListener(name, callback) { listener = { name, callback }; },
    removeEventListener(name, callback) { removed = { name, callback }; },
  };
  let controller = new LiveCaptionController({
    container,
    document: window.document,
    clock,
    track: track(),
  });
  let vertical = createLiveCaptionTrack(turns(), {
    width: 1080,
    height: 1920,
    captionStyle: { preset: 'tiktok', fontSize: 72 },
  });

  controller.setTrack(vertical);
  listener.callback();
  assert.equal(listener.name, 'timeupdate');
  assert.equal(controller.track.profile.preset, 'tiktok');
  assert.equal(container.querySelector('.sn-live-captions-visual').style.fontSize, '72px');
  assert.equal(container.querySelector('.sn-live-captions-visual').style.fontWeight, '400');

  controller.dispose();
  assert.deepEqual(removed, listener);
});
