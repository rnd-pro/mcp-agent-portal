import Symbiote from '@symbiotejs/symbiote';
import template from './Listbox.tpl.js';
import css from './Listbox.css.js';
import { Collection } from '../../ui/collection.js';
import { Typeahead } from '../../ui/typeahead.js';

export class Listbox extends Symbiote {
  static observedAttributes = ['value', 'multiple', 'disabled', 'label'];

  #collection = null;
  #typeahead = new Typeahead();
  #observer = null;
  #focusedIndex = -1;

  constructor() {
    super();
    this.init$ = {
      label: '',
      activeId: '',
    };
  }

  connectedCallback() {
    super.connectedCallback?.();

    this.#collection = new Collection(this, '[role="option"]');

    this.#observer = new MutationObserver(() => {
      if (!this.#observer) return;
      this.#observer.disconnect();
      this.#collection.sync();
      this.#syncSelectedStates();
      if (this.#observer) {
        this.#observer.observe(this, { childList: true, characterData: true, subtree: true });
      }
    });
    this.#observer.observe(this, { childList: true, characterData: true, subtree: true });

    this.ref.container?.addEventListener('keydown', this.#onKeyDown);
    this.ref.container?.addEventListener('click', this.#onClick);

    this.#syncSelectedStates();
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
    this.#observer = null;
    this.ref.container?.removeEventListener('keydown', this.#onKeyDown);
    this.ref.container?.removeEventListener('click', this.#onClick);
    super.disconnectedCallback?.();
  }

  get value() {
    return this.getAttribute('value') || '';
  }

  set value(val) {
    this.setAttribute('value', String(val));
  }

  get multiple() {
    return this.hasAttribute('multiple');
  }

  set multiple(val) {
    this.toggleAttribute('multiple', Boolean(val));
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    this.toggleAttribute('disabled', Boolean(val));
  }

  get label() {
    return this.getAttribute('label') || '';
  }

  set label(val) {
    this.setAttribute('label', String(val));
    this.$.label = val;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'value') {
      this.#syncSelectedStates();
    } else if (name === 'label') {
      this.$.label = newValue || '';
    } else if (name === 'disabled') {
      if (newValue != null) {
        this.ref.container?.setAttribute('tabindex', '-1');
      } else {
        this.ref.container?.setAttribute('tabindex', '0');
      }
    }
  }

  #onKeyDown = (event) => {
    if (this.disabled) return;

    const items = this.#collection.getItems();
    if (items.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.#focusOption(this.#focusedIndex + 1, 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.#focusOption(this.#focusedIndex - 1, -1);
        break;
      case 'Home':
        event.preventDefault();
        this.#focusOption(0, 1);
        break;
      case 'End':
        event.preventDefault();
        this.#focusOption(items.length - 1, -1);
        break;
      case ' ':
      case 'Enter':
        event.preventDefault();
        if (this.#focusedIndex >= 0 && this.#focusedIndex < items.length) {
          this.#selectIndex(this.#focusedIndex);
        }
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const match = this.#typeahead.handleKey(event.key, items.filter(item => !item.disabled).map(i => i.element));
          if (match) {
            const matchedIdx = items.findIndex(i => i.element === match);
            if (matchedIdx >= 0) {
              this.#focusOption(matchedIdx);
            }
          }
        }
        break;
    }
  };

  #onClick = (event) => {
    if (this.disabled) return;
    const items = this.#collection.getItems();
    const targetOption = event.target.closest('[role="option"]');
    if (!targetOption) return;

    const idx = items.findIndex(item => item.element === targetOption);
    if (idx >= 0 && !items[idx].disabled) {
      this.#focusOption(idx);
      this.#selectIndex(idx);
    }
  };

  #focusOption(index, step = 1) {
    const items = this.#collection.getItems();
    if (items.length === 0) return;

    let nextIndex = index;
    for (let attempts = 0; attempts < items.length; attempts += 1) {
      if (nextIndex < 0) nextIndex = items.length - 1;
      if (nextIndex >= items.length) nextIndex = 0;
      if (!items[nextIndex].disabled) break;
      nextIndex += step;
    }

    if (items[nextIndex]?.disabled) {
      this.#focusedIndex = -1;
      this.$.activeId = '';
      return;
    }

    this.#focusedIndex = nextIndex;
    const activeItem = items[nextIndex];

    items.forEach((item, idx) => {
      if (idx === nextIndex) {
        item.element.setAttribute('data-focused', '');
        this.$.activeId = item.id;
        item.element.scrollIntoView?.({ block: 'nearest' });
      } else {
        item.element.removeAttribute('data-focused');
      }
    });
  }

  #selectIndex(index) {
    const items = this.#collection.getItems();
    const item = items[index];
    if (!item || item.disabled) return;

    const oldValue = this.value;
    let newValue = item.value;

    if (this.multiple) {
      let currentValues = oldValue ? oldValue.split(',') : [];
      if (currentValues.includes(item.value)) {
        currentValues = currentValues.filter(v => v !== item.value);
      } else {
        currentValues.push(item.value);
      }
      newValue = currentValues.join(',');
    }

    this.value = newValue;

    if (oldValue !== this.value) {
      const detail = { value: this.value };
      this.dispatchEvent(new CustomEvent('sn-listbox-change', { bubbles: true, composed: true, detail }));
      this.dispatchEvent(new CustomEvent('change', { bubbles: true, composed: true, detail }));
    }
  }

  #syncSelectedStates() {
    if (!this.#collection) return;
    const items = this.#collection.getItems();
    const selectedValues = this.multiple ? this.value.split(',') : [this.value];

    items.forEach(item => {
      const isSelected = selectedValues.includes(item.value);
      item.element.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      item.element.toggleAttribute('data-selected', isSelected);
    });
  }
}

Listbox.template = template;
Listbox.rootStyles = css;
Listbox.reg('sn-listbox');

export default Listbox;
