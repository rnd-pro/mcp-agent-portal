import Symbiote from '@symbiotejs/symbiote';
import template from './Avatar.tpl.js';
import css from './Avatar.css.js';

export class Avatar extends Symbiote {
  static observedAttributes = ['src', 'initials', 'shape', 'status'];

  init$ = {
    src: '',
    initials: '',
    shape: 'circle',
    status: '',
    onImgError: () => {
      this.$.src = '';
    }
  };

  connectedCallback() {
    super.connectedCallback?.();
    // Hydrate $ from pre-set attributes
    if (this.hasAttribute('src')) {
      this.$.src = this.getAttribute('src');
    }
    if (this.hasAttribute('initials')) {
      this.$.initials = this.getAttribute('initials');
    }
    if (this.hasAttribute('shape')) {
      this.$.shape = this.getAttribute('shape');
    }
    if (this.hasAttribute('status')) {
      this.$.status = this.getAttribute('status');
    }
    this.#syncState();
  }

  get src() {
    return this.getAttribute('src') || '';
  }

  set src(val) {
    this.setAttribute('src', val);
  }

  get initials() {
    return this.getAttribute('initials') || '';
  }

  set initials(val) {
    this.setAttribute('initials', val);
  }

  get shape() {
    return this.getAttribute('shape') || 'circle';
  }

  set shape(val) {
    this.setAttribute('shape', val);
  }

  get status() {
    return this.getAttribute('status') || '';
  }

  set status(val) {
    this.setAttribute('status', val);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (!this.isConnected) return;
    if (name === 'src') {
      this.$.src = newValue || '';
    } else if (name === 'initials') {
      this.$.initials = newValue || '';
    } else if (name === 'shape') {
      this.$.shape = newValue || 'circle';
      this.#syncState();
    } else if (name === 'status') {
      this.$.status = newValue || '';
      this.#syncState();
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  #syncState() {
    this.setAttribute('shape', this.$.shape);
    if (this.$.status) {
      this.setAttribute('status', this.$.status);
    } else {
      this.removeAttribute('status');
    }
  }
}

Avatar.template = template;
Avatar.rootStyles = css;
Avatar.reg('sn-avatar');

export default Avatar;
