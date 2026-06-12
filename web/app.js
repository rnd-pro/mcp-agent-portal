// @ctx .context/web/app.ctx
import "./common/base-path.js";
import { tPortal } from "./common/localization.js";
import { applyTheme as n, DEFAULT_PROVIDER_THEME as o, registerGlobalParam, updateParams, getRoute, parseQuery, buildHash, navigate } from "symbiote-ui/ui";
import { applyPortalProjectTransaction, getPortalProjectRuntime } from "./services/portal-runtime.js";
import { getTransactionLayoutRoots } from "./services/project-runtime-package.js";
import { followController } from "./follow-controller.js";
import "./components/FollowRibbon/FollowRibbon.js";
import { subscribe as s, onEvent as i } from "./state.js";
import "./panels/FileTree/FileTree.js";
import "./panels/CodeViewer/CodeViewer.js";
import "./panels/CtxPanel/CtxPanel.js";
import "./panels/dep-graph.js";
import "./panels/GraphFlows/GraphFlows.js";
import "./panels/HealthPanel/HealthPanel.js";
import "./panels/OpsPanel/OpsPanel.js";
import "./components/QuickOpen/QuickOpen.js";
import "./panels/ActiveContext/ActiveContext.js";

// Dashboard panels
import "./panels/ProjectList/ProjectList.js";
import "./panels/ActionBoard/ActionBoard.js";
import "./panels/SettingsPanel/SettingsPanel.js";
import "./panels/RuntimeControl/RuntimeControl.js";
import "./panels/SpatialLayout/SpatialLayout.js";
import "./panels/AgentChat/AgentChat.js";
import "./panels/Marketplace/Marketplace.js";
import "./panels/Topology/TopologyPanel.js";
import "./panels/ToolExplorer/ToolExplorer.js";
import "./panels/ActiveTasks/ActiveTasks.js";
import "./panels/PipelineManager/PipelineManager.js";
import "./panels/WorkflowExplorer/WorkflowExplorer.js";
import "./panels/GroupManager/GroupManager.js";
import "./panels/SkillManager/AgentPortalTree.js";
import "./panels/SkillManager/OpenLibraryTree.js";
import "./panels/SkillManager/SkillManager.js";
import "./panels/SkillManager/SkillMetadata.js";
import "./panels/PeerReview/PeerReview.js";
import "./components/ProjectTabs/ProjectTabs.js";
import "./components/PgWorkspace/PgWorkspace.js";
import "./components/ThemeEditorPanel/ThemeEditorPanel.js";
import { state as dashState, emit as dashEmit } from "./dashboard-state.js";
import { stateSync } from "./state-sync.js";
import { persistLayout, persistUiValue, readUiValue, writeStringCache } from "./common/ui-state.js";

export const state = { skeleton: null, skeletonProjectId: null, activeFile: null, ws: null, monitorEvents: [] };
export { formatStats } from "symbiote-ui/display/format-utils";
import { uiAlert } from "symbiote-ui/ui";
window.alert = (msg) => uiAlert(msg);
export const baseUrl = new URL(".", import.meta.url).href;

function getProjectRoot(projectId = dashState.activeProjectId) {
  let proj = projectId
    ? (dashState.projectHistory || []).find(p => p.id === projectId)
    : null;
  return proj?.path || null;
}

function getApiProjectId(params = {}) {
  return params.projectId || dashState.activeProjectId || null;
}

function getProjectScopedPathArgs(params = {}) {
  let projectId = getApiProjectId(params);
  return {
    path: resolveProjectPath(params.path, projectId),
    projectId,
  };
}

export function resolveProjectPath(p, projectId = dashState.activeProjectId) {
  let projectRoot = null;
  if (projectId) projectRoot = getProjectRoot(projectId);
  if (!p || p === '.') return projectRoot || '.';
  if (p.startsWith('/')) return p;
  if (projectRoot) return projectRoot + '/' + p;
  return p;
}

export function skeletonMatchesProject(skeleton, projectId) {
  let sourceProjectId = skeleton?.publicSource?.projectId || null;
  let project = (dashState.projectHistory || []).find((item) => item.id === projectId);
  let requiresPublicSource = String(project?.path || '').includes('/workspace/public-projects/')
    || (location.pathname.includes('/demos/agent-portal-vr/') && Boolean(projectId));
  if (!sourceProjectId) return !requiresPublicSource;
  return sourceProjectId === (projectId || null);
}

