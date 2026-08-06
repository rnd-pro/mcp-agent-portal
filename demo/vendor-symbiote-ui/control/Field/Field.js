import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import template from './Field.tpl.js';
import css from './Field.css.js';

export class FormField extends Symbiote {
  static observedAttributes = ['disabled', 'required', 'readonly', 'invalid'];

  #observer = null;

  constructor() {
    super();

    const slotNames = new Map();
    this.templateProcessors.add((fr, fnCtx) => {
      fnCtx.initChildren?.forEach(child => {
        if (child instanceof Element && child.hasAttribute('slot')) {
          slotNames.set(child, child.getAttribute('slot'));
        }
      });
    });

    this.templateProcessors.add(slotProcessor);

    this.templateProcessors.add((fr, fnCtx) => {
      for (const [el, slotName] of slotNames.entries()) {
        el.setAttribute('slot', slotName);
        if (slotName === 'label') fnCtx._labelEl = el;
        else if (slotName === 'hint') fnCtx._hintEl = el;
        else if (slotName === 'error') fnCtx._errorEl = el;
      }
    });
  }

  connectedCallback() {
    super.connectedCallback?.();
    this._syncControlState();

    this.#observer = new MutationObserver(() => {
      this._syncControlState();
    });
    this.#observer.observe(this, { childList: true });
  }

  disconnectedCallback() {
    if (this.#observer) {
      this.#observer.disconnect();
      this.#observer = null;
    }
    super.disconnectedCallback?.();
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(value) {
    this.toggleAttribute('disabled', Boolean(value));
  }

  get required() {
    return this.hasAttribute('required');
  }

  set required(value) {
    this.toggleAttribute('required', Boolean(value));
  }

  get readonly() {
    return this.hasAttribute('readonly');
  }

  set readonly(value) {
    this.toggleAttribute('readonly', Boolean(value));
  }

  get invalid() {
    return this.hasAttribute('invalid');
  }

  set invalid(value) {
    this.toggleAttribute('invalid', Boolean(value));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this._syncControlState();
  }

  _syncControlState() {
    if (this.#observer) {
      this.#observer.disconnect();
    }
    try {
      const control = this.querySelector('input, select, textarea');
      if (!control) return;

      const disabled = this.hasAttribute('disabled');
      if (disabled) {
        control.setAttribute('disabled', '');
      } else {
        control.removeAttribute('disabled');
      }

      const required = this.hasAttribute('required');
      if (required) {
        control.setAttribute('required', '');
      } else {
        control.removeAttribute('required');
      }

      const readonly = this.hasAttribute('readonly');
      if (readonly) {
        control.setAttribute('readonly', '');
      } else {
        control.removeAttribute('readonly');
      }

      const invalid = this.hasAttribute('invalid');
      if (invalid) {
        control.setAttribute('aria-invalid', 'true');
      } else {
        control.removeAttribute('aria-invalid');
      }

      const uid = this.uid || Math.random().toString(36).slice(2, 9);
      if (!control.id) {
        control.id = `sn-control-${uid}`;
      }

      const label = this._labelEl || this.querySelector('[slot="label"]') || this.querySelector('label');
      if (label) {
        if (!this._labelEl) this._labelEl = label;
        if (!label.id) {
          label.id = `sn-label-${uid}`;
        }
        if (label.tagName === 'LABEL') {
          label.setAttribute('for', control.id);
        } else {
          control.setAttribute('aria-labelledby', label.id);
        }
      }

      const hint = this._hintEl || this.querySelector('[slot="hint"]');
      if (hint && !this._hintEl) this._hintEl = hint;

      const error = this._errorEl || this.querySelector('[slot="error"]');
      if (error && !this._errorEl) this._errorEl = error;
      if (error && !error.hasAttribute('role')) {
        error.setAttribute('role', 'alert');
      }

      const describedBy = [];

      if (hint) {
        if (!hint.id) hint.id = `sn-hint-${uid}`;
        describedBy.push(hint.id);
      }
      if (error && invalid) {
        if (!error.id) error.id = `sn-error-${uid}`;
        describedBy.push(error.id);
      }

      if (describedBy.length > 0) {
        control.setAttribute('aria-describedby', describedBy.join(' '));
      } else {
        control.removeAttribute('aria-describedby');
      }
    } finally {
      if (this.#observer) {
        this.#observer.observe(this, { childList: true });
      }
    }
  }
}

FormField.template = template;
FormField.rootStyles = css;
FormField.reg('sn-field');

export default FormField;
