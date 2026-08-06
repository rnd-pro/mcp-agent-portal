import Symbiote from '@symbiotejs/symbiote';
import { UID } from '@symbiotejs/symbiote/utils';
import template from './Combobox.tpl.js';
import css from './Combobox.css.js';
import { registerDismissableLayer } from '../../ui/dismissable-layer.js';
import { positionOverlay } from '../../ui/overlay-positioner.js';
import { mountOverlayToDocument, restoreOverlayHome } from '../../ui/overlay-stack.js';

export class Combobox extends Symbiote {
  static observedAttributes = ['value', 'placeholder', 'disabled', 'name'];

  #options = [];
  #filteredOptions = [];
  #observer = null;
  #isOpen = false;
  #focusedIndex = -1;
  #cleanupDismissable = null;
  #syncingValue = false;
  #instanceId = UID.generate('sn-combobox-XXXXXXXX');

  #onInput = (event) => {
    const query = this.ref.input.value.toLowerCase().trim();
    this.#filterOptions(query);
    if (!this.#isOpen) {
      this.open();
    } else {
      this.#repositionDropdown();
    }
  };

  #onKeyDown = (event) => {
    if (this.disabled) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.#isOpen) {
          this.open();
        } else {
          this.#focusOption(this.#focusedIndex + 1, 1);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.#isOpen) {
          this.open();
        } else {
          this.#focusOption(this.#focusedIndex - 1, -1);
        }
        break;
      case 'Enter':
        if (this.#isOpen) {
          event.preventDefault();
          this.#selectFocused();
        }
        break;
      case 'Escape':
        if (this.#isOpen) {
          event.preventDefault();
          this.close();
        }
        break;
      case 'Tab':
        this.close();
        break;
    }
  };

  #onTriggerClick = (event) => {
    if (this.disabled) return;
    this.ref.input.focus();
    this.#isOpen ? this.close() : this.open();
  };

  #onInputFocus = () => {
    if (!this.#isOpen && !this.disabled) this.open();
  };

  #onReposition = () => {
    this.#repositionDropdown();
  };

  constructor() {
    super();
    this.init$ = {
      placeholder: 'Search...',
    };
  }

  connectedCallback() {
    super.connectedCallback?.();

    this.ref.input?.addEventListener('input', this.#onInput);
    this.ref.input?.addEventListener('keydown', this.#onKeyDown);
    this.ref.input?.addEventListener('focus', this.#onInputFocus);
    this.ref.trigger?.addEventListener('click', this.#onTriggerClick);

    this.#observer = new MutationObserver(() => {
      if (!this.#observer) return;
      this.#observer.disconnect();
      this.#syncOptions();
      if (this.#observer) {
        this.#observer.observe(this, { childList: true, characterData: true, subtree: true });
      }
    });
    this.#observer.observe(this, { childList: true, characterData: true, subtree: true });

    this.#setupAria();
    this.#syncOptions();
    this.#syncDisabledState();
    this.#syncNativeInput();
  }

  #setupAria() {
    const listboxId = `${this.#instanceId}-listbox`;
    if (this.ref.dropdown) this.ref.dropdown.id = listboxId;
    if (this.ref.input) {
      this.ref.input.setAttribute('aria-controls', listboxId);
      if (!this.hasAttribute('aria-label') && !this.hasAttribute('aria-labelledby') &&
          !this.ref.input.hasAttribute('aria-label') && !this.ref.input.hasAttribute('aria-labelledby')) {
        this.ref.input.setAttribute('aria-label', 'Search and select an option');
      }
    }
  }

  disconnectedCallback() {
    this.close();
    this.ref.input?.removeEventListener('input', this.#onInput);
    this.ref.input?.removeEventListener('keydown', this.#onKeyDown);
    this.ref.input?.removeEventListener('focus', this.#onInputFocus);
    this.ref.trigger?.removeEventListener('click', this.#onTriggerClick);
    this.#observer?.disconnect();
    this.#observer = null;
    super.disconnectedCallback?.();
  }

  get value() {
    return this.getAttribute('value') || '';
  }

  set value(val) {
    this.setAttribute('value', String(val));
  }

  get placeholder() {
    return this.getAttribute('placeholder') || 'Search...';
  }

  set placeholder(val) {
    this.setAttribute('placeholder', String(val));
    this.$.placeholder = val;
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    this.toggleAttribute('disabled', Boolean(val));
  }

  get name() {
    return this.getAttribute('name') || '';
  }

  set name(val) {
    if (val == null) {
      this.removeAttribute('name');
    } else {
      this.setAttribute('name', String(val));
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'value') {
      if (!this.#syncingValue) {
        this.#syncActiveSelection();
      }
      this.#syncNativeInput();
    } else if (name === 'placeholder') {
      this.$.placeholder = newValue || 'Search...';
    } else if (name === 'disabled') {
      this.#syncDisabledState();
      this.#syncNativeInput();
      if (newValue != null) this.close();
    } else if (name === 'name') {
      this.#syncNativeInput();
    }
  }

  open() {
    if (this.disabled || this.#isOpen || !this.ref.dropdown) return;
    this.#isOpen = true;
    this.ref.input?.setAttribute('aria-expanded', 'true');

    mountOverlayToDocument(this.ref.dropdown, this);
    this.ref.dropdown.setAttribute('data-visible', '');

    this.#filterOptions(this.ref.input.value.trim());
    this.#repositionDropdown();

    window.addEventListener('resize', this.#onReposition);
    window.addEventListener('scroll', this.#onReposition, { capture: true });

    this.#cleanupDismissable = registerDismissableLayer({
      element: this.ref.dropdown,
      onDismiss: () => this.close(),
      interactOutsideExclude: [this.ref.wrapper, this.ref.dropdown],
    });

    this.dispatchEvent(new CustomEvent('sn-combobox-open', { bubbles: true, composed: true }));
  }

  close() {
    if (!this.#isOpen || !this.ref.dropdown) return;
    this.#isOpen = false;
    this.ref.input?.setAttribute('aria-expanded', 'false');

    this.ref.dropdown.removeAttribute('data-visible');
    restoreOverlayHome(this.ref.dropdown);

    window.removeEventListener('resize', this.#onReposition);
    window.removeEventListener('scroll', this.#onReposition, { capture: true });

    if (this.#cleanupDismissable) {
      this.#cleanupDismissable();
      this.#cleanupDismissable = null;
    }

    // Reset input value to selected option if not matched
    this.#syncActiveSelection();

    this.dispatchEvent(new CustomEvent('sn-combobox-close', { bubbles: true, composed: true }));
  }

  #syncOptions() {
    const options = Array.from(this.querySelectorAll('option'));
    this.#options = options.map(opt => ({
      value: opt.value || opt.textContent.trim(),
      label: opt.textContent.trim(),
      disabled: opt.disabled || opt.hasAttribute('disabled'),
    }));
    this.#syncActiveSelection();
  }

  #filterOptions(query) {
    const lowerQuery = query.toLowerCase();
    this.#filteredOptions = this.#options.filter(opt =>
      opt.label.toLowerCase().includes(lowerQuery)
    );

    const container = this.ref.optionsContainer;
    if (container) {
      container.innerHTML = '';
      this.#filteredOptions.forEach((opt, index) => {
        const li = document.createElement('li');
        li.className = 'sn-combobox-option';
        li.role = 'option';
        li.id = `${this.#instanceId}-opt-${index}`;
        li.textContent = opt.label;
        li.setAttribute('data-value', opt.value);
        if (opt.disabled) {
          li.setAttribute('aria-disabled', 'true');
          li.setAttribute('data-disabled', '');
        }
        if (opt.value === this.value) {
          li.setAttribute('aria-selected', 'true');
        }
        li.addEventListener('click', (event) => {
          event.stopPropagation();
          this.#selectOption(opt);
        });
        container.appendChild(li);
      });
    }

    const hasMatches = this.#filteredOptions.length > 0;
    this.ref.empty?.toggleAttribute('data-visible', !hasMatches);

    // Reset focus
    this.#focusOption(hasMatches ? 0 : -1, 1);
  }

  #repositionDropdown() {
    if (this.ref.wrapper && this.ref.dropdown) {
      positionOverlay(this.ref.wrapper, this.ref.dropdown, 'bottom-start', {
        offset: 4,
      });
      // Match width
      this.ref.dropdown.style.width = `${this.ref.wrapper.getBoundingClientRect().width}px`;
    }
  }

  #focusOption(index, step = 1) {
    if (this.#filteredOptions.length === 0) {
      this.#focusedIndex = -1;
      this.ref.input?.removeAttribute('aria-activedescendant');
      return;
    }

    let nextIndex = index;
    for (let attempts = 0; attempts < this.#filteredOptions.length; attempts += 1) {
      if (nextIndex < 0) nextIndex = this.#filteredOptions.length - 1;
      if (nextIndex >= this.#filteredOptions.length) nextIndex = 0;
      if (!this.#filteredOptions[nextIndex].disabled) break;
      nextIndex += step;
    }

    if (this.#filteredOptions[nextIndex]?.disabled) {
      this.#focusedIndex = -1;
      this.ref.input?.removeAttribute('aria-activedescendant');
      return;
    }

    this.#focusedIndex = nextIndex;
    const items = this.ref.optionsContainer?.children || [];

    Array.from(items).forEach((item, idx) => {
      if (idx === nextIndex) {
        item.setAttribute('data-focused', '');
        this.ref.input?.setAttribute('aria-activedescendant', item.id);
        item.scrollIntoView?.({ block: 'nearest' });
      } else {
        item.removeAttribute('data-focused');
      }
    });
  }

  #selectFocused() {
    if (this.#focusedIndex >= 0 && this.#focusedIndex < this.#filteredOptions.length) {
      this.#selectOption(this.#filteredOptions[this.#focusedIndex]);
    }
  }

  #selectOption(opt) {
    if (opt.disabled) return;
    const oldValue = this.value;

    this.#syncingValue = true;
    this.value = opt.value;
    this.#syncingValue = false;
    this.#syncNativeInput();

    this.ref.input.value = opt.label;
    this.close();

    if (oldValue !== opt.value) {
      const detail = { value: opt.value, label: opt.label };
      this.dispatchEvent(new CustomEvent('sn-combobox-change', { bubbles: true, composed: true, detail }));
      this.dispatchEvent(new CustomEvent('change', { bubbles: true, composed: true, detail }));
    }
  }

  #syncActiveSelection() {
    const selected = this.#options.find(opt => opt.value === this.value);
    if (this.ref?.input) {
      this.ref.input.value = selected ? selected.label : '';
    }
    this.#syncNativeInput();
  }

  #syncNativeInput() {
    const nativeInput = this.ref?.nativeInput;
    if (!nativeInput) return;

    nativeInput.value = this.value;
    if (this.name) {
      nativeInput.setAttribute('name', this.name);
    } else {
      nativeInput.removeAttribute('name');
    }
    nativeInput.toggleAttribute('disabled', this.disabled);
  }

  #syncDisabledState() {
    this.ref?.input?.toggleAttribute('disabled', this.disabled);
    this.ref?.trigger?.toggleAttribute('disabled', this.disabled);
  }
}

Combobox.template = template;
Combobox.rootStyles = css;
Combobox.reg('sn-combobox');

export default Combobox;
