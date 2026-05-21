import { getLayout, getSectionsForScope } from '../router-registry.js';
import { createPortalProjectRuntime } from './project-runtime-package.js';

const runtimeByProject = new Map();

function projectKey(projectId) {
  return projectId || 'global';
}

function entryLayout(projectId) {
  return projectId ? 'explorer' : 'dashboard';
}

function buildLayouts(sections) {
  return Object.fromEntries(
    sections
      .map((section) => [section.id, getLayout(section.id)])
      .filter(([, layout]) => Boolean(layout))
  );
}

export function getPortalProjectRuntime(projectId = null) {
  const key = projectKey(projectId);
  if (!runtimeByProject.has(key)) {
    const sections = getSectionsForScope(projectId);
    runtimeByProject.set(key, createPortalProjectRuntime({
      id: `agent-portal:${key}`,
      sections,
      layouts: buildLayouts(sections),
      entryLayout: entryLayout(projectId),
    }));
  }
  return runtimeByProject.get(key);
}

export function getPortalRuntimeLayout(sectionId, projectId = null) {
  return getPortalProjectRuntime(projectId).getLayout(sectionId)?.root || getLayout(sectionId);
}

export function applyPortalProjectTransaction(projectId, transaction) {
  return getPortalProjectRuntime(projectId).applyTransaction(transaction);
}

export function clearPortalProjectRuntimes() {
  runtimeByProject.clear();
}
