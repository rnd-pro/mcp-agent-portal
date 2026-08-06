import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cmdAudit } from '../audit.js';

test('Audit: cmdAudit succeeds on actual repo files', async () => {
  let result = await cmdAudit({});
  assert.equal(result.command, 'audit');
  assert.ok(typeof result.valid === 'boolean');
  assert.ok(Array.isArray(result.errors));
  assert.ok(Array.isArray(result.warnings));
});
