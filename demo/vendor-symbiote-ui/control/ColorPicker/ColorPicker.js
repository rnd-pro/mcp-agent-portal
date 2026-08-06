import Symbiote from '@symbiotejs/symbiote';
import template from './ColorPicker.tpl.js';
import css from './ColorPicker.css.js';

class ColorPicker extends Symbiote {
  static observedAttributes = ['value', 'disabled', 'name'];

  #isOpen = false;
  #hue = 0;
  #saturation = 100;
  #value = 100;
  #isDragging = false;

  #onTriggerClick = (event) => {
    if (this.disabled) return;
    this.#isOpen ? this.close() : this.open();
  };

  #onOutsideClick = (event) => {
    if (this.#isOpen && !this.contains(event.target)) {
      this.close();
    }
  };

  #onHueChange = (event) => {
    this.#hue = Number(event.target.value);
    this.#updateFromHsv();
  };

  #onHexInput = (event) => {
    const val = event.target.value;
    if (this.#isValidHex(val)) {
      this.#commitUserValue(val);
    }
  };

  #onCanvasMouseDown = (event) => {
    if (this.disabled) return;
    this.#isDragging = true;
    this.#handleCanvasMove(event);
    window.addEventListener('mousemove', this.#onCanvasMouseMove);
    window.addEventListener('mouseup', this.#onCanvasMouseUp);
  };

  #onCanvasMouseMove = (event) => {
    if (this.#isDragging) {
      this.#handleCanvasMove(event);
    }
  };

  #onCanvasMouseUp = () => {
    this.#isDragging = false;
    window.removeEventListener('mousemove', this.#onCanvasMouseMove);
    window.removeEventListener('mouseup', this.#onCanvasMouseUp);
  };

  #onCanvasKeyDown = (event) => {
    if (this.disabled) return;
    const step = event.shiftKey ? 10 : 1;
    let handled = true;
    switch (event.key) {
      case 'ArrowRight': this.#saturation = Math.min(100, this.#saturation + step); break;
      case 'ArrowLeft': this.#saturation = Math.max(0, this.#saturation - step); break;
      case 'ArrowUp': this.#value = Math.min(100, this.#value + step); break;
      case 'ArrowDown': this.#value = Math.max(0, this.#value - step); break;
      case 'Home': this.#saturation = 0; break;
      case 'End': this.#saturation = 100; break;
      default: handled = false;
    }
    if (handled) {
      event.preventDefault();
      this.#updateFromHsv();
    }
  };

  constructor() {
    super();
    this.init$ = {
      value: '#ffffff',
    };
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.ref.trigger?.addEventListener('click', this.#onTriggerClick);
    this.ref.hueSlider?.addEventListener('input', this.#onHueChange);
    this.ref.hexInput?.addEventListener('input', this.#onHexInput);
    this.ref.canvas?.addEventListener('mousedown', this.#onCanvasMouseDown);
    this.ref.canvas?.addEventListener('keydown', this.#onCanvasKeyDown);
    document.addEventListener('click', this.#onOutsideClick);

    this.#renderPresets();
    this.#syncValue();
  }

  disconnectedCallback() {
    this.ref.trigger?.removeEventListener('click', this.#onTriggerClick);
    this.ref.hueSlider?.removeEventListener('input', this.#onHueChange);
    this.ref.hexInput?.removeEventListener('input', this.#onHexInput);
    this.ref.canvas?.removeEventListener('mousedown', this.#onCanvasMouseDown);
    this.ref.canvas?.removeEventListener('keydown', this.#onCanvasKeyDown);
    document.removeEventListener('click', this.#onOutsideClick);
    window.removeEventListener('mousemove', this.#onCanvasMouseMove);
    window.removeEventListener('mouseup', this.#onCanvasMouseUp);
    super.disconnectedCallback?.();
  }

  get value() {
    return this.getAttribute('value') || '#ffffff';
  }

  set value(val) {
    if (this.#isValidHex(val)) {
      this.setAttribute('value', val);
    }
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    this.toggleAttribute('disabled', Boolean(val));
  }

  get name() {
    return this.getAttribute('name') || '';
  }

  set name(val) {
    this.setAttribute('name', String(val));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'value') {
      this.#syncValue();
    } else {
      this.#syncControlAttributes();
    }
  }

  open() {
    if (this.disabled || this.#isOpen) return;
    this.#isOpen = true;
    this.ref.trigger?.setAttribute('aria-expanded', 'true');
    this.ref.dropdown?.setAttribute('data-visible', '');
    this.dispatchEvent(new CustomEvent('sn-color-picker-open', { bubbles: true, composed: true }));
  }

  close() {
    if (!this.#isOpen) return;
    this.#isOpen = false;
    this.ref.trigger?.setAttribute('aria-expanded', 'false');
    this.ref.dropdown?.removeAttribute('data-visible');
    this.dispatchEvent(new CustomEvent('sn-color-picker-close', { bubbles: true, composed: true }));
  }

  #syncValue() {
    const val = this.value;
    this.$.value = val;

    if (this.ref.previewSwatch) {
      this.ref.previewSwatch.style.backgroundColor = val;
    }
    if (this.ref.hexInput) {
      this.ref.hexInput.value = val;
    }
    if (this.ref.nativeInput) {
      this.ref.nativeInput.value = val;
    }
    this.#syncControlAttributes();

    const { h, s, v } = this.#hexToHsv(val);
    this.#hue = h;
    this.#saturation = s;
    this.#value = v;

    this.#updateVisuals();
  }

  #syncControlAttributes() {
    const disabled = this.disabled;
    if (this.ref.trigger) this.ref.trigger.disabled = disabled;
    if (this.ref.hueSlider) this.ref.hueSlider.disabled = disabled;
    if (this.ref.hexInput) this.ref.hexInput.disabled = disabled;
    if (this.ref.nativeInput) {
      this.ref.nativeInput.disabled = disabled;
      this.ref.nativeInput.name = this.name;
    }
    if (this.ref.canvas) {
      this.ref.canvas.setAttribute('aria-disabled', String(disabled));
      this.ref.canvas.tabIndex = disabled ? -1 : 0;
    }
  }

  #handleCanvasMove(event) {
    const canvas = this.ref.canvas;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    let x = event.clientX - rect.left;
    let y = event.clientY - rect.top;

    x = Math.max(0, Math.min(x, rect.width));
    y = Math.max(0, Math.min(y, rect.height));

    this.#saturation = (x / rect.width) * 100;
    this.#value = (1 - y / rect.height) * 100;

    this.#updateFromHsv();
  }

  #updateFromHsv() {
    const hex = this.#hsvToHex(this.#hue, this.#saturation, this.#value);
    this.#commitUserValue(hex);
  }

  #commitUserValue(hex) {
    const oldValue = this.value;
    this.value = hex;
    this.#updateVisuals();
    if (oldValue !== hex) {
      this.#emitChange(hex);
    }
  }

  #emitChange(value) {
    const detail = { value };
    this.dispatchEvent(new CustomEvent('sn-control-change', { bubbles: true, composed: true, detail }));
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, composed: true, detail }));
  }

  #updateVisuals() {
    if (this.ref.hueSlider) {
      this.ref.hueSlider.value = String(this.#hue);
      this.ref.hueSlider.setAttribute('aria-valuetext', `${Math.round(this.#hue)} degrees`);
    }

    if (this.ref.canvas) {
      const s = Math.round(this.#saturation);
      const v = Math.round(this.#value);
      this.ref.canvas.setAttribute('aria-valuenow', String(s));
      this.ref.canvas.setAttribute('aria-valuetext', `Saturation ${s}%, brightness ${v}%`);
    }

    if (this.ref.canvasBg) {
      this.ref.canvasBg.style.backgroundColor = `hsl(${this.#hue}, 100%, 50%)`;
    }

    if (this.ref.handle && this.ref.canvas) {
      const rect = this.ref.canvas.getBoundingClientRect();
      const x = (this.#saturation / 100) * rect.width;
      const y = (1 - this.#value / 100) * rect.height;
      this.ref.handle.style.left = `${x}px`;
      this.ref.handle.style.top = `${y}px`;
    }
  }

  #renderPresets() {
    const presets = this.ref.presets;
    if (!presets) return;

    presets.innerHTML = '';
    const colors = [
      '#ff0000', '#00ff00', '#0000ff', '#ffff00',
      '#ff00ff', '#00ffff', '#ffffff', '#000000'
    ];

    colors.forEach(color => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'sn-color-preset-swatch';
      swatch.style.backgroundColor = color;
      swatch.setAttribute('aria-label', color);
      swatch.addEventListener('click', (event) => {
        event.stopPropagation();
        if (this.disabled) return;
        this.#commitUserValue(color);
      });
      presets.appendChild(swatch);
    });
  }

  #isValidHex(hex) {
    return /^#[0-9A-F]{6}$/i.test(hex);
  }

  #hexToHsv(hex) {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;

    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;

    let d = max - min;
    s = max === 0 ? 0 : d / max;

    if (max === min) {
      h = 0;
    } else {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) };
  }

  #hsvToHex(h, s, v) {
    h /= 360;
    s /= 100;
    v /= 100;

    let r, g, b;
    let i = Math.floor(h * 6);
    let f = h * 6 - i;
    let p = v * (1 - s);
    let q = v * (1 - f * s);
    let t = v * (1 - (1 - f) * s);

    switch (i % 6) {
      case 0: r = v, g = t, b = p; break;
      case 1: r = q, g = v, b = p; break;
      case 2: r = p, g = v, b = t; break;
      case 3: r = p, g = q, b = v; break;
      case 4: r = t, g = p, b = v; break;
      case 5: r = v, g = p, b = q; break;
    }

    const toHex = (n) => String(Math.round(n * 255).toString(16)).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
}

ColorPicker.template = template;
ColorPicker.rootStyles = css;
ColorPicker.reg('sn-color-picker');

export default ColorPicker;
