/**
 * state-sync.js — Portal-specific wrapper around symbiote-ui StateSync.
 *
 * Adds version-change detection banner and portal URL construction.
 *
 * Usage:
 *   import { stateSync } from './state-sync.js';
 *   stateSync.on('tasks', (tasks) => { ... });
 *   stateSync.on('chats', (chats) => { ... });
 *   stateSync.connect();
 */
import { createStateSync } from 'symbiote-ui/core';

const _sync = createStateSync();

let _initialServerVersion = null;

/** Check if backend version changed since page load. */
function _checkVersion(serverVersion) {
  if (!serverVersion) return;
  if (!_initialServerVersion) {
    _initialServerVersion = serverVersion;
  } else if (_initialServerVersion !== serverVersion) {
    let banner = document.getElementById('version-warning-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'version-warning-banner';
      let displayVersion = serverVersion.split('+')[0];

      let icon = document.createElement('span');
      icon.className = 'material-symbols-outlined';
      icon.textContent = 'warning';
      Object.assign(icon.style, {
        fontSize: '16px',
        verticalAlign: 'middle',
        marginRight: '4px',
      });

      let message = document.createTextNode(` Agent Portal was updated (v${displayVersion}). Please `);
      let link = document.createElement('a');
      link.href = '#';
      link.textContent = 'refresh the page';
      Object.assign(link.style, {
        color: 'white',
        textDecoration: 'underline',
      });
      link.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        location.reload();
      };

      banner.replaceChildren(icon, message, link, document.createTextNode('.'));
      Object.assign(banner.style, {
        position: 'fixed', top: '0', left: '0', width: '100%', background: 'color-mix(in srgb, var(--sn-danger-color) 92%, var(--sn-bg))', color: 'var(--sn-text)',
        textAlign: 'center', padding: '8px', zIndex: '999999', fontWeight: 'bold', cursor: 'pointer',
        boxShadow: 'var(--sn-shadow-md)'
      });
      banner.onclick = () => location.reload();
      document.body.prepend(banner);
    }
  }
}

function connect() {
  let proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let url = `${proto}//${location.host}/ws/state`;
  _sync.connect(url, {
    onMessage(msg) {
      if (msg.params?.serverVersion) _checkVersion(msg.params.serverVersion);
    },
  });
}

function disconnect() {
  _sync.disconnect();
}

export const stateSync = {
  on: _sync.on,
  get: _sync.get,
  commit: _sync.commit,
  connect,
  disconnect,
};
export const __stateSyncTest = _sync.__test;
export default stateSync;
