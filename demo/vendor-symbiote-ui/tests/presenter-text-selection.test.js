import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import {
  PRESENTER_TEXT_SELECTION_RECEIPT_VERSION,
  PresenterTextSelectionError,
  applyPresenterTextSelection,
} from '../chat/presenter-text-selection.js';

function installSelection(window) {
  let ranges = [];
  class TestRange {
    setStart(node, offset) {
      this.startContainer = node;
      this.startOffset = offset;
    }

    setEnd(node, offset) {
      this.endContainer = node;
      this.endOffset = offset;
    }

    cloneRange() {
      let copy = new TestRange();
      copy.startContainer = this.startContainer;
      copy.startOffset = this.startOffset;
      copy.endContainer = this.endContainer;
      copy.endOffset = this.endOffset;
      return copy;
    }
  }
  let selection = {
    get rangeCount() {
      return ranges.length;
    },
    getRangeAt(index) {
      return ranges[index];
    },
    removeAllRanges() {
      ranges = [];
    },
    addRange(range) {
      ranges.push(range);
    },
  };
  Object.defineProperty(window, 'getSelection', { configurable: true, value: () => selection });
  Object.defineProperty(window.document, 'createRange', {
    configurable: true,
    value: () => new TestRange(),
  });
  return selection;
}

test('selects a quote across DOM text nodes and restores the prior range', () => {
  let { window } = parseHTML('<!doctype html><p id="target">Alpha <strong>verified</strong> outcome ready.</p>');
  let selection = installSelection(window);
  let target = window.document.getElementById('target');
  target.focus = () => {};
  let prior = window.document.createRange();
  prior.setStart(target.firstChild, 0);
  prior.setEnd(target.firstChild, 5);
  selection.addRange(prior);

  let handle = applyPresenterTextSelection(target, { quote: 'verified outcome' });
  let active = selection.getRangeAt(0);

  assert.equal(handle.receipt.version, PRESENTER_TEXT_SELECTION_RECEIPT_VERSION);
  assert.equal(handle.receipt.kind, 'dom-range');
  assert.equal(handle.receipt.selectedText, 'verified outcome');
  assert.equal(active.startContainer.data, 'verified');
  assert.equal(active.startOffset, 0);
  assert.equal(active.endContainer.data, ' outcome ready.');
  assert.equal(active.endOffset, 8);
  assert.equal(handle.state, 'active');

  handle.clear();
  assert.equal(selection.rangeCount, 0);
  assert.equal(handle.state, 'cleared');
  handle.restore();
  assert.equal(selection.rangeCount, 1);
  assert.equal(selection.getRangeAt(0).startContainer, target.firstChild);
  assert.equal(selection.getRangeAt(0).endOffset, 5);
  assert.equal(handle.state, 'restored');
});

test('normalizes whitespace while preserving exact selected DOM offsets', () => {
  let { window } = parseHTML('<!doctype html><p id="target">Alpha   <span>verified\n outcome</span> ready.</p>');
  let selection = installSelection(window);
  let target = window.document.getElementById('target');
  target.focus = () => {};

  let handle = applyPresenterTextSelection(target, {
    quote: 'Alpha verified outcome',
    matchMode: 'normalized',
  });

  assert.equal(handle.receipt.selectedText, 'Alpha   verified\n outcome');
  assert.equal(handle.receipt.startOffset, 0);
  assert.equal(handle.receipt.endOffset, 'Alpha   verified\n outcome'.length);
  assert.equal(selection.rangeCount, 1);
});

test('applies the DOM range after focus so browser focus cannot clear the selection', () => {
  let { window } = parseHTML('<!doctype html><p id="target">Work order 1009 is selected.</p>');
  let selection = installSelection(window);
  let target = window.document.getElementById('target');
  let focusCalls = 0;
  target.focus = () => {
    focusCalls += 1;
    selection.removeAllRanges();
  };

  let handle = applyPresenterTextSelection(target, { quote: '1009' });

  assert.equal(focusCalls, 1);
  assert.equal(handle.receipt.selectedText, '1009');
  assert.equal(selection.rangeCount, 1);
  assert.equal(selection.getRangeAt(0).startContainer, target.firstChild);
  assert.equal(selection.getRangeAt(0).startOffset, 11);
  assert.equal(selection.getRangeAt(0).endOffset, 15);
});

test('rejects ambiguous quotes until an occurrence is provided', () => {
  let { window } = parseHTML('<!doctype html><p id="target">ready, then ready again</p>');
  installSelection(window);
  let target = window.document.getElementById('target');

  assert.throws(
    () => applyPresenterTextSelection(target, { quote: 'ready' }),
    (error) => error instanceof PresenterTextSelectionError
      && error.code === 'quote-ambiguous'
      && error.details.matchCount === 2,
  );

  let handle = applyPresenterTextSelection(target, { quote: 'ready', occurrence: 2 });
  assert.equal(handle.receipt.occurrence, 2);
  assert.equal(handle.receipt.startOffset, 12);
});

test('selects and restores text-control ranges without DOM traversal', () => {
  let target = {
    value: 'status ready; status verified',
    selectionStart: 1,
    selectionEnd: 4,
    selectionDirection: 'backward',
    focusCalls: 0,
    focus() {
      this.focusCalls += 1;
    },
    setSelectionRange(start, end, direction) {
      this.selectionStart = start;
      this.selectionEnd = end;
      this.selectionDirection = direction;
    },
  };

  let handle = applyPresenterTextSelection(target, { quote: 'status', occurrence: 2 });
  assert.equal(handle.receipt.kind, 'control');
  assert.equal(handle.receipt.selectedText, 'status');
  assert.equal(target.selectionStart, 14);
  assert.equal(target.selectionEnd, 20);
  assert.equal(target.focusCalls, 1);

  handle.clear();
  assert.equal(target.selectionStart, 20);
  assert.equal(target.selectionEnd, 20);
  handle.restore();
  assert.equal(target.selectionStart, 1);
  assert.equal(target.selectionEnd, 4);
  assert.equal(target.selectionDirection, 'backward');
});

test('rejects a stale explicit range instead of selecting different text', () => {
  let target = {
    value: 'verified outcome',
    setSelectionRange() {},
  };

  assert.throws(
    () => applyPresenterTextSelection(target, {
      quote: 'verified outcome',
      startOffset: 1,
      endOffset: 8,
    }),
    (error) => error instanceof PresenterTextSelectionError && error.code === 'range-mismatch',
  );
});
