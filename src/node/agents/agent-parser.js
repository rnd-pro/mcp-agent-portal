/**
 * Agent Entity Parser
 * 
 * Parses `.agents/agents/*.md` files with YAML frontmatter and resolves skill composition.
 * 
 * Frontmatter schema:
 *   name, description, role, icon, color, models[], rotation,
 *   skills[], policy, visibleAgents[], max_concurrent, timeout
 * 
 * Skill resolution:
 *   - `skills: [X, Y]` → content prepended BEFORE agent body
 *   - `{{skill:Z}}`    → resolved inline WHERE placed in body
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

/**
 * Parse YAML-like frontmatter from markdown. Handles simple key-value and arrays.
 * @param {string} raw - full file content
 * @returns {{ meta: object, body: string }}
 */
function parseFrontmatter(raw) {
  let match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw.trim() };

  let yamlBlock = match[1];
  let body = match[2].trim();
  let meta = {};
  let currentKey = null;
  let isArray = false;

  for (let line of yamlBlock.split('\n')) {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Array item
    if (trimmed.startsWith('- ') && currentKey && isArray) {
      meta[currentKey].push(trimmed.slice(2).trim());
      continue;
    }

    // Key: value
    let kvMatch = trimmed.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      let key = kvMatch[1];
      let val = kvMatch[2].trim();
      
      if (val === '') {
        // Start of array block
        meta[key] = [];
        currentKey = key;
        isArray = true;
      } else if (val.startsWith('[') && val.endsWith(']')) {
        // Inline array: [a, b, c]
        meta[key] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
        currentKey = key;
        isArray = false;
      } else {
        // Scalar value
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (/^\d+$/.test(val)) val = parseInt(val, 10);
        else if (/^\d+\.\d+$/.test(val)) val = parseFloat(val);
        // Strip quotes
        else if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        meta[key] = val;
        currentKey = key;
        isArray = false;
      }
    }
  }

  return { meta, body };
}

/**
 * Load a single skill file by name.
 * @param {string} skillsDir - path to `.agents/skills/`
 * @param {string} skillName - skill name (without .md)
 * @returns {string|null}
 */
function loadSkill(skillsDir, skillName) {
  let filePath = join(skillsDir, `${skillName}.md`);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf8').trim();
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
    if (content) parts.push(content);
  }

  // 2. Resolve inline {{skill:name}} references
  let resolvedBody = body.replace(/\{\{skill:(\w[\w-]*)\}\}/g, (_, name) => {
    let content = loadSkill(skillsDir, name);
    return content || `<!-- skill "${name}" not found -->`;
  });

  parts.push(resolvedBody);
  return parts.join('\n\n---\n\n');
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
    models: Array.isArray(meta.models) ? meta.models : [],
    rotation: meta.rotation || 'on_error',
    skills: skillNames,
    policy: meta.policy || 'read-write',
    visibleAgents: Array.isArray(meta.visibleAgents) ? meta.visibleAgents : [],
    maxConcurrent: meta.max_concurrent || 1,
    timeout: meta.timeout || 600,
    prompt,
    filePath,
  };
}

/**
 * Load all agents from a directory.
 * @param {string} agentsDir - path to `.agents/agents/`
 * @param {string} skillsDir - path to `.agents/skills/`
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
 * @returns {object[]} array of { slug, icon, color, description, role }
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
    });
  }
  return catalog;
}
