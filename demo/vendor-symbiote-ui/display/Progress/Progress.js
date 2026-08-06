import Symbiote from '@symbiotejs/symbiote';
import { progressBarTemplate, progressRingTemplate, spinnerTemplate } from './Progress.tpl.js';
import css from './Progress.css.js';

export class ProgressBar extends Symbiote {
  static observedAttributes = ['value', 'max', 'indeterminate'];

  init$ = {
    value: 0,
    max: 100,
    indeterminate: false,
    percentageHtml: '0%',
  };

  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'progressbar');
    }
    this.setAttribute('aria-valuemin', '0');
    if (this.hasAttribute('value')) {
      this.$.value = Number(this.getAttribute('value') || 0);
    }
    if (this.hasAttribute('max')) {
      this.$.max = Number(this.getAttribute('max') || 100);
    }
    if (this.hasAttribute('indeterminate')) {
      this.$.indeterminate = true;
    }
    this.#render();
  }

  get value() {
    return Number(this.getAttribute('value') || 0);
  }

  set value(val) {
    this.setAttribute('value', String(val));
  }

  get max() {
    return Number(this.getAttribute('max') || 100);
  }

  set max(val) {
    this.setAttribute('max', String(val));
  }

  get indeterminate() {
    return this.hasAttribute('indeterminate');
  }

  set indeterminate(val) {
    if (val) {
      this.setAttribute('indeterminate', '');
    } else {
      this.removeAttribute('indeterminate');
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (!this.isConnected) return;
    if (name === 'value') {
      this.$.value = Number(newValue || 0);
      this.#render();
    } else if (name === 'max') {
      this.$.max = Number(newValue || 100);
      this.#render();
    } else if (name === 'indeterminate') {
      this.$.indeterminate = newValue !== null;
      this.#render();
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  #render() {
    const value = this.$.value;
    const max = this.$.max;
    const indet = this.$.indeterminate;

    if (indet) {
      this.setAttribute('indeterminate', '');
      this.removeAttribute('aria-valuenow');
      this.$.percentageHtml = 'auto';
    } else {
      this.removeAttribute('indeterminate');
      const percentage = Math.min(100, Math.max(0, (value / max) * 100));
      this.setAttribute('aria-valuenow', String(value));
      this.setAttribute('aria-valuemax', String(max));
      this.$.percentageHtml = `${percentage}%`;
    }
  }
}

ProgressBar.template = progressBarTemplate;
ProgressBar.rootStyles = css;
ProgressBar.reg('sn-progress-bar');

export class ProgressRing extends Symbiote {
  static observedAttributes = ['value', 'max', 'indeterminate'];

  init$ = {
    value: 0,
    max: 100,
    indeterminate: false,
    strokeDashArray: '100.53',
    strokeDashOffset: '100.53',
  };

  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'progressbar');
    }
    this.setAttribute('aria-valuemin', '0');
    if (this.hasAttribute('value')) {
      this.$.value = Number(this.getAttribute('value') || 0);
    }
    if (this.hasAttribute('max')) {
      this.$.max = Number(this.getAttribute('max') || 100);
    }
    if (this.hasAttribute('indeterminate')) {
      this.$.indeterminate = true;
    }
    this.#render();
  }

  get value() {
    return Number(this.getAttribute('value') || 0);
  }

  set value(val) {
    this.setAttribute('value', String(val));
  }

  get max() {
    return Number(this.getAttribute('max') || 100);
  }

  set max(val) {
    this.setAttribute('max', String(val));
  }

  get indeterminate() {
    return this.hasAttribute('indeterminate');
  }

  set indeterminate(val) {
    if (val) {
      this.setAttribute('indeterminate', '');
    } else {
      this.removeAttribute('indeterminate');
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (!this.isConnected) return;
    if (name === 'value') {
      this.$.value = Number(newValue || 0);
      this.#render();
    } else if (name === 'max') {
      this.$.max = Number(newValue || 100);
      this.#render();
    } else if (name === 'indeterminate') {
      this.$.indeterminate = newValue !== null;
      this.#render();
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  #render() {
    const value = this.$.value;
    const max = this.$.max;
    const indet = this.$.indeterminate;

    const circumference = 2 * Math.PI * 16; // 100.53
    this.$.strokeDashArray = `${circumference}`;

    if (indet) {
      this.setAttribute('indeterminate', '');
      this.removeAttribute('aria-valuenow');
      this.$.strokeDashOffset = `${circumference * 0.25}`;
    } else {
      this.removeAttribute('indeterminate');
      const percentage = Math.min(100, Math.max(0, (value / max) * 100));
      const offset = circumference - (percentage / 100) * circumference;
      this.setAttribute('aria-valuenow', String(value));
      this.setAttribute('aria-valuemax', String(max));
      this.$.strokeDashOffset = `${offset}`;
    }
  }
}

ProgressRing.template = progressRingTemplate;
ProgressRing.reg('sn-progress-ring');

export class Spinner extends Symbiote {
  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'progressbar');
    }
  }
}

Spinner.template = spinnerTemplate;
Spinner.reg('sn-spinner');
