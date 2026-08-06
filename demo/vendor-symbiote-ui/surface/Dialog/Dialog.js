import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import template from './Dialog.tpl.js';
import css from './Dialog.css.js';

export class Dialog extends Symbiote {
  static observedAttributes = ['open', 'label', 'no-backdrop-dismiss'];

  #triggerEl = null;
  #syncingOpen = false;

  #onKeyDown = (event) => {
    if (event.key === 'Tab') {
      this.#handleFocusTrap(event);
    }
  };

  #onCloseBtnClick = () => {
    this.close();
  };

  #onDialogClick = (event) => {
    if (this.hasAttribute('no-backdrop-dismiss')) return;
    if (event.target === this.ref.dialog) {
      this.close();
    }
  };

  #onCancel = (event) => {
    // Esc key naturally cancels the native modal dialog
    if (this.hasAttribute('no-backdrop-dismiss')) {
      event.preventDefault();
    } else {
      this.close();
    }
  };

  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
    this.init$ = {
      label: '',
    };
  }

  connectedCallback() {
    super.connectedCallback?.();
    const dialog = this.ref.dialog;
    const closeBtn = this.ref.closeBtn;

    dialog?.addEventListener('click', this.#onDialogClick);
    dialog?.addEventListener('keydown', this.#onKeyDown);
    dialog?.addEventListener('cancel', this.#onCancel);
    closeBtn?.addEventListener('click', this.#onCloseBtnClick);

    // Initial sync
    if (this.open) {
      this.show();
    }
  }

  disconnectedCallback() {
    const dialog = this.ref.dialog;
    const closeBtn = this.ref.closeBtn;

    dialog?.removeEventListener('click', this.#onDialogClick);
    dialog?.removeEventListener('keydown', this.#onKeyDown);
    dialog?.removeEventListener('cancel', this.#onCancel);
    closeBtn?.removeEventListener('click', this.#onCloseBtnClick);

    super.disconnectedCallback?.();
  }

  get open() {
    return this.hasAttribute('open');
  }

  set open(value) {
    this.toggleAttribute('open', Boolean(value));
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
      if (newValue != null) {
        this.show();
      } else {
        this.close();
      }
    } else if (name === 'label') {
      this.$.label = newValue || '';
    }
  }

  show() {
    const dialog = this.ref.dialog;
    if (!dialog) return;

    if (dialog.hasAttribute('open')) {
      this.#setOpenAttribute(true);
      return;
    }

    this.#triggerEl = document.activeElement;

    try {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    } catch (error) {
      this.#triggerEl = null;
      this.#setOpenAttribute(false);
      throw error;
    }

    this.#setOpenAttribute(true);
    this.#focusFirstElement();

    this.dispatchEvent(new CustomEvent('sn-dialog-open', {
      bubbles: true,
      composed: true,
    }));
  }

  close() {
    const dialog = this.ref.dialog;
    if (!dialog) return;

    const wasOpen = this.open || dialog.hasAttribute('open');

    if (dialog.hasAttribute('open') && typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }

    this.#setOpenAttribute(false);

    if (!wasOpen) return;

    if (this.#triggerEl && typeof this.#triggerEl.focus === 'function') {
      this.#triggerEl.focus();
    }
    this.#triggerEl = null;

    this.dispatchEvent(new CustomEvent('sn-dialog-close', {
      bubbles: true,
      composed: true,
    }));
  }

  #setOpenAttribute(value) {
    if (this.open === Boolean(value)) return;
    this.#syncingOpen = true;
    this.toggleAttribute('open', Boolean(value));
    this.#syncingOpen = false;
  }

  #getFocusableElements() {
    const dialog = this.ref.dialog;
    if (!dialog) return [];
    return Array.from(
      dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1');
  }

  #focusFirstElement() {
    const elements = this.#getFocusableElements();
    if (elements.length > 0) {
      elements[0].focus();
    }
  }

  #handleFocusTrap(event) {
    const elements = this.#getFocusableElements();
    if (elements.length === 0) {
      event.preventDefault();
      return;
    }

    const first = elements[0];
    const last = elements[elements.length - 1];
    const active = this.shadowRoot ? this.shadowRoot.activeElement : document.activeElement;

    if (event.shiftKey) {
      if (active === first) {
        last.focus();
        event.preventDefault();
      }
    } else {
      if (active === last) {
        first.focus();
        event.preventDefault();
      }
    }
  }
}

Dialog.template = template;
Dialog.rootStyles = css;
Dialog.reg('sn-dialog');

export default Dialog;
