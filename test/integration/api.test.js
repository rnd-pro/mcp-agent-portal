import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

/**
 * Integration tests for web-server API endpoints.
 * Requires the server to be running (or starts it inline).
 * Run: node --test test/integration/api.test.js
 */

let BASE;

/**
 * Helper: make an HTTP request and return { status, body }.
 * @param {string} method
 * @param {string} path
 * @param {object} [data]
 * @returns {Promise<{ status: number, body: any }>}
 */
function request(method, path, data) {
  return new Promise((resolve, reject) => {
    let url = new URL(path, BASE);
    let options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    let req = http.request(options, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let raw = Buffer.concat(chunks).toString();
        let body;
        try { body = JSON.parse(raw); } catch { body = raw; }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

describe('web-server API', () => {

  it('GET /api/marketplace returns installed and available', async () => {
    // Discover port from environment or skip
    let port = process.env.PORTAL_PORT;
    if (!port) {
      console.log('  ⏭ Skipping: set PORTAL_PORT to run integration tests');
      return;
    }
    BASE = `http://127.0.0.1:${port}`;

    let { status, body } = await request('GET', '/api/marketplace');
    assert.equal(status, 200);
    assert.ok(body.installed !== undefined, 'response should have installed');
    assert.ok(Array.isArray(body.available), 'response should have available array');
    assert.ok(body.available.length > 0, 'mock registry should have entries');
  });

  it('GET /api/instances returns array', async () => {
    let port = process.env.PORTAL_PORT;
    if (!port) return;
    BASE = `http://127.0.0.1:${port}`;

    let { status, body } = await request('GET', '/api/instances');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body), 'instances should be an array');
  });
});
