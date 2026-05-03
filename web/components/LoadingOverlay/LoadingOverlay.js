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
    // Direct DOM fallback — binding may not apply in non-iso host innerHTML contexts
    let el = this.querySelector('.pcb-loader');
    if (el) el.removeAttribute('data-hidden');
  }

  hide(onComplete) {
    this.$.hidden = 'true';
    // Direct DOM fallback
    let el = this.querySelector('.pcb-loader');
    if (el) el.setAttribute('data-hidden', 'true');
    setTimeout(() => {
      if (onComplete) onComplete();
    }, 350);
  }

  setProgress(pct, phase, sub = '') {
    this.$.pct = pct;
    this.$.phase = phase;
    this.$.sub = sub;
    // Direct DOM fallback for progress bar
    let bar = this.querySelector('.pcb-loader-bar');
    if (bar) bar.style.width = pct + '%';
    let phaseEl = this.querySelector('.pcb-loader-phase');
    if (phaseEl) phaseEl.textContent = phase;
    let subEl = this.querySelector('.pcb-loader-sub');
    if (subEl) subEl.textContent = sub;
  }
}

LoadingOverlay.template = template;
LoadingOverlay.rootStyles = css;
LoadingOverlay.reg('loading-overlay');
