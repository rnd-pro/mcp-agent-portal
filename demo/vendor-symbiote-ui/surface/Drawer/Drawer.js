import Symbiote from '@symbiotejs/symbiote';
import template from './Drawer.tpl.js';
import css from './Drawer.css.js';
import { registerDismissableLayer } from '../../ui/dismissable-layer.js';
import { FocusTrap } from '../../ui/focus-trap.js';
import { mountOverlayToDocument, restoreOverlayHome } from '../../ui/overlay-stack.js';

export class Drawer extends Symbiote {
  static observedAttributes = ['open', 'placement', 'label', 'no-backdrop-dismiss'];

  #focusTrap = null;
  #cleanupDismissable = null;
  #syncingOpen = false;
  #titleId = `sn-drawer-title-${Math.random().toString(36).slice(2, 9)}`;

  #onCloseBtnClick = () => {
    this.close();
  };

  #onBackdropClick = (event) => {
    if (this.hasAttribute('no-backdrop-dismiss')) return;
    this.close();
  };

  constructor() {
    super();
    this.init$ = {
      label: '',
    };
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.ref.closeBtn?.addEventListener('click', this.#onCloseBtnClick);
    this.ref.backdrop?.addEventListener('click', this.#onBackdropClick);

    this.#focusTrap = new FocusTrap(this.ref.panel || this);
    this.#syncPanelState();
    this.#syncAccessibleName();

    if (this.open) {
      this.show();
    }
  }

  disconnectedCallback() {
    this.ref.closeBtn?.removeEventListener('click', this.#onCloseBtnClick);
    this.ref.backdrop?.removeEventListener('click', this.#onBackdropClick);
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
    return this.getAttribute('placement') || 'right';
  }

  set placement(value) {
    this.setAttribute('placement', String(value));
  }

  get label() {
    return this.getAttribute('label') || '';
  }

  set label(value) {
    this.setAttribute('label', String(value));
    this.$.label = value;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'open') {
      if (this.#syncingOpen) return;
      newValue != null ? this.show() : this.close();
    } else if (name === 'label') {
      this.$.label = newValue || '';
      this.#syncAccessibleName();
    } else if (name === 'placement') {
      this.#syncPanelState();
    }
  }

  show() {
    const backdrop = this.ref.backdrop;
    const panel = this.ref.panel;

    if (!panel || !backdrop) return;

    this.#setOpenAttribute(true);

    // Mount to document for proper overlay presentation
    mountOverlayToDocument(backdrop, this);
    mountOverlayToDocument(panel, this);

    backdrop.setAttribute('data-visible', '');
    this.#syncPanelState();

    // Slide transition trigger
    const triggerFocus = () => {
      this.#focusTrap?.activate();
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(triggerFocus);
    } else {
      setTimeout(triggerFocus, 0);
    }

    this.#cleanupDismissable = registerDismissableLayer({
      element: panel,
      onDismiss: () => {
        if (!this.hasAttribute('no-backdrop-dismiss')) {
          this.close();
        }
      },
      interactOutsideExclude: [panel, backdrop],
    });

    this.dispatchEvent(new CustomEvent('sn-drawer-open', { bubbles: true, composed: true }));
  }

  close() {
    const backdrop = this.ref.backdrop;
    const panel = this.ref.panel;

    if (!panel || !backdrop) return;

    this.#setOpenAttribute(false);

    this.#focusTrap?.deactivate();
    backdrop.removeAttribute('data-visible');
    panel.removeAttribute('data-visible');

    // Restore to home after transition
    setTimeout(() => {
      if (!this.open) {
        restoreOverlayHome(backdrop);
        restoreOverlayHome(panel);
      }
    }, 240); // Matches transition-normal duration

    if (this.#cleanupDismissable) {
      this.#cleanupDismissable();
      this.#cleanupDismissable = null;
    }

    this.dispatchEvent(new CustomEvent('sn-drawer-close', { bubbles: true, composed: true }));
  }

  #setOpenAttribute(value) {
    if (this.open === Boolean(value)) return;
    this.#syncingOpen = true;
    this.toggleAttribute('open', Boolean(value));
    this.#syncingOpen = false;
  }

  #syncPanelState() {
    const panel = this.ref.panel;
    if (!panel) return;
    panel.setAttribute('data-placement', this.placement);
    panel.toggleAttribute('data-visible', this.open);
  }

  // Name the dialog from its visible heading (aria-labelledby is preferred over
  // aria-label by the APG dialog pattern). Fall back to aria-label only when the
  // heading has no text, so the dialog is never left without an accessible name.
  #syncAccessibleName() {
    const panel = this.ref.panel;
    if (!panel) return;
    const title = this.ref.title;
    const hasHeading = !!(title && title.textContent.trim());
    if (hasHeading) {
      if (!title.id) title.id = this.#titleId;
      panel.setAttribute('aria-labelledby', title.id);
      panel.removeAttribute('aria-label');
    } else {
      panel.removeAttribute('aria-labelledby');
      panel.setAttribute('aria-label', this.label || 'Dialog');
    }
  }
}

Drawer.template = template;
Drawer.rootStyles = css;
Drawer.reg('sn-drawer');

export default Drawer;
