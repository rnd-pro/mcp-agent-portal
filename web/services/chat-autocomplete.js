import { escapeHtml } from '../utils/markdown-formatter.js';

export class ChatAutocomplete {
  constructor(opts) {
    this.popup = opts.popupEl;
    this.textarea = opts.textareaEl;
    this.onAttachFile = opts.onAttachFile;
    this.onInsertWorkflow = opts.onInsertWorkflow;

    this._visible = false;
    this._items = [];
    this._index = -1;
    this._trigger = null; // '@' or '/'
    this._startPos = 0;
  }

  get isVisible() {
    return this._visible;
  }

  check(value, cursorPos) {
    // Find trigger character before cursor
    let before = value.substring(0, cursorPos);
    let atMatch = before.match(/@([\w./\-]*)$/);
    let slashMatch = before.match(/^\/([\w]*)$/);

    if (atMatch) {
      this._trigger = '@';
      this._startPos = cursorPos - atMatch[0].length;
      this._show(atMatch[1]);
    } else if (slashMatch) {
      this._trigger = '/';
      this._startPos = 0;
      this._show(slashMatch[1]);
    } else {
      this.hide();
    }
  }

  async _show(query) {
    let items = [];
    if (this._trigger === '/') {
      // Workflows
      items = [
        { label: 'publish', hint: 'Cross-project publication', icon: 'rocket_launch' },
      ];
      if (query) items = items.filter(i => i.label.startsWith(query));
    } else if (this._trigger === '@') {
      // Files from project
      try {
        let res = await fetch('/api/files/list');
        if (res.ok) {
          let data = await res.json();
          items = (data.files || []).map(f => ({
            label: f.path || f, hint: f.type || 'file', icon: f.type === 'directory' ? 'folder' : 'description'
          }));
        }
      } catch (e) { console.warn('[ChatAutocomplete] file list fetch failed:', e.message); }
      
      // Fallback: allow typing arbitrary paths
      if (items.length === 0) {
        items = [{ label: query || 'path/to/file', hint: 'type a path', icon: 'description' }];
      }
      if (query) items = items.filter(i => i.label.toLowerCase().includes(query.toLowerCase()));
      items = items.slice(0, 12);
    }

    this._items = items;
    this._index = items.length > 0 ? 0 : -1;
    this._render();
  }

  hide() {
    this._visible = false;
    this._items = [];
    this._index = -1;
    if (this.popup) this.popup.classList.remove('visible');
  }

  _render() {
    if (!this.popup) return;
    if (this._items.length === 0) {
      this.hide();
      return;
    }
    this._visible = true;
    let header = this._trigger === '@' ? 'Files' : 'Workflows';
    this.popup.innerHTML = `<div class="autocomplete-header">${header}</div>` +
      this._items.map((item, i) => `
        <div class="autocomplete-item${i === this._index ? ' active' : ''}" data-index="${i}">
          <span class="material-symbols-outlined">${item.icon}</span>
          <span class="autocomplete-item-label">${escapeHtml(item.label)}</span>
          <span class="autocomplete-item-hint">${escapeHtml(item.hint)}</span>
        </div>
      `).join('');
    this.popup.classList.add('visible');

    // Click handler
    this.popup.onclick = (e) => {
      let el = e.target.closest('.autocomplete-item');
      if (el) {
        this._index = parseInt(el.dataset.index);
        this.select();
      }
    };
  }

  navigate(dir) {
    if (this._items.length === 0) return;
    this._index = (this._index + dir + this._items.length) % this._items.length;
    this._render();
  }

  select() {
    let item = this._items[this._index];
    if (!item) return;

    let ta = this.textarea;
    let value = ta.value;

    if (this._trigger === '@') {
      let before = value.substring(0, this._startPos);
      let after = value.substring(ta.selectionStart);
      let newVal = before + after;
      if (this.onAttachFile) this.onAttachFile(newVal, item.label);
    } else if (this._trigger === '/') {
      let newVal = '/' + item.label + ' ';
      if (this.onInsertWorkflow) this.onInsertWorkflow(newVal);
    }

    this.hide();
    ta.focus();
  }
}
