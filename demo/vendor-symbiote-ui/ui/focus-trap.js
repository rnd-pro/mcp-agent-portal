export function getFocusableElements(container) {
  if (!container) return [];
  const elements = Array.from(
    container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter(el => {
    if (el.hasAttribute('disabled') || el.disabled) return false;
    if (el.getAttribute('tabindex') === '-1') return false;

    // Server-side environment fallback check
    if (typeof el.getBoundingClientRect !== 'function') return true;

    // Basic visibility check
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  });
  return elements;
}

export class FocusTrap {
  #container;
  #restoreElement = null;
  #options;
  #active = false;

  constructor(container, options = {}) {
    this.#container = container;
    this.#options = options;
  }

  #onKeyDown = (event) => {
    if (event.key !== 'Tab') return;
    const elements = getFocusableElements(this.#container);
    if (elements.length === 0) {
      event.preventDefault();
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];

    let active = document.activeElement;
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }

    if (event.shiftKey) {
      if (active === first || !this.#container.contains(active)) {
        last.focus();
        event.preventDefault();
      }
    } else {
      if (active === last || !this.#container.contains(active)) {
        first.focus();
        event.preventDefault();
      }
    }
  };

  activate() {
    if (this.#active) return;
    this.#active = true;
    if (typeof document !== 'undefined') {
      this.#restoreElement = document.activeElement;
    }

    this.#container.addEventListener('keydown', this.#onKeyDown);

    const elements = getFocusableElements(this.#container);
    if (elements.length > 0) {
      const initialFocus = this.#options.initialFocus;
      if (initialFocus && typeof initialFocus.focus === 'function') {
        initialFocus.focus();
      } else {
        elements[0].focus();
      }
    }
  }

  deactivate() {
    if (!this.#active) return;
    this.#active = false;
    this.#container.removeEventListener('keydown', this.#onKeyDown);

    if (this.#options.restoreFocus !== false && this.#restoreElement && typeof this.#restoreElement.focus === 'function') {
      this.#restoreElement.focus();
    }
    this.#restoreElement = null;
  }
}
