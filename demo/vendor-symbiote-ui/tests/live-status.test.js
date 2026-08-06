import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MESSAGE_STREAMING_PHASE,
  createLiveStatusMeta,
  advanceStreamingPhase,
} from '../chat/live-status.js';

test('MESSAGE_STREAMING_PHASE is a frozen enum of the three phases', () => {
  assert.deepEqual(MESSAGE_STREAMING_PHASE, {
    THINKING: 'thinking',
    TOOL: 'tool',
    RESPONDING: 'responding',
  });
  assert.ok(Object.isFrozen(MESSAGE_STREAMING_PHASE));
});

test('createLiveStatusMeta builds an idle meta by default', () => {
  assert.deepEqual(createLiveStatusMeta(), {
    phase: null,
    messageCount: 0,
    lastToolName: null,
    thinkingStatus: '',
    active: false,
  });
});

test('createLiveStatusMeta normalizes overrides and unknown phases', () => {
  assert.deepEqual(createLiveStatusMeta({ phase: 'tool', messageCount: '3', lastToolName: '  Bash ' }), {
    phase: 'tool',
    messageCount: 3,
    lastToolName: 'Bash',
    thinkingStatus: '',
    active: true,
  });
  let unknown = createLiveStatusMeta({ phase: 'bogus', messageCount: -5 });
  assert.equal(unknown.phase, null);
  assert.equal(unknown.active, false);
  assert.equal(unknown.messageCount, 0);
});

test('full transition: start → thinking → tool → responding → clear', () => {
  let meta = createLiveStatusMeta();

  meta = advanceStreamingPhase(meta, { type: 'start' });
  assert.equal(meta.phase, MESSAGE_STREAMING_PHASE.THINKING);
  assert.equal(meta.active, true);
  assert.equal(meta.messageCount, 0);
  assert.equal(meta.lastToolName, null);

  meta = advanceStreamingPhase(meta, { type: 'meta', phase: 'thinking', messageCount: 1, thinkingStatus: 'Planning' });
  assert.equal(meta.phase, 'thinking');
  assert.equal(meta.messageCount, 1);
  assert.equal(meta.thinkingStatus, 'Planning');

  meta = advanceStreamingPhase(meta, { type: 'meta', phase: 'tool', messageCount: 2, lastToolName: 'Read' });
  assert.equal(meta.phase, 'tool');
  assert.equal(meta.messageCount, 2);
  assert.equal(meta.lastToolName, 'Read');
  assert.equal(meta.thinkingStatus, '', 'tool phase clears the thinking note');

  meta = advanceStreamingPhase(meta, { type: 'meta', phase: 'responding', messageCount: 3 });
  assert.equal(meta.phase, 'responding');
  assert.equal(meta.messageCount, 3);
  assert.equal(meta.lastToolName, null, 'non-tool phase clears the tool name');

  meta = advanceStreamingPhase(meta, { type: 'clear' });
  assert.deepEqual(meta, createLiveStatusMeta());
});

test('tool phase carries forward the last tool name when a meta omits it', () => {
  let meta = advanceStreamingPhase(createLiveStatusMeta(), { type: 'meta', phase: 'tool', lastToolName: 'Grep', messageCount: 5 });
  assert.equal(meta.lastToolName, 'Grep');
  let next = advanceStreamingPhase(meta, { type: 'meta', phase: 'tool', messageCount: 6 });
  assert.equal(next.lastToolName, 'Grep', 'keeps prior tool name when none supplied');
  assert.equal(next.messageCount, 6);
});

test('meta without messageCount carries forward the running count', () => {
  let meta = createLiveStatusMeta({ phase: 'thinking', messageCount: 7 });
  let next = advanceStreamingPhase(meta, { type: 'meta', phase: 'responding' });
  assert.equal(next.messageCount, 7);
});

test('meta with an unknown phase is a no-op (normalized copy)', () => {
  let meta = createLiveStatusMeta({ phase: 'tool', messageCount: 2, lastToolName: 'Edit' });
  let next = advanceStreamingPhase(meta, { type: 'meta', phase: 'nope' });
  assert.deepEqual(next, meta);
});

test('reconnecting and reconnected set a thinking phase with a default status', () => {
  let base = createLiveStatusMeta({ phase: 'tool', messageCount: 4, lastToolName: 'Bash' });

  let reconnecting = advanceStreamingPhase(base, { type: 'reconnecting' });
  assert.equal(reconnecting.phase, 'thinking');
  assert.equal(reconnecting.thinkingStatus, 'Reconnecting...');
  assert.equal(reconnecting.messageCount, 4, 'preserves running count');
  assert.equal(reconnecting.lastToolName, null);

  let reconnected = advanceStreamingPhase(base, { type: 'reconnected', status: 'Back online' });
  assert.equal(reconnected.phase, 'thinking');
  assert.equal(reconnected.thinkingStatus, 'Back online', 'explicit status wins');
});

test('unknown event types leave the meta unchanged', () => {
  let meta = createLiveStatusMeta({ phase: 'responding', messageCount: 2 });
  assert.deepEqual(advanceStreamingPhase(meta, { type: 'wat' }), meta);
  assert.deepEqual(advanceStreamingPhase(meta, 'also-string'), meta);
});

test('advanceStreamingPhase does not mutate its input', () => {
  let meta = createLiveStatusMeta({ phase: 'thinking', messageCount: 1 });
  let snapshot = { ...meta };
  advanceStreamingPhase(meta, { type: 'meta', phase: 'tool', lastToolName: 'X', messageCount: 9 });
  assert.deepEqual(meta, snapshot);
});

test('tolerates a null/garbage starting meta', () => {
  let meta = advanceStreamingPhase(null, { type: 'start' });
  assert.equal(meta.phase, 'thinking');
  assert.deepEqual(advanceStreamingPhase(undefined, { type: 'clear' }), createLiveStatusMeta());
});
