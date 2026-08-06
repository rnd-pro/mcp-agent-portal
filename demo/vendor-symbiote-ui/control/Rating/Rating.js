import Symbiote from '@symbiotejs/symbiote';
import template from './Rating.tpl.js';
import css from './Rating.css.js';

const RATING_ATTRIBUTES = [
  'value',
  'max',
  'disabled',
  'readonly',
  'name',
];

export class RatingControl extends Symbiote {
  static observedAttributes = RATING_ATTRIBUTES;

  #onClick = (event) => {
    if (this.disabled || this.readonly) return;
    let star = event.target.closest('.sn-rating-star');
    if (!star) return;

    let index = Number(star.dataset.index);
    this.value = index + 1;
    this._emitChange();
  };

  #onKeyDown = (event) => {
    if (this.disabled || this.readonly) return;
    let val = Number(this.value);
    let max = Number(this.max);

    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (val < max) {
        this.value = val + 1;
        this._emitChange();
      }
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (val > 0) {
        this.value = val - 1;
        this._emitChange();
      }
    }
  };

  connectedCallback() {
    super.connectedCallback?.();
    this.setAttribute('role', 'slider');
    this._syncTabindex();
    this._syncStars();
    this.ref.container?.addEventListener('click', this.#onClick);
    this.addEventListener('keydown', this.#onKeyDown);
  }

  disconnectedCallback() {
    this.ref.container?.removeEventListener('click', this.#onClick);
    this.removeEventListener('keydown', this.#onKeyDown);
    super.disconnectedCallback?.();
  }

  get value() {
    return this.getAttribute('value') || '0';
  }

  set value(val) {
    this.setAttribute('value', String(val));
    this._syncInput();
  }

  get max() {
    return this.getAttribute('max') || '5';
  }

  set max(val) {
    this.setAttribute('max', String(val));
    this._syncStars();
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    this.toggleAttribute('disabled', Boolean(val));
    this._syncTabindex();
  }

  get readonly() {
    return this.hasAttribute('readonly');
  }

  set readonly(val) {
    this.toggleAttribute('readonly', Boolean(val));
    this._syncTabindex();
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
    if (name === 'max') {
      this._syncStars();
    } else {
      if (name === 'disabled' || name === 'readonly') {
        this._syncTabindex();
      }
      this._syncInput();
    }
  }

  focusControl(options) {
    this.focus(options);
  }

  _syncTabindex() {
    if (this.disabled) {
      this.removeAttribute('tabindex');
    } else {
      this.setAttribute('tabindex', '0');
    }
  }

  _syncStars() {
    let container = this.ref?.container;
    if (!container) return;

    container.innerHTML = '';
    let max = Number(this.max) || 5;

    for (let i = 0; i < max; i++) {
      let star = document.createElement('span');
      star.className = 'sn-rating-star';
      star.dataset.index = String(i);
      star.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"></path></svg>`;
      container.appendChild(star);
    }

    this._syncInput();
  }

  _syncInput() {
    let input = this.ref?.input;
    if (input) {
      input.value = this.value;
      input.name = this.name;
      input.disabled = this.disabled;
      input.toggleAttribute('disabled', this.disabled);
    }

    this.setAttribute('aria-valuenow', this.value);
    this.setAttribute('aria-valuemin', '0');
    this.setAttribute('aria-valuemax', this.max);

    if (this.disabled) {
      this.setAttribute('aria-disabled', 'true');
    } else {
      this.removeAttribute('aria-disabled');
    }

    if (this.readonly) {
      this.setAttribute('aria-readonly', 'true');
    } else {
      this.removeAttribute('aria-readonly');
    }

    let stars = this.querySelectorAll('.sn-rating-star');
    let val = Number(this.value) || 0;
    stars.forEach((star, index) => {
      star.toggleAttribute('data-active', index < val);
    });
  }

  _emitChange() {
    let detail = {
      control: 'rating',
      value: this.value,
      name: this.name,
    };
    this.dispatchEvent(new CustomEvent('sn-control-change', {
      bubbles: true,
      composed: true,
      detail,
    }));
    this.dispatchEvent(new CustomEvent('sn-rating-change', {
      bubbles: true,
      composed: true,
      detail,
    }));
  }
}

RatingControl.template = template;
RatingControl.rootStyles = css;
RatingControl.reg('sn-rating');

export default RatingControl;
