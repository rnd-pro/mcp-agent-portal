/**
 * data/roles — Instruction & Role Manager
 *
 * Manages AI roles/instructions from Markdown files with YAML frontmatter.
 * Supports listing, filtering by tags, combining roles into system prompts,
 * and scanning directories for role files.
 *
 * Ported from Mr-Computer/modules/razrab-bot/src/services/roles-service.js
 *
 * @module symbiote-engine/packs/data/roles
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Parse YAML frontmatter from markdown content
 * @param {string} content
 * @returns {{ frontmatter: Object, body: string }}
 */
function parseFrontmatter(content) {
  let fmRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  let match = content.match(fmRegex);
  if (!match) return { frontmatter: {}, body: content.trim() };

  let fmText = match[1];
  let body = match[2].trim();
  let frontmatter = {};

  for (const line of fmText.split('\n')) {
    let colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    let key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();


    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^["']|["']$/g, ''));
    }
    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

/**
 * Scan directory for role markdown files
 * @param {string} dirPath
 * @param {string} prefix
 * @returns {Promise<Map<string, Object>>}
 */
async function scanRolesDirectory(dirPath, prefix = '') {
  let roles = new Map();
  let tags = new Set();

  try {
    let entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      let fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        let subRoles = await scanRolesDirectory(
          fullPath,
          prefix ? `${prefix}/${entry.name}` : entry.name
        );
        for (const [id, role] of subRoles) {
          roles.set(id, role);
          if (Array.isArray(role.tags)) role.tags.forEach((t) => tags.add(t));
        }
        continue;
      }

      if (!entry.name.endsWith('.md')) continue;

      let content = await readFile(fullPath, 'utf-8');
      let { frontmatter, body } = parseFrontmatter(content);

      let roleId = prefix
        ? `${prefix}/${entry.name.replace('.md', '')}`
        : entry.name.replace('.md', '');

      let role = {
        id: roleId,
        name: frontmatter.name || frontmatter.title || roleId,
        tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
        description: frontmatter.description || '',
        category: frontmatter.category || prefix || 'general',
        content: body,
        path: fullPath,
      };

      roles.set(roleId, role);
      role.tags.forEach((t) => tags.add(t));
    }
  } catch {

  }

  return roles;
}


export default {
  type: 'data/roles',
  category: 'data',
  icon: 'person',

  driver: {
    description: 'Manage AI roles/instructions from Markdown files with YAML frontmatter',
    inputs: [{ name: 'rolesDir', type: 'string' }],
    outputs: [
      { name: 'result', type: 'any' },
      { name: 'error', type: 'string' },
    ],
    params: {
      operation: {
        type: 'string',
        default: 'list',
        description: 'Operation: list | get | filter-tags | combine | scan',
      },
      roleId: { type: 'string', default: null, description: 'Role ID for get operation' },
      tags: { type: 'any', default: null, description: 'Array of tags for filter-tags' },
      matchAll: {
        type: 'boolean',
        default: true,
        description: 'Require ALL tags (true) or ANY tag (false)',
      },
      roleIds: {
        type: 'any',
        default: null,
        description: 'Array of role IDs for combine operation',
      },
    },
  },

  lifecycle: {
    validate: (inputs) => {
      return typeof inputs.rolesDir === 'string' && inputs.rolesDir.length > 0;
    },

    cacheKey: (inputs, params) => {
      return `roles:${params.operation}:${inputs.rolesDir}:${params.roleId || ''}:${JSON.stringify(params.tags || '')}`;
    },

    execute: async (inputs, params) => {
      let { rolesDir } = inputs;
      let { operation } = params;

      try {

        let roles = await scanRolesDirectory(rolesDir);

        let opMap = {
          list: () => {
            let allTags = new Set();
            let rolesList = [];
            for (const [, role] of roles) {
              rolesList.push({
                id: role.id,
                name: role.name,
                tags: role.tags,
                description: role.description,
                category: role.category,
              });
              role.tags.forEach((t) => allTags.add(t));
            }
            return {
              result: {
                roles: rolesList,
                count: rolesList.length,
                tags: [...allTags].sort(),
              },
            };
          },
          scan: () => opMap.list(),
          get: () => {
            if (!params.roleId) return { error: 'roleId is required for get operation' };
            let role = roles.get(params.roleId);
            if (!role) return { error: `Role not found: ${params.roleId}` };
            return { result: { role } };
          },
          'filter-tags': () => {
            if (!Array.isArray(params.tags)) return { error: 'tags array is required' };
            let filtered = [];
            for (const [, role] of roles) {
              let match = params.matchAll
                ? params.tags.every((t) => role.tags.includes(t))
                : params.tags.some((t) => role.tags.includes(t));
              if (match) filtered.push(role);
            }
            return { result: { roles: filtered, count: filtered.length } };
          },
          combine: () => {
            if (!Array.isArray(params.roleIds)) return { error: 'roleIds array is required' };
            let parts = [];
            let resolved = [];
            let missing = [];
            for (const id of params.roleIds) {
              let role = roles.get(id);
              if (role) {
                parts.push(`# ${role.name}\n\n${role.content}`);
                resolved.push(id);
              } else {
                missing.push(id);
              }
            }
            return {
              result: {
                systemPrompt: parts.join('\n\n---\n\n'),
                resolved,
                missing,
              },
            };
          },
        };

        if (opMap[operation]) {
          return opMap[operation]();
        } else {
          return { error: `Unknown operation: ${operation}` };
        }
      } catch (err) {
        return { error: `roles ${operation} failed: ${err.message}` };
      }
    },
  },
};
