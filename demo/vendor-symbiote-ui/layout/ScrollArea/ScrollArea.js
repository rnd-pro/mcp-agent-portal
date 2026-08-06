import Symbiote from '@symbiotejs/symbiote';
import template from './ScrollArea.tpl.js';
import css from './ScrollArea.css.js';

class ScrollArea extends Symbiote {
  #resizeObserver = null;
  #isDraggingV = false;
  #isDraggingH = false;
  #dragStartY = 0;
  #dragStartX = 0;
  #dragStartScrollTop = 0;
  #dragStartScrollLeft = 0;

  #onScroll = () => {
    this.#updateScrollbars();
    this.#emitScroll();
  };

  #onVThumbMouseDown = (event) => {
    event.preventDefault();
    this.#isDraggingV = true;
    this.#dragStartY = event.clientY;
    this.#dragStartScrollTop = this.ref.viewport?.scrollTop || 0;
    this.ref.vScrollbar?.setAttribute('data-active', '');

    window.addEventListener('mousemove', this.#onVThumbMouseMove);
    window.addEventListener('mouseup', this.#onVThumbMouseUp);
  };

  #onVThumbMouseMove = (event) => {
    if (!this.#isDraggingV || !this.ref.viewport) return;
    const deltaY = event.clientY - this.#dragStartY;

    const scrollHeight = this.ref.viewport.scrollHeight;
    const clientHeight = this.ref.viewport.clientHeight;
    const trackHeight = this.ref.vScrollbar?.clientHeight || clientHeight;

    const ratio = scrollHeight / trackHeight;
    this.ref.viewport.scrollTop = this.#dragStartScrollTop + deltaY * ratio;
  };

  #onVThumbMouseUp = () => {
    this.#isDraggingV = false;
    this.ref.vScrollbar?.removeAttribute('data-active');
    window.removeEventListener('mousemove', this.#onVThumbMouseMove);
    window.removeEventListener('mouseup', this.#onVThumbMouseUp);
  };

  #onHThumbMouseDown = (event) => {
    event.preventDefault();
    this.#isDraggingH = true;
    this.#dragStartX = event.clientX;
    this.#dragStartScrollLeft = this.ref.viewport?.scrollLeft || 0;
    this.ref.hScrollbar?.setAttribute('data-active', '');

    window.addEventListener('mousemove', this.#onHThumbMouseMove);
    window.addEventListener('mouseup', this.#onHThumbMouseUp);
  };

  #onHThumbMouseMove = (event) => {
    if (!this.#isDraggingH || !this.ref.viewport) return;
    const deltaX = event.clientX - this.#dragStartX;

    const scrollWidth = this.ref.viewport.scrollWidth;
    const clientWidth = this.ref.viewport.clientWidth;
    const trackWidth = this.ref.hScrollbar?.clientWidth || clientWidth;

    const ratio = scrollWidth / trackWidth;
    this.ref.viewport.scrollLeft = this.#dragStartScrollLeft + deltaX * ratio;
  };

  #onHThumbMouseUp = () => {
    this.#isDraggingH = false;
    this.ref.hScrollbar?.removeAttribute('data-active');
    window.removeEventListener('mousemove', this.#onHThumbMouseMove);
    window.removeEventListener('mouseup', this.#onHThumbMouseUp);
  };

  constructor() {
    super();
  }

  get scrollTop() {
    return this.ref.viewport?.scrollTop || 0;
  }

  set scrollTop(val) {
    this.scrollToPosition({ top: val });
  }

  get scrollLeft() {
    return this.ref.viewport?.scrollLeft || 0;
  }

  set scrollLeft(val) {
    this.scrollToPosition({ left: val });
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.ref.viewport?.addEventListener('scroll', this.#onScroll);
    this.ref.vThumb?.addEventListener('mousedown', this.#onVThumbMouseDown);
    this.ref.hThumb?.addEventListener('mousedown', this.#onHThumbMouseDown);

    if (typeof ResizeObserver !== 'undefined' && this.ref.viewport) {
      this.#resizeObserver = new ResizeObserver(() => {
        this.#updateScrollbars();
      });
      this.#resizeObserver.observe(this.ref.viewport);
      // Observe children inside slotted area
      Array.from(this.children).forEach(child => {
        this.#resizeObserver.observe(child);
      });
    }

    this.#updateScrollbars();
  }

  scrollToPosition({ top, left } = {}) {
    const viewport = this.ref.viewport;
    if (!viewport) return;
    if (top !== undefined) viewport.scrollTop = Math.max(0, Number(top) || 0);
    if (left !== undefined) viewport.scrollLeft = Math.max(0, Number(left) || 0);
    this.#updateScrollbars();
    this.#emitScroll();
  }

  disconnectedCallback() {
    this.ref.viewport?.removeEventListener('scroll', this.#onScroll);
    this.ref.vThumb?.removeEventListener('mousedown', this.#onVThumbMouseDown);
    this.ref.hThumb?.removeEventListener('mousedown', this.#onHThumbMouseDown);
    window.removeEventListener('mousemove', this.#onVThumbMouseMove);
    window.removeEventListener('mouseup', this.#onVThumbMouseUp);
    window.removeEventListener('mousemove', this.#onHThumbMouseMove);
    window.removeEventListener('mouseup', this.#onHThumbMouseUp);
    this.#resizeObserver?.disconnect();
    super.disconnectedCallback?.();
  }

  #updateScrollbars() {
    const viewport = this.ref.viewport;
    if (!viewport) return;

    const scrollHeight = viewport.scrollHeight;
    const clientHeight = viewport.clientHeight;
    const scrollWidth = viewport.scrollWidth;
    const clientWidth = viewport.clientWidth;

    // Vertical Scrollbar
    if (scrollHeight > clientHeight) {
      this.ref.vScrollbar?.style.setProperty('display', 'block');
      const thumbHeight = Math.max(20, (clientHeight / scrollHeight) * clientHeight);
      const thumbTop = (viewport.scrollTop / scrollHeight) * clientHeight;

      if (this.ref.vThumb) {
        this.ref.vThumb.style.height = `${thumbHeight}px`;
        this.ref.vThumb.style.top = `${thumbTop}px`;
      }
    } else {
      this.ref.vScrollbar?.style.setProperty('display', 'none');
    }

    // Horizontal Scrollbar
    if (scrollWidth > clientWidth) {
      this.ref.hScrollbar?.style.setProperty('display', 'block');
      const thumbWidth = Math.max(20, (clientWidth / scrollWidth) * clientWidth);
      const thumbLeft = (viewport.scrollLeft / scrollWidth) * clientWidth;

      if (this.ref.hThumb) {
        this.ref.hThumb.style.width = `${thumbWidth}px`;
        this.ref.hThumb.style.left = `${thumbLeft}px`;
      }
    } else {
      this.ref.hScrollbar?.style.setProperty('display', 'none');
    }
  }

  #emitScroll() {
    const viewport = this.ref.viewport;
    if (!viewport) return;
    this.dispatchEvent(new CustomEvent('sn-scroll-area-scroll', {
      bubbles: true,
      composed: true,
      detail: {
        scrollTop: viewport.scrollTop,
        scrollLeft: viewport.scrollLeft,
        scrollHeight: viewport.scrollHeight,
        scrollWidth: viewport.scrollWidth,
        clientHeight: viewport.clientHeight,
        clientWidth: viewport.clientWidth,
      },
    }));
  }
}

ScrollArea.template = template;
ScrollArea.rootStyles = css;
ScrollArea.reg('sn-scroll-area');

export default ScrollArea;
