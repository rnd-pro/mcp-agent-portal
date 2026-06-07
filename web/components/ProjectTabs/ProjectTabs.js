import { ProjectTabs } from 'symbiote-ui/ui';
import { state as dashState, events as dashEvents, emit as dashEmit } from '../../dashboard-state.js';
import { navigate, getRoute, parseQuery } from 'symbiote-ui/ui';
import { uiPrompt } from 'symbiote-ui/ui';
import { persistUiValue, readUiValue } from '../../common/ui-state.js';

let configured = new WeakSet();
const GLOBAL_WORKSPACE_ID = 'global';

function getWorkspaceRouteKey(workspaceId) {
  return `pg-workspace-route-${workspaceId || GLOBAL_WORKSPACE_ID}`;
}

function getWorkspaceRoutePath(workspaceId) {
  return `ui/workspaces/${workspaceId || GLOBAL_WORKSPACE_ID}/routeHash`;
}

function normalizeRouteHash(hash) {
  if (!hash || hash === '#' || hash === '#default') return '';
  return hash.startsWith('#') ? hash : `#${hash}`;
}

function updateFavicon(activeColor) {
  let link = document.querySelector("link[rel*='icon']") || document.createElement('link');
  link.type = 'image/svg+xml';
  link.rel = 'shortcut icon';
  if (!activeColor) {
    link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="%234c8bf5" /></svg>';
  } else {
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${encodeURIComponent(activeColor)}"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`;
    link.href = 'data:image/svg+xml,' + svg;
  }
  document.head.appendChild(link);
}

function getProjectIdFromRoute() {
  let route = getRoute();
  let globals = parseQuery(route.query || '');
  return globals.project || null;
}

function getWorkspaceIdFromHash(hash = location.hash) {
  let query = String(hash || '').split('?')[1] || '';
  let projectId = new URLSearchParams(query).get('project') || null;
  return projectId || GLOBAL_WORKSPACE_ID;
}

function routeBelongsToWorkspace(workspaceId, hash) {
  let routeWorkspaceId = getWorkspaceIdFromHash(hash);
  return routeWorkspaceId === (workspaceId || GLOBAL_WORKSPACE_ID);
}

function rememberCurrentWorkspaceRoute() {
  let hash = normalizeRouteHash(location.hash);
  if (!hash) return;
  let workspaceId = getWorkspaceIdFromHash(hash);
  persistUiValue(getWorkspaceRoutePath(workspaceId), hash, getWorkspaceRouteKey(workspaceId));
}

function readWorkspaceRoute(workspaceId) {
  let route = readUiValue(getWorkspaceRoutePath(workspaceId), getWorkspaceRouteKey(workspaceId), '');
  route = normalizeRouteHash(typeof route === 'string' ? route : '');
  return route && routeBelongsToWorkspace(workspaceId, route) ? route : '';
}

function activateWorkspaceRoute(workspaceId) {
  let savedRoute = readWorkspaceRoute(workspaceId);
  if (savedRoute) {
    if (location.hash !== savedRoute) {
      location.hash = savedRoute;
    } else {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
    return;
  }

  if (!workspaceId || workspaceId === GLOBAL_WORKSPACE_ID) {
    navigate('dashboard', '', { project: null });
  } else {
    navigate('explorer', '', { project: workspaceId });
  }
}

function applyActiveProjectAccent(activeColor) {
  let root = document.documentElement;
  if (activeColor) {
    root.style.setProperty('--project-accent', activeColor);
    root.style.setProperty('--sn-composer-send-hover-bg', activeColor);
  } else {
    root.style.removeProperty('--project-accent');
    root.style.removeProperty('--sn-composer-send-hover-bg');
  }
}

function renderProjectTabs(el) {
  let openIds = dashState.openProjectIds || [];
  let history = dashState.projectHistory || [];
  let activeId = getProjectIdFromRoute();
  let activeProject = history.find((p) => p.id === activeId);
  let activeColor = activeProject?.color || null;
  let tabs = [];

  for (let id of openIds) {
    let proj = history.find((p) => p.id === id);
    if (!proj) continue;
    tabs.push({
      id,
      name: proj.name,
      color: proj.color,
      icon: 'folder',
    });
  }

  el.setTabs(tabs, activeId);
  applyActiveProjectAccent(activeColor);
  updateFavicon(activeColor);
}

async function fetchHistory() {
  try {
    let res = await fetch('/api/projects/history');
    let data = await res.json();
    dashState.projectHistory = data.projects || [];
    dashState.openProjectIds = data.activeIds || [];
    dashEmit('projects-history-updated', dashState.projectHistory);
  } catch (err) {
    console.error('[ProjectTabs] fetch history error:', err);
  }
}

async function openProject(id, proj, el) {
  rememberCurrentWorkspaceRoute();
  let res = await fetch('/api/projects/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: proj.name, path: proj.path }),
  });
  let data = await res.json();
  if (data.ok) {
    if (!dashState.openProjectIds.includes(id)) dashState.openProjectIds.push(id);
    activateWorkspaceRoute(id);
    renderProjectTabs(el);
  }
}

