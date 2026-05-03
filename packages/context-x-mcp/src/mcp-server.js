import { readConfig, writeConfig } from './config.js';
import { syncMemory, saveAndPush, isGitRepo } from './git-sync.js';
import { buildTagIndex, searchByTags, toLightList } from './workflow-index.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'child_process';
import { saveScript, listScripts } from './script-store.js';
import { trackFiles, untrackFiles, getTrackedFiles } from './file-tracker.js';

// Import flywheel from core using relative path
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { logFeedback } = await import(path.join(__dirname, '../../../src/node/mlops/flywheel.js'));

// ─── Workflow Index Cache ───────────────────────────────────
// Rebuilt on demand, invalidated by a simple TTL.
let _wfCache = null;
let _wfCacheTime = 0;
const WF_CACHE_TTL = 30_000; // 30 seconds

/**
 * Get or build the workflow index. Scans all configured directories.
 * @returns {{ nodes: Map, tagIndex: Map }}
 */
function getWorkflowIndex() {
  if (_wfCache && (Date.now() - _wfCacheTime < WF_CACHE_TTL)) return _wfCache;

  const config = readConfig();
  const dirs = [];

  // Team memory workflows
  if (config.localPath) {
    const teamWf = path.join(config.localPath, 'workflows');
    if (fs.existsSync(teamWf)) dirs.push(teamWf);
  }

  // Bundled workflows (shipped with context-x-mcp)
  const bundledWf = path.join(path.dirname(import.meta.url.replace('file://', '')), '..', 'workflows');
  if (fs.existsSync(bundledWf)) dirs.push(bundledWf);

  // Merge all directories into one index
  const nodes = new Map();
  const tagIndex = new Map();
  for (const dir of dirs) {
    const idx = buildTagIndex(dir);
    for (const [id, node] of idx.nodes) nodes.set(id, node);
    for (const [tag, ids] of idx.tagIndex) {
      if (!tagIndex.has(tag)) tagIndex.set(tag, []);
      tagIndex.get(tag).push(...ids);
    }
  }

  _wfCache = { nodes, tagIndex };
  _wfCacheTime = Date.now();
  return _wfCache;
}

const TOOLS = [
  {
    name: 'read_team_context',
    description: 'Read the team/global context repository. Actions: list_skills, get_skill, get_rules',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list_skills', 'get_skill', 'get_rules'],
          description: 'Action to perform'
        },
        skillName: {
          type: 'string',
          description: 'Name of the skill file (for get_skill)'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'sync_memory',
    description: 'Pull the latest changes from the team context repository',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'save_skill',
    description: 'Save a new skill or rule to the team context repository and push to origin',
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Name of the file to save (e.g., react-hooks-rule.md)'
        },
        content: {
          type: 'string',
          description: 'Markdown content of the skill/rule'
        },
        commitMessage: {
          type: 'string',
          description: 'Short description for the git commit'
        }
      },
      required: ['filename', 'content', 'commitMessage']
    }
  },
  {
    name: 'configure_context',
    description: 'Configure the git repository for the team context',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryUrl: {
          type: 'string',
          description: 'Git URL of the private team repository'
        }
      },
      required: ['repositoryUrl']
    }
  },
  {
    name: 'list_open_memory',
    description: 'List all available skills, workflows, and rules from the Open Memory global marketplace',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'install_memory_item',
    description: 'Install an item from Open Memory into the Team Memory or Local Project',
    inputSchema: {
      type: 'object',
      properties: {
        itemPath: {
          type: 'string',
          description: 'Relative path of the item in Open Memory (e.g., skills/react-component.md)'
        },
        destination: {
          type: 'string',
          enum: ['team', 'project'],
          description: 'Destination to install the item'
        },
        projectPath: {
          type: 'string',
          description: 'Absolute path to the local project (required if destination is project)'
        }
      },
      required: ['itemPath', 'destination']
    }
  },
  // ─── Workflow Tools ─────────────────────────────────────────
  {
    name: 'list_workflows',
    description: 'List available workflows. Returns workflow names and entry points.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'search_by_tags',
    description: 'Search workflow nodes by tags (AND logic). Returns a lightweight list of matching nodes (name + description only). Use get_workflow_content to load full content of a specific node.',
    inputSchema: {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to search for (AND logic — all must match)'
        }
      },
      required: ['tags']
    }
  },
  {
    name: 'get_workflow_content',
    description: 'Get full content of a workflow node by ID. Returns the markdown body, metadata, and available transitions.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: 'ID of the workflow node (filename without .md extension)'
        }
      },
      required: ['nodeId']
    }
  },
  {
    name: 'save_script',
    description: 'Save a script for later use in workflows',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name without extension' },
        content: { type: 'string', description: 'Script source code' },
        language: { type: 'string', description: 'File extension (e.g. js, py, sh)' }
      },
      required: ['name', 'content']
    }
  },
  {
    name: 'list_scripts',
    description: 'List saved workflow scripts',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'track_files',
    description: 'Add files to the active context (FileContextTracker)',
    inputSchema: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' } }
      },
      required: ['paths']
    }
  },
  {
    name: 'untrack_files',
    description: 'Untrack files from the active context',
    inputSchema: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' } }
      },
      required: ['paths']
    }
  },
  {
    name: 'get_tracked_files',
    description: 'Get the list of currently tracked files without modifying context',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'log_feedback',
    description: 'Log the final outcome of a workflow for the ML Flywheel dataset',
    inputSchema: {
      type: 'object',
      properties: {
        outcome: { type: 'string', enum: ['success', 'partial', 'failed'], description: 'Overall success of the workflow' },
        skill_created: { type: 'string', description: 'Name of the skill created or updated, if any' }
      },
      required: ['outcome']
    }
  }
];

