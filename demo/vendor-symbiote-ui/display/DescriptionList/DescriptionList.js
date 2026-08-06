import Symbiote from '@symbiotejs/symbiote';
import { slotProcessor } from '@symbiotejs/symbiote/core/slotProcessor.js';
import { descriptionListTemplate, descriptionItemTemplate } from './DescriptionList.tpl.js';
import css from './DescriptionList.css.js';

export class DescriptionList extends Symbiote {
  connectedCallback() {
    super.connectedCallback?.();
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'list');
    }
  }
}

DescriptionList.template = descriptionListTemplate;
DescriptionList.rootStyles = css;
DescriptionList.reg('sn-description-list');

export class DescriptionItem extends Symbiote {
  static observedAttributes = ['label'];

  init$ = {
    label: '',
  };

  constructor() {
    super();
    this.templateProcessors.add(slotProcessor);
  }

  renderCallback() {
    // Sync the initial label after init$ is applied so parser/innerHTML-created
    // items (where attributeChangedCallback fires before init$) still render it.
    if (this.hasAttribute('label')) {
      this.$.label = this.getAttribute('label') || '';
    }
  }

  connectedCallback() {
    super.connectedCallback?.();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'label') {
      this.$.label = newValue || '';
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }
}

DescriptionItem.template = descriptionItemTemplate;
DescriptionItem.reg('sn-description-item');

export default DescriptionList;
