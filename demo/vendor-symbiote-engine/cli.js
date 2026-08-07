#!/usr/bin/env node
/**
 * cli.js - symbiote-engine command-line runner
 *
 * Execute, validate, and inspect workflow JSON files.
 * Agent-facing --json mode available for commands that produce structured output.
 *
 * Usage:
 *   symbiote-engine run <workflow.json> [--pack custom] [--secrets secrets.json] [--verbose] [--json]
 *   symbiote-engine validate <workflow.json> [--pack custom] [--json]
 *   symbiote-engine list [--pack custom] [--json]
 *   symbiote-engine inspect <workflow.json> [--json]
 *
 * @module symbiote-engine/cli */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import {
  Executor,
  listDrivers,
  getNodeType,
  getNodeMenu,
  validateParams,
  deserialize,
  loadHandlers,
  listPacks,
  getAllSocketTypes,
} from './index.js';


/**
 * Parse CLI arguments into command and options
 * @param {string[]} argv
 * @returns {{command: string, target: string, options: Record<string, string|boolean>}}
 */
function parseArgs(argv) {
  let args = argv.slice(2);
  let command = args[0];
  let target = '';
  /** @type {Record<string, string|boolean>} */
  let options = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      let key = args[i].slice(2);
      let next = args[i + 1];
      if (next && !next.startsWith('--')) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
    } else if (!target) {
      target = args[i];
    }
  }

  return { command, target, options };
}


/**
 * Load secrets from JSON file
 * @param {string} [secretsPath]
 * @returns {Promise<Record<string, string>>}
 */
