import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { createNetworkAuthController, isLocalRequest } from '../../src/node/server/network-auth.js';

function makeReq(method, url, { address = '192.168.1.20', cookie = '', body } = {}) {
  let req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = {
    host: '192.168.1.10:51615',
    'user-agent': 'Quest Browser',
    ...(cookie ? { cookie } : {}),
  };
  req.socket = { remoteAddress: address };
  req.destroy = (err) => req.emit('error', err);
  process.nextTick(() => {
    if (body !== undefined) req.emit('data', JSON.stringify(body));
    req.emit('end');
  });
  return req;
}

function makeRes() {
  return {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers = {}) {
      this.status = status;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

describe('network auth', () => {
  it('treats loopback requests as already authorized', () => {
    assert.equal(isLocalRequest(makeReq('GET', '/', { address: '127.0.0.1' })), true);
    assert.equal(isLocalRequest(makeReq('GET', '/', { address: '::ffff:127.0.0.1' })), true);
    assert.equal(isLocalRequest(makeReq('GET', '/', { address: '192.168.1.20' })), false);
  });

  it('requires approval for LAN browser requests', () => {
    let auth = createNetworkAuthController();
    let res = makeRes();
    let allowed = auth.requireNetworkAuthorization(makeReq('GET', '/'), res);

    assert.equal(allowed, false);
    assert.equal(res.status, 403);
    assert.match(res.body, /Waiting for local approval/);
    assert.match(res.body, /sn-network-approval-cell-bg/);
    assert.match(res.body, /sn-network-approval-canvas/);
    assert.match(res.body, /--sn-cell-bg/);
    assert.doesNotMatch(res.body, /ap-auth-/);
  assert.equal(auth.listPending().length, 1);
  });

  it('allows configured public diagnostic and asset paths without creating approval requests', () => {
    let auth = createNetworkAuthController({
      publicPaths: ['/xr-diagnostics.html', '/packages/'],
    });
    let diagnosticsRes = makeRes();
    let assetRes = makeRes();

    assert.equal(
      auth.requireNetworkAuthorization(makeReq('GET', '/xr-diagnostics.html'), diagnosticsRes),
      true,
    );
    assert.equal(
      auth.requireNetworkAuthorization(makeReq('GET', '/packages/symbiote-node/xr/index.js'), assetRes),
      true,
    );
    assert.equal(auth.listPending().length, 0);
  });

  it('approves a pending LAN request from a local route and issues a session cookie', async () => {
    let auth = createNetworkAuthController();
    let denied = makeRes();
    auth.requireNetworkAuthorization(makeReq('GET', '/'), denied);
    let [pending] = auth.listPending();

    let approveRes = makeRes();
    await auth.routes()['POST /api/network-auth/approve'](
      makeReq('POST', '/api/network-auth/approve', {
        address: '127.0.0.1',
        body: { id: pending.id },
      }),
      approveRes,
    );
    assert.equal(approveRes.status, 200);

    let waitRes = makeRes();
    await auth.routes()['GET /api/network-auth/wait'](
      makeReq('GET', `/api/network-auth/wait?id=${pending.id}`),
      waitRes,
    );
    assert.equal(waitRes.status, 200);
    assert.equal(waitRes.json().ok, true);
    assert.match(waitRes.headers['Set-Cookie'], /ap_lan_session=/);

    let cookie = waitRes.headers['Set-Cookie'].split(';')[0];
    assert.equal(auth.isAuthorized(makeReq('GET', '/', { cookie })), true);
  });

  it('does not allow LAN browsers to approve other LAN browsers', async () => {
    let auth = createNetworkAuthController();
    let res = makeRes();
    await auth.routes()['POST /api/network-auth/approve'](
      makeReq('POST', '/api/network-auth/approve', { body: { id: 'missing' } }),
      res,
    );
    assert.equal(res.status, 403);
  });
});
