import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveVerifiedSlug } from '../../src/node/server/agent-identity-resolver.js';
import { TaskSecretStore } from '../../packages/agent-pool-mcp/src/runner/task-secret-store.js';

describe('agent identity resolver', () => {
  let tmpDir;
  let store;
  let now;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-identity-resolver-'));
    now = 1000;
    store = new TaskSecretStore({ dir: tmpDir, now: () => now });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves a minted secret to its server-assigned slug', () => {
    let { secret } = store.mint({ taskId: 't1', serverAssignedSlug: 'reviewer' });

    assert.equal(resolveVerifiedSlug(secret, { store }), 'reviewer');
  });

  it('returns null for a wrong, absent, or garbage secret', () => {
    store.mint({ taskId: 't1', serverAssignedSlug: 'reviewer' });

    assert.equal(resolveVerifiedSlug('not-the-secret', { store }), null);
    assert.equal(resolveVerifiedSlug('', { store }), null);
    assert.equal(resolveVerifiedSlug(undefined, { store }), null);
    assert.equal(resolveVerifiedSlug(null, { store }), null);
    assert.equal(resolveVerifiedSlug(42, { store }), null);
  });

  it('returns null once the binding has expired', () => {
    let shortStore = new TaskSecretStore({ dir: tmpDir, now: () => now, ttlMs: 100 });
    let { secret } = shortStore.mint({ taskId: 't1', serverAssignedSlug: 'reviewer' });

    assert.equal(resolveVerifiedSlug(secret, { store: shortStore }), 'reviewer');
    now += 200;
    assert.equal(resolveVerifiedSlug(secret, { store: shortStore }), null);
  });

  it('returns null once the binding is revoked', () => {
    let { secret } = store.mint({ taskId: 't1', serverAssignedSlug: 'reviewer' });
    store.revoke(secret);

    assert.equal(resolveVerifiedSlug(secret, { store }), null);
  });

  it('returns null when the bound slug is absent (fail-closed)', () => {
    let { secret } = store.mint({ taskId: 't1' });

    assert.equal(resolveVerifiedSlug(secret, { store }), null);
  });

  it('returns null and never throws when the store lookup fails', () => {
    let throwingStore = { resolve() { throw new Error('unreadable store'); } };

    assert.equal(resolveVerifiedSlug('any-secret', { store: throwingStore }), null);
  });
});
