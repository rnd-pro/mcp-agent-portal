/**
 * demo-adapter.js — Mock adapter for Agent Portal demo.
 *
 * Intercepts fetch() and WebSocket to serve mock data,
 * enabling a fully interactive demo without a backend.
 */
import {
  instances,
  projectHistory,
  chats,
  getChatById,
  skeleton,
  toolsByServer,
  adapterTypes,
  cliConfig,
  flywheelStats,
  generateEvent,
  generateInitialEvents,
  skills,
  workflows,
  pipelines,
  groups,
} from './mock-data.js';

// ── Fetch Interceptor ────────────────────────────────────────────

const _realFetch = window.fetch.bind(window);

/** Return a mock JSON Response */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Route /api/* requests to mock data */
function mockFetch(input, init) {
  let url;
  try {
    url = new URL(typeof input === 'string' ? input : input.url, location.origin);
  } catch {
    return _realFetch(input, init);
  }

  let path = url.pathname;

  // Skip non-API requests
  if (!path.startsWith('/api/')) return _realFetch(input, init);

  // Parse body for POST requests
  let body = null;
  if (init?.body) {
    try { body = JSON.parse(init.body); } catch { body = {}; }
  }

  // ── GET endpoints ──
  if (path === '/api/instances') {
    return Promise.resolve(jsonResponse(instances));
  }

  if (path === '/api/projects/history') {
    return Promise.resolve(jsonResponse(projectHistory));
  }

  if (path === '/api/chats') {
    if (init?.method === 'POST') {
      // Create chat
      let newId = 'chat-new-' + Date.now();
      return Promise.resolve(jsonResponse({ ok: true, id: newId }));
    }
    return Promise.resolve(jsonResponse({
      chats: chats.map(({ messages, ...rest }) => rest),
    }));
  }

  if (path === '/api/chats/get') {
    let chat = getChatById(body?.id);
    if (chat) return Promise.resolve(jsonResponse(chat));
    return Promise.resolve(jsonResponse({ error: 'Chat not found' }, 404));
  }

  if (path === '/api/chats/update' || path === '/api/chats/message' || path === '/api/chats/messages' || path === '/api/chats/session') {
    return Promise.resolve(jsonResponse({ ok: true }));
  }

  if (path === '/api/cli/config') {
    return Promise.resolve(jsonResponse(cliConfig));
  }

  if (path === '/api/adapter/types') {
    return Promise.resolve(jsonResponse(adapterTypes));
  }

  if (path === '/api/flywheel/stats') {
    return Promise.resolve(jsonResponse(flywheelStats));
  }

  if (path === '/api/mcp-call') {
    return handleMcpCall(body);
  }

  if (path === '/api/skills') {
    return Promise.resolve(jsonResponse({ skills }));
  }

  if (path === '/api/workflows') {
    return Promise.resolve(jsonResponse({ workflows }));
  }

  if (path === '/api/pipelines') {
    return Promise.resolve(jsonResponse({ pipelines }));
  }

  if (path === '/api/groups') {
    return Promise.resolve(jsonResponse({ groups }));
  }

  if (path === '/api/state/tasks') {
    let taskIds = body?.taskIds || [];
    let tasks = {};
    for (let id of taskIds) {
      tasks[id] = {
        status: 'done',
        startedAt: Date.now() - 60_000,
        updatedAt: Date.now() - 5_000,
        chatId: 'chat-sub-' + id,
        chatName: id.includes('impl') ? 'JWT Implementation' : id.includes('review') ? 'Security Review' : id.includes('perf') ? 'Bundle Analysis' : id,
        eventCount: Math.floor(Math.random() * 15) + 5,
      };
    }
    return Promise.resolve(jsonResponse({ tasks }));
  }

  // Fallback — return empty OK for unknown POST, 404 for GET
  if (init?.method === 'POST' || init?.method === 'PUT' || init?.method === 'DELETE') {
    return Promise.resolve(jsonResponse({ ok: true }));
  }
  return Promise.resolve(jsonResponse({ error: 'Not found (demo)' }, 404));
}

function resolveRepoUrl(relativePath) {
  let repoUrl = `https://raw.githubusercontent.com/rnd-pro/mcp-agent-portal/main/${relativePath}`;
  if (relativePath.startsWith('packages/project-graph-mcp/')) {
    repoUrl = `https://raw.githubusercontent.com/rnd-pro/project-graph-mcp/main/${relativePath.replace('packages/project-graph-mcp/', '')}`;
  } else if (relativePath.startsWith('packages/agent-pool-mcp/')) {
    repoUrl = `https://raw.githubusercontent.com/rnd-pro/agent-pool-mcp/main/${relativePath.replace('packages/agent-pool-mcp/', '')}`;
  } else if (relativePath.startsWith('packages/symbiote-node/')) {
    repoUrl = `https://raw.githubusercontent.com/rnd-pro/symbiote-node/main/${relativePath.replace('packages/symbiote-node/', '')}`;
  }
  return repoUrl;
}

