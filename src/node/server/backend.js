import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startWebServer } from './web-server.js';
import { writePortFile, removePortFile } from './backend-lifecycle.js';
import { ensureGatewayAlive, getGatewayPort } from './local-gateway.js';
import { registerLocal } from './mdns.js';

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

// Keep portal.local advertised whenever THIS backend hosts the gateway. The gateway-host setup only
// advertised the name on the no-projectName registerService path; a backend that TAKES OVER :80 via
// ensureGatewayAlive never re-advertised, so portal.local stopped resolving on every backend restart
// while :80 kept serving (the observed "up but unreachable by name" split-brain). Close that gap: own
// the advert while we own the gateway pid, drop it when we don't, and re-assert if the advertiser was
// reaped while we still host. Best-effort — advert maintenance must never crash the backend.
let _portalAdvert = null;
function _gatewayHostPid() {
  try {
    const gwRoot = process.env.PORTAL_LOCAL_GATEWAY_DIR
      || join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.local-gateway');
    return JSON.parse(readFileSync(join(gwRoot, 'gateway.pid'), 'utf8'))?.pid ?? null;
  } catch { return null; }
}
function _portalAdvertAlive() {
  // macOS advertises via a detached `dns-sd` child that can be reaped independently; other platforms use
  // an in-process responder (Node UDP) / avahi child whose handle we hold, so the handle is the signal.
  if (process.platform !== 'darwin') return Boolean(_portalAdvert);
  try { return execSync('pgrep -f "dns-sd.*portal\\.local" 2>/dev/null || true', { encoding: 'utf8' }).trim().length > 0; }
  catch { return Boolean(_portalAdvert); }
}
function maintainPortalAdvert() {
  try {
    if (_gatewayHostPid() === process.pid) {
      if (!_portalAdvert || !_portalAdvertAlive()) _portalAdvert = registerLocal('portal.local', getGatewayPort());
    } else if (_portalAdvert) {
      try { _portalAdvert.cleanup?.(); } catch { /* best effort */ }
      _portalAdvert = null;
    }
  } catch { /* best effort */ }
}
maintainPortalAdvert();

const gatewayHeartbeat = setInterval(() => { ensureGatewayAlive(); maintainPortalAdvert(); }, 10000);
gatewayHeartbeat.unref();
