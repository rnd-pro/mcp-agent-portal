/**
 * Config store — reads/writes ~/.gemini/agent-portal.json.
 * @module config-store
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let CONFIG_PATH = path.join(os.homedir(), '.gemini', 'agent-portal.json');

/** @returns {object} */
export function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return { mcpServers: {} };
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return { mcpServers: {} }; }
}

/** @param {object} config */
export function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
