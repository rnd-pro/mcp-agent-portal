import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import template from './SelectionControl.tpl.js';
import css from './SelectionControl.css.js';

const BASE_ATTRIBUTES = [
  'checked',
  'disabled',
  'required',
  'readonly',
  'invalid',
  'indeterminate',
  'name',
  'value',
];

function asBoolean(value) {
  return value === '' || value === true || value === 'true' || value === 'checked';
}

export class SelectionControl extends Symbiote {
  static observedAttributes = BASE_ATTRIBUTES;

  #type;
  #observer = null;

  #onClick = (event) => {
    if (this.disabled || this.readonly) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this._syncInput();
    }
  };

  #onKeyDown = (event) => {
    if (!this.readonly || (event.key !== ' ' && event.key !== 'Enter')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  #onChange = (event) => {
    let input = this._input;
    if (!input) return;

    if (this.disabled || this.readonly) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this._syncInput();
      return;
    }

    this.checked = input.checked;
    if (this.#type === 'checkbox' && this.indeterminate) {
      this.indeterminate = false;
    }
    this._emitChange();
  };

  constructor(type = 'checkbox') {
    super();
    this.#type = type;

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
        if (slotName === 'hint') fnCtx._hintEl = el;
        else if (slotName === 'error') fnCtx._errorEl = el;
      }
    });
  }

  connectedCallback() {
    super.connectedCallback?.();
    this._syncInput();
    this._input?.addEventListener('click', this.#onClick, { capture: true });
    this._input?.addEventListener('keydown', this.#onKeyDown);
    this._input?.addEventListener('change', this.#onChange);
    this.#observer = new MutationObserver(() => this._syncDescriptions());
    this.#observer.observe(this, { childList: true });
  }

  disconnectedCallback() {
    this._input?.removeEventListener('click', this.#onClick, { capture: true });
    this._input?.removeEventListener('keydown', this.#onKeyDown);
    this._input?.removeEventListener('change', this.#onChange);
    this.#observer?.disconnect();
    this.#observer = null;
    super.disconnectedCallback?.();
  }

  get _input() {
    return this.ref?.input || this.querySelector('input.sn-selection-input');
  }

  get controlType() {
    return this.#type;
  }

  get checked() {
    return this.hasAttribute('checked');
  }

  set checked(value) {
    this.toggleAttribute('checked', Boolean(value));
    this._syncInput();
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(value) {
    this.toggleAttribute('disabled', Boolean(value));
    this._syncInput();
  }

  get required() {
    return this.hasAttribute('required');
  }

  set required(value) {
    this.toggleAttribute('required', Boolean(value));
    this._syncInput();
  }

  get readonly() {
    return this.hasAttribute('readonly');
  }

  set readonly(value) {
    this.toggleAttribute('readonly', Boolean(value));
    this._syncInput();
  }

  get invalid() {
    return this.hasAttribute('invalid');
  }

  set invalid(value) {
    this.toggleAttribute('invalid', Boolean(value));
    this._syncInput();
  }

  get indeterminate() {
    return this.#type === 'checkbox' && this.hasAttribute('indeterminate');
  }

  set indeterminate(value) {
    this.toggleAttribute('indeterminate', this.#type === 'checkbox' && Boolean(value));
    this._syncInput();
  }

  get name() {
    return this.getAttribute('name') || '';
  }

  set name(value) {
    if (value == null || value === '') {
      this.removeAttribute('name');
    } else {
      this.setAttribute('name', String(value));
    }
  }

  get value() {
    return this.getAttribute('value') || 'on';
  }

  set value(value) {
    if (value == null) {
      this.removeAttribute('value');
    } else {
      this.setAttribute('value', String(value));
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'checked' && newValue != null && !asBoolean(newValue)) {
      this.removeAttribute('checked');
      return;
    }
    this._syncInput();
  }

  focusControl(options) {
    this._input?.focus?.(options);
  }

  _syncInput() {
    let input = this._input;
    if (!input) return;

    input.type = this.#type === 'radio' ? 'radio' : 'checkbox';
    input.checked = this.checked;
    input.disabled = this.disabled;
    input.required = this.required;
    input.toggleAttribute('checked', this.checked);
    input.toggleAttribute('disabled', this.disabled);
    input.toggleAttribute('required', this.required);
    input.name = this.name;
    input.value = this.value;
    if (this.name) {
      input.setAttribute('name', this.name);
    } else {
      input.removeAttribute('name');
    }
    input.setAttribute('value', this.value);

    if (this.#type === 'switch') {
      input.setAttribute('role', 'switch');
      input.setAttribute('aria-checked', this.checked ? 'true' : 'false');
    } else {
      input.removeAttribute('role');
      input.removeAttribute('aria-checked');
    }

    if (this.#type === 'checkbox') {
      input.indeterminate = this.indeterminate;
    } else {
      input.indeterminate = false;
      this.removeAttribute('indeterminate');
    }

    if (this.invalid) {
      input.setAttribute('aria-invalid', 'true');
    } else {
      input.removeAttribute('aria-invalid');
    }

    if (this.readonly) {
      input.setAttribute('aria-readonly', 'true');
    } else {
      input.removeAttribute('aria-readonly');
    }

    this._syncDescriptions();
  }

  _syncDescriptions() {
    let input = this._input;
    if (!input) return;

    let uid = this.uid || Math.random().toString(36).slice(2, 9);
    if (!input.id) input.id = `${this.localName}-control-${uid}`;

    let describedBy = [];
    let hint = this._hintEl || this.querySelector('[slot="hint"]');
    let error = this._errorEl || this.querySelector('[slot="error"]');

    if (hint && !this._hintEl) this._hintEl = hint;
    if (error && !this._errorEl) this._errorEl = error;

    if (hint) {
      if (!hint.id) hint.id = `${this.localName}-hint-${uid}`;
      describedBy.push(hint.id);
    }

    if (error && this.invalid) {
      if (!error.id) error.id = `${this.localName}-error-${uid}`;
      describedBy.push(error.id);
    }

    if (describedBy.length) {
      input.setAttribute('aria-describedby', describedBy.join(' '));
    } else {
      input.removeAttribute('aria-describedby');
    }
  }

  _emitChange() {
    let detail = {
      control: this.#type,
      checked: this.checked,
      value: this.value,
      name: this.name,
      indeterminate: this.indeterminate,
    };
    this.dispatchEvent(new CustomEvent('sn-control-change', {
      bubbles: true,
      composed: true,
      detail,
    }));
    this.dispatchEvent(new CustomEvent(`${this.localName}-change`, {
      bubbles: true,
      composed: true,
      detail,
    }));
  }
}

export class CheckboxControl extends SelectionControl {
  constructor() {
    super('checkbox');
  }
}

export class RadioControl extends SelectionControl {
  constructor() {
    super('radio');
  }
}

export class SwitchControl extends SelectionControl {
  constructor() {
    super('switch');
  }
}

CheckboxControl.template = template;
CheckboxControl.rootStyles = css;
CheckboxControl.reg('sn-checkbox');

RadioControl.template = template;
RadioControl.rootStyles = css;
RadioControl.reg('sn-radio');

SwitchControl.template = template;
SwitchControl.rootStyles = css;
SwitchControl.reg('sn-switch');

export default SelectionControl;
