import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { breadcrumbTemplate, breadcrumbItemTemplate } from './Breadcrumb.tpl.js';
import css from './Breadcrumb.css.js';

export class SnBreadcrumbItem extends Symbiote {
  static observedAttributes = ['label', 'icon', 'is-first', 'is-active'];

  init$ = {
    label: '',
    icon: '',
    isFirst: false,
    isActive: false,
  };

  renderCallback() {
    if (this.$.icon) {
      ensureMaterialSymbols([this.$.icon]);
    }
    this.sub('icon', (icon) => {
      if (icon) ensureMaterialSymbols([icon]);
    });
    this.sub('isActive', (val) => {
      this.toggleAttribute('data-active', val);
      if (val) {
        this.setAttribute('aria-current', 'page');
      } else {
        this.removeAttribute('aria-current');
      }
    });
    this.sub('isFirst', (val) => {
      this.toggleAttribute('data-first', val);
    });
  }

  connectedCallback() {
    super.connectedCallback?.();
    this.$.label = this.getAttribute('label') || '';
    this.$.icon = this.getAttribute('icon') || '';
    this.$.isFirst = this.hasAttribute('is-first');
    this.$.isActive = this.hasAttribute('is-active');
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (!this.isConnected) return;
    if (name === 'label') {
      this.$.label = newValue || '';
    } else if (name === 'icon') {
      this.$.icon = newValue || '';
    } else if (name === 'is-first') {
      this.$.isFirst = newValue !== null;
    } else if (name === 'is-active') {
      this.$.isActive = newValue !== null;
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }
}

SnBreadcrumbItem.template = breadcrumbItemTemplate;
SnBreadcrumbItem.reg('sn-breadcrumb-item');

export class SnBreadcrumb extends Symbiote {
  init$ = {
    crumbs: [],
    onItemClick: (e) => {
      let item = e.target.closest('sn-breadcrumb-item');
      if (!item || item.$.isActive) return;
      this.dispatchEvent(new CustomEvent('sn-breadcrumb-select', {
        bubbles: true,
        composed: true,
        detail: {
          label: item.$.label,
          index: Array.from(this.children).indexOf(item),
        }
      }));
    }
  };

  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('aria-label')) {
      this.setAttribute('aria-label', 'Breadcrumb');
    }
  }

  setPath(crumbs = []) {
    this.$.crumbs = crumbs;
    this.innerHTML = '';
    crumbs.forEach((crumb, idx) => {
      const item = document.createElement('sn-breadcrumb-item');
      item.setAttribute('label', crumb.label || '');
      if (crumb.icon) item.setAttribute('icon', crumb.icon);
      if (idx === 0) item.setAttribute('is-first', '');
      if (idx === crumbs.length - 1) item.setAttribute('is-active', '');
      this.appendChild(item);
    });
  }
}

SnBreadcrumb.template = breadcrumbTemplate;
SnBreadcrumb.rootStyles = css;
SnBreadcrumb.reg('sn-breadcrumb');

export default SnBreadcrumb;
