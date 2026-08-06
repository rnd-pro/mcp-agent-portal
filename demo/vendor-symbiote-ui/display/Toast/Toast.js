import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import { toastTemplate, toastRegionTemplate } from './Toast.tpl.js';
import css from './Toast.css.js';

const VARIANT_ICONS = {
  info: 'info',
  success: 'check_circle',
  warning: 'warning',
  error: 'error',
};

export class Toast extends Symbiote {
  static observedAttributes = ['variant', 'duration', 'message'];

  #timeoutId = null;
  #remainingTime = 4000;
  #startTime = null;

  #onCloseBtnClick = (event) => {
    event.stopPropagation();
    this.dismiss();
  };

  #onMouseEnter = () => {
    if (this.#timeoutId) {
      clearTimeout(this.#timeoutId);
      this.#timeoutId = null;
      this.#remainingTime -= Date.now() - this.#startTime;
    }
  };

  #onMouseLeave = () => {
    if (this.duration > 0 && this.#remainingTime > 0) {
      this.#startTime = Date.now();
      this.#timeoutId = setTimeout(() => this.dismiss(), this.#remainingTime);
    }
  };

  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
    this.init$ = {
      variantClass: 'sn-toast-info',
      iconName: 'info',
      message: '',
    };
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.ref.closeBtn?.addEventListener('click', this.#onCloseBtnClick);
    this.addEventListener('mouseenter', this.#onMouseEnter);
    this.addEventListener('mouseleave', this.#onMouseLeave);

    this.#syncState();
    this.#startTimer();
  }

  disconnectedCallback() {
    this.ref.closeBtn?.removeEventListener('click', this.#onCloseBtnClick);
    this.removeEventListener('mouseenter', this.#onMouseEnter);
    this.removeEventListener('mouseleave', this.#onMouseLeave);
    if (this.#timeoutId) {
      clearTimeout(this.#timeoutId);
      this.#timeoutId = null;
    }
    super.disconnectedCallback?.();
  }

  get variant() {
    return this.getAttribute('variant') || 'info';
  }

  set variant(val) {
    this.setAttribute('variant', String(val));
  }

  get duration() {
    const dur = this.getAttribute('duration');
    return dur === null ? 4000 : Number(dur);
  }

  set duration(val) {
    this.setAttribute('duration', String(val));
  }

  get message() {
    return this.getAttribute('message') || '';
  }

  set message(val) {
    this.setAttribute('message', String(val));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this.#syncState();
    if (name === 'duration') {
      this.#startTimer();
    }
  }

  #syncState() {
    const v = this.variant;
    this.$.variantClass = `sn-toast-${v}`;
    this.$.iconName = VARIANT_ICONS[v] || 'info';
    this.$.message = this.message;
  }

  #startTimer() {
    if (this.#timeoutId) {
      clearTimeout(this.#timeoutId);
      this.#timeoutId = null;
    }
    const dur = this.duration;
    if (dur > 0) {
      this.#remainingTime = dur;
      this.#startTime = Date.now();
      this.#timeoutId = setTimeout(() => this.dismiss(), dur);
    }
  }

  dismiss() {
    if (this.hasAttribute('data-dismissing')) return;
    this.setAttribute('data-dismissing', '');

    // Wait for fade-out animation before removing from DOM
    setTimeout(() => {
      this.remove();
    }, 240);
  }
}

Toast.template = toastTemplate;
Toast.rootStyles = css;
Toast.reg('sn-toast');

export class ToastRegion extends Symbiote {
  static #defaultRegion = null;

  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
  }

  static show(options = {}) {
    let region = this.#defaultRegion || document.querySelector('sn-toast-region');
    if (!region) {
      region = document.createElement('sn-toast-region');
      document.body.appendChild(region);
      this.#defaultRegion = region;
    }

    const toast = document.createElement('sn-toast');
    if (options.variant) toast.setAttribute('variant', options.variant);
    if (options.duration !== undefined) toast.setAttribute('duration', String(options.duration));
    if (options.message) toast.setAttribute('message', options.message);
    if (options.content) {
      toast.innerHTML = options.content;
    }

    region.appendChild(toast);
    return toast;
  }

  connectedCallback() {
    super.connectedCallback?.();
    if (!ToastRegion.#defaultRegion) {
      ToastRegion.#defaultRegion = this;
    }
  }

  disconnectedCallback() {
    if (ToastRegion.#defaultRegion === this) {
      ToastRegion.#defaultRegion = null;
    }
    super.disconnectedCallback?.();
  }
}

ToastRegion.template = toastRegionTemplate;
ToastRegion.rootStyles = css;
ToastRegion.reg('sn-toast-region');

export default { Toast, ToastRegion };
