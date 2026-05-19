// @ctx .context/web/panels/ctx-panel.ctx
import Symbiote from '@symbiotejs/symbiote';
import { api, events, state } from '../../app.js';
import template from './CtxPanel.tpl.js';
import css from './CtxPanel.css.js';

export class CtxPanel extends Symbiote {
  init$ = {
    contentHTML: '<div class="pg-placeholder">Select a file to view documentation</div>',
    outlineHTML: '',
  };

  initCallback() {
    events.addEventListener('file-selected', (event) => {
      this._loadCtx(event.detail.path);
      this._loadOutline(event.detail.path);
    });
  }

  _loadOutline(file) {
    const skeleton = state.skeleton;
    if (!skeleton) {
      this.$.outlineHTML = '';
      return;
    }

    const exportsByFile = skeleton.X || {};
    const labels = skeleton.L || {};
    const exports = exportsByFile[file];
    if (!exports || exports.length === 0) {
      this.$.outlineHTML = '';
      return;
    }

    const items = exports.map((exportName) => `<div class="pg-outline-item" title="${exportName}">
        <span class="material-symbols-outlined" style="font-size:13px">function</span>
        <span>${labels[exportName] || exportName}</span>
      </div>`).join('');

    this.$.outlineHTML = `
      <div class="pg-outline-section">
        <div class="pg-outline-title">
          <span class="material-symbols-outlined" style="font-size:14px">account_tree</span>
          Exports · ${exports.length}
        </div>
        ${items}
      </div>
    `;
  }

  async _loadCtx(file) {
    this.$.contentHTML = '<div class="pg-placeholder pg-pulse">Loading docs...</div>';

    try {
      const response = await api('/api/docs', { file });
      const docs = response?.docs || response?.content || '';
      if (!docs) {
        this.$.contentHTML = '<div class="pg-placeholder">No .ctx documentation</div>';
        return;
      }

      this.$.contentHTML = typeof docs === 'string'
        ? this._formatCtx(docs)
        : `<pre class="pg-ctx-raw">${JSON.stringify(docs, null, 2)}</pre>`;
    } catch (err) {
      this.$.contentHTML = '<div class="pg-placeholder">No documentation available</div>';
    }
  }

  _formatCtx(value) {
    return value.split('\n').map((line) => {
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      return line.startsWith('export ') || line.match(/^\s+\w/)
        ? `<div class="pg-ctx-sig">${escaped}</div>`
        : line.startsWith('- [x]')
          ? `<div class="pg-ctx-test passed"><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;margin-right:4px">check_circle</span>${escaped.slice(5)}</div>`
          : line.startsWith('- [ ]')
            ? `<div class="pg-ctx-test pending"><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;margin-right:4px">radio_button_unchecked</span>${escaped.slice(5)}</div>`
            : line.trim()
              ? `<div class="pg-ctx-desc">${escaped}</div>`
              : '';
    }).join('');
  }
}

CtxPanel.template = template;
CtxPanel.rootStyles = css;
CtxPanel.reg('pg-ctx-panel');
