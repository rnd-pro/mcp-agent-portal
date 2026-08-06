import Symbiote from '@symbiotejs/symbiote';
import template from './LoadingOverlay.tpl.js';
import css from './LoadingOverlay.css.js';
import { translate } from '../../locale/index.js';

export class LoadingOverlay extends Symbiote {
  init$ = {
    label: translate('loading.label'),
    pct: 0,
    phase: translate('loading.initializing'),
    sub: '',
    isHidden: false,
  };

  renderCallback() {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'progressbar');
    this.setAttribute('aria-valuemin', '0');
    this.setAttribute('aria-valuemax', '100');

    this.sub('isHidden', (value) => {
      this.toggleAttribute('hidden-state', Boolean(value));
    });
    this.sub('pct', (value) => {
      let pct = Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : 0;
      this.style.setProperty('--sn-loading-progress', `${pct}%`);
      this.setAttribute('aria-valuenow', String(pct));
    });
    this.sub('phase', () => this._syncValueText());
    this.sub('sub', () => this._syncValueText());
  }

  _syncValueText() {
    const text = [this.$.phase, this.$.sub].filter(Boolean).join(': ');
    if (text) {
      this.setAttribute('aria-valuetext', text);
    } else {
      this.removeAttribute('aria-valuetext');
    }
  }

  show() {
    this.$.isHidden = false;
  }

  hide(onComplete) {
    this.$.isHidden = true;
    if (onComplete) {
      setTimeout(onComplete, 350);
    }
  }

  setProgress(pct, phase, sub = '') {
    let value = Number(pct);
    this.$.pct = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
    this.$.phase = phase || '';
    this.$.sub = sub || '';
  }
}

LoadingOverlay.template = template;
LoadingOverlay.rootStyles = css;
LoadingOverlay.reg('sn-loading-overlay');

export default LoadingOverlay;
