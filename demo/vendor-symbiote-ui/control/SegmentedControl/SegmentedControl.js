import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import template from './SegmentedControl.tpl.js';
import css from './SegmentedControl.css.js';

const SEGMENTED_ATTRIBUTES = [
  'value',
  'disabled',
  'readonly',
  'name',
];

export class SegmentedControl extends Symbiote {
  static observedAttributes = SEGMENTED_ATTRIBUTES;

  #slot = null;

  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
  }

  #onSlotChange = () => {
    this._syncItems();
  };

  #onClick = (event) => {
    if (this.disabled || this.readonly) return;
    let target = event.target.closest('sn-segmented-control > *');
    if (!target) return;

    let val = target.getAttribute('value') || target.textContent.trim();
    this.value = val;
    this._emitChange();
  };

  #onKeyDown = (event) => {
    if (this.disabled || this.readonly) return;
    let items = this._getItems();
    if (!items.length) return;

    let activeIndex = items.findIndex(item => item === document.activeElement);
    if (activeIndex === -1) {
      activeIndex = items.findIndex(item => item.getAttribute('aria-checked') === 'true');
    }
    if (activeIndex === -1) activeIndex = 0;

    let nextIndex = activeIndex;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      nextIndex = (activeIndex + 1) % items.length;
      items[nextIndex].focus();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      nextIndex = (activeIndex - 1 + items.length) % items.length;
      items[nextIndex].focus();
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      let target = items[activeIndex];
      let val = target.getAttribute('value') || target.textContent.trim();
      this.value = val;
      this._emitChange();
    }
  };

  connectedCallback() {
    super.connectedCallback?.();
    this.setAttribute('role', 'radiogroup');
    this.addEventListener('click', this.#onClick);
    this.addEventListener('keydown', this.#onKeyDown);

    this.#slot = this._slot;
    this.#slot?.addEventListener('slotchange', this.#onSlotChange);
    this._syncItems();
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('keydown', this.#onKeyDown);
    this.#slot?.removeEventListener('slotchange', this.#onSlotChange);
    this.#slot = null;
    super.disconnectedCallback?.();
  }

  get _slot() {
    return this.querySelector('slot') || this.shadowRoot?.querySelector('slot');
  }

  _getItems() {
    let slot = this._slot;
    let assigned = slot ? slot.assignedElements() : [];
    if (!assigned.length) {
      assigned = Array.from(this.children).filter(child => child.tagName !== 'SLOT');
    }
    return assigned;
  }

  get value() {
    return this.getAttribute('value') || '';
  }

  set value(val) {
    this.setAttribute('value', String(val));
    this._syncItems();
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    this.toggleAttribute('disabled', Boolean(val));
  }

  get readonly() {
    return this.hasAttribute('readonly');
  }

  set readonly(val) {
    this.toggleAttribute('readonly', Boolean(val));
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
    this._syncItems();
  }

  focusControl() {
    let items = this._getItems();
    let selected = items.find(item => item.getAttribute('aria-checked') === 'true');
    if (selected) {
      selected.focus();
    } else if (items[0]) {
      items[0].focus();
    }
  }

  _syncItems() {
    let items = this._getItems();
    let val = this.value;

    if (this.disabled) {
      this.setAttribute('aria-disabled', 'true');
    } else {
      this.removeAttribute('aria-disabled');
    }

    let hasSelected = false;

    items.forEach(item => {
      item.setAttribute('role', 'radio');
      let itemVal = item.getAttribute('value') || item.textContent.trim();
      let isChecked = itemVal === val;
      item.setAttribute('aria-checked', isChecked ? 'true' : 'false');
      item.toggleAttribute('selected', isChecked);

      if (isChecked) {
        item.setAttribute('tabindex', '0');
        hasSelected = true;
      } else {
        item.setAttribute('tabindex', '-1');
      }

      if (this.disabled) {
        item.setAttribute('disabled', '');
        item.setAttribute('aria-disabled', 'true');
      } else {
        item.removeAttribute('disabled');
        item.removeAttribute('aria-disabled');
      }
    });

    if (!hasSelected && items[0]) {
      items[0].setAttribute('tabindex', '0');
    }
  }

  _emitChange() {
    let detail = {
      control: 'segmented',
      value: this.value,
      name: this.name,
    };
    this.dispatchEvent(new CustomEvent('sn-control-change', {
      bubbles: true,
      composed: true,
      detail,
    }));
    this.dispatchEvent(new CustomEvent('sn-segmented-change', {
      bubbles: true,
      composed: true,
      detail,
    }));
  }
}

SegmentedControl.template = template;
SegmentedControl.rootStyles = css;
SegmentedControl.reg('sn-segmented-control');

export default SegmentedControl;
