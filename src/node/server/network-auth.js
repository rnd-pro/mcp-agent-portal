import crypto from 'node:crypto';
import { renderNetworkApprovalPage } from 'symbiote-node/display/network-approval-page';
import { json, parseBody } from './routes/http.js';

const COOKIE_NAME = 'ap_lan_session';
const PENDING_TTL_MS = 5 * 60 * 1000;

function now() {
  return Date.now();
}

export function isLocalRequest(req) {
  let address = req.socket?.remoteAddress || '';
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1'
    || address === 'localhost';
}

function parseCookies(header = '') {
  let cookies = new Map();
  for (let part of String(header).split(';')) {
    let [name, ...rest] = part.trim().split('=');
    if (!name) continue;
    cookies.set(name, decodeURIComponent(rest.join('=')));
  }
  return cookies;
}

function requestIdentity(req) {
  return {
    address: req.socket?.remoteAddress || '',
    userAgent: String(req.headers['user-agent'] || '').slice(0, 180),
    host: String(req.headers.host || ''),
  };
}

function serializePublicRequest(item) {
  return {
    id: item.id,
    address: item.address,
    userAgent: item.userAgent,
    host: item.host,
    createdAt: item.createdAt,
    approvedAt: item.approvedAt || null,
    rejectedAt: item.rejectedAt || null,
  };
}

function renderPendingPage(item) {
  return renderNetworkApprovalPage({
    requestId: item.id,
    address: item.address,
    text: {
      title: 'Agent Portal Network Approval',
      message: 'This network browser must be approved from an already authorized local Agent Portal browser.',
      approvedStatus: 'Approved. Opening Agent Portal...',
    },
  });
}

export function createNetworkAuthController() {
  let pending = new Map();
  let sessions = new Map();

  function cleanup() {
    let cutoff = now() - PENDING_TTL_MS;
    for (let [id, item] of pending) {
      if (item.createdAt < cutoff || item.rejectedAt) pending.delete(id);
    }
  }

  function createPending(req) {
    cleanup();
    let identity = requestIdentity(req);
    for (let item of pending.values()) {
      if (!item.approvedAt && !item.rejectedAt && item.address === identity.address && item.userAgent === identity.userAgent) {
        return item;
      }
    }
    let item = {
      id: crypto.randomUUID().slice(0, 8),
      createdAt: now(),
      ...identity,
    };
    pending.set(item.id, item);
    return item;
  }

  function isAuthorized(req) {
    if (isLocalRequest(req)) return true;
    let token = parseCookies(req.headers.cookie).get(COOKIE_NAME);
    return Boolean(token && sessions.has(token));
  }

  function requireNetworkAuthorization(req, res) {
    if (isAuthorized(req)) return true;
    let url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/api/network-auth/wait') return true;
    let item = createPending(req);
    if (url.pathname.startsWith('/api/')) {
      json(res, { error: 'network approval required', request: serializePublicRequest(item) }, 401);
      return false;
    }
    res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(renderPendingPage(item));
    return false;
  }

  function hasAuthorizedUpgrade(req) {
    return isAuthorized(req);
  }

  function approve(id) {
    cleanup();
    let item = pending.get(id);
    if (!item || item.rejectedAt) return null;
    item.approvedAt = now();
    item.sessionToken = crypto.randomBytes(24).toString('base64url');
    sessions.set(item.sessionToken, {
      createdAt: item.approvedAt,
      address: item.address,
      userAgent: item.userAgent,
    });
    return serializePublicRequest(item);
  }

  function reject(id) {
    let item = pending.get(id);
    if (!item) return null;
    item.rejectedAt = now();
    return serializePublicRequest(item);
  }

  function listPending() {
    cleanup();
    return Array.from(pending.values())
      .filter((item) => !item.approvedAt && !item.rejectedAt)
      .map(serializePublicRequest);
  }

  async function handleWait(req, res) {
    let url = new URL(req.url || '/', 'http://localhost');
    let id = url.searchParams.get('id');
    let item = id ? pending.get(id) : null;
    if (!item) {
      json(res, { ok: false, missing: true }, 404);
      return;
    }
    if (item.rejectedAt) {
      json(res, { ok: false, rejected: true });
      return;
    }
    if (!item.approvedAt || !item.sessionToken) {
      json(res, { ok: false, pending: true });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': `${COOKIE_NAME}=${encodeURIComponent(item.sessionToken)}; Path=/; SameSite=Lax`,
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ ok: true }));
  }

  function routes() {
    return {
      'GET /api/network-auth/pending': (req, res) => {
        if (!isLocalRequest(req)) {
          json(res, { error: 'local approval browser required' }, 403);
          return;
        }
        json(res, { pending: listPending() });
      },
      'POST /api/network-auth/approve': async (req, res) => {
        if (!isLocalRequest(req)) {
          json(res, { error: 'local approval browser required' }, 403);
          return;
        }
        let { id } = await parseBody(req);
        let request = approve(id);
        json(res, request ? { ok: true, request } : { error: 'request not found' }, request ? 200 : 404);
      },
      'POST /api/network-auth/reject': async (req, res) => {
        if (!isLocalRequest(req)) {
          json(res, { error: 'local approval browser required' }, 403);
          return;
        }
        let { id } = await parseBody(req);
        let request = reject(id);
        json(res, request ? { ok: true, request } : { error: 'request not found' }, request ? 200 : 404);
      },
      'GET /api/network-auth/wait': handleWait,
    };
  }

  return {
    approve,
    hasAuthorizedUpgrade,
    isAuthorized,
    listPending,
    reject,
    requireNetworkAuthorization,
    routes,
  };
}
