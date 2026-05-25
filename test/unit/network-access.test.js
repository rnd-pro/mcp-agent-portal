import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LAN_HOST,
  LOOPBACK_HOST,
  createNetworkAccessStatus,
  normalizeNetworkAccessConfig,
  resolveRequestedPort,
} from '../../src/node/server/network-access.js';

describe('network-access', () => {
  it('defaults to loopback-only access', () => {
    assert.deepEqual(normalizeNetworkAccessConfig({}, {}), {
      lanEnabled: false,
      bindHost: LOOPBACK_HOST,
      networkAuthRequired: true,
    });
  });

  it('binds all interfaces when LAN access is enabled', () => {
    assert.deepEqual(normalizeNetworkAccessConfig({ lanEnabled: true }, {}), {
      lanEnabled: true,
      bindHost: LAN_HOST,
      networkAuthRequired: true,
    });
  });

  it('allows an explicit bind host environment override', () => {
    assert.deepEqual(normalizeNetworkAccessConfig({}, { AGENT_PORTAL_BIND_HOST: '0.0.0.0' }), {
      lanEnabled: true,
      bindHost: LAN_HOST,
      networkAuthRequired: true,
    });
  });

  it('allows trusted gateway deployments to bind LAN without browser approval', () => {
    assert.deepEqual(normalizeNetworkAccessConfig({}, {
      AGENT_PORTAL_BIND_HOST: '0.0.0.0',
      AGENT_PORTAL_NETWORK_AUTH: '0',
    }), {
      lanEnabled: true,
      bindHost: LAN_HOST,
      networkAuthRequired: false,
    });
  });

  it('reports local and LAN URL surfaces from the effective config', () => {
    let status = createNetworkAccessStatus(57580, { lanEnabled: false, bindHost: LOOPBACK_HOST });
    assert.equal(status.localUrl, 'http://127.0.0.1:57580/');
    assert.deepEqual(status.lanUrls, []);
    assert.ok(Array.isArray(status.availableLanUrls));
    assert.equal(status.secureContextRequiredForXR, true);
    assert.equal(status.networkAuthRequired, true);
  });

  it('uses an explicit restart port when provided', () => {
    assert.equal(resolveRequestedPort({ AGENT_PORTAL_PORT: '51615' }), 51615);
    assert.equal(resolveRequestedPort({ AGENT_PORTAL_PORT: 'invalid' }), 0);
    assert.equal(resolveRequestedPort({}), 0);
  });
});
