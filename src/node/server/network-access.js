import os from 'node:os';
import { getAgentPortalConfig } from '../config-store.js';

export const LOOPBACK_HOST = '127.0.0.1';
export const LAN_HOST = '0.0.0.0';

function isEnabled(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

function isDisabled(value) {
  return value === false || value === 'false' || value === '0' || value === 0;
}

export function normalizeNetworkAccessConfig(raw = {}, env = process.env) {
  let lanEnabled = isEnabled(raw.lanEnabled) || isEnabled(env.AGENT_PORTAL_LAN);
  let bindHost = env.AGENT_PORTAL_BIND_HOST || (lanEnabled ? LAN_HOST : LOOPBACK_HOST);
  if (bindHost === 'localhost') bindHost = LOOPBACK_HOST;
  if (!lanEnabled && bindHost === LAN_HOST) lanEnabled = true;
  let networkAuthRequired = !isDisabled(raw.networkAuthRequired)
    && !isDisabled(env.AGENT_PORTAL_NETWORK_AUTH);

  return {
    lanEnabled,
    bindHost,
    networkAuthRequired,
  };
}

export function getNetworkAccessConfig(env = process.env) {
  let config = getAgentPortalConfig();
  return normalizeNetworkAccessConfig(config.networkAccess || {}, env);
}

export function resolveRequestedPort(env = process.env) {
  let raw = env.AGENT_PORTAL_PORT || env.PORTAL_PORT;
  if (!raw) return 0;
  let port = Number.parseInt(raw, 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 0;
}

export function getLanAddresses() {
  let addresses = [];
  let interfaces = os.networkInterfaces();
  for (let entries of Object.values(interfaces)) {
    for (let entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      addresses.push(entry.address);
    }
  }
  return addresses;
}

export function createNetworkAccessStatus(port, config = getNetworkAccessConfig()) {
  let localUrl = `http://127.0.0.1:${port}/`;
  let availableLanUrls = getLanAddresses().map((address) => `http://${address}:${port}/`);
  let lanUrls = config.lanEnabled ? availableLanUrls : [];

  return {
    lanEnabled: config.lanEnabled,
    bindHost: config.bindHost,
    networkAuthRequired: config.networkAuthRequired !== false,
    localUrl,
    lanUrls,
    availableLanUrls,
    secureContextRequiredForXR: true,
  };
}
