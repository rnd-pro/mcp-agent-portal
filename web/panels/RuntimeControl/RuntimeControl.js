import { Symbiote } from '@symbiotejs/symbiote';
import cssShared from '../../common/ui-shared.css.js';
import cssLocal from './RuntimeControl.css.js';
import template from './RuntimeControl.tpl.js';

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

function metric(label, value) {
  return `
    <div class="rtc-metric">
      <div class="rtc-metric-label">${escapeHtml(label)}</div>
      <div class="rtc-metric-value" title="${escapeHtml(value)}">${escapeHtml(value)}</div>
    </div>
  `;
}

export class RuntimeControl extends Symbiote {
  init$ = {};
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
    let container = this.ref.instanceList;
    container.innerHTML = '';

    if (!hasInstances) {
      container.innerHTML = '<div class="ui-empty-state rtc-empty">Instances endpoint is unavailable.</div>';
      return;
    }

    if (!instances.length) {
      container.innerHTML = '<div class="ui-empty-state rtc-empty">No instances reported by the runtime.</div>';
      return;
    }

    if (!activeInstances.length) {
      container.innerHTML = '<div class="ui-empty-state rtc-empty">No active instances.</div>';
      return;
    }

    for (let instance of activeInstances) {
      let item = document.createElement('div');
      item.className = 'rtc-instance';
      item.innerHTML = `
        <div class="rtc-instance-head">
          <div class="rtc-instance-name" title="${escapeHtml(instance.name || 'unknown')}">${escapeHtml(instance.name || 'unknown')}</div>
          <div class="rtc-status"><span class="rtc-status-dot"></span>Active</div>
        </div>
        <div class="rtc-metrics">
          ${metric('PID', instance.pid ?? '-')}
          ${metric('Port', instance.port ?? '-')}
          ${metric('Agents', instance.agents ?? 0)}
          ${metric('Uptime', formatStartedAt(instance.startedAt))}
          ${metric('Project', instance.project || instance.projectPath || '-')}
          ${metric('Command', instance.command || '-')}
          ${metric('Prefix', instance.prefix || '-')}
          ${metric('Location', this._instanceLocation(instance))}
        </div>
      `;
      container.appendChild(item);
    }
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
