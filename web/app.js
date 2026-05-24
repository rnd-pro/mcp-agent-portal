// @ctx .context/web/app.ctx
import "./common/base-path.js";
import { LayoutTree as t, applyTheme as n, DEFAULT_THEME as o, registerGlobalParam, updateParams, getRoute, parseQuery, buildHash, navigate } from "symbiote-node/ui";
import { waitForElementApi } from "symbiote-node/core";
import { panelTypes, getSectionsForScope, hasSection } from "./router-registry.js";
import { applyPortalProjectTransaction, getPortalProjectRuntime, getPortalRuntimeLayout } from "./services/portal-runtime.js";
import { getTransactionLayoutRoots } from "./services/project-runtime-package.js";
import { layoutMatchesSection } from "./layout-policy.js";
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
import { state as dashState, emit as dashEmit } from "./dashboard-state.js";
import { stateSync } from "./state-sync.js";
import { persistLayout, persistUiValue, readLayout, readUiValue } from "./common/ui-state.js";

export const state = { skeleton: null, activeFile: null, ws: null, monitorEvents: [] };
export { formatStats } from "symbiote-node/display/format-utils";
import { uiAlert } from "symbiote-node/ui";
window.alert = (msg) => uiAlert(msg);
export const baseUrl = new URL(".", import.meta.url).href;

export function resolveProjectPath(p) {
  let projectRoot = null;
  if (dashState.activeProjectId) {
    let proj = (dashState.projectHistory || []).find(p => p.id === dashState.activeProjectId);
    if (proj) projectRoot = proj.path;
  }
  if (!p || p === '.') return projectRoot || '.';
  if (p.startsWith('/')) return p;
  if (projectRoot) return projectRoot + '/' + p;
  return p;
}

