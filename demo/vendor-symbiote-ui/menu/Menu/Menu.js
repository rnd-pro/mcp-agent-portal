import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { setupRovingFocus } from '../../ui/roving-focus.js';
import { menuTemplate, menuItemTemplate, menuSeparatorTemplate, menuGroupTemplate, dropdownTemplate } from './Menu.tpl.js';
import css from './Menu.css.js';

export class Menu extends Symbiote {
  #cleanupRoving = null;

  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
  }

  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'menu');
    }
    this.#cleanupRoving = setupRovingFocus(this, 'sn-menu-item', {
      onFocusChange: () => {}
    });
  }

  disconnectedCallback() {
    this.#cleanupRoving?.();
    super.disconnectedCallback?.();
  }
}

Menu.template = menuTemplate;
Menu.rootStyles = css;
Menu.reg('sn-menu');

export class MenuItem extends Symbiote {
  static observedAttributes = ['disabled', 'checked', 'icon', 'shortcut'];

  init$ = {
    disabled: false,
    checked: false,
    icon: '',
    shortcut: '',
    hasIconOrCheck: false,
  };

  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
  }

  #onKeyDown = (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      this.click();
    }
  };

  #onClick = (e) => {
    if (this.$.disabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    this.dispatchEvent(new CustomEvent('sn-menu-item-select', {
      bubbles: true,
      composed: true,
      detail: {
        checked: this.$.checked,
        shortcut: this.$.shortcut,
      }
    }));
  };

  connectedCallback() {
    super.connectedCallback?.();
    this.$.disabled = this.disabled;
    this.$.checked = this.checked;
    this.$.icon = this.icon;
    this.$.shortcut = this.shortcut;
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', this.checked ? 'menuitemcheckbox' : 'menuitem');
    }
    this.setAttribute('aria-disabled', String(this.$.disabled));
    if (this.$.checked) {
      this.setAttribute('aria-checked', 'true');
    }
    if (!this.hasAttribute('tabindex')) {
      this.setAttribute('tabindex', '-1');
    }

    this.addEventListener('keydown', this.#onKeyDown);
    this.addEventListener('click', this.#onClick);
    this.#syncIcons();
  }

  disconnectedCallback() {
    this.removeEventListener('keydown', this.#onKeyDown);
    this.removeEventListener('click', this.#onClick);
    super.disconnectedCallback?.();
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(value) {
    this.toggleAttribute('disabled', Boolean(value));
  }

  get checked() {
    return this.hasAttribute('checked');
  }

  set checked(value) {
    this.toggleAttribute('checked', Boolean(value));
  }

  get icon() {
    return this.getAttribute('icon') || '';
  }

  set icon(value) {
    this.setAttribute('icon', String(value));
  }

  get shortcut() {
    return this.getAttribute('shortcut') || '';
  }

  set shortcut(value) {
    this.setAttribute('shortcut', String(value));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (!this.isConnected) return;
    if (name === 'disabled') {
      this.$.disabled = newValue !== null;
      this.setAttribute('aria-disabled', String(this.$.disabled));
    } else if (name === 'checked') {
      this.$.checked = newValue !== null;
      this.setAttribute('role', this.$.checked ? 'menuitemcheckbox' : 'menuitem');
      this.setAttribute('aria-checked', String(this.$.checked));
      this.#syncIcons();
    } else if (name === 'icon') {
      this.$.icon = newValue || '';
      this.#syncIcons();
    } else if (name === 'shortcut') {
      this.$.shortcut = newValue || '';
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  #syncIcons() {
    const list = [];
    if (this.$.icon) list.push(this.$.icon);
    if (this.$.checked) list.push('check');
    if (list.length > 0) {
      ensureMaterialSymbols(list);
    }
    this.$.hasIconOrCheck = Boolean(this.$.icon || this.$.checked);
  }
}

MenuItem.template = menuItemTemplate;
MenuItem.reg('sn-menu-item');

export class MenuSeparator extends Symbiote {
  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'separator');
    }
  }
}

MenuSeparator.template = menuSeparatorTemplate;
MenuSeparator.reg('sn-menu-separator');

export class MenuGroup extends Symbiote {
  static observedAttributes = ['label'];

  init$ = {
    label: '',
  };

  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.$.label = this.getAttribute('label') || '';
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'group');
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (!this.isConnected) return;
    if (name === 'label') {
      this.$.label = newValue || '';
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }
}

MenuGroup.template = menuGroupTemplate;
MenuGroup.reg('sn-menu-group');

export class Dropdown extends Symbiote {
  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
  }

  onTriggerClick(event) {
    event.stopPropagation();
    const popover = this.querySelector('.sn-dropdown-popover');
    // The trigger wrapper becomes the popover's implicit anchor (per-instance, no
    // document-global anchor-name), so position-area resolves against this dropdown.
    popover?.togglePopover({ source: this.querySelector('.sn-dropdown-trigger') });
  }

  renderCallback() {
    super.renderCallback?.();
    // Selecting an item dismisses the menu, matching native <select>/popover UX.
    this.addEventListener('sn-menu-item-select', () => {
      this.querySelector('.sn-dropdown-popover')?.hidePopover?.();
    });
  }
}

Dropdown.template = dropdownTemplate;
Dropdown.reg('sn-dropdown');
