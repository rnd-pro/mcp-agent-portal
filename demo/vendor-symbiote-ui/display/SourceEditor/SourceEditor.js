import Symbiote from '@symbiotejs/symbiote';
import template from './SourceEditor.tpl.js';
import css from './SourceEditor.css.js';
import {
  applySourceSyntaxTheme,
  normalizeSourceAction,
  normalizeSourceSyntaxTheme,
} from '../source-contract.js';

function emit(component, name, detail = {}) {
  component.dispatchEvent(new CustomEvent(name, {
    bubbles: true,
    composed: true,
    detail,
  }));
}

export class SourceEditor extends Symbiote {
  init$ = {
    value: '',
    language: 'plain',
    path: '',
    placeholder: '',
    ariaLabel: 'Source editor',
    readonly: false,
    disabled: false,
    dirty: false,
    onInput: () => this._handleInput(),
    onKeyDown: (event) => this._handleKeyDown(event),
  };

  _saveAction = null;
  _syntaxTheme = null;

  renderCallback() {
    this.sub('value', (value) => {
      let editor = this.ref?.editor;
      if (editor && editor.value !== value) {
        editor.value = value || '';
      }
    });

    this.sub('language', (value) => {
      this.setAttribute('data-language', value || 'plain');
    });

    this.sub('dirty', (value) => {
      this.toggleAttribute('dirty', Boolean(value));
    });
  }

  get value() {
    return this.getContent();
  }

  set value(value) {
    this.setContent(value);
  }

  get disabled() {
    return Boolean(this.$.disabled);
  }

  set disabled(value) {
    this.$.disabled = Boolean(value);
  }

  get readOnly() {
    return Boolean(this.$.readonly);
  }

  set readOnly(value) {
    this.$.readonly = Boolean(value);
  }

  getContent() {
    return this.ref?.editor?.value ?? this.$.value ?? '';
  }

  setContent(value, options = {}) {
    let content = String(value ?? '');
    this.$.value = content;
    if (this.ref?.editor && this.ref.editor.value !== content) {
      this.ref.editor.value = content;
    }
    this.setDirty(Boolean(options.dirty));
  }

  setSourceDocument(document = {}) {
    let data = document && typeof document === 'object' ? document : {};
    if (data.path != null || data.id != null || data.uri != null) {
      this.$.path = String(data.path || data.id || data.uri || '');
    }
    if (data.language != null || data.lang != null) {
      this.setLanguage(data.language || data.lang);
    }
    if (data.readOnly !== undefined || data.readonly !== undefined) {
      this.readOnly = Boolean(data.readOnly ?? data.readonly);
    }
    if (data.disabled !== undefined) {
      this.disabled = Boolean(data.disabled);
    }
    this.setSaveAction(data.saveAction || data.save || null);
    this.setSyntaxTheme(data.syntaxTheme || { tokens: data.syntaxTokens });
    this.setContent(data.content ?? data.raw ?? '', { dirty: Boolean(data.dirty) });
  }

  setEditable(editable) {
    this.$.disabled = !editable;
  }

  setLanguage(language) {
    this.$.language = language || 'plain';
  }

  setDirty(dirty) {
    this.$.dirty = Boolean(dirty);
  }

  setSaveAction(action) {
    this._saveAction = normalizeSourceAction(action);
    this.toggleAttribute('has-save-action', Boolean(this._saveAction));
    return this._saveAction;
  }

  setSyntaxTheme(theme = null) {
    this._syntaxTheme = normalizeSourceSyntaxTheme(theme);
    applySourceSyntaxTheme(this, this._syntaxTheme);
    return this._syntaxTheme;
  }

  setSyntaxTokens(tokens = {}) {
    return this.setSyntaxTheme({ tokens });
  }

  triggerSave(extra = {}) {
    if (!this._saveAction || this._saveAction.disabled) return false;
    emit(this, 'source-editor-save', {
      action: this._saveAction,
      path: this.$.path,
      value: this.getContent(),
      dirty: this.$.dirty,
      language: this.$.language,
      ...extra,
    });
    return true;
  }

  focus() {
    this.ref?.editor?.focus();
  }

  select() {
    this.ref?.editor?.select();
  }

  _handleInput() {
    let value = this.getContent();
    this.$.value = value;
    this.setDirty(true);
    emit(this, 'source-editor-input', {
      value,
      dirty: this.$.dirty,
      language: this.$.language,
      path: this.$.path,
    });
  }

  _handleKeyDown(event) {
    if (event.key !== 'Tab' || event.metaKey || event.ctrlKey || event.altKey) return;

    let editor = this.ref?.editor;
    if (!editor || editor.disabled || editor.readOnly) return;

    event.preventDefault();
    let start = editor.selectionStart;
    let end = editor.selectionEnd;
    let tab = '  ';
    editor.value = `${editor.value.slice(0, start)}${tab}${editor.value.slice(end)}`;
    editor.selectionStart = editor.selectionEnd = start + tab.length;
    this._handleInput();
  }
}

SourceEditor.template = template;
SourceEditor.rootStyles = css;
SourceEditor.reg('source-editor');