async function loadSecrets(secretsPath) {
  if (!secretsPath) {

    let defaultPath = resolve(process.cwd(), 'secrets.json');
    try {
      let data = await readFile(defaultPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  try {
    let data = await readFile(resolve(secretsPath), 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`⚠ Could not load secrets from ${secretsPath}: ${err.message}`);
    return {};
  }
}


/**
 * Load domain packs by name
 * @param {string|string[]} packs
 * @param {Object} [options]
 * @param {boolean} [options.quiet]
 * @returns {Promise<void>}
 */
async function loadPacks(packs, options = {}) {
  let packList = Array.isArray(packs) ? packs : packs.split(',');
  for (const pack of packList) {
    let packName = pack.trim();
    try {
      await import(`./packs/${packName}-pack.js`);
      if (!options.quiet) console.log(`  ✔ Pack loaded: ${packName}`);
    } catch (err) {
      console.error(`  ✖ Failed to load pack "${packName}": ${err.message}`);
      process.exit(1);
    }
  }
}

/**
 * Run a workflow JSON file
 * @param {string} filePath
 * @param {Record<string, string|boolean>} options
 * @returns {Promise<object>}
 */
async function cmdRun(filePath, options) {
  let verbose = !!options.verbose;
  let json = !!options.json;

  if (options.pack) {
    await loadPacks(/** @type {string} */ (options.pack), { quiet: json });
  }


  if (options.handlers) {
    let dir = resolve(/** @type {string} */ (options.handlers));
    let types = await loadHandlers(dir);
    if (verbose && !json) console.log(`  🔧 Loaded ${types.length} handler(s) from ${options.handlers}`);
  }


  let secrets = await loadSecrets(/** @type {string|undefined} */ (options.secrets));
  if (Object.keys(secrets).length > 0 && verbose && !json) {
    console.log(`  🔑 Secrets loaded: ${Object.keys(secrets).join(', ')}`);
  }


  let raw = await readFile(resolve(filePath), 'utf-8');
  let workflowData = JSON.parse(raw);

  if (!json) {
    console.log(`\n🚀 symbiote-engine run: ${filePath}\n`);
    console.log(`  📄 Workflow: ${workflowData.name || workflowData.id}`);
    console.log(`  📊 Nodes: ${workflowData.nodes?.length || 0}`);
    console.log(`  🔗 Connections: ${workflowData.connections?.length || 0}`);
    console.log();
  }


  let graph = deserialize(raw);


  let executor = new Executor();
  let t0 = performance.now();

  try {
    let result = await executor.run(graph, {
      cache: workflowData.execution?.cache,
      secrets,
    });

    let elapsed = (performance.now() - t0).toFixed(1);

    let jsonResult = {
      command: 'run',
      file: filePath,
      success: true,
      durationMs: parseFloat(elapsed),
      workflowName: workflowData.name || workflowData.id || null,
      nodeCount: result.executionOrder.length,
      executionOrder: result.executionOrder,
      outputs: result.outputs,
      log: result.log.map((entry) => ({
        nodeId: entry.nodeId,
        nodeName: graph.getNode(entry.nodeId)?.name || entry.nodeId,
        timeMs: entry.time,
        skipped: entry.skipped || false,
      })),
    };

    if (json) return jsonResult;

    console.log(`  ✔ Execution complete in ${elapsed}ms`);
    console.log(`  📋 Execution order: ${result.executionOrder.length} nodes`);

    if (verbose) {
      console.log('\n  Execution log:');
      for (const entry of result.log) {
        let status = entry.skipped ? '⏭ skipped' : `✔ ${entry.time.toFixed(2)}ms`;
        let nodeData = graph.getNode(entry.nodeId);
        console.log(`    ${nodeData?.name || entry.nodeId}: ${status}`);
      }

      console.log('\n  Outputs:');
      for (const [nodeId, output] of Object.entries(result.outputs)) {
        let nodeData = graph.getNode(nodeId);
        console.log(
          `    ${nodeData?.name || nodeId}:`,
          JSON.stringify(output, null, 2).slice(0, 200)
        );
      }
    }


    let outputNodes = result.executionOrder.filter((id) => {
      let node = graph.getNode(id);
      return node?.type?.startsWith('output/');
    });

    if (outputNodes.length > 0) {
      console.log(`\n  Output nodes:`);
      for (const id of outputNodes) {
        let node = graph.getNode(id);
        console.log(`    → ${node.name || node.type} (${id})`);
      }
    }

    console.log(`\n✅ Done\n`);

    return jsonResult;
  } catch (err) {
    let elapsed = (performance.now() - t0).toFixed(1);

    let jsonError = {
      command: 'run',
      file: filePath,
      success: false,
      durationMs: parseFloat(elapsed),
      error: err.message,
    };

    if (json) return jsonError;

    console.error(`\n  ✖ Execution failed after ${elapsed}ms: ${err.message}\n`);
    process.exit(1);
  }
}

/**
 * Validate a workflow JSON file without executing
 * @param {string} filePath
 * @param {Record<string, string|boolean>} options
 * @returns {Promise<object>}
 */
async function cmdValidate(filePath, options) {
  let json = !!options.json;
  if (!json) console.log(`\n🔍 symbiote-engine validate: ${filePath}\n`);
  if (options.pack) {
    await loadPacks(/** @type {string} */ (options.pack), { quiet: json });
  }

  if (options.handlers) {
    let dir = resolve(/** @type {string} */ (options.handlers));
    await loadHandlers(dir);
  }

  let raw = await readFile(resolve(filePath), 'utf-8');
  let data = JSON.parse(raw);

  let errors = [];
  let warnings = [];


  for (const node of data.nodes || []) {
    let typeDef = getNodeType(node.type);
    if (!typeDef) {
      errors.push({ nodeId: node.id, type: node.type, message: `Unknown node type` });
      continue;
    }


    let validation = validateParams(node.type, node.params || {});
    if (!validation.valid) {
      for (const err of validation.errors) {
        errors.push({ nodeId: node.id, type: node.type, message: err });
      }
    }
  }


  let nodeIds = new Set((data.nodes || []).map((n) => n.id));
  for (const conn of data.connections || []) {
    if (!nodeIds.has(conn.from)) {
      errors.push({ kind: 'connection', from: conn.from, message: 'Unknown source node' });
    }
    if (!nodeIds.has(conn.to)) {
      errors.push({ kind: 'connection', to: conn.to, message: 'Unknown target node' });
    }
  }


  let connectedNodes = new Set();
  for (const conn of data.connections || []) {
    connectedNodes.add(conn.from);
    connectedNodes.add(conn.to);
  }
  for (const node of data.nodes || []) {
    if (!connectedNodes.has(node.id)) {
      warnings.push({ nodeId: node.id, type: node.type, message: 'Orphan node' });
    }
  }

  let errorCount = errors.length;
  let warningCount = warnings.length;

  let jsonResult = {
    command: 'validate',
    file: filePath,
    valid: errorCount === 0,
    errors,
    warnings,
    errorCount,
    warningCount,
  };

  if (json) return jsonResult;

  for (const err of errors) {
    console.error(`  ✖ ${err.nodeId || err.from || ''} (${err.type || ''}): ${err.message}`);
  }
  for (const warn of warnings) {
    console.warn(`  ⚠ ${warn.nodeId} (${warn.type}): ${warn.message}`);
  }

  console.log();
  if (errorCount === 0) {
    console.log(`  ✅ Valid (${warningCount} warning${warningCount !== 1 ? 's' : ''})\n`);
  } else {
    console.error(
      `  ❌ ${errorCount} error${errorCount !== 1 ? 's' : ''}, ${warningCount} warning${warningCount !== 1 ? 's' : ''}\n`
    );
    process.exit(1);
  }

  return jsonResult;
}

/**
 * List all registered node types
 * @param {Record<string, string|boolean>} options
 * @returns {Promise<object>}
 */
async function cmdList(options) {
  let json = !!options.json;
  if (!json) console.log(`\n📋 symbiote-engine node types\n`);
  if (options.pack) {
    await loadPacks(/** @type {string} */ (options.pack), { quiet: json });
  }

  if (options.handlers) {
    let dir = resolve(/** @type {string} */ (options.handlers));
    await loadHandlers(dir);
  }

  let menu = getNodeMenu();
  let drivers = listDrivers();
  let total = drivers.length;

  let jsonResult = {
    command: 'list',
    total,
    categories: menu.map((group) => ({
      category: group.category,
      nodes: group.nodes.map((node) => {
        let typeDef = getNodeType(node.type);
        return {
          type: node.type,
          icon: node.icon,
          description: node.description,
          inputCount: typeDef?.driver.inputs?.length || 0,
          outputCount: typeDef?.driver.outputs?.length || 0,
        };
      }),
    })),
    drivers: drivers.map((d) => ({
      type: d.type,
      category: d.category,
      icon: d.icon,
      inputs: (d.driver.inputs || []).map((inp) => ({ name: inp.name, type: inp.type, label: inp.label })),
      outputs: (d.driver.outputs || []).map((out) => ({ name: out.name, type: out.type, label: out.label })),
      description: d.driver.description,
      params: Object.entries(d.driver.params || {}).map(([name, p]) => ({ name, type: p.type, required: p.required, default: p.default })),
    })),
  };

  if (json) return jsonResult;

  for (const group of menu) {
    console.log(`  ═══ ${group.category.toUpperCase()} ═══`);
    for (const node of group.nodes) {
      let typeDef = getNodeType(node.type);
      let ins = typeDef?.driver.inputs?.length || 0;
      let outs = typeDef?.driver.outputs?.length || 0;
      console.log(`    ${node.type}  [${ins}→${outs}]  ${node.description || ''}`);
    }
    console.log();
  }

  console.log(`  Total: ${total} node types\n`);

  return jsonResult;
}

/**
 * Inspect a workflow — show structure without executing
 * @param {string} filePath
 * @param {Object} [options]
 * @returns {Promise<object>}
 */
async function cmdInspect(filePath, options = {}) {
  let json = !!options.json;
  if (!json) console.log(`\n🔎 symbiote-engine inspect: ${filePath}\n`);
  let raw = await readFile(resolve(filePath), 'utf-8');
  let data = JSON.parse(raw);

  let nodes = (data.nodes || []).map((node) => ({
    id: node.id,
    type: node.type,
    name: node.name || null,
    params: node.params || {},
    paramKeys: Object.keys(node.params || {}),
  }));

  let connections = (data.connections || []).map((conn) => ({
    from: conn.from,
    out: conn.out,
    to: conn.to,
    in: conn.in,
  }));

  let jsonResult = {
    command: 'inspect',
    file: filePath,
    name: data.name || null,
    id: data.id || null,
    version: data.version || null,
    nodeCount: nodes.length,
    connectionCount: connections.length,
    nodes,
    connections,
    execution: data.execution || null,
  };

  if (json) return jsonResult;

  console.log(`  Name: ${data.name || '(unnamed)'}`);
  console.log(`  ID: ${data.id || '(none)'}`);
  console.log(`  Version: ${data.version || '(none)'}`);
  console.log();


  console.log(`  Nodes (${data.nodes?.length || 0}):`);
  for (const node of data.nodes || []) {
    let paramKeys = Object.keys(node.params || {});
    let paramStr = paramKeys.length > 0 ? ` {${paramKeys.join(', ')}}` : '';
    console.log(`    ${node.id}  [${node.type}]  ${node.name || ''}${paramStr}`);
  }


  console.log(`\n  Connections (${data.connections?.length || 0}):`);
  for (const conn of data.connections || []) {
    console.log(`    ${conn.from}.${conn.out} → ${conn.to}.${conn.in}`);
  }


  if (data.execution) {
    console.log(`\n  Execution: mode=${data.execution.mode}, cache=${data.execution.cache}`);
  }

  console.log();

  return jsonResult;
}

const HELP = `
symbiote-engine CLI — Universal node-based workflow runner
Commands:
  run <file.workflow.json>       Execute a workflow
  validate <file.workflow.json>  Validate without executing
  list                           List all registered node types
  inspect <file.workflow.json>   Show workflow structure
  serve <file.workflow.json>     Start WebSocket + HTTP server

Options:
  --json             Output machine-readable JSON (run, validate, list, inspect)
  --pack <name>      Load domain pack (e.g. "custom")
  --handlers <dir>   Load handler files from directory
  --secrets <path>   Path to secrets.json
  --port <number>    Server port (default: 3100)
  --verbose          Show detailed execution log
`;

let cliMap = {
  run: async () => {
    if (!target) {
      console.error('Usage: symbiote-engine run <file.workflow.json>');
      process.exit(1);
    }
    let result = await cmdRun(target, options);
    if (options.json && result) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      if (!result.success) process.exit(1);
    }
    return result;
  },
  validate: async () => {
    if (!target) {
      console.error('Usage: symbiote-engine validate <file.workflow.json>');
      process.exit(1);
    }
    let result = await cmdValidate(target, options);
    if (options.json && result) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      if (!result.valid) process.exit(1);
    }
    return result;
  },
  list: async () => {
    let result = await cmdList(options);
    if (options.json && result) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
    return result;
  },
  inspect: async () => {
    if (!target) {
      console.error('Usage: symbiote-engine inspect <file.workflow.json>');
      process.exit(1);
    }
    let result = await cmdInspect(target, options);
    if (options.json && result) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
    return result;
  },
  serve: async () => {
    let port = parseInt(options.port) || 3100;
    let { createServer } = await import('./GraphServer.js');
    await createServer({
      port,
      workflowFile: target,
      handlersDir: options.handlers ? resolve(options.handlers) : undefined,
      watchFiles: true,
      verbose: !!options.verbose,
    });
  },
};

let { command, target, options } = parseArgs(process.argv);

let handler = cliMap[command];


export { cmdRun, cmdValidate, cmdList, cmdInspect, parseArgs };

let isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain && handler) {
  await handler();
} else if (isMain) {
  console.log(HELP);
  if (command && command !== '--help' && command !== '-h') process.exit(1);
}
