import Symbiote from '@symbiotejs/symbiote';
import { mountOverlayToDocument, restoreOverlayHome, bringOverlayToFront } from '../../ui/overlay-stack.js';
import template from './Tooltip.tpl.js';
import css from './Tooltip.css.js';

const TOOLTIP_ATTRIBUTES = [
  'content',
  'placement',
  'disabled',
];

export class Tooltip extends Symbiote {
  static observedAttributes = TOOLTIP_ATTRIBUTES;

  #onShow = () => {
    if (this.disabled) return;
    this.show();
  };

  #onHide = () => {
    this.hide();
  };

  constructor() {
    super();
    this.init$ = {
      content: '',
    };
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.$.content = this.content;
    this.addEventListener('mouseenter', this.#onShow);
    this.addEventListener('mouseleave', this.#onHide);
    this.addEventListener('focusin', this.#onShow);
    this.addEventListener('focusout', this.#onHide);

    let uid = this.uid || Math.random().toString(36).slice(2, 9);
    let popup = this.ref?.popup;
    if (popup) {
      popup.id = `sn-tooltip-popup-${uid}`;
    }

    let trigger = this.firstElementChild;
    if (trigger && popup) {
      trigger.setAttribute('aria-describedby', popup.id);
    }
  }

  disconnectedCallback() {
    this.hide();
    this.removeEventListener('mouseenter', this.#onShow);
    this.removeEventListener('mouseleave', this.#onHide);
    this.removeEventListener('focusin', this.#onShow);
    this.removeEventListener('focusout', this.#onHide);
    super.disconnectedCallback?.();
  }

  get content() {
    return this.getAttribute('content') || '';
  }

  set content(val) {
    this.setAttribute('content', String(val));
  }

  get placement() {
    return this.getAttribute('placement') || 'top';
  }

  set placement(val) {
    this.setAttribute('placement', String(val));
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    this.toggleAttribute('disabled', Boolean(val));
    if (val) this.hide();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'content') {
      this.$.content = newValue || '';
    } else if (name === 'disabled' && newValue != null) {
      this.hide();
    } else if (name === 'placement' && this.ref?.popup?.hasAttribute('data-visible')) {
      this._position();
    }
  }

  show() {
    if (this.disabled) return;
    let popup = this.ref?.popup;
    if (!popup) return;

    popup.setAttribute('data-visible', '');
    popup.setAttribute('aria-hidden', 'false');
    mountOverlayToDocument(popup, this);
    bringOverlayToFront(popup);

    this._position();

    this.dispatchEvent(new CustomEvent('sn-tooltip-show', {
      bubbles: true,
      composed: true,
    }));
  }

  hide() {
    let popup = this.ref?.popup;
    if (!popup || !popup.hasAttribute('data-visible')) return;

    popup.removeAttribute('data-visible');
    popup.setAttribute('aria-hidden', 'true');
    restoreOverlayHome(popup);

    this.dispatchEvent(new CustomEvent('sn-tooltip-hide', {
      bubbles: true,
      composed: true,
    }));
  }

  _position() {
    let popup = this.ref?.popup;
    if (!popup) return;

    let triggerRect = this.getBoundingClientRect();
    let popupRect = popup.getBoundingClientRect();

    let placement = this.placement;
    let gap = 6;
    let x = 0;
    let y = 0;

    switch (placement) {
      case 'bottom':
        x = triggerRect.left + (triggerRect.width - popupRect.width) / 2;
        y = triggerRect.bottom + gap;
        break;
      case 'left':
        x = triggerRect.left - popupRect.width - gap;
        y = triggerRect.top + (triggerRect.height - popupRect.height) / 2;
        break;
      case 'right':
        x = triggerRect.right + gap;
        y = triggerRect.top + (triggerRect.height - popupRect.height) / 2;
        break;
      case 'top':
      default:
        x = triggerRect.left + (triggerRect.width - popupRect.width) / 2;
        y = triggerRect.top - popupRect.height - gap;
        break;
    }

    popup.style.setProperty('--sn-tooltip-x', `${x}px`);
    popup.style.setProperty('--sn-tooltip-y', `${y}px`);
  }
}

Tooltip.template = template;
Tooltip.rootStyles = css;
Tooltip.reg('sn-tooltip');

export default Tooltip;