function setupRepo(repoUrl, localDir) {
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }

  if (!isGitRepo(localDir)) {
    try {
      // Clone if it's empty
      if (fs.readdirSync(localDir).length === 0) {
        execSync(`git clone ${repoUrl} .`, { cwd: localDir });
      } else {
        execSync('git init', { cwd: localDir });
        execSync(`git remote add origin ${repoUrl}`, { cwd: localDir });
        execSync('git pull origin main', { cwd: localDir });
      }
    } catch (e) {
      throw new Error(`Failed to initialize repository at ${localDir}: ${e.message}`);
    }
  }
}

function ensureRepoSetup(config) {
  if (!config.teamRepository) {
    throw new Error('Team repository URL is not configured. Use configure_context first.');
  }
  
  setupRepo(config.teamRepository, config.localPath);
  
  if (config.openRepository && config.openPath) {
    setupRepo(config.openRepository, config.openPath);
  }
}

async function handleToolCall(name, args) {
  const config = readConfig();

  if (name === 'configure_context') {
    config.teamRepository = args.repositoryUrl;
    writeConfig(config);
    try {
      ensureRepoSetup(config);
      return `Successfully configured and cloned repository: ${args.repositoryUrl}`;
    } catch (e) {
      return `Configured URL, but failed to clone: ${e.message}`;
    }
  }

  // All other tools require the repo to be set up
  ensureRepoSetup(config);

  if (name === 'sync_memory') {
    let result = syncMemory(config.localPath);
    if (!result.success) throw new Error(`Team memory sync failed: ${result.error}`);
    let output = `Team Memory synced successfully. ${result.output || ''}`;
    
    if (config.openRepository && config.openPath) {
      let openResult = syncMemory(config.openPath);
      if (!openResult.success) throw new Error(`Open memory sync failed: ${openResult.error}`);
      output += `\nOpen Memory synced successfully. ${openResult.output || ''}`;
    }
    return output;
  }

  if (name === 'save_skill') {
    const filePath = path.join(config.localPath, args.filename);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    fs.writeFileSync(filePath, args.content, 'utf-8');
    const result = saveAndPush(config.localPath, args.commitMessage);
    if (!result.success) throw new Error(result.error);
    return `Skill saved and pushed. ${result.output || ''}`;
  }

  if (name === 'read_team_context' || name === 'list_open_memory') {
    const walkSync = (dir, fileList = []) => {
      if (!fs.existsSync(dir)) return fileList;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file === '.git') continue;
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
          walkSync(filePath, fileList);
        } else if (file.endsWith('.md') || file.endsWith('.json') || file.endsWith('.js')) {
          fileList.push(filePath);
        }
      }
      return fileList;
    };
    
    if (name === 'list_open_memory') {
      if (!config.openPath) throw new Error('Open Memory path is not configured');
      const files = walkSync(config.openPath).map(f => path.relative(config.openPath, f));
      return `Available context items in Open Memory:\n${files.join('\n')}`;
    }

    if (args.action === 'list_skills') {
      const files = walkSync(config.localPath).map(f => path.relative(config.localPath, f));
      return `Available context items in Team Memory:\n${files.join('\n')}`;
    }
    if (args.action === 'get_skill') {
      const filePath = path.join(config.localPath, args.skillName);
      if (!fs.existsSync(filePath)) throw new Error(`Skill not found: ${args.skillName}`);
      return fs.readFileSync(filePath, 'utf-8');
    }
    if (args.action === 'get_rules') {
      const rulesPath = path.join(config.localPath, 'team-rules.md');
      if (fs.existsSync(rulesPath)) return fs.readFileSync(rulesPath, 'utf-8');
      return "No team-rules.md found.";
    }
  }

  if (name === 'install_memory_item') {
    if (!config.openPath) throw new Error('Open Memory path is not configured');
    
    const sourcePath = path.join(config.openPath, args.itemPath);
    if (!fs.existsSync(sourcePath)) throw new Error(`Item not found in Open Memory: ${args.itemPath}`);
    
    const content = fs.readFileSync(sourcePath, 'utf-8');
    
    if (args.destination === 'team') {
      const destPath = path.join(config.localPath, args.itemPath);
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(destPath, content, 'utf-8');
      
      const result = saveAndPush(config.localPath, `Install ${args.itemPath} from Open Memory`);
      if (!result.success) throw new Error(result.error);
      return `Successfully installed ${args.itemPath} into Team Memory and pushed to remote.`;
    } 
    else if (args.destination === 'project') {
      if (!args.projectPath) throw new Error('projectPath is required when destination is project');
      // Always install project skills into .agents/skills/ 
      // but retain the base filename (we flatten the structure for projects for now, or keep it)
      const fileName = path.basename(args.itemPath);
      const destDir = path.join(args.projectPath, '.agents', 'skills');
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      
      const destPath = path.join(destDir, fileName);
      fs.writeFileSync(destPath, content, 'utf-8');
      return `Successfully installed ${fileName} into local project at .agents/skills/`;
    }
  }

  // ─── Workflow tools ──────────────────────────────────────────

  if (name === 'list_workflows') {
    const { nodes } = getWorkflowIndex();
    const workflows = new Map();
    for (const [id, node] of nodes) {
      const wf = node.meta.workflow;
      if (!wf) continue;
      if (!workflows.has(wf)) {
        workflows.set(wf, { name: wf, steps: [], entryPoint: null });
      }
      const entry = workflows.get(wf);
      entry.steps.push({ id, name: node.meta.name || id, description: node.meta.description || '' });
      const tags = node.meta.tags || [];
      if (tags.includes('workflow-entry') || tags.includes('first-step')) {
        entry.entryPoint = id;
      }
    }
    return JSON.stringify([...workflows.values()], null, 2);
  }

  if (name === 'search_by_tags') {
    const { nodes, tagIndex } = getWorkflowIndex();
    const matched = searchByTags(nodes, tagIndex, args.tags);
    if (matched.length === 0) {
      return JSON.stringify({ matches: [], action_required: null });
    }
    if (matched.length === 1) {
      // Single match — return full content directly (no extra round-trip)
      const node = matched[0];
      return JSON.stringify({
        id: node.id,
        name: node.meta.name,
        workflow: node.meta.workflow,
        group: node.meta.group || null,
        transitions: node.meta.transitions || {},
        availableDecisions: Object.keys(node.meta.transitions || {}),
        content: node.body,
      });
    }
    // Multiple matches — return lightweight list (Lazy Context Selection)
    return JSON.stringify({
      matches: toLightList(matched),
      action_required: 'get_workflow_content'
    });
  }

  if (name === 'get_workflow_content') {
    const { nodes } = getWorkflowIndex();
    const node = nodes.get(args.nodeId);
    if (!node) throw new Error(`Workflow node not found: ${args.nodeId}`);
    return JSON.stringify({
      id: node.id,
      name: node.meta.name,
      workflow: node.meta.workflow,
      group: node.meta.group || null,
      transitions: node.meta.transitions || {},
      availableDecisions: Object.keys(node.meta.transitions || {}),
      content: node.body,
    });
  }

  if (name === 'save_script') {
    const cwd = process.cwd();
    const savedPath = saveScript(cwd, args.name, args.content, args.language || 'js');
    return JSON.stringify({ success: true, savedPath });
  }

  if (name === 'list_scripts') {
    const cwd = process.cwd();
    return JSON.stringify(listScripts(cwd), null, 2);
  }

  if (name === 'get_tracked_files') {
    const cwd = process.cwd();
    return JSON.stringify({ tracked_files: getTrackedFiles(cwd) }, null, 2);
  }

  if (name === 'track_files') {
    const cwd = process.cwd();
    return JSON.stringify({ active_files: trackFiles(cwd, args.paths) }, null, 2);
  }

  if (name === 'untrack_files') {
    const cwd = process.cwd();
    return JSON.stringify({ active_files: untrackFiles(cwd, args.paths) }, null, 2);
  }

  if (name === 'log_feedback') {
    logFeedback(args.outcome, args.skill_created || null);
    return JSON.stringify({ success: true, logged: true });
  }

  throw new Error(`Unknown tool: ${name}`);
}

process.stdin.on('data', async (data) => {
  try {
    const req = JSON.parse(data.toString());
    
    if (req.method === 'initialize') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'context-x-mcp', version: '1.0.0' }
        }
      }) + '\n');
      return;
    }

    if (req.method === 'tools/list') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: req.id,
        result: { tools: TOOLS }
      }) + '\n');
      return;
    }

    if (req.method === 'tools/call') {
      try {
        const result = await handleToolCall(req.params.name, req.params.arguments);
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: req.id,
          result: {
            content: [{ type: 'text', text: result }],
            isError: false
          }
        }) + '\n');
      } catch (e) {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: req.id,
          result: {
            content: [{ type: 'text', text: String(e.message) }],
            isError: true
          }
        }) + '\n');
      }
      return;
    }

    // Acknowledge other standard methods
    if (req.id) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: {} }) + '\n');
    }

  } catch (e) {
    // Ignore parse errors on stdout
  }
});
