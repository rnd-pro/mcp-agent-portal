import { Symbiote } from '@symbiotejs/symbiote';
import cssShared from '../../common/ui-shared.css.js';
import cssLocal from './RuntimeControl.css.js';
import template from './RuntimeControl.tpl.js';
import './InstanceItem.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatNumber(value) {
  return Number.isFinite(value) ? String(value) : '-';
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '-';
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;

  let days = Math.floor(seconds / 86400);
  let hours = Math.floor((seconds % 86400) / 3600);
  let minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatStartedAt(startedAt) {
  if (!startedAt) return '-';
  let timestamp = Number(startedAt);
  if (!Number.isFinite(timestamp)) return '-';
  let millis = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  return formatDuration((Date.now() - millis) / 1000);
}

function readCount(value) {
  let count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

function isActiveInstance(instance) {
  if (instance?.connected === true || instance?.active === true) return true;
  if (instance?.status === 'active' || instance?.status === 'running' || instance?.status === 'connected') return true;
  return Boolean(instance?.pid);
}

async function fetchJson(path) {
  let res = await fetch(path);
  if (!res.ok) throw new Error(`${path} returned HTTP ${res.status}`);
  return res.json();
}

function summaryCard(label, value, note = '') {
  return `
    <div class="rtc-summary-card">
      <div class="rtc-summary-label">${escapeHtml(label)}</div>
      <div class="rtc-summary-value">${escapeHtml(value)}</div>
      ${note ? `<div class="rtc-summary-note">${escapeHtml(note)}</div>` : ''}
    </div>
  `;
}

export class RuntimeControl extends Symbiote {
  init$ = {
    instances: [],
  };
  _refreshTimer = null;

  initCallback() {
    this.ref.refreshBtn.onclick = () => this.loadRuntime();
    this.loadRuntime();
    this._refreshTimer = setInterval(() => this.loadRuntime({ silent: true }), 5000);
  }

  disconnectedCallback() {
    super.disconnectedCallback && super.disconnectedCallback();
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  async loadRuntime(options = {}) {
    if (!options.silent) this._setBanner('loading', 'Loading runtime status...');

    let [statusResult, instancesResult] = await Promise.allSettled([
      fetchJson('/api/server-status'),
      fetchJson('/api/instances'),
    ]);

    let hasStatus = statusResult.status === 'fulfilled';
    let hasInstances = instancesResult.status === 'fulfilled' && Array.isArray(instancesResult.value);
    let status = hasStatus ? statusResult.value : null;
    let instances = hasInstances
      ? instancesResult.value
      : [];
    let errors = [];

    if (statusResult.status === 'rejected') errors.push(statusResult.reason.message);
    if (instancesResult.status === 'rejected') errors.push(instancesResult.reason.message);

    this._renderSummary(status, instances, hasInstances);
    this._renderInstances(instances, hasInstances);

    if (errors.length) {
      this._setBanner('error', `Some runtime data is unavailable: ${errors.join('; ')}`);
    } else {
      this._clearBanner();
    }

    this.ref.updatedAt.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  }

  _renderSummary(status, instances, hasInstances) {
    let activeInstances = instances.filter(isActiveInstance);
    let agents = readCount(status?.agents);
    let monitors = readCount(status?.monitors);

    this.ref.summaryGrid.innerHTML = [
      summaryCard('Uptime', formatDuration(Number(status?.uptime)), status ? 'Portal process' : 'Status unavailable'),
      summaryCard('Agents', status ? formatNumber(agents) : '-', 'Connected MCP clients'),
      summaryCard('Monitors', status ? formatNumber(monitors) : '-', 'Open monitor sessions'),
      summaryCard('Instances', hasInstances ? formatNumber(activeInstances.length) : '-', hasInstances ? `${instances.length} registered` : 'Instances unavailable'),
    ].join('');
  }

  _renderInstances(instances, hasInstances) {
    let activeInstances = instances.filter(isActiveInstance);
    this.$.instances = [];
    this.ref.instanceEmpty.hidden = true;
    this.ref.instanceEmpty.textContent = '';

    if (!hasInstances) {
      this._setInstancesEmpty('Instances endpoint is unavailable.');
      return;
    }

    if (!instances.length) {
      this._setInstancesEmpty('No instances reported by the runtime.');
      return;
    }

    if (!activeInstances.length) {
      this._setInstancesEmpty('No active instances.');
      return;
    }

    this.$.instances = activeInstances.map((instance) => ({
      name: instance.name || 'unknown',
      status: instance.status || 'Active',
      pid: instance.pid ?? '-',
      port: instance.port ?? '-',
      agents: instance.agents ?? 0,
      uptime: formatStartedAt(instance.startedAt),
      project: instance.project || instance.projectPath || '-',
      command: instance.command || '-',
      prefix: instance.prefix || '-',
      location: this._instanceLocation(instance),
    }));
  }

  _setInstancesEmpty(message) {
    this.ref.instanceEmpty.hidden = false;
    this.ref.instanceEmpty.textContent = message;
  }

  _instanceLocation(instance) {
    if (instance.command === 'remote-client' && Array.isArray(instance.args) && instance.args[0]) {
      return instance.args[0];
    }
    return instance.host || 'localhost';
  }

  _setBanner(kind, message) {
    this.ref.stateBanner.hidden = false;
    this.ref.stateBanner.dataset.kind = kind;
    this.ref.stateBanner.textContent = message;
  }

  _clearBanner() {
    this.ref.stateBanner.hidden = true;
    this.ref.stateBanner.textContent = '';
    delete this.ref.stateBanner.dataset.kind;
  }
}

RuntimeControl.template = template;
RuntimeControl.rootStyles = cssShared + cssLocal;
RuntimeControl.reg('pg-runtime-control');

export default RuntimeControl;
