import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';

function frameMessage(message) {
  let body = Buffer.from(JSON.stringify(message), 'utf8');
  return `Content-Length: ${body.length}\r\n\r\n${body}`;
}

function parseProtocolResponses(state) {
  let responses = [];
  while (true) {
    let header = state.buffer.match(/Content-Length: (\d+)\r\n\r\n/);
    if (!header) return responses;
    let length = Number(header[1]);
    let start = header[0].length;
    if (state.buffer.length < start + length) return responses;
    responses.push(JSON.parse(state.buffer.slice(start, start + length)));
    state.buffer = state.buffer.slice(start + length);
  }
}

function waitForResponse(responses, events, id, timeoutMs = 8000) {
  let found = responses.find((response) => response.id === id);
  if (found) return Promise.resolve(found);

  return new Promise((resolve, reject) => {
    let timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for response ${id}`));
    }, timeoutMs);

    events.once('response', (response) => {
      clearTimeout(timer);
      if (response.id === id) {
        resolve(response);
        return;
      }
      waitForResponse(responses, events, id, timeoutMs).then(resolve, reject);
    });
  });
}

function waitForConnection(connections, events, index, timeoutMs = 8000) {
  if (connections[index]) return Promise.resolve(connections[index]);

  return new Promise((resolve, reject) => {
    let timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for websocket connection ${index}`));
    }, timeoutMs);

    events.once('connection', () => {
      clearTimeout(timer);
      waitForConnection(connections, events, index, timeoutMs).then(resolve, reject);
    });
  });
}

function handleSocket(socket, requests) {
  socket.on('message', (data) => {
    let request = JSON.parse(data.toString());
    requests.push(request);
    if (request.method === 'initialize') {
      socket.send(JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'fake-agent-portal', version: 'test' },
        },
      }));
    } else if (request.method === 'tools/list') {
      socket.send(JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: [
            {
              name: 'get_portal_status',
              description: 'Fake status tool',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        },
      }));
    }
  });
}

async function writeBackendPortFile({ backendsDir, projectRoot, port, pid, version }) {
  let projectName = path.basename(projectRoot);
  let localUrl = `http://127.0.0.1:${port}/`;
  let data = {
    port,
    host: '127.0.0.1',
    lanEnabled: false,
    localUrl,
    lanUrls: [],
    pid,
    project: path.resolve(projectRoot),
    name: projectName,
    projectName,
    version,
    startedAt: Date.now(),
    mcpUrl: 'http://portal.local/mcp',
    mcpDirect: `http://127.0.0.1:${port}/mcp`,
    webDirect: localUrl,
  };
  await mkdir(backendsDir, { recursive: true });
  await writeFile(path.join(backendsDir, 'portal.json'), JSON.stringify(data, null, 2));
  return { data, fileName: 'portal.json' };
}

