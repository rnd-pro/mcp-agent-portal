import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';

class TestCSSStyleSheet {
  replaceSync(text) {
    this.cssText = text;
  }
}

let testWindow = null;

function installDom() {
  if (testWindow) {
    testWindow.document.body.innerHTML = '';
    testWindow.document.adoptedStyleSheets = [];
    return;
  }

  let { window } = parseHTML('<!doctype html><html><body></body></html>');
  testWindow = window;
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
  });
  window.document.adoptedStyleSheets = [];
}

async function nextRenderTick() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('DOM: sn-source-diff rendering, layout toggle, comment triggers and hunk actions', async () => {
  installDom();

  let { SourceDiff } = await import('../display/SourceDiff/SourceDiff.js');
  if (!customElements.get('sn-source-diff')) {
    customElements.define('sn-source-diff', SourceDiff);
  }

  let diffEl = document.createElement('sn-source-diff');
  document.body.append(diffEl);
  await nextRenderTick();

  // Load sample diff data
  diffEl.setDiffData({
    path: 'lib/math.js',
    hunks: [
      {
        header: '@@ -1,3 +1,4 @@',
        lines: [
          { type: 'normal', originalLineNumber: 1, modifiedLineNumber: 1, content: 'export function add(a, b) {' },
          { type: 'deletion', originalLineNumber: 2, modifiedLineNumber: null, content: '  return a + b;' },
          {
            type: 'addition',
            originalLineNumber: null,
            modifiedLineNumber: 2,
            content: '  // compute sum',
            diagnostics: [{ severity: 'warning', message: 'Missing JSDoc' }],
          },
          { type: 'addition', originalLineNumber: null, modifiedLineNumber: 3, content: '  return a + b;' },
          { type: 'normal', originalLineNumber: 3, modifiedLineNumber: 4, content: '}' }
        ]
      }
    ]
  });
  await nextRenderTick();

  // Basic stats text check
  assert.equal(diffEl.$.statsText, '+2 -1 lines');
  assert.equal(Object.hasOwn(diffEl, '_diffData'), false);
  assert.equal(diffEl.getDiffData().path, 'lib/math.js');

  // Verify unified mode rendering (default)
  let rows = diffEl.querySelectorAll('.sn-source-diff-row');
  assert.equal(rows.length, 5);
  assert.ok(rows[1].classList.contains('sn-source-diff-line-delete'));
  assert.ok(rows[2].classList.contains('sn-source-diff-line-add'));
  let diagnostic = diffEl.querySelector('.sn-source-diff-diagnostic');
  assert.ok(diagnostic);
  assert.equal(diagnostic.dataset.severity, 'warning');
  assert.equal(diagnostic.textContent, '1');

  // Event emission tracking
  let commentEvent = null;
  diffEl.addEventListener('sn-diff-comment-add', (e) => {
    commentEvent = e.detail;
  });

  let reviewAcceptEvent = null;
  diffEl.addEventListener('sn-review-accept', (e) => {
    reviewAcceptEvent = e.detail;
  });

  let requestChangeEvent = null;
  diffEl.addEventListener('sn-review-request-change', (e) => {
    requestChangeEvent = e.detail;
  });

  // Trigger comment button
  let firstCommentBtn = diffEl.querySelector('.sn-source-diff-comment-btn');
  assert.ok(firstCommentBtn);
  firstCommentBtn.dispatchEvent(new Event('click', { bubbles: true }));
  await nextRenderTick();

  assert.ok(commentEvent);
  assert.equal(commentEvent.path, 'lib/math.js');
  assert.equal(commentEvent.line, 1);

  // Trigger hunk accept action
  let acceptHunkBtn = diffEl.querySelector('.sn-source-diff-hunk-btn[data-action="accept"]');
  assert.ok(acceptHunkBtn);
  acceptHunkBtn.dispatchEvent(new Event('click', { bubbles: true }));
  await nextRenderTick();

  assert.ok(reviewAcceptEvent);
  assert.equal(reviewAcceptEvent.hunkIndex, 0);
  assert.equal(reviewAcceptEvent.mode, 'hunk');

  let requestHunkBtn = diffEl.querySelector('.sn-source-diff-hunk-btn[data-action="request-change"]');
  assert.ok(requestHunkBtn);
  requestHunkBtn.dispatchEvent(new Event('click', { bubbles: true }));
  await nextRenderTick();

  assert.ok(requestChangeEvent);
  assert.equal(requestChangeEvent.hunkIndex, 0);
  assert.equal(requestChangeEvent.mode, 'hunk');

  requestChangeEvent = null;
  diffEl.$.onRequestChanges();
  await nextRenderTick();

  assert.ok(requestChangeEvent);
  assert.equal(requestChangeEvent.mode, 'all');

  // Toggle layout mode to Side-by-Side
  diffEl.toggleAttribute('layout-toggle'); // Or click on mode btn
  diffEl.$.onToggleLayout();
  await nextRenderTick();

  assert.equal(diffEl.$.layout, 'side-by-side');

  // Side-by-side table rows rendering:
  // Pair 1: Normal line (normal left & normal right)
  // Pair 2: Deletion left & Addition right
  // Pair 3: Empty left & Addition right
  // Pair 4: Normal line
  // Total of 4 aligned rows!
  let sbsRows = diffEl.querySelectorAll('.sn-source-diff-side-by-side .sn-source-diff-row');
  assert.equal(sbsRows.length, 4);
});
