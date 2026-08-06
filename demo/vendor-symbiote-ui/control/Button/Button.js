import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import template from './Button.tpl.js';
import css from './Button.css.js';

export class ActionButton extends Symbiote {
  static observedAttributes = ['disabled', 'loading', 'size', 'block', 'pressed', 'selected', 'variant'];

  #disabled = false;
  #loading = false;
  #block = false;
  #selected = false;

  #onClick = (event) => {
    if (this.disabled || this.loading) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
  };

  #onKeyDown = (event) => {
    if (this.disabled || this.loading) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.click();
  };

  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
  }

  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('role')) this.setAttribute('role', 'button');
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;

    this.#disabled = this.hasAttribute('disabled');
    this.#loading = this.hasAttribute('loading');
    this.#block = this.hasAttribute('block');
    this.#selected = this.hasAttribute('selected');

    this._syncDisabled(this.#disabled);
    this._syncLoading(this.#loading);
    this.addEventListener('click', this.#onClick, { capture: true });
    this.addEventListener('keydown', this.#onKeyDown);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#onClick, { capture: true });
    this.removeEventListener('keydown', this.#onKeyDown);
    super.disconnectedCallback?.();
  }

  get disabled() {
    return this.#disabled;
  }

  set disabled(value) {
    this.#disabled = Boolean(value);
    this.toggleAttribute('disabled', this.#disabled);
    this._syncDisabled(this.#disabled);
  }

  get loading() {
    return this.#loading;
  }

  set loading(value) {
    this.#loading = Boolean(value);
    this.toggleAttribute('loading', this.#loading);
    this._syncLoading(this.#loading);
  }

  get size() {
    return this.getAttribute('size') || '';
  }

  set size(value) {
    if (value) {
      this.setAttribute('size', String(value));
    } else {
      this.removeAttribute('size');
    }
  }

  get variant() {
    return this.getAttribute('variant') || '';
  }

  set variant(value) {
    if (value) {
      this.setAttribute('variant', String(value));
    } else {
      this.removeAttribute('variant');
    }
  }

  get block() {
    return this.#block;
  }

  set block(value) {
    this.#block = Boolean(value);
    this.toggleAttribute('block', this.#block);
  }

  get pressed() {
    return this.getAttribute('pressed') || '';
  }

  set pressed(value) {
    if (value === true || value === 'true') {
      this.setAttribute('pressed', 'true');
      this.setAttribute('aria-pressed', 'true');
    } else if (value === false || value === 'false') {
      this.setAttribute('pressed', 'false');
      this.setAttribute('aria-pressed', 'false');
    } else if (value) {
      this.setAttribute('pressed', String(value));
      this.setAttribute('aria-pressed', String(value));
    } else {
      this.removeAttribute('pressed');
      this.removeAttribute('aria-pressed');
    }
  }

  get selected() {
    return this.#selected;
  }

  set selected(value) {
    this.#selected = Boolean(value);
    this.toggleAttribute('selected', this.#selected);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    switch (name) {
      case 'disabled':
        this.#disabled = newValue !== null;
        this._syncDisabled(this.#disabled, { reflect: false });
        break;
      case 'loading':
        this.#loading = newValue !== null;
        this._syncLoading(this.#loading);
        break;
      case 'block':
        this.#block = newValue !== null;
        break;
      case 'selected':
        this.#selected = newValue !== null;
        break;
      case 'pressed':
        if (newValue === null) {
          this.removeAttribute('aria-pressed');
        } else if (newValue === 'false') {
          this.setAttribute('aria-pressed', 'false');
        } else {
          this.setAttribute('aria-pressed', 'true');
        }
        break;
      default:
        super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  _syncDisabled(value, options = {}) {
    let disabled = Boolean(value);
    if (options.reflect !== false) {
      this.toggleAttribute('disabled', disabled);
    }
    this.setAttribute('aria-disabled', (disabled || this.#loading) ? 'true' : 'false');
    const tabIdx = (disabled || this.#loading) ? -1 : 0;
    this.setAttribute('tabindex', String(tabIdx));
    this.tabIndex = tabIdx;
  }

  _syncLoading(value) {
    let loading = Boolean(value);
    this.setAttribute('aria-busy', loading ? 'true' : 'false');
    this.setAttribute('aria-disabled', (this.#disabled || loading) ? 'true' : 'false');
    const tabIdx = (this.#disabled || loading) ? -1 : 0;
    this.setAttribute('tabindex', String(tabIdx));
    this.tabIndex = tabIdx;
    let spinner = this.querySelector('.sn-button-spinner');
    if (spinner) spinner.hidden = !loading;
  }
}

ActionButton.template = template;
ActionButton.rootStyles = css;
ActionButton.reg('sn-button');

export default ActionButton;
