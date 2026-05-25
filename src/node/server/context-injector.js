import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Reads the global team rules to be injected into internal agent prompts.
 * @returns {string} The global rules, or empty string if none exist.
 */
export function getGlobalTeamRules() {
  try {
    const configDir = process.env.PORTAL_CONFIG_DIR || path.join(os.homedir(), '.agent-portal');
    const teamRulesPath = path.join(configDir, 'context', 'team', 'team-rules.md');
    
    if (!fs.existsSync(teamRulesPath)) return '';
    return fs.readFileSync(teamRulesPath, 'utf-8').trim();
  } catch {
    return '';
  }
}
