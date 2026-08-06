import Symbiote from '@symbiotejs/symbiote';
import { UID } from '@symbiotejs/symbiote/utils';
import template from './Mentions.tpl.js';
import css from './Mentions.css.js';

class Mentions extends Symbiote {
  static observedAttributes = ['trigger-char'];

  #options = [];
  #isOpen = false;
  #focusedIndex = -1;
  #triggerIndex = -1;
  #activeQuery = '';
  #instanceId = UID.generate('sn-mentions-XXXXXXXX');

  #onInput = (event) => {
    const input = this.#getInputElement();
    if (!input) return;

    const value = input.value;
    const selectionStart = input.selectionStart;
    const triggerChar = this.triggerChar;

    // Search backwards from the cursor to find the last trigger char
    const lastTrigger = value.lastIndexOf(triggerChar, selectionStart - 1);

    if (lastTrigger !== -1 && (lastTrigger === 0 || /\s/.test(value[lastTrigger - 1]))) {
      const query = value.slice(lastTrigger + 1, selectionStart);
      if (!/\s/.test(query)) {
        this.#isOpen = true;
        this.#triggerIndex = lastTrigger;
        this.#activeQuery = query;
        this.#renderDropdown();
        this.#positionDropdown(input);
        return;
      }
    }

    this.close();
  };

  #onKeyDown = (event) => {
    if (!this.#isOpen) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.#focusOption(this.#focusedIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.#focusOption(this.#focusedIndex - 1);
        break;
      case 'Enter':
        event.preventDefault();
        this.#selectFocused();
        break;
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
    }
  };

  #onOutsideClick = (event) => {
    if (this.#isOpen && !this.contains(event.target)) {
      this.close();
    }
  };

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback?.();
    const input = this.#getInputElement();
    if (input) {
      input.addEventListener('input', this.#onInput);
      input.addEventListener('keydown', this.#onKeyDown);
    }
    document.addEventListener('click', this.#onOutsideClick);

    this.#setupAria();
    this.#parseChildren();
  }

  #setupAria() {
    const listboxId = `${this.#instanceId}-listbox`;
    if (this.ref.optionsList) this.ref.optionsList.id = listboxId;

    const input = this.#getInputElement();
    if (input) {
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-haspopup', 'listbox');
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-expanded', 'false');
      input.setAttribute('aria-controls', listboxId);
    }
  }

  disconnectedCallback() {
    const input = this.#getInputElement();
    if (input) {
      input.removeEventListener('input', this.#onInput);
      input.removeEventListener('keydown', this.#onKeyDown);
    }
    document.removeEventListener('click', this.#onOutsideClick);
    super.disconnectedCallback?.();
  }

  get triggerChar() {
    return this.getAttribute('trigger-char') || '@';
  }

  set triggerChar(val) {
    this.setAttribute('trigger-char', String(val));
  }

  setOptions(options) {
    this.#options = options.map(opt => ({
      value: typeof opt === 'string' ? opt : opt.value,
      label: typeof opt === 'string' ? opt : opt.label,
    }));
  }

  close() {
    this.#isOpen = false;
    this.ref.dropdown?.removeAttribute('data-visible');
    this.#focusedIndex = -1;

    const input = this.#getInputElement();
    if (input) {
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
  }

  #getInputElement() {
    return this.querySelector('textarea, input');
  }

  #parseChildren() {
    const optionElements = Array.from(this.querySelectorAll('option'));
    if (optionElements.length > 0) {
      this.#options = optionElements.map(opt => ({
        value: opt.value || opt.textContent.trim(),
        label: opt.textContent.trim(),
      }));
    }
  }

  #getFilteredOptions() {
    const query = this.#activeQuery.toLowerCase();
    return this.#options.filter(opt =>
      opt.label.toLowerCase().includes(query) || opt.value.toLowerCase().includes(query)
    );
  }

  #renderDropdown() {
    const list = this.ref.optionsList;
    if (!list) return;

    list.innerHTML = '';
    const filtered = this.#getFilteredOptions();

    if (filtered.length === 0) {
      this.close();
      return;
    }

    filtered.forEach((opt, index) => {
      const li = document.createElement('li');
      li.className = 'sn-mentions-option';
      li.setAttribute('role', 'option');
      li.id = `${this.#instanceId}-opt-${index}`;
      li.setAttribute('aria-selected', 'false');
      li.textContent = opt.label;
      li.setAttribute('data-value', opt.value);
      li.addEventListener('click', (event) => {
        event.stopPropagation();
        this.#selectOption(opt);
      });
      list.appendChild(li);
    });

    this.ref.dropdown?.setAttribute('data-visible', '');
    this.#getInputElement()?.setAttribute('aria-expanded', 'true');
    this.#focusOption(0);
  }

  #focusOption(index) {
    const list = this.ref.optionsList;
    if (!list) return;

    const items = Array.from(list.children);
    if (items.length === 0) return;

    if (index < 0) index = items.length - 1;
    if (index >= items.length) index = 0;

    this.#focusedIndex = index;
    items.forEach((item, idx) => {
      if (idx === index) {
        item.setAttribute('data-focused', '');
        item.setAttribute('aria-selected', 'true');
        item.scrollIntoView?.({ block: 'nearest' });
        this.#getInputElement()?.setAttribute('aria-activedescendant', item.id);
      } else {
        item.removeAttribute('data-focused');
        item.setAttribute('aria-selected', 'false');
      }
    });
  }

  #selectFocused() {
    const filtered = this.#getFilteredOptions();
    const opt = filtered[this.#focusedIndex];
    if (opt) {
      this.#selectOption(opt);
    }
  }

  #selectOption(opt) {
    const input = this.#getInputElement();
    if (!input) return;

    const value = input.value;
    const prefix = value.slice(0, this.#triggerIndex);
    const suffix = value.slice(input.selectionStart);
    const trigger = this.triggerChar;

    const replacement = `${trigger}${opt.value} `;
    input.value = `${prefix}${replacement}${suffix}`;

    // Move focus back and place cursor after the completed mention
    input.focus();
    const newCursorPos = this.#triggerIndex + replacement.length;
    input.setSelectionRange(newCursorPos, newCursorPos);

    this.close();

    this.dispatchEvent(new CustomEvent('sn-mention-select', {
      bubbles: true,
      composed: true,
      detail: opt
    }));

    // Trigger standard input event to update model
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  #positionDropdown(input) {
    const dropdown = this.ref.dropdown;
    if (!dropdown || !input) return;

    // Simple default positioning below the input element
    const rect = input.getBoundingClientRect();
    const wrapperRect = this.getBoundingClientRect();

    dropdown.style.left = `${rect.left - wrapperRect.left}px`;
    dropdown.style.top = `${rect.bottom - wrapperRect.top}px`;
    dropdown.style.width = `${rect.width}px`;
  }
}

Mentions.template = template;
Mentions.rootStyles = css;
Mentions.reg('sn-mentions');

export default Mentions;
