import Symbiote from '@symbiotejs/symbiote';
import template from './PinInput.tpl.js';
import css from './PinInput.css.js';

class PinInput extends Symbiote {
  static observedAttributes = ['disabled', 'value', 'length', 'mask'];

  #cells = [];
  #isMasked = false;

  #onToggleMask = () => {
    this.#isMasked = !this.#isMasked;
    this.#updateMaskState();
  };

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.ref.maskToggle?.addEventListener('click', this.#onToggleMask);
    this.#isMasked = this.hasAttribute('mask');
    this.#rebuildCells();
  }

  disconnectedCallback() {
    this.ref.maskToggle?.removeEventListener('click', this.#onToggleMask);
    this.#destroyCells();
    super.disconnectedCallback?.();
  }

  get length() {
    return Number(this.getAttribute('length')) || 4;
  }

  set length(val) {
    this.setAttribute('length', String(val));
  }

  get value() {
    return this.#cells.map(c => c.value).join('');
  }

  set value(val) {
    this.setAttribute('value', String(val || ''));
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    this.toggleAttribute('disabled', Boolean(val));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'length') {
      this.#rebuildCells();
    } else if (name === 'value') {
      this.#syncValue();
    } else if (name === 'disabled') {
      this.#syncDisabled();
    } else if (name === 'mask') {
      this.#isMasked = newValue != null;
      this.#updateMaskState();
    }
  }

  #rebuildCells() {
    this.#destroyCells();
    const container = this.ref.cellsContainer;
    if (!container) return;

    container.innerHTML = '';
    this.#cells = [];

    const len = this.length;
    for (let i = 0; i < len; i++) {
      const input = document.createElement('input');
      input.type = this.#isMasked ? 'password' : 'text';
      input.className = 'sn-pin-cell';
      input.maxLength = 1;
      input.pattern = '[0-9]*';
      input.inputMode = 'numeric';
      input.disabled = this.disabled;
      input.setAttribute('aria-label', `Digit ${i + 1} of ${len}`);

      input.addEventListener('input', (e) => this.#handleInput(e, i));
      input.addEventListener('keydown', (e) => this.#handleKeyDown(e, i));
      input.addEventListener('paste', (e) => this.#handlePaste(e, i));

      container.appendChild(input);
      this.#cells.push(input);
    }

    this.#syncValue();
    this.#updateMaskState();
  }

  #destroyCells() {
    this.#cells = [];
  }

  #syncValue() {
    const val = String(this.getAttribute('value') || '');
    this.#cells.forEach((cell, idx) => {
      cell.value = val[idx] || '';
    });
  }

  #syncDisabled() {
    this.#cells.forEach(cell => {
      cell.disabled = this.disabled;
    });
  }

  #updateMaskState() {
    this.#cells.forEach(cell => {
      cell.type = this.#isMasked ? 'password' : 'text';
    });
    if (this.ref.toggleIcon) {
      this.ref.toggleIcon.textContent = this.#isMasked ? 'visibility' : 'visibility_off';
    }
    this.ref.maskToggle?.setAttribute('aria-pressed', String(this.#isMasked));
  }

  #handleInput(event, index) {
    const cell = this.#cells[index];
    const val = cell.value;

    if (val && index < this.#cells.length - 1) {
      this.#cells[index + 1].focus();
    }

    this.#emitChange();
  }

  #handleKeyDown(event, index) {
    if (event.key === 'Backspace' && !this.#cells[index].value && index > 0) {
      this.#cells[index - 1].focus();
    }
  }

  #handlePaste(event, index) {
    event.preventDefault();
    const data = (event.clipboardData || window.clipboardData).getData('text');
    if (!data) return;

    let targetIndex = index;
    for (let i = 0; i < data.length && targetIndex < this.#cells.length; i++) {
      const char = data[i];
      if (/[0-9]/.test(char)) {
        this.#cells[targetIndex].value = char;
        targetIndex++;
      }
    }

    if (targetIndex < this.#cells.length) {
      this.#cells[targetIndex].focus();
    } else {
      this.#cells[this.#cells.length - 1].focus();
    }

    this.#emitChange();
  }

  #emitChange() {
    const val = this.value;
    const detail = { value: val };
    this.dispatchEvent(new CustomEvent('sn-control-change', { bubbles: true, composed: true, detail }));
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, composed: true, detail }));

    if (val.length === this.length) {
      this.dispatchEvent(new CustomEvent('sn-pin-complete', { bubbles: true, composed: true, detail }));
    }
  }
}

PinInput.template = template;
PinInput.rootStyles = css;
PinInput.reg('sn-pin-input');

export default PinInput;
