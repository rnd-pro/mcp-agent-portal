import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBoardNotificationTracker,
  ensureNotificationWidget,
  installBoardNotifier,
} from '../../web/common/board-notifier.js';

function board(boardId, cards) {
  return {
    boardId,
    cards,
    columns: [
      { id: 'ready', title: 'Tasks' },
      { id: 'in-progress', title: 'In Progress' },
      { id: 'done', title: 'Done' },
    ],
  };
}

describe('board notification tracker', () => {
  it('is silent on the first board observation', () => {
    let tracker = createBoardNotificationTracker();
    let events = tracker.observe(board('b', [{ id: 'c1', title: 'A', columnId: 'ready' }]));
    assert.deepEqual(events, []);
  });

  it('emits transition events after a card moves on a subsequent load', () => {
    let tracker = createBoardNotificationTracker();
    tracker.observe(board('b', [{ id: 'c1', title: 'A', columnId: 'ready' }]));
    let events = tracker.observe(board('b', [{ id: 'c1', title: 'A', columnId: 'in-progress' }]));
    assert.equal(events.length, 1);
    assert.equal(events[0].columnId, 'in-progress');
    assert.equal(events[0].type, 'task.started');
  });

  it('does not re-emit for a resting card across repeated loads', () => {
    let tracker = createBoardNotificationTracker();
    tracker.observe(board('b', [{ id: 'c1', title: 'A', columnId: 'ready' }]));
    assert.deepEqual(tracker.observe(board('b', [{ id: 'c1', title: 'A', columnId: 'ready' }])), []);
    assert.deepEqual(tracker.observe(board('b', [{ id: 'c1', title: 'A', columnId: 'ready' }])), []);
  });

  it('tracks each board id independently', () => {
    let tracker = createBoardNotificationTracker();
    tracker.observe(board('home', [{ id: 'c1', title: 'A', columnId: 'ready' }]));
    // First observation of a different board id stays silent.
    assert.deepEqual(tracker.observe(board('project', [{ id: 'p1', title: 'P', columnId: 'in-progress' }])), []);
    let events = tracker.observe(board('home', [{ id: 'c1', title: 'A', columnId: 'done' }]));
    assert.equal(events.length, 1);
    assert.equal(events[0].cardId, 'c1');
    assert.equal(tracker.size, 2);
  });

  it('reset forgets the baseline', () => {
    let tracker = createBoardNotificationTracker();
    tracker.observe(board('b', [{ id: 'c1', title: 'A', columnId: 'ready' }]));
    tracker.reset('b');
    // After reset the next observation is treated as a first observation again.
    assert.deepEqual(tracker.observe(board('b', [{ id: 'c1', title: 'A', columnId: 'in-progress' }])), []);
  });
});

// Minimal DOM doubles: an EventTarget-backed document and a recording widget.
function fakeDocument() {
  let listeners = new Map();
  let body = { appended: [], appendChild(node) { this.appended.push(node); } };
  let widgets = [];
  return {
    body,
    _widgets: widgets,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    dispatch(type, detail) {
      for (let fn of listeners.get(type) || []) fn({ type, detail });
    },
    querySelector(tag) {
      return widgets.find((w) => w.tag === tag) || null;
    },
    createElement(tag) {
      return { tag, attributes: {}, setAttribute(k, v) { this.attributes[k] = v; } };
    },
  };
}

function recordingWidget() {
  return { tag: 'notification-widget', notified: [], notify(event) { this.notified.push(event); } };
}

