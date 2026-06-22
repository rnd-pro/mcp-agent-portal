import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as gateway from '../../src/node/server/local-gateway.js';

// Self-heal API surface. `ensureGatewayAlive` is the heartbeat entrypoint backends call so the
// portal.local router survives the death of whichever backend happened to host it. We only assert the
// export here — invoking it binds the real :80/:8080 listener (a process-wide side effect that must not
// run in unit tests); the re-host/no-op behavior is exercised by the live backend restart instead.
describe('local-gateway self-heal', () => {
  it('exports ensureGatewayAlive as a callable heartbeat entrypoint', () => {
    assert.equal(typeof gateway.ensureGatewayAlive, 'function');
  });

  it('still exports the routing primitives it relies on', () => {
    assert.equal(typeof gateway.reconcileBackendRoutes, 'function');
    assert.equal(typeof gateway.registerService, 'function');
    assert.equal(typeof gateway.resolveGatewayRoute, 'function');
  });
});
