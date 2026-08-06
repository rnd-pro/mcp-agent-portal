import Symbiote from '@symbiotejs/symbiote';
import template from './Popover.tpl.js';
import css from './Popover.css.js';
import { registerDismissableLayer } from '../../ui/dismissable-layer.js';
import { positionOverlay } from '../../ui/overlay-positioner.js';
import { mountOverlayToDocument, restoreOverlayHome } from '../../ui/overlay-stack.js';

export class Popover extends Symbiote {
  static observedAttributes = ['open', 'placement', 'offset', 'disabled'];

  #triggerEl = null;
  #cleanupDismissable = null;
  #syncingOpen = false;
  #panelId = `sn-popover-panel-${Math.random().toString(36).slice(2, 9)}`;

  #onTriggerClick = (event) => {
    if (this.disabled) return;
    this.open ? this.close() : this.show();
  };

  #onReposition = () => {
    if (this.open && this.#triggerEl && this.ref.panel) {
      positionOverlay(this.#triggerEl, this.ref.panel, this.placement, {
        offset: this.offset,
      });
    }
  };

  constructor() {
    super();
    this.init$ = {};
  }

  connectedCallback() {
    super.connectedCallback?.();

    // Find trigger element
    const slot = this.shadowRoot?.querySelector('slot[name="trigger"]');
    const updateTrigger = () => {
      const assigned = slot?.assignedElements();
      const newTrigger = assigned?.[0] || this.querySelector('[slot="trigger"]');
      if (newTrigger !== this.#triggerEl) {
        this.#triggerEl?.removeEventListener('click', this.#onTriggerClick);
        this.#triggerEl = newTrigger;
        this.#triggerEl?.addEventListener('click', this.#onTriggerClick);
        this.#triggerEl?.setAttribute('aria-haspopup', 'dialog');
        this.#triggerEl?.setAttribute('aria-controls', this.ref.panel?.id || this.#panelId);
        this.#triggerEl?.setAttribute('aria-expanded', this.open ? 'true' : 'false');
      }
    };

    if (this.ref.panel && !this.ref.panel.id) {
      this.ref.panel.id = this.#panelId;
    }

    slot?.addEventListener('slotchange', updateTrigger);
    updateTrigger();

    if (this.open) {
      this.show();
    }
  }

  disconnectedCallback() {
    this.#triggerEl?.removeEventListener('click', this.#onTriggerClick);
    this.#triggerEl = null;
    this.close();
    super.disconnectedCallback?.();
  }

  get open() {
    return this.hasAttribute('open');
  }

  set open(value) {
    this.toggleAttribute('open', Boolean(value));
  }

  get placement() {
    return this.getAttribute('placement') || 'bottom-start';
  }

  set placement(value) {
    this.setAttribute('placement', String(value));
  }

  get offset() {
    const val = Number.parseInt(this.getAttribute('offset'), 10);
    return Number.isNaN(val) ? 4 : val;
  }

  set offset(value) {
    this.setAttribute('offset', String(value));
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(value) {
    this.toggleAttribute('disabled', Boolean(value));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'open') {
      if (this.#syncingOpen) return;
      newValue != null ? this.show() : this.close();
    } else if (name === 'disabled' && newValue != null) {
      this.close();
    }
  }

  show() {
    const panel = this.ref.panel;
    if (!panel || !this.#triggerEl) return;

    this.#setOpenAttribute(true);
    this.#triggerEl.setAttribute('aria-expanded', 'true');

    mountOverlayToDocument(panel, this);
    panel.setAttribute('data-visible', '');

    // Position overlay
    positionOverlay(this.#triggerEl, panel, this.placement, {
      offset: this.offset,
    });

    window.addEventListener('resize', this.#onReposition);
    window.addEventListener('scroll', this.#onReposition, { capture: true });

    // Register dismissable layer
    this.#cleanupDismissable = registerDismissableLayer({
      element: panel,
      onDismiss: (event) => this.close({ returnFocus: event?.key === 'Escape' }),
      interactOutsideExclude: [this.#triggerEl, panel],
    });

    this.dispatchEvent(new CustomEvent('sn-popover-open', { bubbles: true, composed: true }));
  }

  close({ returnFocus = false } = {}) {
    const panel = this.ref.panel;
    if (!panel) return;

    this.#setOpenAttribute(false);
    this.#triggerEl?.setAttribute('aria-expanded', 'false');

    panel.removeAttribute('data-visible');
    restoreOverlayHome(panel);

    window.removeEventListener('resize', this.#onReposition);
    window.removeEventListener('scroll', this.#onReposition, { capture: true });

    if (this.#cleanupDismissable) {
      this.#cleanupDismissable();
      this.#cleanupDismissable = null;
    }

    if (returnFocus && typeof this.#triggerEl?.focus === 'function') {
      this.#triggerEl.focus();
    }

    this.dispatchEvent(new CustomEvent('sn-popover-close', { bubbles: true, composed: true }));
  }

  #setOpenAttribute(value) {
    if (this.open === Boolean(value)) return;
    this.#syncingOpen = true;
    this.toggleAttribute('open', Boolean(value));
    this.#syncingOpen = false;
  }
}

Popover.template = template;
Popover.rootStyles = css;
Popover.reg('sn-popover');

export default Popover;
