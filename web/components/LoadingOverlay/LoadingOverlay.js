import { Symbiote } from '@symbiotejs/symbiote';
import template from './LoadingOverlay.tpl.js';
import css from './LoadingOverlay.css.js';

export class LoadingOverlay extends Symbiote {
  init$ = {
    pct: 0,
    phase: 'Initializing…',
    sub: '',
    hidden: 'false'
  };

  show() {
    this.$.hidden = 'false';
  }

  hide(onComplete) {
    this.$.hidden = 'true';
    setTimeout(() => {
      if (onComplete) onComplete();
    }, 350);
  }

  setProgress(pct, phase, sub = '') {
    this.$.pct = pct;
    this.$.phase = phase;
    this.$.sub = sub;
  }
}

LoadingOverlay.template = template;
LoadingOverlay.rootStyles = css;
LoadingOverlay.reg('loading-overlay');
