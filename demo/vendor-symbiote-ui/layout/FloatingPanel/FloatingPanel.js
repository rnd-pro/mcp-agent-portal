import Symbiote from '@symbiotejs/symbiote';
import template from './FloatingPanel.tpl.js';
import css from './FloatingPanel.css.js';

class FloatingPanel extends Symbiote {
  static observedAttributes = ['label', 'x', 'y', 'width', 'height', 'minimized', 'maximized'];

  #isDragging = false;
  #dragStartX = 0;
  #dragStartY = 0;
  #panelStartX = 0;
  #panelStartY = 0;

  #onHeaderMouseDown = (event) => {
    if (this.maximized || event.target.closest('.sn-floating-action-btn')) return;
    event.preventDefault();
    this.#isDragging = true;

    this.#dragStartX = event.clientX;
    this.#dragStartY = event.clientY;

    const rect = this.getBoundingClientRect();
    this.#panelStartX = rect.left;
    this.#panelStartY = rect.top;

    window.addEventListener('mousemove', this.#onMouseMove);
    window.addEventListener('mouseup', this.#onMouseUp);
  };

  #onMouseMove = (event) => {
    if (!this.#isDragging) return;
    const deltaX = event.clientX - this.#dragStartX;
    const deltaY = event.clientY - this.#dragStartY;

    let targetLeft = this.#panelStartX + deltaX;
    let targetTop = this.#panelStartY + deltaY;

    // Viewport bounds constraints
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelRect = this.getBoundingClientRect();

    targetLeft = Math.max(0, Math.min(targetLeft, viewportWidth - panelRect.width));
    targetTop = Math.max(0, Math.min(targetTop, viewportHeight - panelRect.height));

    this.style.left = `${targetLeft}px`;
    this.style.top = `${targetTop}px`;

    this.setAttribute('x', String(targetLeft));
    this.setAttribute('y', String(targetTop));
  };

  #onMouseUp = () => {
    this.#isDragging = false;
    window.removeEventListener('mousemove', this.#onMouseMove);
    window.removeEventListener('mouseup', this.#onMouseUp);
  };

  #onClose = () => {
    this.dispatchEvent(new CustomEvent('sn-floating-close', { bubbles: true, composed: true }));
    this.remove();
  };

  #onMinimize = () => {
    this.minimized = !this.minimized;
    this.dispatchEvent(new CustomEvent('sn-floating-minimize', { bubbles: true, composed: true, detail: { minimized: this.minimized } }));
  };

  #onMaximize = () => {
    this.maximized = !this.maximized;
    this.dispatchEvent(new CustomEvent('sn-floating-maximize', { bubbles: true, composed: true, detail: { maximized: this.maximized } }));
  };

  constructor() {
    super();
    this.init$ = {
      label: 'Floating Window',
    };
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.ref.header?.addEventListener('mousedown', this.#onHeaderMouseDown);
    this.ref.closeBtn?.addEventListener('click', this.#onClose);
    this.ref.minBtn?.addEventListener('click', this.#onMinimize);
    this.ref.maxBtn?.addEventListener('click', this.#onMaximize);

    this.#syncState();
  }

  disconnectedCallback() {
    this.ref.header?.removeEventListener('mousedown', this.#onHeaderMouseDown);
    this.ref.closeBtn?.removeEventListener('click', this.#onClose);
    this.ref.minBtn?.removeEventListener('click', this.#onMinimize);
    this.ref.maxBtn?.removeEventListener('click', this.#onMaximize);
    window.removeEventListener('mousemove', this.#onMouseMove);
    window.removeEventListener('mouseup', this.#onMouseUp);
    super.disconnectedCallback?.();
  }

  get label() {
    return this.getAttribute('label') || 'Floating Window';
  }

  set label(val) {
    this.setAttribute('label', String(val));
  }

  get x() {
    return Number(this.getAttribute('x')) || 100;
  }

  set x(val) {
    this.setAttribute('x', String(val));
  }

  get y() {
    return Number(this.getAttribute('y')) || 100;
  }

  set y(val) {
    this.setAttribute('y', String(val));
  }

  get width() {
    return Number(this.getAttribute('width')) || 300;
  }

  set width(val) {
    this.setAttribute('width', String(val));
  }

  get height() {
    return Number(this.getAttribute('height')) || 200;
  }

  set height(val) {
    this.setAttribute('height', String(val));
  }

  get minimized() {
    return this.hasAttribute('minimized');
  }

  set minimized(val) {
    this.toggleAttribute('minimized', Boolean(val));
  }

  get maximized() {
    return this.hasAttribute('maximized');
  }

  set maximized(val) {
    this.toggleAttribute('maximized', Boolean(val));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this.#syncState();
  }

  #syncState() {
    this.$.label = this.label;

    if (!this.maximized) {
      this.style.left = `${this.x}px`;
      this.style.top = `${this.y}px`;
      this.style.width = `${this.width}px`;
      if (!this.minimized) {
        this.style.height = `${this.height}px`;
      } else {
        this.style.height = 'auto';
      }
    } else {
      this.style.left = '0';
      this.style.top = '0';
      this.style.width = '100vw';
      this.style.height = '100vh';
    }
  }
}

FloatingPanel.template = template;
FloatingPanel.rootStyles = css;
FloatingPanel.reg('sn-floating-panel');

export default FloatingPanel;
