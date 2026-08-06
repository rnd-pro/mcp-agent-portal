import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { setupRovingFocus } from '../../ui/roving-focus.js';
import { navListTemplate, navItemTemplate } from './NavList.tpl.js';
import css from './NavList.css.js';

export class NavList extends Symbiote {
  #cleanupRoving = null;

  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'navigation');
    }
    if (!this.hasAttribute('aria-label') && !this.hasAttribute('aria-labelledby')) {
      this.setAttribute('aria-label', 'Navigation');
    }
    this.#cleanupRoving = setupRovingFocus(this, 'sn-nav-item');
  }

  disconnectedCallback() {
    this.#cleanupRoving?.();
    super.disconnectedCallback?.();
  }
}

NavList.template = navListTemplate;
NavList.rootStyles = css;
NavList.reg('sn-nav-list');

export class NavItem extends Symbiote {
  static observedAttributes = ['active', 'disabled', 'icon', 'badge'];

  init$ = {
    active: false,
    disabled: false,
    icon: '',
    badge: '',
  };

  #onClick = (e) => {
    if (this.$.disabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    this.dispatchEvent(new CustomEvent('sn-nav-select', {
      bubbles: true,
      composed: true,
      detail: {
        active: this.$.active,
        icon: this.$.icon,
        badge: this.$.badge,
      }
    }));
  };

  #onKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    if (this.$.disabled) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    this.click();
  };

  connectedCallback() {
    super.connectedCallback?.();
    this.$.active = this.active;
    this.$.disabled = this.disabled;
    this.$.icon = this.icon;
    this.$.badge = this.badge;
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'link');
    }
    this.#syncCurrent();
    this.setAttribute('aria-disabled', String(this.$.disabled));
    if (!this.hasAttribute('tabindex')) {
      this.setAttribute('tabindex', '-1');
    }
    this.addEventListener('click', this.#onClick);
    this.addEventListener('keydown', this.#onKeyDown);
    this.#syncIcon();
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('keydown', this.#onKeyDown);
    super.disconnectedCallback?.();
  }

  #syncCurrent() {
    if (this.$.active) {
      this.setAttribute('aria-current', 'page');
    } else {
      this.removeAttribute('aria-current');
    }
  }

  get active() {
    return this.hasAttribute('active');
  }

  set active(value) {
    this.toggleAttribute('active', Boolean(value));
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(value) {
    this.toggleAttribute('disabled', Boolean(value));
  }

  get icon() {
    return this.getAttribute('icon') || '';
  }

  set icon(value) {
    this.setAttribute('icon', String(value));
  }

  get badge() {
    return this.getAttribute('badge') || '';
  }

  set badge(value) {
    this.setAttribute('badge', String(value));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (!this.isConnected) return;
    if (name === 'active') {
      this.$.active = newValue !== null;
      this.#syncCurrent();
    } else if (name === 'disabled') {
      this.$.disabled = newValue !== null;
      this.setAttribute('aria-disabled', String(this.$.disabled));
    } else if (name === 'icon') {
      this.$.icon = newValue || '';
      this.#syncIcon();
    } else if (name === 'badge') {
      this.$.badge = newValue || '';
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  #syncIcon() {
    if (this.$.icon) {
      ensureMaterialSymbols([this.$.icon]);
    }
  }
}

NavItem.template = navItemTemplate;
NavItem.reg('sn-nav-item');

export default NavList;
