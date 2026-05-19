import { Symbiote } from '@symbiotejs/symbiote';
import { events } from '../../app.js';
import '../../components/CodeBlock/CodeBlock.js';
import './SkillMetadata.js';

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
    editMode: false,
    modeLabel: 'edit',
    onSave: () => this.saveCurrentFile(),
    onToggleEdit: () => this.setEditMode(!this.$.editMode)
  };

  initCallback() {
    events.addEventListener('file-selected', event => {
      let path = event.detail.path || '';
      if (path.startsWith('.agent-portal/')) this.loadFile(path);
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

  async loadFile(path) {
    if (this.$.dirty && !confirm('Current file has unsaved changes. Open another file?')) return;
    this._currentPath = path;
    this.$.filename = path;
    this.$.hasFile = false;
    this.$.statusText = 'Loading...';
    try {
      let data = await this.fetchJson(withActiveProject(`/api/agent-portal/file?path=${encodeURIComponent(portalRelativePath(path))}`));
      this.ref.editor.value = data.content || '';
      this.ref.editor.disabled = !EDITABLE_EXTS.has(extensionOf(path));
      this.syncPreview();
      this.setEditMode(!isMarkdown(path));
      this.$.hasFile = true;
      this.setDirty(false);
      this.dispatchMetadata();
    } catch (err) {
      this.ref.editor.value = `Error: ${err.message}`;
      this.ref.editor.disabled = true;
      this.$.hasFile = true;
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
}

SkillManager.template = `
  <div class="pg-code-header">
    <span class="pg-code-filename" bind="textContent: filename"></span>
    <div class="pg-code-controls">
      <span class="pg-code-stats" bind="textContent: statusText"></span>
      <button class="pg-mode-toggle" bind="onclick: onToggleEdit; hidden: !hasFile" title="Toggle edit mode">
        <span class="material-symbols-outlined" style="font-size:14px">edit_note</span>
        <span class="pg-mode-label" bind="textContent: modeLabel"></span>
      </button>
      <button class="pg-mode-toggle" bind="onclick: onSave; disabled: !dirty" title="Save">
        <span class="material-symbols-outlined" style="font-size:14px">save</span>
        <span class="pg-mode-label">save</span>
      </button>
    </div>
  </div>
  <code-block ref="preview"></code-block>
  <textarea class="pg-markdown-editor" ref="editor" spellcheck="false" disabled></textarea>
`;

SkillManager.rootStyles = `
  pg-skill-manager {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  pg-skill-manager .pg-code-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
    color: var(--sn-text-dim, hsl(30, 10%, 45%));
    border-bottom: 1px solid var(--sn-node-border, hsl(35, 18%, 80%));
    background: var(--sn-node-header-bg, hsl(37, 25%, 93%));
    gap: 8px;
  }
  pg-skill-manager .pg-code-filename {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  pg-skill-manager .pg-code-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  pg-skill-manager .pg-code-stats {
    font-size: 10px;
    color: var(--sn-cat-server, hsl(210, 45%, 45%));
    white-space: nowrap;
  }
  pg-skill-manager .pg-mode-toggle {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 2px 8px;
    border: 1px solid var(--sn-node-border, hsl(35, 18%, 80%));
    border-radius: 4px;
    background: var(--sn-bg, hsl(37, 30%, 91%));
    color: var(--sn-text-dim, hsl(30, 10%, 45%));
    font-family: inherit;
    font-size: 10px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  pg-skill-manager .pg-mode-toggle:disabled {
    opacity: 0.45;
    cursor: default;
  }
  pg-skill-manager .pg-mode-toggle[hidden] {
    display: none;
  }
  pg-skill-manager code-block {
    flex: 1;
    min-height: 0;
    cursor: text;
  }
  pg-skill-manager .pg-markdown-editor {
    display: none;
    flex: 1;
    min-height: 0;
    width: 100%;
    box-sizing: border-box;
    border: 0;
    outline: 0;
    resize: none;
    padding: 14px 16px;
    background: var(--sn-bg, hsl(37, 30%, 96%));
    color: var(--sn-text, hsl(30, 15%, 18%));
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 12px;
    line-height: 1.6;
    tab-size: 2;
  }
  pg-skill-manager[mode-edit] code-block {
    display: none;
  }
  pg-skill-manager[mode-edit] .pg-markdown-editor {
    display: block;
  }
`;

SkillManager.reg('pg-skill-manager');

export default SkillManager;
