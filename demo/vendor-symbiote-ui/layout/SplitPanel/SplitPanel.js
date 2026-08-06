import Symbiote from '@symbiotejs/symbiote';
import template from './SplitPanel.tpl.js';
import css from './SplitPanel.css.js';

class SplitPanel extends Symbiote {
  static observedAttributes = ['orientation', 'value', 'disabled'];

  #isDragging = false;
  #lastValue = 50;

  #onMouseDown = (event) => {
    if (this.disabled) return;
    event.preventDefault();
    this.#isDragging = true;
    this.ref.divider?.setAttribute('data-active', '');

    window.addEventListener('mousemove', this.#onMouseMove);
    window.addEventListener('mouseup', this.#onMouseUp);
  };

  #onMouseMove = (event) => {
    if (!this.#isDragging) return;
    const container = this.ref.container;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    let percentage = 50;

    if (this.orientation === 'horizontal') {
      const x = event.clientX - rect.left;
      percentage = (x / rect.width) * 100;
    } else {
      const y = event.clientY - rect.top;
      percentage = (y / rect.height) * 100;
    }

    percentage = Math.max(0, Math.min(percentage, 100));
    this.value = percentage;
  };

  #onMouseUp = () => {
    this.#isDragging = false;
    this.ref.divider?.removeAttribute('data-active');
    window.removeEventListener('mousemove', this.#onMouseMove);
    window.removeEventListener('mouseup', this.#onMouseUp);
    this.dispatchEvent(new CustomEvent('sn-split-resize', { bubbles: true, composed: true, detail: { value: this.value } }));
  };

  #onDoubleClick = () => {
    if (this.disabled) return;
    const current = this.value;
    if (current > 10 && current < 90) {
      this.#lastValue = current;
      this.value = current > 50 ? 100 : 0;
    } else {
      this.value = this.#lastValue;
    }
    this.dispatchEvent(new CustomEvent('sn-split-resize', { bubbles: true, composed: true, detail: { value: this.value } }));
  };

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.ref.divider?.addEventListener('mousedown', this.#onMouseDown);
    this.ref.divider?.addEventListener('dblclick', this.#onDoubleClick);
    this.#syncLayout();
  }

  disconnectedCallback() {
    this.ref.divider?.removeEventListener('mousedown', this.#onMouseDown);
    this.ref.divider?.removeEventListener('dblclick', this.#onDoubleClick);
    window.removeEventListener('mousemove', this.#onMouseMove);
    window.removeEventListener('mouseup', this.#onMouseUp);
    super.disconnectedCallback?.();
  }

  get orientation() {
    return this.getAttribute('orientation') || 'horizontal';
  }

  set orientation(val) {
    this.setAttribute('orientation', String(val));
  }

  get value() {
    return Number(this.getAttribute('value')) ?? 50;
  }

  set value(val) {
    this.setAttribute('value', String(val));
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    this.toggleAttribute('disabled', Boolean(val));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this.#syncLayout();
  }

  #syncLayout() {
    const container = this.ref.container;
    const primary = this.ref.primary;
    const secondary = this.ref.secondary;
    const divider = this.ref.divider;

    if (!container || !primary || !secondary || !divider) return;

    const orient = this.orientation;
    container.setAttribute('data-orientation', orient);

    const percentage = this.value;

    if (orient === 'horizontal') {
      primary.style.width = `${percentage}%`;
      primary.style.height = '100%';
      secondary.style.width = `${100 - percentage}%`;
      secondary.style.height = '100%';
      primary.style.flexBasis = `${percentage}%`;
      secondary.style.flexBasis = `${100 - percentage}%`;
    } else {
      primary.style.height = `${percentage}%`;
      primary.style.width = '100%';
      secondary.style.height = `${100 - percentage}%`;
      secondary.style.width = '100%';
      primary.style.flexBasis = `${percentage}%`;
      secondary.style.flexBasis = `${100 - percentage}%`;
    }
  }
}

SplitPanel.template = template;
SplitPanel.rootStyles = css;
SplitPanel.reg('sn-split-panel');

export default SplitPanel;