/** Handle /api/mcp-call — route to appropriate mock tool response */
async function handleMcpCall(body) {
  let serverName = body?.serverName || 'project-graph';
  let method = body?.method;
  let params = body?.params || {};

  if (method === 'tools/list') {
    let tools = toolsByServer[serverName] || toolsByServer['project-graph'] || [];
    return jsonResponse({ tools });
  }

  if (method === 'tools/call') {
    let toolName = params.name;
    let args = params.arguments || {};

    if (toolName === 'get_skeleton') {
      return jsonResponse({
        result: { content: [{ type: 'text', text: JSON.stringify(skeleton) }] },
      });
    }

    if (toolName === 'list_skills') {
      return jsonResponse({
        result: { content: [{ type: 'text', text: JSON.stringify(skills) }] },
      });
    }

    if (toolName === 'compact') {
      let relativePath = args.path.replace(/^.*\/mcp-agent-portal\//, '').replace(/^(\.\/|\/)/, '');
      let repoUrl = resolveRepoUrl(relativePath);

      let code;
      try {
        let codeRes = await _realFetch(`${repoUrl}?t=${Date.now()}`);
        if (codeRes.ok) {
          code = await codeRes.text();
        } else {
          code = `// Failed to load source from GitHub for ${relativePath} (HTTP ${codeRes.status})`;
        }
      } catch (err) {
        code = `// Error loading source from GitHub for ${relativePath}: ${err.message}`;
      }
      return jsonResponse({
        result: { content: [{ type: 'text', text: JSON.stringify({ code }) }] },
      });
    }

    if (toolName === 'docs') {
      let targetPath = args.file || args.path;
      if (!targetPath) {
        return jsonResponse({ result: { content: [{ type: 'text', text: JSON.stringify({ content: 'No path provided' }) }] } });
      }
      
      let relativePath = targetPath.replace(/^.*\/mcp-agent-portal\//, '').replace(/^(\.\/|\/)/, '');
      
      let baseWithoutExt = relativePath.replace(/\.[a-zA-Z0-9]+$/, '');
      let ctxMdPath = baseWithoutExt + '.ctx.md';
      let ctxPath = baseWithoutExt + '.ctx';
      
      if (!relativePath.includes('.')) {
         ctxMdPath = relativePath + '/project.ctx';
      }

      let contentStr = '';
      try {
        let [resMd, resCtx] = await Promise.all([
          _realFetch(`${resolveRepoUrl(ctxMdPath)}?t=${Date.now()}`),
          _realFetch(`${resolveRepoUrl(ctxPath)}?t=${Date.now()}`)
        ]);

        let mdStr = resMd.ok ? await resMd.text() : '';
        let ctxStr = resCtx.ok ? await resCtx.text() : '';

        if (mdStr || ctxStr) {
          contentStr = [ctxStr, mdStr].filter(Boolean).join('\n\n---\n\n');
        } else {
          contentStr = `// Failed to load documentation for ${relativePath} (tried ${ctxMdPath} and ${ctxPath})`;
        }
      } catch (err) {
        contentStr = `// Error loading docs for ${relativePath}: ${err.message}`;
      }

      return jsonResponse({
        result: { content: [{ type: 'text', text: JSON.stringify({ content: contentStr }) }] },
      });
    }

    if (toolName === 'analyze') {
      return jsonResponse({
        result: { content: [{ type: 'text', text: JSON.stringify({ summary: `Analysis of ${args.path}: Code appears healthy.`, details: "Detailed AST metrics are unavailable in the demo." }) }] },
      });
    }

    if (toolName === 'navigate') {
      return jsonResponse({
        result: { content: [{ type: 'text', text: JSON.stringify({ usages: [], definitions: [], message: `Navigation to ${args.symbol} is mocked.` }) }] },
      });
    }

    if (toolName === 'get_tracked_files') {
      return jsonResponse({
        result: { content: [{ type: 'text', text: JSON.stringify({ tracked_files: ['src/node/proxy/mcp-proxy.js', 'web/app.js'] }) }] },
      });
    }

    // Default tool response
    return jsonResponse({
      result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, tool: toolName, args }) }] },
    });
  }

  if (method === 'resources/list') {
    return jsonResponse({ resources: [] });
  }

  return jsonResponse({ result: { content: [{ type: 'text', text: '{}' }] } });
}

