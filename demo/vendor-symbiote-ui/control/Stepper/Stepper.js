import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import template from './Stepper.tpl.js';
import css from './Stepper.css.js';

export class Stepper extends Symbiote {
  static observedAttributes = ['active-step'];

  init$ = {
    activeStep: 0,
    stepsHtml: '',
  };

  #steps = [];

  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'list');
    }
    if (!this.hasAttribute('aria-label')) {
      this.setAttribute('aria-label', 'Progress');
    }
    this.$.activeStep = this.activeStep;
    this.addEventListener('click', this.#onStepClick);
    this.addEventListener('keydown', this.#onStepKeydown);
    this.#render();
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#onStepClick);
    this.removeEventListener('keydown', this.#onStepKeydown);
    super.disconnectedCallback?.();
  }

  get activeStep() {
    return Number(this.getAttribute('active-step') || 0);
  }

  set activeStep(val) {
    this.setAttribute('active-step', String(val));
  }

  setSteps(steps = []) {
    this.#steps = steps;
    this.#render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (!this.isConnected) return;
    if (name === 'active-step') {
      this.$.activeStep = Number(newValue || 0);
      this.#render();
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  #onStepClick(e) {
    this.#activateStep(e.target.closest('.sn-stepper-step'));
  }

  #onStepKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    const stepEl = e.target.closest('.sn-stepper-step');
    if (!stepEl) return;
    e.preventDefault();
    this.#activateStep(stepEl);
  }

  #activateStep(stepEl) {
    if (!stepEl) return;
    const index = Number(stepEl.dataset.index);
    if (!Number.isInteger(index)) return;

    this.dispatchEvent(new CustomEvent('sn-step-change', {
      bubbles: true,
      composed: true,
      detail: { index }
    }));
  }

  #render() {
    const active = this.$.activeStep;
    const steps = this.#steps;
    if (steps.length === 0) {
      this.$.stepsHtml = '';
      return;
    }

    const icons = steps.map(s => s.icon).filter(Boolean);
    icons.push('check');
    ensureMaterialSymbols(icons);

    let htmlStr = '';
    steps.forEach((step, idx) => {
      let state = 'pending';
      if (idx < active) {
        state = 'completed';
      } else if (idx === active) {
        state = 'active';
      }

      let stepLabel = typeof step === 'string' ? step : (step.label || '');
      let stepIcon = typeof step === 'object' && step.icon ? step.icon : '';
      let indicator = '';

      if (state === 'completed') {
        indicator = '<span class="material-symbols-outlined">check</span>';
      } else if (stepIcon) {
        indicator = `<span class="material-symbols-outlined">${stepIcon}</span>`;
      } else {
        indicator = `${idx + 1}`;
      }

      const isLast = idx === steps.length - 1;
      const lineHtml = isLast ? '' : '<div class="sn-stepper-line"></div>';

      const stateText = state === 'completed' ? 'completed' : state === 'active' ? 'current' : 'not completed';
      const accessibleName = `Step ${idx + 1}${stepLabel ? `: ${stepLabel}` : ''}, ${stateText}`;
      const currentAttr = state === 'active' ? ' aria-current="step"' : '';

      htmlStr += `
        <div class="sn-stepper-step" data-state="${state}" data-index="${idx}" role="button" tabindex="0" aria-label="${accessibleName}"${currentAttr}>
          <span class="sn-stepper-indicator" aria-hidden="true">${indicator}</span>
          <span class="sn-stepper-label" aria-hidden="true">${stepLabel}</span>
          ${lineHtml}
        </div>
      `;
    });

    this.$.stepsHtml = htmlStr;
  }
}

Stepper.template = template;
Stepper.rootStyles = css;
Stepper.reg('sn-stepper');

export default Stepper;