export async function api(endpoint, params = {}) {
  const urlParams = new URLSearchParams(window.location.search);
  const serverName = urlParams.get('server') || "project-graph";
  let projectRoot = resolveProjectPath('.');

  const map = {
    "/api/skeleton": { name: "get_skeleton", args: p => ({ path: resolveProjectPath(p.path) }) },
    "/api/file": { name: "compact", args: p => ({ action: "compact_file", path: resolveProjectPath(p.path), beautify: true }) },
    "/api/compact-file": { name: "compact", args: p => ({ action: "compact_file", path: resolveProjectPath(p.path), beautify: false }) },
    "/api/expand-file": { name: "compact", args: p => ({ action: "expand_file", path: resolveProjectPath(p.path), beautify: true }) },
    "/api/raw-file": { name: "compact", args: p => ({ action: "compact_file", path: resolveProjectPath(p.path), beautify: false }) },
    "/api/analysis": { name: "analyze", args: p => ({ action: "full_analysis", path: resolveProjectPath(p.path) }) },
    "/api/analysis-summary": { name: "analyze", args: p => ({ action: "analysis_summary", path: resolveProjectPath(p.path) }) },
    "/api/deps": { name: "navigate", args: p => ({ action: "deps", symbol: p.symbol, path: projectRoot }) },
    "/api/usages": { name: "navigate", args: p => ({ action: "usages", symbol: p.symbol, path: projectRoot }) },
    "/api/expand": { name: "navigate", args: p => ({ action: "expand", symbol: p.symbol, path: projectRoot }) },
    "/api/chain": { name: "navigate", args: p => ({ action: "call_chain", from: p.from, to: p.to, path: projectRoot }) },
    "/api/docs": { name: "docs", args: p => ({ action: "get", path: projectRoot || '.', file: p.file || p.path }) }
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

function connectDashboardWS(e, t, o, _att = 0) {
  const r = `${t}${o}${e.prefix}/ws/monitor`, n = new WebSocket(r);
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
        fetch('/api/chats').then(r => r.json()).then(d => { dashState.chats = d.chats || []; dashEmit("chats-updated"); });
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

// ── Unified Layout Controller ────────────────────────────────────
// Single sidebar + panel-layout, driven by URL hash.

/** @type {string} Current section being displayed */
let _currentSection = '';
/** @type {string|null|undefined} Current project ID from URL — undefined = never set */
let _currentProjectId = undefined;


/**
 * Pre-calculate subPanels for a section based on its layout tree.
 * This ensures the sidebar correctly shows expand chevrons for sections with multiple panels
 * even before the user navigates to them.
 * @param {string} sectionId
 * @param {string} projectId
 * @returns {Array<object>}
 */
function getSubPanelsForSection(sectionId, projectId) {
  let storageKey = `pg-layout-v4-${projectId || 'global'}-${sectionId}`;
  let fallback = getPortalRuntimeLayout(sectionId, projectId);
  let tree = readLayout(storageKey);
  if (!layoutMatchesSection(sectionId, tree, fallback)) tree = fallback;
  
  return t.createSidebarSubPanels(tree, panelTypes);
}

/**
 * Handle project switch — update sidebar sections and defaults.
 * Called when ?project= param changes in URL.
 */
function handleProjectSwitch(projectId) {
  if (projectId === _currentProjectId) return;
  _currentProjectId = projectId;

  let sidebar = document.getElementById('app-sidebar');
  let baseSections = getSectionsForScope(projectId);
  let sections = baseSections.map(s => ({
    ...s,
    subPanels: getSubPanelsForSection(s.id, projectId)
  }));
  
  if (sidebar) {
    // Guard against element not yet upgraded by Symbiote —
    // on cold load, setSections() can fire before renderCallback().
    if (sidebar.$) {
      sidebar.setSections(sections);
    } else {
      customElements.whenDefined('layout-sidebar').then(() => {
        sidebar.setSections(sections);
      });
    }
  }

  // Update dashboard state (single source of truth for other panels)
  dashState.activeProjectId = projectId;
  persistUiValue('ui/activeProjectId', projectId || null, 'pg-active-project-id');

  // Clear active chat if it does not belong to the new project
  if (dashState.activeChatId) {
    let routeChatId = parseQuery(getRoute().query || '').chat || null;
    let chat = (dashState.chats || []).find(c => c.id === dashState.activeChatId);
    if ((!chat && routeChatId !== dashState.activeChatId) || (chat && chat.projectId !== projectId)) {
      dashState.activeChatId = null;
      updateParams({ chat: null });
      dashEmit('active-chat-changed', { id: null });
    }
  }

  dashEmit('active-project-changed', { id: projectId });

  // Re-fetch skeleton for the new project context
  // This triggers file-tree and dep-graph to re-render with correct data
  state.skeleton = null;
  _currentSection = ''; // Force layout re-apply on next route
  api('/api/skeleton', {}).then(sk => {
    state.skeleton = sk;
    emit('skeleton-loaded', sk);
  }).catch(() => {});
  
  updateTopbarPath();
}

function updateTopbarPath() {
  let pathEl = document.getElementById('active-project-path');
  if (!pathEl) return;
  
  let proj = (dashState.projectHistory || []).find(p => p.id === dashState.activeProjectId);
  if (proj && proj.path) {
    pathEl.textContent = proj.path;
    pathEl.title = proj.path;
  } else {
    pathEl.textContent = 'Workspace not selected';
    pathEl.title = '';
  }
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

  // Layout switch on section change
  if (hasSection(section) && section !== _currentSection) {
    _currentSection = section;
    let layout = document.getElementById('app-layout');
    if (!layout) return;

    let storageKey = `pg-layout-v4-${projectId || 'global'}-${section}`;
    layout.$['@storage-key'] = storageKey;

    let fallback = getPortalRuntimeLayout(section, projectId);
    let saved = readLayout(storageKey);
    if (!layoutMatchesSection(section, saved, fallback)) saved = null;

    if (saved) {
      try {
        layout.setLayout(saved);
      } catch {
        if (fallback) layout.setLayout(fallback);
      }
    } else {
      if (fallback) layout.setLayout(fallback);
    }

    // Trigger sidebar sub-menu sync after DOM settles
    setTimeout(() => {
      layout.dispatchEvent(new CustomEvent('layout-change'));
    }, 100);
  }

  // Explorer file routing
  if (section === 'explorer' && subPath) {
    requestAnimationFrame(() => {
      emit('file-selected', { path: subPath, fromRoute: true });
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
    _currentSection = '';
    handleRoute();
  }
  document.documentElement.setAttribute('data-project-runtime-updated', transaction.id || 'transaction');
  document.dispatchEvent(new CustomEvent('agent-portal-project-runtime-updated', {
    detail: { projectId, project },
  }));
  return project;
}

async function u() {
  n(document.documentElement, o);
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

  requestAnimationFrame(async () => {
    // Register project & chat as global params — they persist across section switches
    registerGlobalParam('project', 'chat');

    // Register all panel types on the single layout
    let layout = document.getElementById('app-layout');
    let sidebar = document.getElementById('app-sidebar');
    await Promise.all([
      waitForElementApi(layout, 'registerPanelType'),
      waitForElementApi(sidebar, 'setSections'),
    ]);
    if (layout) {
      for (const [e, t] of Object.entries(panelTypes)) {
        layout.registerPanelType?.(e, t);
      }
      
      // Sync layout changes to sidebar sub-panels
      if (sidebar) {
        layout.addEventListener('layout-change', () => {
          if (!_currentSection) return;
          let panelNodes = Array.from(layout.querySelectorAll('layout-node[node-type="panel"]'));
          
          let panels = panelNodes.map((p, idx) => {
            let nodeData = p.$.nodeData || {};
            let pType = nodeData.panelType || 'panel';
            let config = panelTypes[pType] || {};
            return {
              title: config.title || pType,
              icon: config.icon || 'dashboard',
              panelId: p.$.nodeId,
              isMaster: idx === 0 // First panel is master (cannot be closed)
            };
          });
          
          let panelsToSet = panels.length > 1 ? panels : [];
          sidebar.updateSubPanels(_currentSection, panelsToSet);
        });

        layout.sub?.('layoutTree', (tree) => {
          let storageKey = layout.$['@storage-key'];
          if (storageKey && tree) persistLayout(storageKey, tree);
        });

        // Listen for panel close requests from the sidebar submenu
        sidebar.addEventListener('panel-close', (e) => {
          let pid = e.detail?.panelId;
          if (pid && typeof layout.joinPanels === 'function') {
            layout.joinPanels(pid);
          }
        });
      }
    }

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

    localStorage.removeItem("pg-explorer-layout");
    localStorage.removeItem("pg-layout-v2");
    localStorage.removeItem("pg-layout-v3");

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
    const t = e.detail; if (!t) return; state.skeleton = t; const n = new Set; for (const e of Object.values(t.n || {})) e.f && n.add(e.f); for (const e of Object.keys(t.X || {})) n.add(e); for (const [e, o] of Object.entries(t.f || {})) for (const t of o) n.add("./" === e ? t : `${e}${t}`); for (const [e, o] of Object.entries(t.a || {})) for (const t of o) n.add("./" === e ? t : `${e}${t}`); const o = document.getElementById("project-files"); o && (o.textContent = `${n.size} files`)
  });
  s("skeleton", e => { if (!e) return; state.skeleton = e; emit("skeleton-loaded", e) });
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
