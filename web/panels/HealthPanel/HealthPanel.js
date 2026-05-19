// @ctx .context/web/panels/health-panel.ctx
import Symbiote from '@symbiotejs/symbiote';
import { api, state, events } from '../../app.js';
import template from './HealthPanel.tpl.js';
import css from './HealthPanel.css.js';

export class HealthPanel extends Symbiote {
  init$ = {
    contentHTML: '<div class="pg-placeholder">Loading health analysis...</div>',
    loaded: false,
  };

  initCallback() {
    events.addEventListener('skeleton-loaded', () => this._loadHealth());
    setTimeout(() => this._loadHealth(), 500);
  }

  async _loadHealth() {
    if (!this.$.loaded) {
      this.$.contentHTML = '<div class="pg-placeholder pg-pulse">Analyzing project health...</div>';

      try {
        const data = await api('/api/analysis-summary');
        this.$.loaded = true;

        const score = data.healthScore ?? data.score ?? '?';
        const scoreClass = score >= 80 ? 'good' : score >= 50 ? 'warning' : 'critical';
        const grade = data.grade || (score >= 80 ? 'healthy' : score >= 50 ? 'needs work' : 'critical');
        const skeletonStats = state.skeleton?.s || {};
        const files = skeletonStats.files || Object.keys(state.skeleton?.X || {}).length || '—';
        const functions = skeletonStats.functions || 0;
        const classes = skeletonStats.classes || 0;
        const exportsCount = Object.values(state.skeleton?.X || {}).reduce((sum, exports) => sum + exports.length, 0);

        this.$.contentHTML = `
        <div class="pg-health-grid">
          <div class="pg-health-card pg-health-score-card">
            <div class="pg-health-score ${scoreClass}">${score}</div>
            <div class="pg-health-score-label">Health Score · ${grade}</div>
          </div>
          <div class="pg-health-card">
            <div class="pg-health-card-title">
              <span class="material-symbols-outlined" style="font-size:16px">code</span>
              Code
            </div>
            ${this._metric('Source files', files)}
            ${this._metric('Functions', functions)}
            ${this._metric('Classes', classes)}
            ${this._metric('Exports', exportsCount)}
          </div>
          <div class="pg-health-card">
            <div class="pg-health-card-title">
              <span class="material-symbols-outlined" style="font-size:16px">bug_report</span>
              Issues
            </div>
            ${this._metric('Complexity', data.complexity || 0, data.complexity > 200)}
            ${this._metric('JSDoc issues', data.jsdocIssues || 0, data.jsdocIssues > 10)}
            ${this._metric('Undocumented', data.undocumented || 0, data.undocumented > 5)}
          </div>
          <div class="pg-health-card">
            <div class="pg-health-card-title">
              <span class="material-symbols-outlined" style="font-size:16px">speed</span>
              Cache Performance
            </div>
            ${this._metric('Cache hits', data.cache?.hits ?? '—')}
            ${this._metric('Cache misses', data.cache?.misses ?? '—')}
            ${this._metric('Hit rate', data.cache ? `${Math.round(data.cache.hits / (data.cache.hits + data.cache.misses) * 100)}%` : '—')}
          </div>
        </div>
        ${data.note ? `<div class="pg-health-note"><span class="material-symbols-outlined" style="font-size:14px">info</span> ${data.note}</div>` : ''}
      `;
      } catch (err) {
        this.$.contentHTML = `<div class="pg-placeholder" style="color:var(--sn-danger-color)">Error: ${err.message}</div>`;
      }
    }
  }

  _metric(label, value, isWarning = false) {
    return `<div class="pg-metric${isWarning ? ' pg-metric-warn' : ''}"><span>${label}</span><span class="pg-metric-val">${value}</span></div>`;
  }
}

HealthPanel.template = template;
HealthPanel.rootStyles = css;
HealthPanel.reg('pg-health-panel');
