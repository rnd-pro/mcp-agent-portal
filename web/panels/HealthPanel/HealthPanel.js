// @ctx .context/web/panels/health-panel.ctx
import Symbiote from '@symbiotejs/symbiote';
import { api, state, events } from '../../app.js';
import template from './HealthPanel.tpl.js';
import css from './HealthPanel.css.js';

export class HealthPanel extends Symbiote {
  init$ = {
    loaded: false,
  };

  initCallback() {
    events.addEventListener('skeleton-loaded', () => this._loadHealth());
    setTimeout(() => this._loadHealth(), 500);
  }

  async _loadHealth() {
    if (!this.$.loaded) {
      this._renderEmpty('Analyzing project health...', 'pg-pulse');

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

        let grid = document.createElement('div');
        grid.className = 'pg-health-grid';
        grid.replaceChildren(
          this._scoreCard(score, scoreClass, grade),
          this._metricCard('code', 'Code', [
            this._metric('Source files', files),
            this._metric('Functions', functions),
            this._metric('Classes', classes),
            this._metric('Exports', exportsCount),
          ]),
          this._metricCard('bug_report', 'Issues', [
            this._metric('Complexity', data.complexity || 0, data.complexity > 200),
            this._metric('JSDoc issues', data.jsdocIssues || 0, data.jsdocIssues > 10),
            this._metric('Undocumented', data.undocumented || 0, data.undocumented > 5),
          ]),
          this._metricCard('speed', 'Cache Performance', [
            this._metric('Cache hits', data.cache?.hits ?? '—'),
            this._metric('Cache misses', data.cache?.misses ?? '—'),
            this._metric('Hit rate', data.cache ? `${Math.round(data.cache.hits / (data.cache.hits + data.cache.misses) * 100)}%` : '—'),
          ]),
        );

        let children = [grid];
        if (data.note) children.push(this._note(data.note));
        this.ref.content.replaceChildren(...children);
      } catch (err) {
        this._renderEmpty(`Error: ${err.message}`, 'pg-health-error');
      }
    }
  }

  _metric(label, value, isWarning = false) {
    let metric = document.createElement('sn-metric');
    if (isWarning) metric.setAttribute('status', 'warning');
    let labelEl = document.createElement('span');
    labelEl.slot = 'label';
    labelEl.textContent = label;
    let valueEl = document.createElement('span');
    valueEl.slot = 'value';
    valueEl.textContent = String(value);
    metric.replaceChildren(labelEl, valueEl);
    return metric;
  }

  _renderEmpty(message, className = '') {
    let empty = document.createElement('sn-empty-state');
    empty.textContent = message;
    if (className) empty.className = className;
    this.ref.content.replaceChildren(empty);
  }

  _scoreCard(score, scoreClass, grade) {
    let card = document.createElement('sn-card');
    card.className = 'pg-health-score-card';
    let scoreEl = document.createElement('div');
    scoreEl.className = `pg-health-score ${scoreClass}`;
    scoreEl.textContent = String(score);
    let label = document.createElement('div');
    label.className = 'pg-health-score-label';
    label.textContent = `Health Score · ${grade}`;
    card.replaceChildren(scoreEl, label);
    return card;
  }

  _metricCard(iconName, title, metrics) {
    let card = document.createElement('sn-card');
    let header = document.createElement('div');
    header.className = 'pg-health-title';
    let icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.textContent = iconName;
    header.append(icon, document.createTextNode(title));
    card.replaceChildren(header, ...metrics);
    return card;
  }

  _note(text) {
    let note = document.createElement('sn-banner');
    note.setAttribute('variant', 'info');
    let icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.textContent = 'info';
    note.replaceChildren(icon, document.createTextNode(text));
    return note;
  }
}

HealthPanel.template = template;
HealthPanel.rootStyles = css;
HealthPanel.reg('pg-health-panel');
