import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BEGIN_MARKER = '# --- BEGIN RND-PRO TEAM RULES ---';
const END_MARKER = '# --- END RND-PRO TEAM RULES ---';
const EXPLANATION = '# These rules are automatically synchronized from the Global Team Memory.\n# Do not edit them directly here, as they will be overwritten on next portal startup.\n';

/**
 * Synchronize global team rules into the local workspace IDE rule files
 * (.cursorrules, .windsurfrules).
 * @param {string} projectRoot
 */
export function syncWorkspaceRules(projectRoot) {
  if (!projectRoot || projectRoot === '/' || projectRoot === os.homedir()) return;
  try {
    const configDir = process.env.PORTAL_CONFIG_DIR || path.join(os.homedir(), '.agent-portal');
    const teamRulesPath = path.join(configDir, 'context', 'team', 'team-rules.md');

    if (!fs.existsSync(teamRulesPath)) {
      return; // No global rules to sync
    }

    const teamRulesContent = fs.readFileSync(teamRulesPath, 'utf-8').trim();
    if (!teamRulesContent) return;

    const blockToInject = `${BEGIN_MARKER}\n${EXPLANATION}\n${teamRulesContent}\n${END_MARKER}\n`;

    const ruleFiles = ['.cursorrules', '.windsurfrules'];

    for (const filename of ruleFiles) {
      const filePath = path.join(projectRoot, filename);
      let fileContent = '';

      if (fs.existsSync(filePath)) {
        fileContent = fs.readFileSync(filePath, 'utf-8');
      }

      const startIndex = fileContent.indexOf(BEGIN_MARKER);
      const endIndex = fileContent.indexOf(END_MARKER);

      if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        // Replace existing block
        const before = fileContent.substring(0, startIndex);
        const after = fileContent.substring(endIndex + END_MARKER.length);
        
        // Only ensure one newline boundary
        const newContent = `${before.trim()}\n\n${blockToInject}\n${after.trim()}`.trim() + '\n';
        if (newContent !== fileContent) {
          fs.writeFileSync(filePath, newContent, 'utf-8');
          console.error(`[portal] Updated global team rules in ${filename}`);
        }
      } else {
        // Append block if it doesn't exist
        const newContent = `${fileContent.trim()}\n\n${blockToInject}`.trim() + '\n';
        fs.writeFileSync(filePath, newContent, 'utf-8');
        console.error(`[portal] Injected global team rules into ${filename}`);
      }
    }
  } catch (err) {
    console.error(`[portal] Failed to sync workspace rules: ${err.message}`);
  }
}

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