window.fetch = mockFetch;

// ── WebSocket Interceptor ────────────────────────────────────────

const _RealWebSocket = window.WebSocket;

class MockWebSocket extends EventTarget {
  constructor(url, protocols) {
    super();
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.CONNECTING = 0;
    this.OPEN = 1;
    this.CLOSING = 2;
    this.CLOSED = 3;
    this._timers = [];

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      parsedUrl = { pathname: url };
    }

    let isMonitor = parsedUrl.pathname?.includes('/ws/monitor');
    let isState = parsedUrl.pathname?.includes('/ws/state');
    let isChat = parsedUrl.pathname?.includes('/ws/chat');

    if (!isMonitor && !isState && !isChat) {
      // Not a known WS endpoint — try real WS (will likely fail in demo)
      // Instead of erroring, just simulate a silent open+close
      setTimeout(() => {
        this.readyState = 1;
        this._emit('open', new Event('open'));
        // Stay open silently
      }, 50);
      return;
    }

    // Simulate open
    setTimeout(() => {
      this.readyState = 1;
      this._emit('open', new Event('open'));

      if (isState) {
        // Send initial state snapshot
        this._send({
          method: 'snapshot',
          params: {
            v: 1,
            serverVersion: '1.0.0-alpha.4+demo',
            state: {
              tasks: {},
              chats: Object.fromEntries(chats.map(c => [c.id, { id: c.id, name: c.name, projectId: c.projectId, adapter: c.adapter, status: 'idle' }])),
              ui: { theme: 'dark' },
            },
          },
        });
      }

      if (isMonitor) {
        // Send initial snapshot
        this._send({
          method: 'snapshot',
          params: {
            state: {
              project: {
                name: 'mcp-agent-portal',
                path: '/home/dev/mcp-agent-portal',
                color: '#4c8bf5',
                agents: 2,
                pid: 41200,
              },
            },
          },
        });

        // Simulate periodic events
        let eventIdx = 30;
        let timer = setInterval(() => {
          if (this.readyState !== 1) return;
          let evt = generateEvent(eventIdx++);
          this._send({ method: 'event', params: evt });
        }, 4000 + Math.random() * 3000);
        this._timers.push(timer);

        // Simulate agent count changes
        let agentTimer = setInterval(() => {
          if (this.readyState !== 1) return;
          let agents = Math.floor(Math.random() * 4);
          this._send({
            method: 'patch',
            params: { path: 'project.agents', value: agents },
          });
        }, 8000 + Math.random() * 5000);
        this._timers.push(agentTimer);
      }
    }, 100);
  }

  _send(data) {
    if (this.readyState !== 1) return;
    let event = new MessageEvent('message', { data: JSON.stringify(data) });
    this._emit('message', event);
  }

  _emit(type, event) {
    this.dispatchEvent(event);
    let handler = this['on' + type];
    if (typeof handler === 'function') handler.call(this, event);
  }

  send(data) {
    // Ignore sends from the app — demo doesn't process incoming messages
  }

  close(code, reason) {
    this.readyState = 3;
    for (let t of this._timers) clearInterval(t);
    this._timers = [];
    let event = new CloseEvent('close', { code: code || 1000, reason: reason || '' });
    this._emit('close', event);
  }
}

// Replace global WebSocket
window.WebSocket = MockWebSocket;

// ── Demo Badge ───────────────────────────────────────────────────

function addDemoBadge() {
  let badge = document.createElement('div');
  badge.id = 'demo-badge';
  badge.innerHTML = `LIVE DEMO`;
  Object.assign(badge.style, {
    position: 'fixed',
    top: '7px',
    right: '16px',
    background: 'linear-gradient(135deg, hsl(265, 80%, 55%), hsl(330, 80%, 55%))',
    color: '#fff',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '10px',
    fontWeight: '700',
    fontFamily: 'Inter, sans-serif',
    letterSpacing: '1.5px',
    zIndex: '999999',
    boxShadow: '0 2px 10px rgba(120, 60, 200, 0.35)',
    cursor: 'default',
    userSelect: 'none',
    pointerEvents: 'none',
  });
  document.body.appendChild(badge);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addDemoBadge);
} else {
  addDemoBadge();
}

console.log(
  '%c🚀 Agent Portal — LIVE DEMO MODE%c\nAll data is simulated. No backend required.',
  'color: #a855f7; font-size: 14px; font-weight: bold;',
  'color: #888; font-size: 12px;'
);
