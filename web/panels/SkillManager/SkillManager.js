import { Symbiote } from '@symbiotejs/symbiote';
import { events } from '../../app.js';
import '../../components/CodeBlock/CodeBlock.js';
import './SkillMetadata.js';
import template from './SkillManager.tpl.js';
import styles from './SkillManager.css.js';

const EDITABLE_EXTS = new Set(['.md', '.markdown', '.json', '.js', '.yml', '.yaml', '.txt']);

function extensionOf(path) {
  let match = String(path || '').match(/(\.[^.\\/]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function portalRelativePath(path) {
  return String(path || '').replace(/^\.agent-portal\/?/, '');
}

function isMarkdown(path) {
  return /\.(md|markdown)$/i.test(path || '');
}

function activeProjectId() {
  let query = String(location.hash || '').split('?')[1] || '';
  return new URLSearchParams(query).get('project') || null;
}

function withActiveProject(url) {
  let projectId = activeProjectId();
  if (!projectId) return url;
  let separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}project=${encodeURIComponent(projectId)}`;
}

export class SkillManager extends Symbiote {
  init$ = {
    filename: 'Select a file',
    statusText: '',
    dirty: false,
    hasFile: false,
    canInstall: false,
    editMode: false,
    modeLabel: 'edit',
    onSave: () => this.saveCurrentFile(),
    onInstall: () => this.installCurrentOpenFile(),
    onToggleEdit: () => this.setEditMode(!this.$.editMode)
  };

  initCallback() {
    events.addEventListener('file-selected', event => {
      let path = event.detail.path || '';
      if (path.startsWith('.agent-portal/')) this.loadFile(path);
      if (path.startsWith('.open-library/')) this.loadFile(path, { source: 'open-library' });
    });
    this.ref.editor.addEventListener('input', () => {
      this.setDirty(true);
      this.syncPreview();
      this.dispatchMetadata();
    });
    this.ref.preview.addEventListener('click', () => {
      if (this._currentPath && !this.ref.editor.disabled) this.setEditMode(true);
    });
  }

  async fetchJson(url, options) {
    let res = await fetch(url, options);
    let data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async loadFile(path, { source = 'team' } = {}) {
    if (this.$.dirty && !confirm('Current file has unsaved changes. Open another file?')) return;
    this._currentPath = path;
    this._currentSource = source;
    this.$.filename = path;
    this.$.hasFile = false;
    this.$.canInstall = false;
    this.$.statusText = 'Loading...';
    try {
      let relPath = portalRelativePath(path.replace(/^\.open-library\/?/, ''));
      let url = source === 'open-library'
        ? `/api/agent-portal/open-library/file?path=${encodeURIComponent(relPath)}`
        : withActiveProject(`/api/agent-portal/file?path=${encodeURIComponent(relPath)}`);
      let data = await this.fetchJson(url);
      this.ref.editor.value = data.content || '';
      this.ref.editor.disabled = source === 'open-library' || !EDITABLE_EXTS.has(extensionOf(path));
      this.syncPreview();
      this.setEditMode(source !== 'open-library' && !isMarkdown(path));
      this.$.hasFile = true;
      this.$.canInstall = source === 'open-library';
      this.setDirty(false);
      this.dispatchMetadata();
    } catch (err) {
      this.ref.editor.value = `Error: ${err.message}`;
      this.ref.editor.disabled = true;
      this.$.hasFile = true;
      this.$.canInstall = false;
      this.$.statusText = 'Error';
    }
  }

  setDirty(dirty) {
    this.$.dirty = dirty;
    this.$.statusText = dirty ? 'Modified' : '';
    this.dispatchMetadata();
  }

  setEditMode(editMode) {
    this.$.editMode = !!editMode;
    this.$.modeLabel = this.$.editMode ? 'view' : 'edit';
    this.toggleAttribute('mode-edit', this.$.editMode);
    if (this.$.editMode) {
      requestAnimationFrame(() => this.ref.editor.focus());
    } else {
      this.syncPreview();
    }
  }

  syncPreview() {
    let preview = this.ref.preview;
    if (!preview) return;
    let path = this._currentPath || '';
    let markdown = isMarkdown(path);
    preview.setBasePath(path);
    preview.$.lang = markdown ? 'md' : 'plain';
    preview.$.code = this.ref.editor.value || '';
  }

  dispatchMetadata() {
    if (!this._currentPath) return;
    events.dispatchEvent(new CustomEvent('agent-portal-file-loaded', {
      detail: {
        path: this._currentPath,
        content: this.ref.editor.value,
        editable: !this.ref.editor.disabled
      }
    }));
  }

  applyContent(content) {
    this.ref.editor.value = content;
    this.syncPreview();
    this.setDirty(true);
  }

  async saveCurrentFile() {
    if (!this._currentPath || this.ref.editor.disabled) return;
    this.$.statusText = 'Saving...';
    try {
      await this.fetchJson(withActiveProject('/api/agent-portal/file'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProjectId(),
          path: portalRelativePath(this._currentPath),
          content: this.ref.editor.value
        })
      });
      this.setDirty(false);
      if (isMarkdown(this._currentPath)) this.setEditMode(false);
      this.$.statusText = 'Saved';
      setTimeout(() => {
        if (!this.$.dirty) this.$.statusText = '';
      }, 1200);
    } catch (err) {
      this.$.statusText = `Error: ${err.message}`;
    }
  }

  async installCurrentOpenFile() {
    if (!this._currentPath?.startsWith('.open-library/')) return;
    let sourcePath = this._currentPath.replace(/^\.open-library\/?/, '');
    this.$.statusText = 'Installing...';
    try {
      let data = await this.fetchJson(withActiveProject('/api/agent-portal/open-library/install'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProjectId(),
          sourcePath
        })
      });
      events.dispatchEvent(new CustomEvent('agent-portal-tree-refresh'));
      this.$.statusText = 'Installed';
      let teamPath = `.agent-portal/${data.targetPath || sourcePath}`;
      setTimeout(() => this.loadFile(teamPath), 150);
    } catch (err) {
      this.$.statusText = `Error: ${err.message}`;
    }
  }
}

SkillManager.template = template;
SkillManager.rootStyles = styles;
SkillManager.reg('pg-skill-manager');

export default SkillManager;
