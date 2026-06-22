import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readConfig } from '../../config-store.js';
import { getTeamMemoryRoot } from '../../../../packages/agent-pool-mcp/src/runtime/paths.js';
import { getStateGraph } from '../../state-graph.js';
import { getFlywheelStats } from '../../mlops/flywheel.js';
import { listAdapterTypes, getAgentList, invalidateAgentList } from '../../adapters/index.js';
import { REGISTRY, getRegistryByCategory } from '../marketplace-registry.js';
import { getLogPath } from '../../ops/runtime.js';
import { createXrDiagnosticLogStore } from '../xr-diagnostics-log.js';
import { json, parseBody } from './http.js';

function normalizeAgentSlug(value) {
  let slug = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) {
    throw new Error('Invalid agent slug');
  }
  return slug;
}

function normalizeAgentResourceGroup(value) {
  let group = String(value || '').trim();
  if (!group || group === 'none') return null;
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(group)) {
    throw new Error('Invalid resource group');
  }
  return group;
}

function yamlScalar(value) {
  let text = String(value || '');
  return /^[A-Za-z0-9._-]+$/.test(text) ? text : JSON.stringify(text);
}

function setFrontmatterScalar(content, key, value) {
  let marker = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  let line = value ? `${key}: ${yamlScalar(value)}` : null;
  if (!marker) {
    return line ? `---\n${line}\n---\n\n${String(content || '').replace(/^\n+/, '')}` : content;
  }

  let before = content.slice(0, marker.index);
  let body = content.slice(marker.index + marker[0].length);
  let lines = marker[1].split(/\r?\n/);
  let found = false;
  let nextLines = [];
  for (let current of lines) {
    if (new RegExp(`^${key}\\s*:`).test(current)) {
      found = true;
      if (line) nextLines.push(line);
    } else {
      nextLines.push(current);
    }
  }
  if (!found && line) nextLines.push(line);
  return `${before}---\n${nextLines.join('\n').replace(/\n+$/, '')}\n---\n${body}`;
}

async function updateAgentResourceGroup(agentSlug, resourceGroup) {
  let slug = normalizeAgentSlug(agentSlug);
  let group = normalizeAgentResourceGroup(resourceGroup);
  let teamMemoryRoot = getTeamMemoryRoot();
  if (!teamMemoryRoot) {
    throw new Error(
      'Team memory is not configured. Set agentPortal.teamMemoryRoot or AGENT_PORTAL_MEMORY_ROOT.',
    );
  }
  let agentsDir = path.join(teamMemoryRoot, 'agents');
  let agentPath = path.join(agentsDir, `${slug}.md`);
  let realDir = await fs.realpath(agentsDir);
  let targetDir = await fs.realpath(path.dirname(agentPath));
  if (targetDir !== realDir) throw new Error('Agent path must stay inside team-memory agents');
  let stat = await fs.lstat(agentPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Agent file is not editable');
  let content = await fs.readFile(agentPath, 'utf8');
  let nextContent = setFrontmatterScalar(content, 'resource_group', group);
  await fs.writeFile(agentPath, nextContent, 'utf8');
  invalidateAgentList();
  return { slug, resourceGroup: group };
}

/**
 * @param {{ proxyManager: any, projectRoot: string }} ctx
 * @returns {Record<string, (req: any, res: any) => void>}
 */
export function createCoreRoutes(ctx) {
  let { proxyManager, projectRoot, getNetworkAccessStatus, env = process.env } = ctx;
  let xrDiagnosticLogStore = createXrDiagnosticLogStore({
    logFile: getLogPath('xr-diagnostics', ['events.jsonl'], { projectRoot, env }),
  });

  return {
    'GET /api/instances': (_req, res) => {
      json(res, proxyManager.getInstances());
    },

    'GET /api/project-info': (_req, res) => {
      let networkAccess = typeof getNetworkAccessStatus === 'function' ? getNetworkAccessStatus() : null;
      json(res, {
        name: 'mcp-agent-portal',
        path: projectRoot,
        agents: proxyManager.servers.size,
        pid: process.pid,
        networkAccess,
      });
    },

    'GET /api/server-status': (_req, res) => {
      json(res, {
        uptime: Math.round(process.uptime()),
        agents: proxyManager.servers.size,
        monitors: proxyManager.monitors.size,
        shutdownAt: null,
      });
    },

    'GET /api/marketplace': (_req, res) => {
      let config = readConfig();
      json(res, {
        installed: config.mcpServers || {},
        available: REGISTRY,
        categories: getRegistryByCategory(),
      });
    },

    'GET /api/health': (_req, res) => {
      json(res, proxyManager.getHealthStatus());
    },

    'GET /api/adapter/status': (_req, res) => {
      json(res, proxyManager.adapterPool?.getStatus() || { adapters: {} });
    },

    'GET /api/flywheel/stats': (_req, res) => {
      json(res, getFlywheelStats());
    },

    'GET /api/adapter/types': (_req, res) => {
      json(res, listAdapterTypes());
    },

    'GET /api/agents': (_req, res) => {
      json(res, { agents: getAgentList() });
    },

    'POST /api/agents/resource-group': async (req, res) => {
      try {
        let body = await parseBody(req);
        let agent = await updateAgentResourceGroup(
          body.agent || body.agentSlug || body.slug,
          body.resourceGroup || body.resource_group,
        );
        json(res, { ok: true, agent });
      } catch (error) {
        json(res, { error: error.message }, 400);
      }
    },

    'GET /api/xr-diagnostics/logs': (_req, res) => {
      json(res, { logs: xrDiagnosticLogStore.list() });
    },

    'GET /api/xr-diagnostics/summary': (_req, res) => {
      json(res, xrDiagnosticLogStore.summary());
    },

    'POST /api/xr-diagnostics/log': async (req, res) => {
      try {
        let body = await parseBody(req, 256 * 1024);
        let entry = xrDiagnosticLogStore.push(req, body);
        json(res, { ok: true, entry });
      } catch (error) {
        json(res, { error: error.message }, 400);
      }
    },
  };
}
