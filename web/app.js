// @ctx .context/web/app.ctx
import { Layout as e, LayoutTree as t, applyTheme as n, CARBON as o, registerGlobalParam, setDefaultPanel, updateParams, getRoute, parseQuery, buildHash, navigate } from "symbiote-node";
import { panelTypes, getSections, getSectionsForScope, getLayout, hasSection } from "./router-registry.js";
import { followController } from "./follow-controller.js";
import "./components/follow-ribbon.js";
import { state as a, subscribe as s, onEvent as i, call as r, connect as c } from "./state.js";
import "./panels/file-tree.js";
import "./panels/code-viewer.js";
import "./panels/ctx-panel.js";
import "./panels/dep-graph.js";
import "./panels/health-panel.js";
import "./panels/live-monitor.js";
import "./components/quick-open.js";
import "./components/canvas-graph.js";
import "./panels/ActiveContext/ActiveContext.js";

// Dashboard panels
import "./panels/ProjectList/ProjectList.js";
import "./panels/ActionBoard/ActionBoard.js";
import "./panels/SettingsPanel/SettingsPanel.js";
import "./panels/AgentChat/AgentChat.js";
import "./panels/Marketplace/Marketplace.js";
import "./panels/Topology/TopologyPanel.js";
import "./panels/ToolExplorer/ToolExplorer.js";
import "./panels/ActiveTasks/ActiveTasks.js";
import "./panels/PipelineManager/PipelineManager.js";
import "./panels/WorkflowExplorer/WorkflowExplorer.js";
import "./panels/GroupManager/GroupManager.js";
import "./panels/SkillManager/SkillManager.js";
import "./panels/PeerReview/PeerReview.js";
import "./components/ProjectTabs/ProjectTabs.js";
import { state as dashState, events as dashEvents, emit as dashEmit } from "./dashboard-state.js";
import { stateSync } from "./state-sync.js";

export const state = { skeleton: null, activeFile: null, ws: null, monitorEvents: [] };
export { formatStats } from "./stats-format.js";
export const baseUrl = new URL(".", import.meta.url).href; const l = baseUrl;

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
    const t = await e.text();
    throw console.error("[dashboard] fetch failed:", e.status, t), new Error(`Fetch failed: ${e.status}`);
  }
  return e.json();
}

function initDashboardWS(e) {
  if (!e.length) return void console.warn("[dashboard] No projects to connect WebSockets for");
  const t = "https:" === location.protocol ? "wss://" : "ws://", o = location.host;
  for (const r of e) connectDashboardWS(r, t, o)
}

function connectDashboardWS(e, t, o, _att = 0) {
  const r = `${t}${o}${e.prefix}/ws/monitor`, n = new WebSocket(r);
  n.onopen = () => {
    _att = 0;
    console.log("[dashboard] WS connected:", e.name || e.projectName);
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
  n.onerror = () => { console.error("[dashboard] WS error:", e.name || e.projectName) };
  n.onclose = r => {
    console.warn("[dashboard] WS closed:", e.name || e.projectName, r.code);
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
 */
function getSubPanelsForSection(sectionId, projectId) {
  let storageKey = `pg-layout-v2-${projectId || 'global'}-${sectionId}`;
  let saved = localStorage.getItem(storageKey);
  let tree;
  if (saved) {
    try { tree = JSON.parse(saved); } catch (e) {}
  }
  if (!tree) {
    let fallback = getLayout(sectionId);
    if (fallback) tree = fallback;
  }
  
  let panels = [];
  function walk(node) {
    if (!node) return;
    if (node.nodeType === 'panel') {
      let pType = node.panelType || 'panel';
      let config = panelTypes[pType] || {};
      panels.push({
        title: config.title || pType,
        icon: config.icon || 'dashboard',
        panelId: node.id || Math.random().toString(36).substr(2, 9),
        isMaster: panels.length === 0
      });
    }
    if (node.children) node.children.forEach(walk);
  }
  walk(tree);
  
  // If there is only 1 panel, we don't show a submenu
  return panels.length > 1 ? panels : [];
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
  if (projectId) {
    localStorage.setItem('pg-active-project-id', projectId);
  } else {
    localStorage.removeItem('pg-active-project-id');
  }
  dashEmit('active-project-changed', { id: projectId });

  // Re-fetch skeleton for the new project context
  // This triggers file-tree and dep-graph to re-render with correct data
  state.skeleton = null;
  _currentSection = ''; // Force layout re-apply on next route
  api('/api/skeleton', {}).then(sk => {
    state.skeleton = sk;
    emit('skeleton-loaded', sk);
  }).catch(err => {
    console.warn('[app] skeleton fetch for project switch:', err);
  });
  
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

    let storageKey = `pg-layout-v2-${projectId || 'global'}-${section}`;
    layout.$['@storage-key'] = storageKey;

    let saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        layout.setLayout(JSON.parse(saved));
      } catch (err) {
        let fallback = getLayout(section);
        if (fallback) layout.setLayout(fallback);
      }
    } else {
      let fallback = getLayout(section);
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

async function u() {
  n(document.documentElement, o);

  requestAnimationFrame(async () => {
    // Register project & chat as global params — they persist across section switches
    registerGlobalParam('project', 'chat');

    // Register all panel types on the single layout
    let layout = document.getElementById('app-layout');
    let sidebar = document.getElementById('app-sidebar');
    if (layout) {
      for (const [e, t] of Object.entries(panelTypes)) {
        layout.registerPanelType(e, t);
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

    try {
      const [histRes, cliRes, chatRes] = await Promise.all([
        fetch('/api/projects/history').then(r => r.json()),
        fetch('/api/cli/config').then(r => r.json()),
        fetch('/api/chats').then(r => r.json()),
      ]);
      dashState.projectHistory = histRes.projects || [];
      dashState.openProjectIds = histRes.activeIds || [];
      dashState.globalCli = cliRes.global || {};
      dashState.chats = chatRes.chats || [];
      dashEmit('projects-history-updated', dashState.projectHistory);
      dashEmit('chats-updated');
      updateTopbarPath();
    } catch (err) {
      console.warn('[app] project/chat init error:', err);
    }

    localStorage.removeItem("pg-explorer-layout");
    localStorage.removeItem("pg-layout-v2");

    // Initial sidebar + route setup
    let savedProjectId = localStorage.getItem('pg-active-project-id');
    let route = getRoute();
    let globals = parseQuery(route.query);
    let initialProjectId = globals.project || savedProjectId || null;

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
