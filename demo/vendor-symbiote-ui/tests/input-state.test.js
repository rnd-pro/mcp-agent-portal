import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeChatInputState,
  CHAT_INPUT_PLACEHOLDER_KEYS,
} from '../chat/input-state.js';

test('subagent chat is always disabled with the subagent token', () => {
  assert.deepEqual(
    normalizeChatInputState({ isSubagent: true, hasModel: true, hasGroup: true }),
    { disabled: true, placeholderKey: CHAT_INPUT_PLACEHOLDER_KEYS.SUBAGENT }
  );
});

test('subagent precedence ignores missing model', () => {
  assert.deepEqual(
    normalizeChatInputState({ isSubagent: true, isModelRequired: true }),
    { disabled: true, placeholderKey: CHAT_INPUT_PLACEHOLDER_KEYS.SUBAGENT }
  );
});

test('model required but none selected and no group is disabled with missingModel', () => {
  assert.deepEqual(
    normalizeChatInputState({ isModelRequired: true, hasModel: false, hasGroup: false }),
    { disabled: true, placeholderKey: CHAT_INPUT_PLACEHOLDER_KEYS.MISSING_MODEL }
  );
});

test('disabled true when model required and nothing resolved', () => {
  let result = normalizeChatInputState({ isModelRequired: true });
  assert.equal(result.disabled, true);
  assert.equal(result.placeholderKey, CHAT_INPUT_PLACEHOLDER_KEYS.MISSING_MODEL);
});

test('a resource group satisfies the requirement', () => {
  assert.deepEqual(
    normalizeChatInputState({ isModelRequired: true, hasModel: false, hasGroup: true }),
    { disabled: false, placeholderKey: CHAT_INPUT_PLACEHOLDER_KEYS.READY }
  );
});

test('a selected model satisfies the requirement', () => {
  assert.deepEqual(
    normalizeChatInputState({ isModelRequired: true, hasModel: true, hasGroup: false }),
    { disabled: false, placeholderKey: CHAT_INPUT_PLACEHOLDER_KEYS.READY }
  );
});

test('model not required stays enabled even with nothing selected', () => {
  assert.deepEqual(
    normalizeChatInputState({ isModelRequired: false }),
    { disabled: false, placeholderKey: CHAT_INPUT_PLACEHOLDER_KEYS.READY }
  );
});

test('modelInfo present yields the modelInfo token when enabled', () => {
  assert.deepEqual(
    normalizeChatInputState({ hasModel: true, modelInfo: 'openai / gpt-4o' }),
    { disabled: false, placeholderKey: CHAT_INPUT_PLACEHOLDER_KEYS.MODEL_INFO }
  );
});

test('whitespace-only modelInfo is treated as empty', () => {
  assert.equal(
    normalizeChatInputState({ hasModel: true, modelInfo: '   ' }).placeholderKey,
    CHAT_INPUT_PLACEHOLDER_KEYS.READY
  );
});

test('modelInfo is ignored while disabled', () => {
  assert.deepEqual(
    normalizeChatInputState({ isModelRequired: true, modelInfo: 'openai / gpt-4o' }),
    { disabled: true, placeholderKey: CHAT_INPUT_PLACEHOLDER_KEYS.MISSING_MODEL }
  );
});

test('defaults with no arguments are ready and enabled', () => {
  assert.deepEqual(normalizeChatInputState(), {
    disabled: false,
    placeholderKey: CHAT_INPUT_PLACEHOLDER_KEYS.READY,
  });
});

test('placeholder keys are stable tokens, not localized text', () => {
  assert.equal(CHAT_INPUT_PLACEHOLDER_KEYS.SUBAGENT, 'chat.placeholder.subagent');
  assert.equal(CHAT_INPUT_PLACEHOLDER_KEYS.MISSING_MODEL, 'chat.placeholder.missingModel');
  assert.equal(CHAT_INPUT_PLACEHOLDER_KEYS.READY, 'chat.placeholder.ready');
  assert.throws(() => {
    CHAT_INPUT_PLACEHOLDER_KEYS.READY = 'mutated';
  }, TypeError);
});
