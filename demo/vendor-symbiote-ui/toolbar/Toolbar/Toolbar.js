import Symbiote from '@symbiotejs/symbiote';
import { setupRovingFocus } from '../../ui/roving-focus.js';
import template from './Toolbar.tpl.js';
import css from './Toolbar.css.js';

export class Toolbar extends Symbiote {
  static observedAttributes = ['orientation', 'compact'];

  #cleanupRoving = null;

  init$ = {
    orientation: 'horizontal',
    compact: false,
  };

  connectedCallback() {
    super.connectedCallback?.();
    this.$.orientation = this.orientation;
    this.$.compact = this.compact;
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'toolbar');
    }
    if (!this.hasAttribute('aria-label') && !this.hasAttribute('aria-labelledby')) {
      this.setAttribute('aria-label', 'Toolbar');
    }
    this.setAttribute('aria-orientation', this.orientation);

    this.#initFocus();
  }

  disconnectedCallback() {
    this.#cleanupRoving?.();
    super.disconnectedCallback?.();
  }

  get orientation() {
    return this.getAttribute('orientation') || 'horizontal';
  }

  set orientation(val) {
    this.setAttribute('orientation', val);
  }

  get compact() {
    return this.hasAttribute('compact');
  }

  set compact(val) {
    this.toggleAttribute('compact', Boolean(val));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (!this.isConnected) return;
    if (name === 'orientation') {
      this.$.orientation = newValue || 'horizontal';
      this.setAttribute('aria-orientation', this.$.orientation);
      this.#initFocus();
    } else if (name === 'compact') {
      this.$.compact = newValue !== null;
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  #initFocus() {
    this.#cleanupRoving?.();
    // Selector for toolbar controls
    const selector = 'button, select, input, sn-button, sn-checkbox, sn-radio, sn-switch, sn-select, sn-combobox, [tabindex="0"], [tabindex="-1"]';
    this.#cleanupRoving = setupRovingFocus(this, selector);
  }
}

Toolbar.template = template;
Toolbar.rootStyles = css;
Toolbar.reg('sn-toolbar');

export default Toolbar;
