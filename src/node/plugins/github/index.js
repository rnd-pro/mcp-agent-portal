// @ctx github.ctx
import https from 'node:https';

let token;
let owner;
let repo;
let labels;

/**
 * Initialize GitHub Issues plugin.
 * Config: { token: string, repo: "owner/repo", labels?: string[] }
 */
export async function init(portalAPI, config) {
  if (!config.token || !config.repo) {
    console.error('🔴 [GitHubPlugin] Missing token or repo in configuration.');
    return;
  }

  token = config.token;
  let parts = config.repo.split('/');
  owner = parts[0];
  repo = parts[1];
  labels = config.labels || ['agent-portal', 'alert'];
  console.log(`✅ [GitHubPlugin] Initialized for ${config.repo}.`);
}

export async function destroy() {
  token = null;
  owner = null;
  repo = null;
}

/**
 * Create a GitHub issue on system alert.
 * Only creates issues for 'crash' type alerts to avoid noise.
 * @param {{ type: string, server?: string, message: string }} alert
 */
export function onAlert(alert) {
  if (!token || !owner || !repo) return;
  // Only create issues for crashes, not warnings
  if (alert.type !== 'crash') return;

  let title = `[Agent Portal] ${alert.type}: ${alert.server || 'system'}`;
  let body = [
    `## Alert: ${alert.type}`,
    '',
    `**Server:** ${alert.server || 'N/A'}`,
    `**Time:** ${new Date().toISOString()}`,
    '',
    '### Message',
    '```',
    alert.message,
    '```',
    '',
    '_Auto-created by agent-portal GitHub plugin._',
  ].join('\n');

  let payload = JSON.stringify({ title, body, labels });

  let options = {
    hostname: 'api.github.com',
    path: `/repos/${owner}/${repo}/issues`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent': 'agent-portal',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  };

  let req = https.request(options, (res) => {
    if (res.statusCode >= 300) {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.error(`🟡 [GitHubPlugin] Issue creation failed (${res.statusCode}): ${data.slice(0, 200)}`);
      });
    }
  });

  req.on('error', (err) => {
    console.error(`🟡 [GitHubPlugin] Request error: ${err.message}`);
  });

  req.write(payload);
  req.end();
}

export default { init, destroy, onAlert };
