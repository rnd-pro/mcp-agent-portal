import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { startWebServer } from './web-server.js';
import { writePortFile, removePortFile } from './backend-lifecycle.js';
import { ensureGatewayAlive } from './local-gateway.js';

const projectRoot = resolve(process.argv[2] || '.');

// Only remove port file if it belongs to THIS process (prevents restart race)
function cleanup() {
  try {
    const __dir = dirname(fileURLToPath(import.meta.url));
    const gwRoot = process.env.PORTAL_LOCAL_GATEWAY_DIR
      || join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.local-gateway');
    const gwDir = join(gwRoot, 'backends');
    const hash = createHash('md5').update(resolve(projectRoot)).digest('hex').slice(0, 8);
    const portFile = join(gwDir, `portal-${hash}.json`);
    if (existsSync(portFile)) {
      const data = JSON.parse(readFileSync(portFile, 'utf8'));
      if (data.pid === process.pid) {
        removePortFile(projectRoot);
      }
    }
  } catch { /* non-critical */ }
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(); });
process.on('SIGTERM', () => { cleanup(); process.exit(); });

// Start the web server and MCP Proxy Manager
const { server, proxyManager, networkAccess } = startWebServer(projectRoot);
proxyManager.startAllServers();

// Start Telegram Gateway (will naturally skip if no token)
import('../gateways/telegram.js').then(m => {
  m.startTelegramGateway(proxyManager);
}).catch(err => {
  console.error('[portal] Failed to load Telegram gateway:', err.message);
});

// Wait for port to be assigned, then write port file
const checkInterval = setInterval(() => {
  const addr = server.address();
  if (addr) {
    clearInterval(checkInterval);
    writePortFile(projectRoot, addr.port, networkAccess);
  }
}, 50);

// Keep the local-gateway router (portal.local) alive independently of any single backend. ensureGatewayAlive
// is a no-op when a live gateway already owns the listener and re-hosts it here otherwise, so if the backend
// that happened to host the gateway dies, the next surviving backend re-hosts it within one heartbeat — and
// routes stay fresh across backend restarts (portal.local no longer drops with the backend).
ensureGatewayAlive();
const gatewayHeartbeat = setInterval(ensureGatewayAlive, 10000);
gatewayHeartbeat.unref();
