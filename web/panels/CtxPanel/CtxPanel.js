// @ctx .context/web/panels/ctx-panel.ctx
import Symbiote from '@symbiotejs/symbiote';
import 'symbiote-node/ui';
import { getSourceLanguage } from 'symbiote-node/ui';
import { api, events, getActiveRouteProjectId, state } from '../../app.js';
import { tPortal } from '../../common/localization.js';
import template from './CtxPanel.tpl.js';
import css from './CtxPanel.css.js';

function makeEmptyState(message, className = '') {
  let node = document.createElement('sn-empty-state');
  node.textContent = message;
  if (className) node.className = className;
  return node;
}

function makeIcon(name, className = '') {
  let icon = document.createElement('span');
  icon.className = `material-symbols-outlined${className ? ` ${className}` : ''}`;
  icon.textContent = name;
  return icon;
}

function setListItem(item, data) {
  if (typeof item.setItem === 'function') {
    item.setItem(data);
    return;
  }
  customElements.whenDefined('sn-list-item').then(() => item.setItem(data));
}

export class CtxPanel extends Symbiote {
  _loadRequestId = 0;

  initCallback() {
    this._renderContentEmpty(tPortal('text.selectFileDocumentation'));

    events.addEventListener('file-selected', (event) => {
      this._handleFileSelected(event.detail);
    });
  }

  _handleFileSelected(detail = {}) {
    let file = detail.path;
    let projectId = detail.projectId || getActiveRouteProjectId();
    if (getSourceLanguage(file) === 'md') {
      this._clearOutline();
      this._loadCtx(file, projectId);
      return;
    }
    this._loadOutline(file);
    this._loadCtx(file, projectId);
  }

  _loadOutline(file) {
    const skeleton = state.skeleton;
    if (!skeleton) {
      this._clearOutline();
      return;
    }

    const exportsByFile = skeleton.X || {};
    const labels = skeleton.L || {};
    const exports = exportsByFile[file];
    if (!exports || exports.length === 0) {
      this._clearOutline();
      return;
    }

    let section = document.createElement('div');
    section.className = 'pg-outline-section';

    let title = document.createElement('div');
    title.className = 'pg-outline-title';
    title.append(makeIcon('account_tree', 'pg-outline-title-icon'), document.createTextNode(`Exports · ${exports.length}`));

    let items = exports.map((exportName) => {
      let item = document.createElement('sn-list-item');
      item.className = 'pg-outline-item';
      item.title = exportName;
      setListItem(item, {
        icon: 'function',
        label: labels[exportName] || exportName,
        description: exportName,
        item: { exportName },
      });
      return item;
    });

    section.replaceChildren(title, ...items);
    this.ref.outline.replaceChildren(section);
  }

  async _loadCtx(file, projectId = getActiveRouteProjectId()) {
    const requestId = ++this._loadRequestId;
    if (getSourceLanguage(file) === 'md') {
      this._renderContentEmpty(tPortal('text.markdownShownInViewer'));
      return;
    }

    this._renderContentEmpty(tPortal('text.loadingDocs'), 'pg-pulse');

    try {
      const response = await api('/api/docs', { file, projectId });
      if (requestId !== this._loadRequestId) return;
      const docs = response?.docs || response?.content || '';
      if (!docs) {
        this._renderContentEmpty(tPortal('text.noCtxDocumentation'));
        return;
      }

      if (typeof docs === 'string') {
        this._renderCtx(docs);
        return;
      }

      let raw = document.createElement('code-block');
      raw.className = 'pg-ctx-raw';
      this.ref.content.replaceChildren(raw);
      customElements.whenDefined('code-block').then(() => {
        if (requestId !== this._loadRequestId) return;
        raw.setContent(JSON.stringify(docs, null, 2), 'json');
      });
    } catch (err) {
      if (requestId !== this._loadRequestId) return;
      this._renderContentEmpty(tPortal('text.noDocumentationAvailable'));
    }
  }

  _clearOutline() {
    this.ref.outline.replaceChildren();
  }

  _renderContentEmpty(message, className = '') {
    this.ref.content.replaceChildren(makeEmptyState(message, className));
  }

  _renderCtx(value) {
    let nodes = value.split('\n').map((line) => this._lineNode(line)).filter(Boolean);
    if (nodes.length === 0) {
      this._renderContentEmpty(tPortal('text.noDocumentationAvailable'));
      return;
    }
    this.ref.content.replaceChildren(...nodes);
  }

  _lineNode(line) {
    if (!line.trim()) return null;

    if (line.startsWith('export ') || line.match(/^\s+\w/)) {
      let sig = document.createElement('div');
      sig.className = 'pg-ctx-sig';
      sig.textContent = line;
      return sig;
    }

    if (line.startsWith('- [x]') || line.startsWith('- [ ]')) {
      let passed = line.startsWith('- [x]');
      let test = document.createElement('div');
      test.className = `pg-ctx-test ${passed ? 'passed' : 'pending'}`;
      test.append(
        makeIcon(passed ? 'check_circle' : 'radio_button_unchecked', 'pg-ctx-test-icon'),
        document.createTextNode(line.slice(5)),
      );
      return test;
    }

    let desc = document.createElement('div');
    desc.className = 'pg-ctx-desc';
    desc.textContent = line;
    return desc;
  }
}

CtxPanel.template = template;
CtxPanel.rootStyles = css;
CtxPanel.reg('pg-ctx-panel');
