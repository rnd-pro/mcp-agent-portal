import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('api-routes', () => {
  it('createRoutes returns a route map', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    
    // Mock proxyManager with minimal interface
    let mockProxyManager = {
      servers: new Map(),
      config: {},
      getStatus() { return []; },
    };
    
    let routes = createRoutes({ proxyManager: mockProxyManager, projectRoot: '/tmp' });
    assert.ok(routes, 'should return routes object');
    assert.ok(typeof routes === 'object', 'routes should be an object');
  });

  it('dispatch returns false for unknown routes', async () => {
    let { createRoutes, dispatch } = await import('../../src/node/server/api-routes.js');
    
    let mockProxyManager = {
      servers: new Map(),
      config: {},
      getStatus() { return []; },
    };
    
    let routes = createRoutes({ proxyManager: mockProxyManager, projectRoot: '/tmp' });
    
    // Mock req/res
    let req = { method: 'GET', url: '/api/nonexistent' };
    let res = { writeHead() {}, end() {} };
    
    let handled = dispatch(routes, req, res);
    assert.equal(handled, false, 'unknown route should not be handled');
  });
});
