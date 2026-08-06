import Symbiote from '@symbiotejs/symbiote';
import template from './RichTextEditor.tpl.js';
import css from './RichTextEditor.css.js';

class RichTextEditor extends Symbiote {
  static observedAttributes = ['value', 'disabled', 'unsafe'];

  #savedRange = null;

  #onToolbarClick = (event) => {
    if (this.disabled) return;
    let btn = event.target.closest('.sn-editor-btn');
    if (!btn) return;

    event.preventDefault();
    let command = btn.getAttribute('data-command');

    if (command === 'createLink') {
      this.#saveSelection();
      this.ref.linkInput.value = '';
      this.ref.linkOverlay.hidden = false;
      this.ref.linkInput.focus();
    } else {
      this.#formatSelection(command);
    }
  };

  #formatSelection(command, value = null) {
    if (this.disabled) return;
    let selection = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
    if (!selection || !selection.rangeCount) return;
    let range = selection.getRangeAt(0);

    if (!this.ref.editor.contains(range.commonAncestorContainer)) return;

    if (command === 'bold') {
      this.#wrapOrUnwrapRange(range, 'strong');
    } else if (command === 'italic') {
      this.#wrapOrUnwrapRange(range, 'em');
    } else if (command === 'underline') {
      this.#wrapOrUnwrapRange(range, 'u');
    } else if (command === 'createLink') {
      let safeUrl = this.#sanitizeUrl(value);
      if (safeUrl) {
        let a = document.createElement('a');
        a.setAttribute('href', safeUrl);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        try {
          range.surroundContents(a);
        } catch (e) {
          let content = range.extractContents();
          a.appendChild(content);
          range.insertNode(a);
        }
      }
    } else if (command === 'insertUnorderedList' || command === 'insertOrderedList') {
      let tag = command === 'insertUnorderedList' ? 'ul' : 'ol';
      let list = document.createElement(tag);
      let li = document.createElement('li');
      try {
        range.surroundContents(li);
        list.appendChild(li);
        range.insertNode(list);
      } catch (e) {
        let content = range.extractContents();
        li.appendChild(content);
        list.appendChild(li);
        range.insertNode(list);
      }
    }

    this.ref.editor?.focus();
    this.#emitChange();
  }

  #wrapOrUnwrapRange(range, tagName) {
    let parent = range.commonAncestorContainer;
    if (parent.nodeType === 3) { // Node.TEXT_NODE
      parent = parent.parentNode;
    }

    let existing = parent.closest(tagName);
    if (existing && this.ref.editor.contains(existing)) {
      let parentNode = existing.parentNode;
      while (existing.firstChild) {
        parentNode.insertBefore(existing.firstChild, existing);
      }
      parentNode.removeChild(existing);
    } else {
      let wrapper = document.createElement(tagName);
      if (range.collapsed) {
        let textNode = document.createTextNode('\u200B');
        wrapper.appendChild(textNode);
        range.insertNode(wrapper);

        let newRange = document.createRange();
        newRange.setStart(textNode, 1);
        newRange.collapse(true);
        let sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(newRange);
      } else {
        try {
          range.surroundContents(wrapper);
        } catch (e) {
          let content = range.extractContents();
          wrapper.appendChild(content);
          range.insertNode(wrapper);
        }
      }
    }
  }

  #saveSelection = () => {
    let sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
    if (sel && sel.rangeCount > 0) {
      let range = sel.getRangeAt(0);
      if (this.ref.editor.contains(range.commonAncestorContainer)) {
        this.#savedRange = range.cloneRange();
      }
    }
  };

  #restoreSelection = () => {
    if (this.#savedRange) {
      let sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(this.#savedRange);
      }
    }
  };

  #onLinkConfirm = () => {
    let url = this.ref.linkInput.value.trim();
    this.ref.linkOverlay.hidden = true;
    if (url) {
      this.#restoreSelection();
      this.#formatSelection('createLink', url);
    }
    this.ref.editor?.focus();
    this.#savedRange = null;
  };

  #onLinkCancel = () => {
    this.ref.linkOverlay.hidden = true;
    this.ref.editor?.focus();
    this.#savedRange = null;
  };

  #onLinkInputKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.#onLinkConfirm();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.#onLinkCancel();
    }
  };

  #onEditorInput = () => {
    this.#emitChange();
  };

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.ref.toolbar?.addEventListener('click', this.#onToolbarClick);
    this.ref.editor?.addEventListener('input', this.#onEditorInput);
    this.ref.editor?.addEventListener('blur', this.#onEditorInput);
    this.ref.linkConfirmBtn?.addEventListener('click', this.#onLinkConfirm);
    this.ref.linkCancelBtn?.addEventListener('click', this.#onLinkCancel);
    this.ref.linkInput?.addEventListener('keydown', this.#onLinkInputKeyDown);

    this.#syncValue();
    this.#syncDisabled();
  }

  disconnectedCallback() {
    this.ref.toolbar?.removeEventListener('click', this.#onToolbarClick);
    this.ref.editor?.removeEventListener('input', this.#onEditorInput);
    this.ref.editor?.removeEventListener('blur', this.#onEditorInput);
    this.ref.linkConfirmBtn?.removeEventListener('click', this.#onLinkConfirm);
    this.ref.linkCancelBtn?.removeEventListener('click', this.#onLinkCancel);
    this.ref.linkInput?.removeEventListener('keydown', this.#onLinkInputKeyDown);
    super.disconnectedCallback?.();
  }

  get value() {
    let htmlContent = this.ref.editor?.innerHTML || '';
    return this.unsafe ? htmlContent : this.sanitize(htmlContent);
  }

  set value(val) {
    let sanitized = this.sanitize(val);
    this.setAttribute('value', String(sanitized || ''));
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    this.toggleAttribute('disabled', Boolean(val));
  }

  get unsafe() {
    return this.hasAttribute('unsafe');
  }

  set unsafe(val) {
    this.toggleAttribute('unsafe', Boolean(val));
  }

  #sanitizeUrl(value, options = {}) {
    let url = String(value || '').trim();
    if (!url) return '';

    let compact = url.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
    if (compact.startsWith('javascript:') || compact.startsWith('vbscript:')) {
      return '';
    }

    if (compact.startsWith('data:')) {
      if (options.allowDataImage && /^data:image\/(png|gif|jpe?g|webp);/i.test(compact)) {
        return url;
      }
      return '';
    }

    let schemeMatch = url.match(/^([a-z][a-z0-9+.-]*):/i);
    if (schemeMatch && !['http', 'https', 'mailto', 'tel'].includes(schemeMatch[1].toLowerCase())) {
      return '';
    }

    return url;
  }

  sanitize(htmlContent) {
    if (this.unsafe || !htmlContent) return htmlContent || '';
    if (typeof window === 'undefined') return htmlContent;
    let doc = window.document || globalThis.window?.document;
    if (!doc) return htmlContent;
    let div = doc.createElement('div');
    div.innerHTML = htmlContent;

    let elements = div.querySelectorAll('*');
    for (let el of elements) {
      let tag = el.tagName.toLowerCase();
      if (['script', 'style', 'iframe', 'object', 'embed', 'applet', 'meta', 'link'].includes(tag)) {
        el.remove();
        continue;
      }

      let attrNames = el.getAttributeNames();
      for (let name of attrNames) {
        if (name.startsWith('on')) {
          el.removeAttribute(name);
        } else if (['style', 'srcdoc', 'srcset'].includes(name)) {
          el.removeAttribute(name);
        } else if (['href', 'src', 'action', 'formaction'].includes(name)) {
          let val = el.getAttribute(name).trim();
          let safeValue = this.#sanitizeUrl(val, { allowDataImage: name === 'src' });
          if (!safeValue) {
            el.removeAttribute(name);
          } else if (safeValue !== val) {
            el.setAttribute(name, safeValue);
          }
        }
      }
    }
    return div.innerHTML;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'value') {
      this.#syncValue();
    } else if (name === 'disabled') {
      this.#syncDisabled();
    } else if (name === 'unsafe') {
      this.#syncValue();
    }
  }

  #syncValue() {
    if (this.ref.editor) {
      let val = this.getAttribute('value') || '';
      let sanitized = this.sanitize(val);
      if (!this.unsafe && this.hasAttribute('value') && val !== sanitized) {
        this.setAttribute('value', sanitized);
        return;
      }
      if (this.ref.editor.innerHTML !== sanitized) {
        this.ref.editor.innerHTML = sanitized;
      }
    }
  }

  #syncDisabled() {
    if (this.ref.editor) {
      let enabled = !this.disabled;
      this.ref.editor.contentEditable = String(enabled);
      this.ref.editor.setAttribute('contenteditable', String(enabled));
    }
  }

  #emitChange() {
    let htmlContent = this.value;
    let detail = { value: htmlContent };
    this.dispatchEvent(new CustomEvent('sn-control-change', { bubbles: true, composed: true, detail }));
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, composed: true, detail }));
  }
}

RichTextEditor.template = template;
RichTextEditor.rootStyles = css;
RichTextEditor.reg('sn-rich-text-editor');

export default RichTextEditor;