async function openNewProject(projectPath, el) {
  rememberCurrentWorkspaceRoute();
  let name = projectPath.split('/').pop() || projectPath;
  let res = await fetch('/api/projects/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, path: projectPath }),
  });
  let data = await res.json();
  if (data.ok) {
    await fetchHistory();
    if (!dashState.openProjectIds.includes(data.id)) dashState.openProjectIds.push(data.id);
    activateWorkspaceRoute(data.id);
    renderProjectTabs(el);
  }
}

async function showAddDialog(el) {
  let history = dashState.projectHistory || [];
  let openIds = new Set(dashState.openProjectIds || []);
  let available = history.filter((p) => !openIds.has(p.id));

  if (available.length > 0) {
    let names = available.map((p, i) => `${i + 1}. ${p.name} (${p.path})`).join('\n');
    let choice = await uiPrompt(`Open project:\n${names}\n\nOr enter a new path:`);
    if (!choice) return;

    let idx = parseInt(choice, 10) - 1;
    if (idx >= 0 && idx < available.length) {
      await openProject(available[idx].id, available[idx], el);
    } else {
      await openNewProject(choice.trim(), el);
    }
  } else {
    let pathStr = await uiPrompt('Enter project path:');
    if (pathStr) await openNewProject(pathStr.trim(), el);
  }
}

function configureProjectTabs(el) {
  if (!(el instanceof ProjectTabs) || configured.has(el)) return;
  configured.add(el);

  el.addEventListener('project-tabs-home', () => {
    rememberCurrentWorkspaceRoute();
    activateWorkspaceRoute(GLOBAL_WORKSPACE_ID);
  });
  el.addEventListener('project-tabs-add', () => showAddDialog(el));
  el.addEventListener('project-tabs-select', (event) => {
    let id = event.detail?.id;
    if (!id || id === getProjectIdFromRoute()) return;
    rememberCurrentWorkspaceRoute();
    activateWorkspaceRoute(id);
    renderProjectTabs(el);
  });
  el.addEventListener('project-tabs-close', async (event) => {
    let id = event.detail?.id;
    if (!id) return;
    await fetch('/api/projects/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    dashState.openProjectIds = dashState.openProjectIds.filter((item) => item !== id);
    if (getProjectIdFromRoute() === id) activateWorkspaceRoute(GLOBAL_WORKSPACE_ID);
    renderProjectTabs(el);
  });

  dashEvents.addEventListener('projects-history-updated', () => renderProjectTabs(el));
  dashEvents.addEventListener('active-project-changed', () => renderProjectTabs(el));
  window.addEventListener('hashchange', () => {
    rememberCurrentWorkspaceRoute();
    renderProjectTabs(el);
  });
  rememberCurrentWorkspaceRoute();
  renderProjectTabs(el);
}

function configureAllProjectTabs(root = document) {
  root.querySelectorAll('project-tabs').forEach((el) => configureProjectTabs(el));
}

customElements.whenDefined('project-tabs').then(() => {
  configureAllProjectTabs();
  new MutationObserver((records) => {
    for (let record of records) {
      for (let node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches?.('project-tabs')) configureProjectTabs(node);
        configureAllProjectTabs(node);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
});