describe('static MCP connector fresh process', () => {
  it('buffers initialize, reconnects /mcp-ws, and remains usable through the bin entrypoint', async () => {
    let stateDir = await mkdtemp(path.join(os.tmpdir(), 'agent-portal-static-connector-'));
    let projectRoot = path.join(stateDir, 'project');
    let gatewayDir = path.join(stateDir, 'local-gateway');
    let backendsDir = path.join(gatewayDir, 'backends');
    let server = http.createServer();
    let wss = new WebSocketServer({ noServer: true });
    let connections = [];
    let connectionEvents = new EventEmitter();
    let requests = [];
    let repoRoot = path.resolve('.');
    let sentinel = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    });

    await mkdir(projectRoot, { recursive: true });

    server.on('upgrade', (req, socket, head) => {
      if (req.url !== '/mcp-ws') {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        connections.push(ws);
        connectionEvents.emit('connection', ws);
        handleSocket(ws, requests);
      });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    let port = server.address().port;

    let packageMeta = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
    let { data: portData, fileName } = await writeBackendPortFile({
      backendsDir,
      projectRoot,
      port,
      pid: sentinel.pid,
      version: packageMeta.version,
    });
    let portFile = path.join(backendsDir, fileName);
    let binPath = path.resolve(repoRoot, packageMeta.bin['mcp-agent-portal']);

    assert.equal(JSON.parse(await readFile(portFile, 'utf8')).pid, sentinel.pid);
    assert.equal(portData.project, path.resolve(projectRoot));
    assert.equal(portData.name, path.basename(projectRoot));
    assert.equal(portData.projectName, path.basename(projectRoot));
    assert.equal(portData.host, '127.0.0.1');
    assert.equal(portData.lanEnabled, false);
    assert.deepEqual(portData.lanUrls, []);
    assert.equal(portData.localUrl, `http://127.0.0.1:${port}/`);
    assert.equal(portData.mcpDirect, `http://127.0.0.1:${port}/mcp`);
    assert.equal(portData.webDirect, portData.localUrl);
    assert.equal(portData.mcpUrl, 'http://portal.local/mcp');
    assert.equal(portData.version, packageMeta.version);
    assert.equal(typeof portData.startedAt, 'number');

    let responses = [];
    let responseState = { buffer: '' };
    let responseEvents = new EventEmitter();

    let child = spawn(process.execPath, [binPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: path.join(stateDir, 'home'),
        PORTAL_LOCAL_GATEWAY_DIR: gatewayDir,
        PORTAL_CONFIG_PATH: path.join(stateDir, 'agent-portal.json'),
        PORTAL_CHATS_DIR: path.join(stateDir, 'agent-portal-chats'),
        PORTAL_STATE_DIR: stateDir,
        PORTAL_STATE_PATH: path.join(stateDir, 'agent-portal-state.json'),
        PORTAL_WAL_PATH: path.join(stateDir, 'agent-portal.wal'),
        PORTAL_MEMORY_PATH: path.join(stateDir, 'global-memory.json'),
        PORTAL_CONFIG_DIR: stateDir,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    try {
      let stderr = '';
      let stdout = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.stdout.on('data', (chunk) => {
        let text = chunk.toString();
        stdout += text;
        responseState.buffer += text;
        for (let response of parseProtocolResponses(responseState)) {
          responses.push(response);
          responseEvents.emit('response', response);
        }
      });

      child.stdin.write(frameMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          roots: [{ uri: pathToFileURL(projectRoot).href }],
          capabilities: {},
          clientInfo: { name: 'static-connector-test', version: '1' },
        },
      }));

      let init = await waitForResponse(responses, responseEvents, 1);
      assert.equal(init.result.serverInfo.name, 'fake-agent-portal');
      assert.equal(requests[0].method, 'initialize');
      assert.match(stderr, new RegExp(`Workspace root from MCP initialize: ${projectRoot}`));
      assert.match(stdout, /^Content-Length: /);

      let firstSocket = await waitForConnection(connections, connectionEvents, 0);
      firstSocket.close();

      let toolsListFrame = frameMessage({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      });
      child.stdin.write(toolsListFrame.slice(0, 12));
      child.stdin.write(toolsListFrame.slice(12));

      let secondSocket = await waitForConnection(connections, connectionEvents, 1);
      assert.equal(secondSocket.readyState, WebSocket.OPEN);

      let list = await waitForResponse(responses, responseEvents, 2);
      assert.equal(list.result.tools[0].name, 'get_portal_status');
      assert.equal(requests.filter((request) => request.method === 'tools/list').length, 1);
      assert.match(stderr, /Connected to singleton backend/);
      assert.doesNotMatch(stderr, /Proxy failed after 5 retries/);
      assert.deepEqual(await readdir(backendsDir), [fileName]);

      child.stdin.end();
      let [code] = await Promise.race([
        once(child, 'exit'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out waiting for connector exit')), 2000)),
      ]);
      assert.equal(code, 0);
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
      wss.close();
      await new Promise((resolve) => server.close(resolve));
      sentinel.kill('SIGKILL');
      await Promise.race([
        once(sentinel, 'exit'),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
      await rm(stateDir, { recursive: true, force: true });
    }
  });
});
