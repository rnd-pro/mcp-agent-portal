import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function makeReq(method, url, body) {
  let req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.destroy = (err) => req.emit('error', err);
  process.nextTick(() => {
    if (body !== undefined) req.emit('data', JSON.stringify(body));
    req.emit('end');
  });
  return req;
}

function makeRes() {
  let res = {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) {
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
  return res;
}

function makeRoutes(projectRoot = '/tmp') {
  return {
    proxyManager: { servers: new Map(), config: {}, getStatus() { return []; } },
    projectRoot,
  };
}

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

  it('POST /api/ui rejects non-UI state paths', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');

    let routes = createRoutes(makeRoutes());

    let req = {
      on(event, cb) {
        if (event === 'data') cb(JSON.stringify({ path: 'settings/mcpServers', value: {} }));
        if (event === 'end') cb();
      },
    };
    let status;
    let payload;
    let res = {
      writeHead(code) { status = code; },
      end(body) { payload = JSON.parse(body); },
    };

    await routes['POST /api/ui'](req, res);

    assert.equal(status, 400);
    assert.match(payload.error, /Invalid UI state path/);
  });

  it('POST /api/agent-portal/file only writes editable public markdown or JSON content', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-agent-tree-'));
    let routes = createRoutes(makeRoutes(tmpDir));

    let okReq = makeReq('POST', '/api/agent-portal/file', {
      path: 'skills/code/example.md',
      content: '# Example\n',
    });
    let okRes = makeRes();
    await routes['POST /api/agent-portal/file'](okReq, okRes);

    assert.equal(okRes.status, 200);
    assert.equal(await fs.readFile(path.join(tmpDir, '.agent-portal/skills/code/example.md'), 'utf8'), '# Example\n');

    let deniedReq = makeReq('POST', '/api/agent-portal/file', {
      path: 'runtime/state.json',
      content: '{}',
    });
    let deniedRes = makeRes();
    await routes['POST /api/agent-portal/file'](deniedReq, deniedRes);

    assert.equal(deniedRes.status, 400);
    assert.match(deniedRes.json().error, /not editable public|local portal state/);
  });

  it('rejects .agent-portal file symlinks that escape the project portal root', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-agent-symlink-'));
    let outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-agent-outside-'));
    let skillDir = path.join(tmpDir, '.agent-portal/skills/code');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(outsideDir, 'secret.md'), '# secret\n');
    await fs.symlink(path.join(outsideDir, 'secret.md'), path.join(skillDir, 'leak.md'));

    let routes = createRoutes(makeRoutes(tmpDir));
    let readReq = makeReq('GET', '/api/agent-portal/file?path=skills%2Fcode%2Fleak.md');
    let readRes = makeRes();
    await routes['GET /api/agent-portal/file'](readReq, readRes);

    assert.equal(readRes.status, 400);
    assert.match(readRes.json().error, /must stay inside configured root/);

    let writeReq = makeReq('POST', '/api/agent-portal/file', {
      path: 'skills/code/leak.md',
      content: '# overwritten\n',
    });
    let writeRes = makeRes();
    await routes['POST /api/agent-portal/file'](writeReq, writeRes);

    assert.equal(writeRes.status, 400);
    assert.match(writeRes.json().error, /symbolic link/);
    assert.equal(await fs.readFile(path.join(outsideDir, 'secret.md'), 'utf8'), '# secret\n');
  });

  it('POST /api/agent-portal/open-library/install rejects non-public targets', async () => {
    let oldOpenLibrary = process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR;
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-agent-install-'));
    let libDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-open-library-'));
    process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR = libDir;
    await fs.mkdir(path.join(libDir, 'skills/code'), { recursive: true });
    await fs.writeFile(path.join(libDir, 'skills/code/example.md'), '# Example\n');

    try {
      let routes = createRoutes(makeRoutes(tmpDir));
      let req = makeReq('POST', '/api/agent-portal/open-library/install', {
        sourcePath: 'skills/code/example.md',
        targetPath: 'messages/example.md',
      });
      let res = makeRes();
      await routes['POST /api/agent-portal/open-library/install'](req, res);

      assert.equal(res.status, 400);
      assert.match(res.json().error, /not editable public|local portal state/);
    } finally {
      if (oldOpenLibrary === undefined) delete process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR;
      else process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR = oldOpenLibrary;
    }
  });

  it('POST /api/agent-portal/open-library/install rejects source symlinks that escape the library root', async () => {
    let oldOpenLibrary = process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR;
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-agent-install-symlink-'));
    let libDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-open-library-symlink-'));
    let outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-open-library-outside-'));
    process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR = libDir;
    await fs.mkdir(path.join(libDir, 'skills/code'), { recursive: true });
    await fs.writeFile(path.join(outsideDir, 'secret.md'), '# secret\n');
    await fs.symlink(path.join(outsideDir, 'secret.md'), path.join(libDir, 'skills/code/leak.md'));

    try {
      let routes = createRoutes(makeRoutes(tmpDir));
      let req = makeReq('POST', '/api/agent-portal/open-library/install', {
        sourcePath: 'skills/code/leak.md',
      });
      let res = makeRes();
      await routes['POST /api/agent-portal/open-library/install'](req, res);

      assert.equal(res.status, 400);
      assert.match(res.json().error, /must stay inside configured root/);
    } finally {
      if (oldOpenLibrary === undefined) delete process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR;
      else process.env.AGENT_PORTAL_OPEN_LIBRARY_DIR = oldOpenLibrary;
    }
  });

  it('GET /api/project-graph-metadata returns missing sidecar metadata', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let routes = createRoutes(makeRoutes(tmpDir));
    let req = makeReq('GET', '/api/project-graph-metadata');
    let res = makeRes();

    await routes['GET /api/project-graph-metadata'](req, res);

    assert.equal(res.status, 200);
    assert.deepEqual(res.json(), {
      ok: true,
      found: false,
      path: path.join(tmpDir, '.portal', 'project-graph.json'),
      metadata: { version: 1 },
    });
  });

  it('POST /api/project-graph-metadata validates and writes normalized metadata', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let routes = createRoutes(makeRoutes(tmpDir));
    let metadata = {
      version: 1,
      clusters: [
        { label: 'Web UI', color: '#7cc7ff', paths: ['web/'] },
      ],
    };
    let postReq = makeReq('POST', '/api/project-graph-metadata', { metadata });
    let postRes = makeRes();

    await routes['POST /api/project-graph-metadata'](postReq, postRes);

    assert.equal(postRes.status, 200);
    assert.equal(postRes.json().metadata.clusters[0].id, 'web-ui');

    let written = JSON.parse(await fs.readFile(path.join(tmpDir, '.portal', 'project-graph.json'), 'utf8'));
    assert.equal(written.clusters[0].id, 'web-ui');

    let getReq = makeReq('GET', '/api/project-graph-metadata');
    let getRes = makeRes();
    await routes['GET /api/project-graph-metadata'](getReq, getRes);
    assert.equal(getRes.json().found, true);
    assert.equal(getRes.json().metadata.clusters[0].label, 'Web UI');
  });

  it('POST /api/project-graph-metadata accepts MCP-compatible singular match fields', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let routes = createRoutes(makeRoutes(tmpDir));
    let req = makeReq('POST', '/api/project-graph-metadata', {
      metadata: { clusters: [{ label: 'Web UI', path: 'web/' }] },
    });
    let res = makeRes();

    await routes['POST /api/project-graph-metadata'](req, res);

    assert.equal(res.status, 200);
    assert.deepEqual(res.json().metadata.clusters[0].paths, ['web/']);
  });

  it('POST /api/project-graph-metadata writes normalized stories', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let routes = createRoutes(makeRoutes(tmpDir));
    let req = makeReq('POST', '/api/project-graph-metadata', {
      metadata: {
        stories: [
          {
            title: 'Compact Flow',
            beats: [
              {
                title: 'UI Request',
                description: 'Browser requests compact context.',
                cluster: 'web-dashboard',
                path: 'web/app.js',
                nodes: ['web/app.js'],
              },
            ],
          },
        ],
      },
    });
    let res = makeRes();

    await routes['POST /api/project-graph-metadata'](req, res);

    assert.equal(res.status, 200);
    assert.deepEqual(res.json().metadata.stories[0].beats[0], {
      id: 'ui-request',
      label: 'UI Request',
      narrative: 'Browser requests compact context.',
      nodes: ['web/app.js'],
      edges: [],
      clusterId: 'web-dashboard',
      focusPath: 'web/app.js',
    });
  });

  it('POST /api/project-graph-metadata rejects invalid story beats', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let routes = createRoutes(makeRoutes(tmpDir));
    let req = makeReq('POST', '/api/project-graph-metadata', {
      metadata: {
        stories: [
          {
            label: 'Bad Flow',
            beats: [{ label: 'Bad Beat', nodes: [42] }],
          },
        ],
      },
    });
    let res = makeRes();

    await routes['POST /api/project-graph-metadata'](req, res);

    assert.equal(res.status, 400);
    assert.match(res.json().error, /beats\[0\]\.nodes must be an array/);
  });

  it('POST /api/project-graph-metadata rejects invalid cluster definitions', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let routes = createRoutes(makeRoutes(tmpDir));
    let req = makeReq('POST', '/api/project-graph-metadata', {
      metadata: { clusters: [{ label: 'Missing Paths' }] },
    });
    let res = makeRes();

    await routes['POST /api/project-graph-metadata'](req, res);

    assert.equal(res.status, 400);
    assert.match(res.json().error, /must define at least one path/);
  });

  it('POST /api/project-graph-metadata rejects non-root project paths', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let nestedDir = path.join(tmpDir, 'packages', 'project-graph-mcp');
    let routes = createRoutes(makeRoutes(tmpDir));
    let req = makeReq('POST', '/api/project-graph-metadata', {
      projectPath: nestedDir,
      metadata: { clusters: [{ label: 'Nested', paths: ['src/'] }] },
    });
    let res = makeRes();

    await routes['POST /api/project-graph-metadata'](req, res);

    assert.equal(res.status, 400);
    assert.match(res.json().error, /projectPath must match/);
    await assert.rejects(
      fs.readFile(path.join(nestedDir, '.portal', 'project-graph.json'), 'utf8'),
      /ENOENT/,
    );
  });

  it('GET /api/project-graph-metadata rejects non-root projectPath query', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let nestedDir = path.join(tmpDir, 'packages', 'project-graph-mcp');
    let routes = createRoutes(makeRoutes(tmpDir));
    let req = makeReq(
      'GET',
      `/api/project-graph-metadata?projectPath=${encodeURIComponent(nestedDir)}`,
    );
    let res = makeRes();

    await routes['GET /api/project-graph-metadata'](req, res);

    assert.equal(res.status, 400);
    assert.match(res.json().error, /projectPath must match/);
  });

  it('GET /api/project-graph-metadata accepts root path query with trailing slash', async () => {
    let { createRoutes } = await import('../../src/node/server/api-routes.js');
    let tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-graph-metadata-'));
    let routes = createRoutes(makeRoutes(tmpDir));
    let req = makeReq(
      'GET',
      `/api/project-graph-metadata?path=${encodeURIComponent(`${tmpDir}/`)}`,
    );
    let res = makeRes();

    await routes['GET /api/project-graph-metadata'](req, res);

    assert.equal(res.status, 200);
    assert.equal(res.json().path, path.join(tmpDir, '.portal', 'project-graph.json'));
  });
});
