import Symbiote from '@symbiotejs/symbiote';
import template from './Slider.tpl.js';
import css from './Slider.css.js';

const SLIDER_ATTRIBUTES = [
  'value',
  'min',
  'max',
  'step',
  'disabled',
  'readonly',
  'name',
  'aria-label',
  'aria-labelledby',
  'aria-valuetext',
];

export class SliderControl extends Symbiote {
  static observedAttributes = SLIDER_ATTRIBUTES;

  #onInput = (event) => {
    let input = this._input;
    if (!input) return;

    if (this.disabled || this.readonly) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this._syncInput();
      return;
    }

    this.value = input.value;
    this._syncVisuals();
    this._emitChange('input');
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

    this.value = input.value;
    this._syncVisuals();
    this._emitChange('change');
  };

  connectedCallback() {
    super.connectedCallback?.();
    this._syncInput();
    this._input?.addEventListener('input', this.#onInput);
    this._input?.addEventListener('change', this.#onChange);
  }

  disconnectedCallback() {
    this._input?.removeEventListener('input', this.#onInput);
    this._input?.removeEventListener('change', this.#onChange);
    super.disconnectedCallback?.();
  }

  get _input() {
    return this.ref?.input;
  }

  get value() {
    return this.getAttribute('value') || '0';
  }

  set value(val) {
    this.setAttribute('value', String(val));
    this._syncInput();
  }

  get min() {
    return this.getAttribute('min') || '0';
  }

  set min(val) {
    this.setAttribute('min', String(val));
    this._syncInput();
  }

  get max() {
    return this.getAttribute('max') || '100';
  }

  set max(val) {
    this.setAttribute('max', String(val));
    this._syncInput();
  }

  get step() {
    return this.getAttribute('step') || '1';
  }

  set step(val) {
    this.setAttribute('step', String(val));
    this._syncInput();
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    this.toggleAttribute('disabled', Boolean(val));
    this._syncInput();
  }

  get readonly() {
    return this.hasAttribute('readonly');
  }

  set readonly(val) {
    this.toggleAttribute('readonly', Boolean(val));
    this._syncInput();
  }

  get name() {
    return this.getAttribute('name') || '';
  }

  set name(val) {
    if (val == null || val === '') {
      this.removeAttribute('name');
    } else {
      this.setAttribute('name', String(val));
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this._syncInput();
  }

  focusControl(options) {
    this._input?.focus?.(options);
  }

  _syncInput() {
    let input = this._input;
    if (!input) return;

    input.value = this.value;
    input.min = this.min;
    input.max = this.max;
    input.step = this.step;
    input.disabled = this.disabled;
    input.toggleAttribute('disabled', this.disabled);
    input.toggleAttribute('readonly', this.readonly);
    if (this.name) {
      input.setAttribute('name', this.name);
    } else {
      input.removeAttribute('name');
    }

    if (this.readonly) {
      input.setAttribute('aria-readonly', 'true');
    } else {
      input.removeAttribute('aria-readonly');
    }

    this._forwardAria(input, 'aria-label');
    this._forwardAria(input, 'aria-labelledby');
    this._forwardAria(input, 'aria-valuetext');

    this._syncVisuals();
  }

  _forwardAria(input, attr) {
    let value = this.getAttribute(attr);
    if (value == null) {
      input.removeAttribute(attr);
    } else {
      input.setAttribute(attr, value);
    }
  }

  _syncVisuals() {
    let activeTrack = this.ref?.activeTrack;
    let thumb = this.ref?.thumb;
    if (!activeTrack || !thumb) return;

    let min = Number(this.min);
    let max = Number(this.max);
    let val = Number(this.value);

    let percent = (val - min) / (max - min);
    if (Number.isNaN(percent) || percent < 0) percent = 0;
    if (percent > 1) percent = 1;

    activeTrack.style.inlineSize = `${percent * 100}%`;
    thumb.style.insetInlineStart = `${percent * 100}%`;
  }

  _emitChange(type) {
    let detail = {
      control: 'slider',
      value: this.value,
      name: this.name,
    };
    this.dispatchEvent(new CustomEvent('sn-control-change', {
      bubbles: true,
      composed: true,
      detail,
    }));
    this.dispatchEvent(new CustomEvent(`sn-slider-${type}`, {
      bubbles: true,
      composed: true,
      detail,
    }));
  }
}

SliderControl.template = template;
SliderControl.rootStyles = css;
SliderControl.reg('sn-slider');

export default SliderControl;
