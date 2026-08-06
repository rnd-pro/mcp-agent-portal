import Symbiote from '@symbiotejs/symbiote';
import template from './QuickOpen.tpl.js';
import css from './QuickOpen.css.js';
import { fuzzyScore, normalizeQuickOpenItems, searchQuickOpenItems } from '../quick-open-utils.js';
import { translate } from '../../locale/index.js';

function emit(el, type, detail = {}) {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export class QuickOpen extends Symbiote {
  init$ = {
    visible: false,
    query: '',
    resultsHTML: '',
    selectedIdx: 0,
    activeDescendantId: '',
    placeholder: translate('quickOpen.placeholder'),
    emptyText: translate('quickOpen.empty'),
    maxResults: 15,
    onDialogClick: (event) => {
      event.stopPropagation();
    },
    onInput: (event) => {
      this._onInput(event);
    },
    onKeydown: (event) => {
      this._onKeydown(event);
    },
    onResultClick: (event) => {
      let item = event.target.closest('.qo-item');
      if (!item) return;
      this.$.selectedIdx = Number(item.dataset.idx);
      this._selectCurrent();
    },
  };

  _items = [];
  _results = [];
  _renderInitialized = false;
  _removeDocumentKeydown = null;

  renderCallback() {
    if (this._renderInitialized) return;
    this._renderInitialized = true;

    this._overlay = this.querySelector('.qo-overlay');
    this._overlay?.addEventListener('click', (event) => {
      if (event.target === this._overlay) this.close();
    });

    let keydown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        this.toggle();
      }

      if (event.key === 'Escape' && this.$.visible) {
        event.preventDefault();
        this.close();
      }
    };

    document.addEventListener('keydown', keydown);
    this._removeDocumentKeydown = () => document.removeEventListener('keydown', keydown);

    this.sub('visible', (visible) => {
      let input = this.querySelector('.qo-input');
      if (input) {
        input.setAttribute('aria-expanded', String(visible));
      }

      if (!this._overlay) return;
      this._overlay.hidden = !visible;

      if (visible) {
        let focusInput = () => {
          if (input) {
            input.value = '';
            input.focus();
          }
        };
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(focusInput);
        } else {
          focusInput();
        }
      }
    });

    this.sub('activeDescendantId', (id) => {
      let input = this.querySelector('.qo-input');
      if (input) {
        if (id) {
          input.setAttribute('aria-activedescendant', id);
        } else {
          input.removeAttribute('aria-activedescendant');
        }
      }
    });
  }

  disconnectedCallback() {
    this._removeDocumentKeydown?.();
    super.disconnectedCallback?.();
  }

  setItems(items = []) {
    this._items = normalizeQuickOpenItems(items);
    this._search(this.$.query);
  }

  setFiles(files = []) {
    this.setItems(files);
  }

  open() {
    this.$.visible = true;
    this.$.query = '';
    this.$.selectedIdx = 0;
    this._search('');
  }

  close() {
    this.$.visible = false;
  }

  toggle() {
    if (this.$.visible) {
      this.close();
    } else {
      this.open();
    }
  }

  _onInput(event) {
    this.$.query = event.target.value;
    this.$.selectedIdx = 0;
    this._search(this.$.query);
  }

  _onKeydown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.$.selectedIdx = Math.min(this.$.selectedIdx + 1, this._results.length - 1);
      this._renderResults();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.$.selectedIdx = Math.max(this.$.selectedIdx - 1, 0);
      this._renderResults();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this._selectCurrent();
    }
  }

  _selectCurrent() {
    let result = this._results[this.$.selectedIdx];
    if (!result) return;

    this.close();
    emit(this, 'quick-open-select', result.item);
  }

  _search(query) {
    this._results = searchQuickOpenItems(this._items, query, this.$.maxResults);
    this._renderResults();
  }

  static _fuzzyScore(query, candidate) {
    return fuzzyScore(query, candidate);
  }

  _renderResults() {
    if (this._results.length === 0) {
      this.$.resultsHTML = `<div class="qo-empty">${escapeHtml(this.$.emptyText)}</div>`;
      this.$.activeDescendantId = '';
      return;
    }

    let html = [];
    for (let i = 0; i < this._results.length; i++) {
      let { item } = this._results[i];
      let isSelected = i === this.$.selectedIdx;
      let selectedClass = isSelected ? ' qo-selected' : '';

      html.push(`<div class="qo-item${selectedClass}" id="qo-item-${i}" role="option" aria-selected="${isSelected}" data-idx="${i}" data-value="${escapeHtml(item.value)}">
        <span class="qo-name">${escapeHtml(item.label)}</span>
        <span class="qo-path">${escapeHtml(item.path)}</span>
      </div>`);
    }

    this.$.resultsHTML = html.join('');
    this.$.activeDescendantId = `qo-item-${this.$.selectedIdx}`;
  }
}

QuickOpen.template = template;
QuickOpen.rootStyles = css;
QuickOpen.reg('quick-open');
