import Symbiote from '@symbiotejs/symbiote';
import template from './Tour.tpl.js';
import css from './Tour.css.js';
import { positionOverlay } from '../../ui/overlay-positioner.js';

class Tour extends Symbiote {
  static observedAttributes = ['active-step'];

  #steps = [];
  #currentIndex = -1;
  #highlightedEl = null;

  #onClose = () => {
    this.close();
    this.dispatchEvent(new CustomEvent('sn-tour-close', { bubbles: true, composed: true }));
  };

  #onPrev = () => {
    if (this.#currentIndex > 0) {
      this.activeStep = this.#currentIndex - 1;
    }
  };

  #onNext = () => {
    if (this.#currentIndex < this.#steps.length - 1) {
      this.activeStep = this.#currentIndex + 1;
    } else {
      this.close();
      this.dispatchEvent(new CustomEvent('sn-tour-complete', { bubbles: true, composed: true }));
    }
  };

  constructor() {
    super();
    this.init$ = {
      currentTitle: '',
      currentDescription: '',
      progressText: '',
      nextBtnLabel: 'Next',
    };
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.ref.closeBtn?.addEventListener('click', this.#onClose);
    this.ref.prevBtn?.addEventListener('click', this.#onPrev);
    this.ref.nextBtn?.addEventListener('click', this.#onNext);

    if (this.hasAttribute('active-step')) {
      this.#currentIndex = Number(this.getAttribute('active-step')) || 0;
    }
  }

  disconnectedCallback() {
    this.ref.closeBtn?.removeEventListener('click', this.#onClose);
    this.ref.prevBtn?.removeEventListener('click', this.#onPrev);
    this.ref.nextBtn?.removeEventListener('click', this.#onNext);
    this.#clearHighlight();
    super.disconnectedCallback?.();
  }

  get activeStep() {
    return Number(this.getAttribute('active-step')) ?? 0;
  }

  set activeStep(val) {
    this.setAttribute('active-step', String(val));
  }

  setSteps(steps) {
    this.#steps = steps.map(s => ({
      title: String(s.title || ''),
      description: String(s.description || ''),
      target: String(s.target || ''),
    }));
    if (this.#currentIndex === -1 && this.#steps.length > 0) {
      this.activeStep = 0;
    } else {
      this.#syncStep();
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'active-step') {
      this.#currentIndex = Number(newValue) || 0;
      this.#syncStep();
    }
  }

  close() {
    this.ref.popover?.removeAttribute('data-visible');
    this.#clearHighlight();
  }

  #syncStep() {
    let step = this.#steps[this.#currentIndex];
    let popover = this.ref.popover;

    if (!step || !popover) {
      this.close();
      return;
    }

    this.$.currentTitle = step.title;
    this.$.currentDescription = step.description;
    this.$.progressText = `${this.#currentIndex + 1} / ${this.#steps.length}`;
    this.$.nextBtnLabel = this.#currentIndex === this.#steps.length - 1 ? 'Finish' : 'Next';

    if (this.ref.prevBtn) {
      this.ref.prevBtn.hidden = this.#currentIndex === 0;
    }

    this.#clearHighlight();

    // Position next to target
    let target = document.querySelector(step.target);
    if (target) {
      this.#highlightedEl = target;
      target.style.outline = '2px solid var(--sn-sys-accent)';
      target.style.outlineOffset = '2px';

      popover.setAttribute('data-visible', '');

      // Defer overlay positioning until rendered
      setTimeout(() => {
        positionOverlay(target, popover, 'bottom-start');
        let popoverRect = popover.getBoundingClientRect();
        this.style.left = `${popoverRect.left}px`;
        this.style.top = `${popoverRect.top}px`;
        // Keep popover styled locally inside the host
        popover.style.position = 'static';
      }, 0);
    } else {
      // Center popover in viewport if target is not found
      popover.setAttribute('data-visible', '');
      this.style.left = '50%';
      this.style.top = '50%';
      this.style.transform = 'translate(-50%, -50%)';
      popover.style.position = 'static';
    }

    this.dispatchEvent(new CustomEvent('sn-tour-change', {
      bubbles: true,
      composed: true,
      detail: { step: this.#currentIndex }
    }));
  }

  #clearHighlight() {
    if (this.#highlightedEl) {
      this.#highlightedEl.style.outline = '';
      this.#highlightedEl.style.outlineOffset = '';
      this.#highlightedEl = null;
    }
  }
}

Tour.template = template;
Tour.rootStyles = css;
Tour.reg('sn-tour');

export default Tour;
