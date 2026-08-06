import Symbiote from '@symbiotejs/symbiote';
import template from './Carousel.tpl.js';
import css from './Carousel.css.js';

class Carousel extends Symbiote {
  static observedAttributes = ['active-index'];

  #slides = [];
  #observer = null;
  #currentIndex = 0;

  #onScroll = () => {
    const viewport = this.ref.viewport;
    if (!viewport) return;

    const width = viewport.clientWidth || 1;
    const index = Math.round(viewport.scrollLeft / width);

    if (index !== this.#currentIndex && index >= 0 && index < this.#slides.length) {
      this.#currentIndex = index;
      this.setAttribute('active-index', String(index));
      this.#updatePagination();
      this.dispatchEvent(new CustomEvent('sn-carousel-change', {
        bubbles: true,
        composed: true,
        detail: { index }
      }));
    }
  };

  #onPrev = () => {
    const viewport = this.ref.viewport;
    if (viewport) {
      viewport.scrollLeft -= viewport.clientWidth;
    }
  };

  #onNext = () => {
    const viewport = this.ref.viewport;
    if (viewport) {
      viewport.scrollLeft += viewport.clientWidth;
    }
  };

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.ref.viewport?.addEventListener('scroll', this.#onScroll);
    this.ref.prevBtn?.addEventListener('click', this.#onPrev);
    this.ref.nextBtn?.addEventListener('click', this.#onNext);

    this.#observer = new MutationObserver(() => {
      this.#syncSlides();
    });
    this.#observer.observe(this, { childList: true });

    this.#syncSlides();
  }

  disconnectedCallback() {
    this.ref.viewport?.removeEventListener('scroll', this.#onScroll);
    this.ref.prevBtn?.removeEventListener('click', this.#onPrev);
    this.ref.nextBtn?.removeEventListener('click', this.#onNext);
    this.#observer?.disconnect();
    super.disconnectedCallback?.();
  }

  get activeIndex() {
    return Number(this.getAttribute('active-index')) || 0;
  }

  set activeIndex(val) {
    this.setAttribute('active-index', String(val));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'active-index') {
      const idx = Number(newValue) || 0;
      if (idx !== this.#currentIndex) {
        this.#currentIndex = idx;
        this.#scrollToIndex(idx);
      }
    }
  }

  #syncSlides() {
    this.#slides = Array.from(this.children);
    this.#renderPagination();
  }

  #renderPagination() {
    const container = this.ref.pagination;
    if (!container) return;

    container.innerHTML = '';
    this.#slides.forEach((slide, index) => {
      const dot = document.createElement('button');
      dot.className = 'sn-carousel-dot';
      dot.type = 'button';
      dot.setAttribute('aria-label', `Go to slide ${index + 1}`);
      if (index === this.#currentIndex) {
        dot.setAttribute('data-active', '');
      }

      dot.addEventListener('click', () => {
        this.activeIndex = index;
      });

      container.appendChild(dot);
    });
  }

  #updatePagination() {
    const container = this.ref.pagination;
    if (!container) return;

    Array.from(container.children).forEach((dot, index) => {
      if (index === this.#currentIndex) {
        dot.setAttribute('data-active', '');
      } else {
        dot.removeAttribute('data-active');
      }
    });
  }

  #scrollToIndex(index) {
    const viewport = this.ref.viewport;
    if (!viewport) return;

    const width = viewport.clientWidth;
    viewport.scrollLeft = width * index;
  }
}

Carousel.template = template;
Carousel.rootStyles = css;
Carousel.reg('sn-carousel');

export default Carousel;
