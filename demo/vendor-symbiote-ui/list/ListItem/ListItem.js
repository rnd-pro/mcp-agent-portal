import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import template from './ListItem.tpl.js';
import css from './ListItem.css.js';

function emit(el, type, detail = {}) {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

export class ListItem extends Symbiote {
  static observedAttributes = ['disabled', 'active', 'selected', 'current', 'loading'];

  init$ = {
    label: '',
    description: '',
    icon: '',
    meta: '',
    active: false,
    selected: false,
    current: false,
    disabled: false,
    loading: false,
    item: null,

    onSelect: (event) => {
      if (this.$.disabled || this.$.loading) {
        event.preventDefault();
        return;
      }
      emit(this, 'sn-list-item-select', { item: this.$.item || this.getItemDetail() });
    },

    onKeydown: (event) => {
      if (this.$.disabled || this.$.loading) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      this.$.onSelect(event);
    },
  };

  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
  }

  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(val) { this.toggleAttribute('disabled', Boolean(val)); }

  get active() { return this.hasAttribute('active'); }
  set active(val) { this.toggleAttribute('active', Boolean(val)); }

  get selected() { return this.hasAttribute('selected'); }
  set selected(val) { this.toggleAttribute('selected', Boolean(val)); }

  get current() { return this.hasAttribute('current'); }
  set current(val) { this.toggleAttribute('current', Boolean(val)); }

  get loading() { return this.hasAttribute('loading'); }
  set loading(val) { this.toggleAttribute('loading', Boolean(val)); }

  getItemDetail() {
    return {
      label: this.$.label,
      description: this.$.description,
      icon: this.$.icon,
      meta: this.$.meta,
      active: this.$.active || this.$.selected,
      disabled: this.$.disabled,
      current: this.$.current,
      loading: this.$.loading,
    };
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    const isPresent = newValue !== null;
    switch (name) {
      case 'disabled':
        this.$.disabled = isPresent;
        break;
      case 'active':
        this.$.active = isPresent;
        break;
      case 'selected':
        this.$.selected = isPresent;
        break;
      case 'current':
        this.$.current = isPresent;
        break;
      case 'loading':
        this.$.loading = isPresent;
        break;
      default:
        super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  renderCallback() {
    this.sub('active', (value) => {
      const active = Boolean(value);
      this.toggleAttribute('active', active);
      this.ref.item.setAttribute('aria-selected', String(active));
    });

    this.sub('selected', (value) => {
      const selected = Boolean(value);
      this.toggleAttribute('selected', selected);
      this.ref.item.setAttribute('aria-selected', String(selected));
    });

    this.sub('current', (value) => {
      const current = Boolean(value);
      this.toggleAttribute('current', current);
      if (current) {
        this.ref.item.setAttribute('aria-current', 'true');
      } else {
        this.ref.item.removeAttribute('aria-current');
      }
    });

    this.sub('loading', (value) => {
      const loading = Boolean(value);
      this.toggleAttribute('loading', loading);
      this.ref.item.setAttribute('aria-busy', String(loading));
      const spinner = this.querySelector('.sn-list-item-spinner');
      if (spinner) {
        spinner.hidden = !loading;
      }
    });

    this.sub('disabled', (value) => {
      let disabled = Boolean(value);
      this.toggleAttribute('disabled', disabled);
      this.ref.item.setAttribute('aria-disabled', String(disabled));
      this.ref.item.setAttribute('tabindex', disabled ? '-1' : '0');
      this.ref.item.tabIndex = disabled ? -1 : 0;
    });
  }

  setItem(item = null) {
    this.$.item = item;
    if (!item || typeof item !== 'object') return;

    this.set$({
      label: item.label || '',
      description: item.description || '',
      icon: item.icon || '',
      meta: item.meta || '',
      active: Boolean(item.active || item.selected),
      disabled: Boolean(item.disabled),
      current: Boolean(item.current),
      loading: Boolean(item.loading),
    });
  }
}

ListItem.template = template;
ListItem.rootStyles = css;
ListItem.reg('sn-list-item');

export default ListItem;
