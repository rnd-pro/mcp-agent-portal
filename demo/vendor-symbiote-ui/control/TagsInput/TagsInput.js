import Symbiote from '@symbiotejs/symbiote';
import template from './TagsInput.tpl.js';
import css from './TagsInput.css.js';

class TagsInput extends Symbiote {
  static observedAttributes = ['disabled', 'value', 'placeholder'];

  #tags = [];

  #onContainerClick = () => {
    if (this.disabled) return;
    this.ref.input?.focus();
  };

  #onInputKeyDown = (event) => {
    if (this.disabled) return;
    const input = this.ref.input;
    if (!input) return;

    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      const val = input.value.trim().replace(/,$/, '');
      if (val && !this.#tags.includes(val)) {
        this.#addTag(val);
        input.value = '';
      }
    } else if (event.key === 'Backspace' && input.value === '') {
      this.#removeLastTag();
    }
  };

  constructor() {
    super();
    this.init$ = {
      placeholder: 'Add tag...',
      inputLabel: 'Add tag...',
    };
  }

  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'group');
    }
    if (!this.hasAttribute('aria-label')) {
      this.setAttribute('aria-label', 'Tags input');
    }
    this.ref.container?.addEventListener('click', this.#onContainerClick);
    this.ref.input?.addEventListener('keydown', this.#onInputKeyDown);

    this.$.placeholder = this.getAttribute('placeholder') || 'Add tag...';
    this.$.inputLabel = this.$.placeholder;
    this.#syncValue();
    this.#syncDisabled();
  }

  disconnectedCallback() {
    this.ref.container?.removeEventListener('click', this.#onContainerClick);
    this.ref.input?.removeEventListener('keydown', this.#onInputKeyDown);
    super.disconnectedCallback?.();
  }

  get value() {
    return this.#tags.join(',');
  }

  set value(val) {
    this.setAttribute('value', String(val || ''));
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    this.toggleAttribute('disabled', Boolean(val));
    this.#syncDisabled();
  }

  get placeholder() {
    return this.getAttribute('placeholder') || 'Add tag...';
  }

  set placeholder(val) {
    this.setAttribute('placeholder', String(val));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'value') {
      this.#syncValue();
    } else if (name === 'disabled') {
      this.#syncDisabled();
    } else if (name === 'placeholder') {
      this.$.placeholder = newValue || 'Add tag...';
      this.$.inputLabel = this.$.placeholder;
    }
  }

  #syncValue() {
    const val = this.getAttribute('value') || '';
    this.#tags = val.split(',').map(t => t.trim()).filter(Boolean);
    this.#renderTags();
  }

  #syncDisabled() {
    if (this.ref.input) {
      this.ref.input.disabled = this.disabled;
    }
    this.ref.tagsList?.querySelectorAll('.sn-tags-chip-remove').forEach((btn) => {
      btn.disabled = this.disabled;
    });
  }

  #addTag(tag) {
    this.#tags.push(tag);
    this.setAttribute('value', this.#tags.join(','));
    this.#renderTags();
    this.#emitChange('add', tag);
  }

  #removeTag(tag) {
    this.#tags = this.#tags.filter(t => t !== tag);
    this.setAttribute('value', this.#tags.join(','));
    this.#renderTags();
    this.#emitChange('remove', tag);
  }

  #removeLastTag() {
    if (this.#tags.length === 0) return;
    const removed = this.#tags.pop();
    this.setAttribute('value', this.#tags.join(','));
    this.#renderTags();
    this.#emitChange('remove', removed);
  }

  #renderTags() {
    const list = this.ref.tagsList;
    if (!list) return;

    list.innerHTML = '';
    this.#tags.forEach(tag => {
      const li = document.createElement('li');
      li.className = 'sn-tags-chip';
      li.textContent = tag;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'sn-tags-chip-remove';
      removeBtn.setAttribute('aria-label', `Remove ${tag}`);
      removeBtn.disabled = this.disabled;
      const removeIcon = document.createElement('span');
      removeIcon.className = 'material-symbols-outlined sn-tags-chip-remove-icon';
      removeIcon.setAttribute('aria-hidden', 'true');
      removeIcon.textContent = 'close';
      removeBtn.appendChild(removeIcon);
      removeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (this.disabled) return;
        this.#removeTag(tag);
      });

      li.appendChild(removeBtn);
      list.appendChild(li);
    });
  }

  #emitChange(type, tag) {
    const detail = { value: this.value, tag, action: type };
    this.dispatchEvent(new CustomEvent('sn-control-change', { bubbles: true, composed: true, detail }));
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, composed: true, detail }));
  }
}

TagsInput.template = template;
TagsInput.rootStyles = css;
TagsInput.reg('sn-tags-input');

export default TagsInput;