export function getActiveRouteProjectId() {
  let query = String(location.hash || '').split('?')[1] || '';
  let routeProjectId = new URLSearchParams(query).get('project') || null;
  return routeProjectId || dashState.activeProjectId || null;
}

export async function api(endpoint, params = {}) {
  const urlParams = new URLSearchParams(window.location.search);
  const serverName = urlParams.get('server') || "project-graph";
  let requestProjectId = getApiProjectId(params);
  let projectRoot = resolveProjectPath('.', requestProjectId);

  const map = {
    "/api/skeleton": { name: "get_skeleton", args: p => getProjectScopedPathArgs(p) },
    "/api/file": { name: "compact", args: p => ({ action: "compact_file", ...getProjectScopedPathArgs(p), beautify: true }) },
    "/api/compact-file": { name: "compact", args: p => ({ action: "compact_file", ...getProjectScopedPathArgs(p), beautify: false }) },
    "/api/expand-file": { name: "compact", args: p => ({ action: "expand_file", ...getProjectScopedPathArgs(p), beautify: true }) },
    "/api/raw-file": { name: "compact", args: p => ({ action: "compact_file", ...getProjectScopedPathArgs(p), beautify: false }) },
    "/api/analysis": { name: "analyze", args: p => ({ action: "full_analysis", ...getProjectScopedPathArgs(p) }) },
    "/api/analysis-summary": { name: "analyze", args: p => ({ action: "analysis_summary", ...getProjectScopedPathArgs(p) }) },
    "/api/deps": { name: "navigate", args: p => ({ action: "deps", symbol: p.symbol, path: projectRoot }) },
    "/api/usages": { name: "navigate", args: p => ({ action: "usages", symbol: p.symbol, path: projectRoot }) },
    "/api/expand": { name: "navigate", args: p => ({ action: "expand", symbol: p.symbol, path: projectRoot }) },
    "/api/chain": { name: "navigate", args: p => ({ action: "call_chain", from: p.from, to: p.to, path: projectRoot }) },
    "/api/docs": { name: "docs", args: p => ({ action: "get", path: resolveProjectPath('.', getApiProjectId(p)) || '.', file: p.file || p.path, projectId: getApiProjectId(p) }) }
  };

  const tool = map[endpoint];
  if (tool) {
    const res = await fetch("/api/mcp-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serverName,
        method: "tools/call",
        params: {
          name: tool.name,
          arguments: tool.args(params)
        }
      })
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    
    // Handle JSON-RPC standard error
    if (data.error) {
      throw new Error(data.error.message || "Tool error");
    }
    // Handle our custom error flag if present
    if (data.isError) {
      let errText = "Tool error";
      if (data.result?.content?.[0]?.text) errText = data.result.content[0].text;
      else if (data.content?.[0]?.text) errText = data.content[0].text;
      else errText = data.error || "Tool error";
      throw new Error(errText);
    }
    
    // Extract text from standard MCP result.content or fallbacks
    let resultText = data.result?.content?.[0]?.text || data.content?.[0]?.text || data.text || data.response || JSON.stringify(data.result || data);
    try {
      return JSON.parse(resultText);
    } catch {
      return resultText;
    }
  }

  params.server = serverName;
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${endpoint}${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const events = new EventTarget;
export function emit(e, t = {}) { events.dispatchEvent(new CustomEvent(e, { detail: t })) }

// Panel types and sections are defined in router-registry.js
// They can be extended at runtime by marketplace plugins and MCP servers

async function fetchProjects() {
  const e = await fetch("/api/instances");
  if (!e.ok) {
    throw new Error(`Fetch failed: ${e.status}`);
  }
  return e.json();
}

function initDashboardWS(e) {
  if (!e.length) return;
  const t = "https:" === location.protocol ? "wss://" : "ws://", o = location.host;
  for (const r of e) connectDashboardWS(r, t, o)
}

function chatPatchId(value) {
  return typeof value === 'string' ? value : value?.id || null;
}

let pendingCreatedChatPatch = null;
let createdChatRefreshTimer = null;

function scheduleCreatedChatRefresh(detail = {}) {
  pendingCreatedChatPatch = { ...(pendingCreatedChatPatch || {}), ...detail };
  if (createdChatRefreshTimer) return;
  createdChatRefreshTimer = setTimeout(() => {
    createdChatRefreshTimer = null;
    let emitDetail = pendingCreatedChatPatch || {};
    pendingCreatedChatPatch = null;
    fetch('/api/chats').then(r => r.json()).then(d => {
      dashState.chats = d.chats || [];
      dashEmit("chats-updated", { ...emitDetail, hydrated: true });
      if (emitDetail.id) {
        dashEmit("chat-created", { id: emitDetail.id, source: "monitor" });
      }
    });
  }, 150);
}

function connectDashboardWS(e, t, o, _att = 0) {
  const path = `${String(e.prefix || '').replace(/^\/+/, '')}/ws/monitor`;
  const r = new URL(path, baseUrl);
  r.protocol = t;
  r.host = o;
  const n = new WebSocket(r.href);
  n.onopen = () => {
    _att = 0;
  };
  n.onmessage = t => {
    let o; try { o = JSON.parse(t.data) } catch { return }
    if ("snapshot" === o.method && o.params?.state) {
      const t = o.params.state, r = dashState.projects.find(t => t.prefix === e.prefix);
      return void (r && t.project && (Object.assign(r, { projectName: t.project.name, projectPath: t.project.path, color: t.project.color, agents: t.project.agents, pid: t.project.pid, connected: true }), dashEmit("projects-updated", dashState.projects)))
    }
    if ("patch" === o.method && o.params) {
      if (o.params.path === "chats.created" || o.params.path === "chats.updated") {
        const chatId = chatPatchId(o.params.value);
        if (o.params.path === "chats.created") {
          scheduleCreatedChatRefresh({ id: chatId, path: o.params.path });
        } else if (chatId) {
          dashEmit("chat-updated", { id: chatId, source: "monitor" });
        }
      }
      if (o.params.path === "projects.opened") {
        fetch('/api/projects/history').then(r => r.json()).then(d => { dashState.projectHistory = d.projects || []; dashState.openProjectIds = d.activeIds || []; dashEmit("projects-history-updated"); });
      }
      const t = dashState.projects.find(t => t.prefix === e.prefix);
      return void (t && "project.agents" === o.params.path && (t.agents = o.params.value, dashEmit("projects-updated", dashState.projects)))
    }
    if ("event" === o.method && o.params) {
      const t = o.params;
      t._projectPrefix = e.prefix;
      t._projectName = e.name || e.projectName;
      dashState.events.push(t);
      dashState.events.length > 1e3 && dashState.events.shift();
      return void dashEmit("global-tool-event", t)
    }
    o.type && (o._projectPrefix = e.prefix, o._projectName = e.name || e.projectName, dashState.events.push(o), dashState.events.length > 1e3 && dashState.events.shift(), dashEmit("global-tool-event", o))
  };
  n.onerror = () => {};
  n.onclose = r => {
    const n = dashState.projects.find(t => t.prefix === e.prefix);
    n && (n.connected = false, dashEmit("projects-updated", dashState.projects));
    setTimeout(() => connectDashboardWS(e, t, o, _att + 1), Math.min(500 * Math.pow(2, _att), 3e4));
  }
}

// ── Workspace Layout Controller ──────────────────────────────────
// Each pg-workspace owns its sidebar and panel-layout, driven by URL hash.
/** @type {string|null|undefined} Current project ID from URL — undefined = never set */
let _currentProjectId = undefined;

function scheduleFrame(callback) {
  let raf = globalThis.requestAnimationFrame || globalThis.window?.requestAnimationFrame;
  if (typeof raf === 'function') {
    raf(callback);
    return;
  }
  setTimeout(callback, 0);
}

function getWorkspaceId(projectId) {
  return projectId || 'global';
}

function setWorkspaceActive(workspace, active) {
  if (!workspace) return;
  if (workspace.$) {
    if (workspace.$.active === active) return;
    workspace.$.active = active;
    return;
  }
  customElements.whenDefined('pg-workspace').then(() => {
    if (workspace.isConnected && workspace.$ && workspace.$.active !== active) {
      workspace.$.active = active;
    }
  });
}

function ensureWorkspace(projectId) {
  let host = document.getElementById('main-layout');
  if (!host) return null;
  let workspaceId = getWorkspaceId(projectId);
  let workspace = host.querySelector(`pg-workspace[data-workspace-id="${workspaceId}"]`);
  if (workspace) return workspace;
  workspace = document.createElement('pg-workspace');
  workspace.dataset.workspaceId = workspaceId;
  workspace.setAttribute('project-id', workspaceId);
  host.appendChild(workspace);
  return workspace;
}

function activateWorkspace(projectId) {
  let host = document.getElementById('main-layout');
  if (!host) return;
  let activeWorkspace = ensureWorkspace(projectId);
  for (let workspace of host.querySelectorAll('pg-workspace')) {
    setWorkspaceActive(workspace, workspace === activeWorkspace);
  }
}

function refreshActiveWorkspace(projectId) {
  let host = document.getElementById('main-layout');
  let workspaceId = getWorkspaceId(projectId);
  let workspace = host?.querySelector(`pg-workspace[data-workspace-id="${workspaceId}"]`);
  workspace?.refreshCurrentLayout?.();
}

/**
 * Handle project switch — update sidebar sections and defaults.
 * Called when ?project= param changes in URL.
 */
function handleProjectSwitch(projectId) {
  if (projectId === _currentProjectId && state.skeleton && skeletonMatchesProject(state.skeleton, projectId)) {
    activateWorkspace(projectId);
    updateTopbarPath();
    return;
  }
  let previousProjectId = _currentProjectId;
  _currentProjectId = projectId;
  if (previousProjectId !== undefined && previousProjectId !== projectId) {
    state.activeFile = null;
  }

  // Update dashboard state (single source of truth for other panels)
  dashState.activeProjectId = projectId;
  persistUiValue('ui/activeProjectId', projectId || null, 'pg-active-project-id');

  // Clear route and memory chat state if either points outside the active project.
  if (projectId) {
    let routeChatId = parseQuery(getRoute().query || '').chat || null;
    let routeChat = routeChatId ? (dashState.chats || []).find(c => c.id === routeChatId) : null;
    let activeChat = dashState.activeChatId
      ? (dashState.chats || []).find(c => c.id === dashState.activeChatId)
      : null;
    let routeChatMismatch = routeChatId && (!routeChat || routeChat.projectId !== projectId);
    let activeChatMismatch = dashState.activeChatId && (!activeChat || activeChat.projectId !== projectId);

    if (routeChatMismatch || activeChatMismatch) {
      dashState.activeChatId = null;
      if (routeChatId) updateParams({ chat: null });
      dashEmit('active-chat-changed', { id: null });
    }
  }

  dashEmit('active-project-changed', { id: projectId });
  activateWorkspace(projectId);

  // Re-fetch skeleton for the new project context
  // This triggers file-tree and dep-graph to re-render with correct data
  state.skeleton = null;
  state.skeletonProjectId = projectId || null;
  api('/api/skeleton', { projectId }).then(sk => {
    if (_currentProjectId !== projectId) return;
    if (!skeletonMatchesProject(sk, projectId)) return;
    state.skeleton = sk;
    state.skeletonProjectId = projectId || null;
    emit('skeleton-loaded', sk);
  }).catch(() => {});
  
  updateTopbarPath();
}

function updateTopbarPath() {
  let pathEl = document.getElementById('active-project-path');
  if (!pathEl) return;
  
  let proj = (dashState.projectHistory || []).find(p => p.id === dashState.activeProjectId);
  if (proj && proj.path) {
    pathEl.textContent = formatProjectPathForTopbar(proj.path);
    pathEl.title = proj.path;
  } else {
    pathEl.textContent = tPortal('topbar.workspaceNotSelected');
    pathEl.title = '';
  }
}

function formatProjectPathForTopbar(projectPath) {
  let parts = String(projectPath || '').split('/').filter(Boolean);
  if (parts.length <= 3) return projectPath;
  return `.../${parts.slice(-3).join('/')}`;
}

/**
 * Handle route change — update panel layout.
 * Called on every hashchange.
 */
function handleRoute() {
  let route = getRoute();
  let section = route.panel;
  let subPath = route.subpath;

  // Project scope from URL
  let globals = parseQuery(route.query);
  let projectId = globals.project || null;
  handleProjectSwitch(projectId);

  // Explorer file routing
  if (section === 'explorer' && subPath) {
    state.activeFile = subPath;
    scheduleFrame(() => {
      emit('file-selected', { path: subPath, projectId, fromRoute: true });
    });
  }
}

function applyRuntimeTransaction(projectId, transaction) {
  let project = applyPortalProjectTransaction(projectId, transaction);
  for (let [layoutId, root] of getTransactionLayoutRoots(project, transaction)) {
    let storageKey = `pg-layout-v4-${projectId || 'global'}-${layoutId}`;
    persistLayout(storageKey, root);
  }
  let route = getRoute();
  let globals = parseQuery(route.query);
  if ((globals.project || null) === (projectId || null)) {
    refreshActiveWorkspace(projectId);
  }
  document.documentElement.setAttribute('data-project-runtime-updated', transaction.id || 'transaction');
  document.dispatchEvent(new CustomEvent('agent-portal-project-runtime-updated', {
    detail: { projectId, project },
  }));
  return project;
}

function getActiveWorkspaceLayout() {
  let workspace = document.querySelector('pg-workspace:not([hidden])');
  return workspace?.ref?.layout || workspace?.querySelector?.('panel-layout') || null;
}

function openThemeEditorPanel(event) {
  event.preventDefault?.();
  let layout = getActiveWorkspaceLayout();
  if (!layout || typeof layout.openPanel !== 'function') return;
  layout.openPanel('theme-editor', {
    reuseExisting: true,
    uiInvoked: true,
    source: 'cascade-theme-widget',
  });
}

async function u() {
  n(document.documentElement, o);
  document.documentElement.dataset.themeScope = 'default-provider';
  document.addEventListener('cascade-theme-open-full', openThemeEditorPanel);
  let runtimeApi = {
    getProject: (projectId = null) => getPortalProjectRuntime(projectId).getProject(),
    applyTransaction: applyRuntimeTransaction,
  };
  try {
    window.agentPortalProjectRuntime = runtimeApi;
  } catch {}
  document.documentElement.agentPortalProjectRuntime = runtimeApi;
  document.documentElement.setAttribute('data-project-runtime', 'ready');
  document.addEventListener('agent-portal-project-transaction', (event) => {
    let { projectId = null, transaction } = event.detail || {};
    if (transaction) applyRuntimeTransaction(projectId, transaction);
  });

  // Initial route mount must not depend on frame scheduling in embedded webviews.
  registerGlobalParam('project');
  handleRoute();

  scheduleFrame(async () => {
    // Project is global route context; chat is section-scoped and should not leak across menu sections.
    await customElements.whenDefined('pg-workspace');

    // File selection routing
    events.addEventListener("file-selected", e => {
      if (e.detail.fromRoute) return;
      if (e.detail.source === "canvas") return;
      let filePath = e.detail.path;
      let route = getRoute();
      if (filePath && route.panel === "explorer") {
        let currentParams = parseQuery(route.query);
        history.replaceState(null, "", "#" + buildHash('explorer', filePath, currentParams));
      }
    });

    // Initialize Dashboard data
    const list = await fetchProjects();
    dashState.projects = list.map(t => ({ prefix: t.prefix, ...t, connected: false, agents: 0 }));
    dashEmit("projects-updated", dashState.projects);
    initDashboardWS(dashState.projects);

    // Connect StateGraph sync for reactive task/chat/settings updates
    stateSync.connect();

    let uiRes = {};
    try {
      const [histRes, cliRes, chatRes, uiStateRes] = await Promise.all([
        fetch('/api/projects/history').then(r => r.json()),
        fetch('/api/cli/config').then(r => r.json()),
        fetch('/api/chats').then(r => r.json()),
        fetch('/api/ui').then(r => r.json()).catch(() => ({})),
      ]);
      dashState.projectHistory = histRes.projects || [];
      dashState.openProjectIds = histRes.activeIds || [];
      dashState.globalCli = cliRes.global || {};
      dashState.chats = chatRes.chats || [];
      uiRes = uiStateRes || {};
      dashEmit('projects-history-updated', dashState.projectHistory);
      dashEmit('chats-updated');
      updateTopbarPath();
    } catch {}

    writeStringCache("pg-explorer-layout", null);
    writeStringCache("pg-layout-v2", null);
    writeStringCache("pg-layout-v3", null);

    // Initial sidebar + route setup
    let savedProjectId = readUiValue('ui/activeProjectId', 'pg-active-project-id', null);
    let route = getRoute();
    let globals = parseQuery(route.query);
    let initialProjectId = globals.project || uiRes.activeProjectId || savedProjectId || null;

    // If no hash or default, navigate to appropriate default
    if (!location.hash || location.hash === '#' || location.hash === '#default') {
      let defaultSection = initialProjectId ? 'explorer' : 'dashboard';
      let params = initialProjectId ? { project: initialProjectId } : {};
      navigate(defaultSection, '', params);
    }

    // Listen for hash changes — unified route handler
    window.addEventListener('hashchange', () => {
      handleRoute();
    });

    // Initial route — this also calls handleProjectSwitch() to populate sidebar
    handleRoute();
  });

  // Also keep original Explorer websocket events alive conceptually
  s("project", e => { e && (document.title = `${e.name} — Project Graph`, document.getElementById("project-name").textContent = e.name, document.documentElement.style.setProperty("--project-accent", e.color), g(e.agents)) });
  events.addEventListener("skeleton-loaded", e => {
    const t = e.detail; if (!t || !skeletonMatchesProject(t, getActiveRouteProjectId())) return; state.skeleton = t; const n = new Set; for (const e of Object.values(t.n || {})) e.f && n.add(e.f); for (const e of Object.keys(t.X || {})) n.add(e); for (const [e, o] of Object.entries(t.f || {})) for (const t of o) n.add("./" === e ? t : `${e}${t}`); for (const [e, o] of Object.entries(t.a || {})) for (const t of o) n.add("./" === e ? t : `${e}${t}`); const o = document.getElementById("project-files"); o && (o.textContent = `${n.size} files`)
  });
  s("skeleton", e => { if (!e || !skeletonMatchesProject(e, getActiveRouteProjectId())) return; state.skeleton = e; state.skeletonProjectId = getActiveRouteProjectId(); emit("skeleton-loaded", e) });
  s("connected", e => { const t = document.getElementById("status-indicator"); t && (t.className = e ? "status connected" : "status disconnected") });
  i(e => {
    if ("agent_connect" === e.type || "agent_disconnect" === e.type) return g(e.agents), void emit("agent-event", e);
    state.monitorEvents.push(e), state.monitorEvents.length > 500 && state.monitorEvents.shift(), emit("tool-event", e)
  });
  // NOTE: In mcp-agent-portal context, state.js WS connect is disabled.
  // All API calls go through HTTP /api/mcp-call multiplexer.
  // c();
}

function g(e) { let t = document.getElementById("agent-badge"); if (!t) { const e = document.querySelector(".app-topbar"); if (!e) return; t = document.createElement("span"), t.id = "agent-badge", t.className = "agent-badge", e.appendChild(t) } t.textContent = e > 0 ? `● ${e} agent${1 !== e ? "s" : ""}` : "", t.hidden = !(e > 0) }
function f() { document.querySelector("pg-quick-open") || document.body.appendChild(document.createElement("pg-quick-open")) }
function h() { const btn = document.getElementById("follow-btn"); if (!btn) return; let active = false; btn.addEventListener("click", () => { active = !active; if (active) { btn.setAttribute("data-active", ""); btn.classList.add("active"); followController.enable(); location.hash = "follow" } else { btn.removeAttribute("data-active"); btn.classList.remove("active"); const prev = followController.getPreviousHash(); followController.disable(); if (prev && prev !== "#follow") location.hash = prev.replace(/^#/, "") } events.dispatchEvent(new CustomEvent("follow-mode-changed", { detail: { enabled: active } })) }); events.addEventListener("follow-state-changed", e => { const en = e.detail?.enabled; if (en && !active) { active = true; btn.setAttribute("data-active", ""); btn.classList.add("active") } else if (!en && active) { active = false; btn.removeAttribute("data-active"); btn.classList.remove("active") } }); window.addEventListener("hashchange", () => { const sec = (location.hash.replace("#", "").split("?")[0].split("/")[0]) || "explorer"; if (sec === "follow" && !active) { active = true; btn.setAttribute("data-active", ""); btn.classList.add("active"); followController.enable() } else if (sec !== "follow" && active) { active = false; btn.removeAttribute("data-active"); btn.classList.remove("active"); followController.disable() } }) }
function _initRibbon() { if (!document.querySelector("follow-ribbon")) document.body.appendChild(document.createElement("follow-ribbon")) }

if ("loading" === document.readyState) {
  document.addEventListener("DOMContentLoaded", () => { u(), f(), followController.init(events, emit), h(), _initRibbon() });
} else {
  u(), f(), followController.init(events, emit), h(), _initRibbon();
}