describe('installBoardNotifier', () => {
  it('feeds board transition events into the widget', () => {
    let doc = fakeDocument();
    let widget = recordingWidget();
    doc._widgets.push(widget);

    let stop = installBoardNotifier({ documentRef: doc });
    doc.dispatch('workflow-board-loaded', { board: board('b', [{ id: 'c1', title: 'A', columnId: 'ready' }]) });
    assert.equal(widget.notified.length, 0, 'first load is silent');

    doc.dispatch('workflow-board-loaded', { board: board('b', [{ id: 'c1', title: 'A', columnId: 'in-progress' }]) });
    assert.equal(widget.notified.length, 1);
    assert.equal(widget.notified[0].type, 'task.started');
    assert.equal(widget.notified[0].params.title, 'A');
    stop();
  });

  it('ignores events without a board payload', () => {
    let doc = fakeDocument();
    let widget = recordingWidget();
    doc._widgets.push(widget);
    installBoardNotifier({ documentRef: doc });
    doc.dispatch('workflow-board-loaded', {});
    doc.dispatch('workflow-board-loaded', { board: null });
    assert.equal(widget.notified.length, 0);
  });

  it('does nothing when no widget is mounted', () => {
    let doc = fakeDocument();
    let stop = installBoardNotifier({ documentRef: doc });
    doc.dispatch('workflow-board-loaded', { board: board('b', [{ id: 'c1', title: 'A', columnId: 'ready' }]) });
    doc.dispatch('workflow-board-loaded', { board: board('b', [{ id: 'c1', title: 'A', columnId: 'done' }]) });
    assert.doesNotThrow(() => stop());
  });

  it('stops delivering after unsubscribe', () => {
    let doc = fakeDocument();
    let widget = recordingWidget();
    doc._widgets.push(widget);
    let stop = installBoardNotifier({ documentRef: doc });
    doc.dispatch('workflow-board-loaded', { board: board('b', [{ id: 'c1', title: 'A', columnId: 'ready' }]) });
    stop();
    doc.dispatch('workflow-board-loaded', { board: board('b', [{ id: 'c1', title: 'A', columnId: 'in-progress' }]) });
    assert.equal(widget.notified.length, 0);
  });

  it('uses a custom getWidget resolver when provided', () => {
    let doc = fakeDocument();
    let widget = recordingWidget();
    let stop = installBoardNotifier({ documentRef: doc, getWidget: () => widget });
    doc.dispatch('workflow-board-loaded', { board: board('b', [{ id: 'c1', title: 'A', columnId: 'ready' }]) });
    doc.dispatch('workflow-board-loaded', { board: board('b', [{ id: 'c1', title: 'A', columnId: 'done' }]) });
    assert.equal(widget.notified.length, 1);
    assert.equal(widget.notified[0].type, 'task.completed');
    stop();
  });
});

describe('ensureNotificationWidget', () => {
  it('mounts a single widget on the document body', () => {
    let doc = fakeDocument();
    let created = ensureNotificationWidget({ documentRef: doc, storageKey: 'agentPortal.notifications' });
    assert.equal(created.tag, 'notification-widget');
    assert.equal(created.attributes['storage-key'], 'agentPortal.notifications');
    assert.equal(doc.body.appended.length, 1);
    // Register it so the next call finds it instead of mounting a second one.
    doc._widgets.push(created);
    let again = ensureNotificationWidget({ documentRef: doc });
    assert.equal(again, created);
    assert.equal(doc.body.appended.length, 1);
  });

  it('sets the widget locale so narration follows the interface language', () => {
    let doc = fakeDocument();
    let created = ensureNotificationWidget({ documentRef: doc, locale: 'ru' });
    assert.equal(created.attributes.locale, 'ru');
    doc._widgets.push(created);
    // A later call updates the locale on the existing widget without remounting.
    ensureNotificationWidget({ documentRef: doc, locale: 'es' });
    assert.equal(created.attributes.locale, 'es');
    assert.equal(doc.body.appended.length, 1);
  });

  it('mounts into the top bar before the theme widget when a top bar exists', () => {
    let theme = { tag: 'cascade-theme-widget' };
    let topbarRight = {
      children: [theme],
      querySelector(sel) { return sel === 'cascade-theme-widget' ? theme : null; },
      insertBefore(node, ref) {
        this.children.splice(this.children.indexOf(ref), 0, node);
        node.parentElement = this;
      },
      appendChild(node) { this.children.push(node); node.parentElement = this; },
    };
    let doc = fakeDocument();
    let baseQuery = doc.querySelector.bind(doc);
    doc.querySelector = (sel) =>
      /topbar-right/.test(sel) ? topbarRight : baseQuery(sel);

    let created = ensureNotificationWidget({ documentRef: doc, storageKey: 'k' });
    assert.equal(created.parentElement, topbarRight, 'mounted in the top bar');
    assert.equal(topbarRight.children[0], created, 'sits before the theme widget');
    assert.equal(topbarRight.children[1], theme);
    assert.equal(doc.body.appended.length, 0, 'not appended to the body');

    // Idempotent: a second call re-homes nothing and adds no duplicate.
    doc._widgets.push(created);
    let again = ensureNotificationWidget({ documentRef: doc });
    assert.equal(again, created);
    assert.equal(topbarRight.children.length, 2);
  });
});
