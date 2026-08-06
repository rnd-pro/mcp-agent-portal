import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import template from './ListDetailShell.tpl.js';
import css from './ListDetailShell.css.js';

const ATTR_TO_PROP = {
  'sidebar-title': 'sidebarTitle',
  'sidebar-icon': 'sidebarIcon',
  'detail-title': 'detailTitle',
  'detail-icon': 'detailIcon',
  'detail-description': 'detailDescription',
  'detail-mode': 'detailMode',
};

export class ListDetailShell extends Symbiote {
  static observedAttributes = [...Object.keys(ATTR_TO_PROP), 'has-detail'];

  init$ = {
    sidebarTitle: '',
    sidebarIcon: '',
    detailTitle: '',
    detailIcon: '',
    detailDescription: '',
    detailMode: '',
    hasDetail: false,
  };

  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
  }

  connectedCallback() {
    super.connectedCallback?.();
    this._syncAttributes();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'has-detail') {
      this.$.hasDetail = newValue !== null;
      return;
    }
    let prop = ATTR_TO_PROP[name];
    if (prop) {
      this.$[prop] = newValue ?? '';
      return;
    }
    super.attributeChangedCallback?.(name, oldValue, newValue);
  }

  get hasDetail() {
    return this.hasAttribute('has-detail');
  }

  set hasDetail(value) {
    this.toggleAttribute('has-detail', Boolean(value));
  }

  _syncAttributes() {
    for (let [attr, prop] of Object.entries(ATTR_TO_PROP)) {
      this.$[prop] = this.getAttribute(attr) ?? '';
    }
    this.$.hasDetail = this.hasAttribute('has-detail');
  }
}

ListDetailShell.template = template;
ListDetailShell.rootStyles = css;
ListDetailShell.reg('sn-list-detail-shell');

export default ListDetailShell;
