import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_DIR = process.env.PORTAL_CONFIG_DIR || path.join(os.homedir(), '.agent-portal');
const CONFIG_PATH = path.join(CONFIG_DIR, 'context-x.json');

const DEFAULT_CONFIG = {
  teamRepository: "git@github.com:rnd-pro/team-memory.git", // Shared team memory repository
  localPath: path.join(CONFIG_DIR, 'context', 'team'),
  openRepository: "git@github.com:rnd-pro/open-memory.git", // Public open memory marketplace
  openPath: path.join(CONFIG_DIR, 'context', 'open')
};

export function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    // Create default config if it doesn't exist
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    return DEFAULT_CONFIG;
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function writeConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
