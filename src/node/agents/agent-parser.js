/**
 * Agent Entity Parser
 * 
 * Parses `.agent-portal/agents/*.md` files with YAML frontmatter and resolves skill composition.
 * 
 * Frontmatter schema:
 *   name, description, role, icon, color, resource_group, provider, model, models[], rotation,
 *   skills[], policy, approval_mode, visibleAgents[], max_concurrent, timeout
 * 
 * Skill resolution:
 *   - `skills: [X, Y]` → content prepended BEFORE agent body
 *   - `{{skill:Z}}`    → resolved inline WHERE placed in body
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { parseMarkdownFrontmatter } from './frontmatter.js';

/**
 * Parse YAML-like frontmatter from markdown. Handles simple key-value and arrays.
 * @param {string} raw - full file content
 * @returns {{ meta: object, body: string }}
 */
function parseFrontmatter(raw) {
  let parsed = parseMarkdownFrontmatter(raw);
  return parsed ? { meta: parsed.meta, body: parsed.body } : { meta: {}, body: raw.trim() };
}

import { statSync } from 'fs';

let _skillCache = null;
let _skillCacheDir = null;
let _skillCacheTime = 0;

function getSkillMap(skillsDir) {
  const now = Date.now();
  if (_skillCache && _skillCacheDir === skillsDir && (now - _skillCacheTime < 2000)) return _skillCache;

  let map = new Map();
  if (!existsSync(skillsDir)) return map;

  function scan(dir) {
    for (const f of readdirSync(dir)) {
      if (f.startsWith('.')) continue;
      const fullPath = join(dir, f);
      if (statSync(fullPath).isDirectory()) {
        scan(fullPath);
      } else if (f.endsWith('.md')) {
        const raw = readFileSync(fullPath, 'utf8');
        const { meta } = parseFrontmatter(raw);
        const name = meta.name || basename(f, '.md');
        map.set(name, raw.trim());
      }
    }
  }
  
  scan(skillsDir);
  _skillCache = map;
  _skillCacheDir = skillsDir;
  _skillCacheTime = now;
  return map;
}

/**
 * Load a single skill file by name.
 * @param {string} skillsDir - path to `.agent-portal/skills/`
 * @param {string} skillName - skill name (without .md)
 * @returns {string|null}
 */
function loadSkill(skillsDir, skillName) {
  const map = getSkillMap(skillsDir);
  return map.get(skillName) || null;
}

/**
 * Resolve skills for an agent.
 * - `skills: [X, Y]` → prepend before body
 * - `{{skill:Z}}`    → resolve inline in body
 * 
 * @param {string} body - agent body text
 * @param {string[]} skillNames - frontmatter skills array
 * @param {string} skillsDir - path to skills directory
 * @returns {string} assembled prompt
 */
function resolveSkills(body, skillNames, skillsDir) {
  let parts = [];

  // 1. Prepend frontmatter skills
  for (let name of skillNames) {
    let content = loadSkill(skillsDir, name);
    if (!content) throw new Error(`Required skill '${name}' not found`);
    parts.push(content);
  }

  // 2. Resolve inline {{skill:name}} references
  let resolvedBody = body.replace(/\{\{skill:(\w[\w-]*)\}\}/g, (_, name) => {
    let content = loadSkill(skillsDir, name);
    if (!content) throw new Error(`Required inline skill '${name}' not found`);
    return content;
  });

  parts.push(resolvedBody);
  return parts.join('\n\n---\n\n');
}

function approvalModeFromMeta(meta) {
  let explicit = meta.approval_mode || meta.approvalMode || meta.access_mode || meta.accessMode;
  if (explicit) return explicit;
  if (meta.policy === 'read-only') return 'plan';
  if (meta.policy === 'admin') return 'yolo';
  if (meta.policy === 'read-write') return 'auto_edit';
  return null;
}

/**
 * Parse a single agent file.
 * @param {string} filePath - absolute path to agent .md file
 * @param {string} skillsDir - path to skills directory
 * @returns {object} agent definition
 */
export function parseAgent(filePath, skillsDir) {
  let raw = readFileSync(filePath, 'utf8');
  let { meta, body } = parseFrontmatter(raw);
  
  let slug = meta.name || basename(filePath, '.md');
  let skillNames = Array.isArray(meta.skills) ? meta.skills : [];
  let prompt = resolveSkills(body, skillNames, skillsDir);

  return {
    slug,
    description: meta.description || '',
    role: meta.role || 'executor',
    icon: meta.icon || 'smart_toy',
    color: meta.color || '#666',
    resourceGroup: meta.resource_group || meta.resourceGroup || meta.group || null,
    provider: meta.provider || null,
    model: meta.model || null,
    models: Array.isArray(meta.models) ? meta.models : [],
    rotation: meta.rotation || 'on_error',
    skills: skillNames,
    policy: meta.policy || 'read-write',
    approvalMode: approvalModeFromMeta(meta),
    visibleAgents: Array.isArray(meta.visibleAgents) ? meta.visibleAgents : [],
    maxConcurrent: meta.max_concurrent || 1,
    timeout: meta.timeout || 600,
    prompt,
    filePath,
  };
}

/**
 * Load all agents from a directory.
 * @param {string} agentsDir - path to `.agent-portal/agents/`
 * @param {string} skillsDir - path to `.agent-portal/skills/`
 * @returns {Map<string, object>} slug → agent definition
 */
export function loadAgents(agentsDir, skillsDir) {
  let agents = new Map();
  if (!existsSync(agentsDir)) return agents;

  let files = readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  for (let file of files) {
    let agent = parseAgent(join(agentsDir, file), skillsDir);
    agents.set(agent.slug, agent);
  }
  return agents;
}

/**
 * Get agent metadata suitable for UI display (icon, color, description).
 * @param {Map<string, object>} agents
 * @returns {object[]} array of { slug, icon, color, description, role, resourceGroup }
 */
export function getAgentCatalog(agents) {
  let catalog = [];
  for (let [, agent] of agents) {
    catalog.push({
      slug: agent.slug,
      icon: agent.icon,
      color: agent.color,
      description: agent.description,
      role: agent.role,
      resourceGroup: agent.resourceGroup,
      approvalMode: agent.approvalMode,
    });
  }
  return catalog;
}
