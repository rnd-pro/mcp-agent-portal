// @ctx slack.ctx
import https from 'node:https';

let webhookUrl;
let channel;

/**
 * Initialize Slack webhook plugin.
 * Config: { webhookUrl: string, channel?: string }
 */
export async function init(portalAPI, config) {
  if (!config.webhookUrl) {
    console.error('🔴 [SlackPlugin] Missing webhookUrl in configuration.');
    return;
  }

  webhookUrl = config.webhookUrl;
  channel = config.channel || null;
  console.log('✅ [SlackPlugin] Initialized with webhook.');
}

export async function destroy() {
  webhookUrl = null;
  channel = null;
}

/**
 * Forward system alerts to Slack channel via webhook.
 * @param {{ type: string, server?: string, message: string }} alert
 */
export function onAlert(alert) {
  if (!webhookUrl) return;

  let emoji = alert.type === 'crash' ? '🔴' : '⚠️';
  let blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *Portal Alert: ${alert.type}*\n${alert.message}`,
      },
    },
  ];

  if (alert.server) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Server: \`${alert.server}\`` }],
    });
  }

  let payload = JSON.stringify({ blocks });
  if (channel) {
    payload = JSON.stringify({ channel, blocks });
  }

  let url = new URL(webhookUrl);
  let options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  let req = https.request(options);
  req.on('error', (err) => {
    console.error(`🟡 [SlackPlugin] Webhook error: ${err.message}`);
  });
  req.write(payload);
  req.end();
}

export default { init, destroy, onAlert };
