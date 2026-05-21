import { Symbiote } from '@symbiotejs/symbiote';
import 'symbiote-node/ui';
import { syncListItem } from 'symbiote-node/ui';
import template from './AgentListItem.tpl.js';
import css from './AgentListItem.css.js';

export class AgentListItem extends Symbiote {
  init$ = {
    name: '',
    description: '',
    tier: '',
    icon: 'smart_toy',
    color: '#888',
    isActive: false,
  };

  renderCallback() {
    this.#syncListItem();
    this.sub('name', () => this.#syncListItem());
    this.sub('description', () => this.#syncListItem());
    this.sub('tier', () => this.#syncListItem());
    this.sub('icon', () => this.#syncListItem());
    this.sub('color', () => this.#syncListItem());
    this.sub('isActive', () => this.#syncListItem());
  }

  #syncListItem() {
    syncListItem(this, {
      label: this.$.name,
      description: this.$.description,
      icon: this.$.icon,
      meta: this.$.tier,
      active: this.$.isActive,
      name: this.$.name,
      tier: this.$.tier,
    }, {
      active: this.$.isActive,
      iconColor: this.$.color || '#888',
    });
  }
}

AgentListItem.template = template;
AgentListItem.rootStyles = css;
AgentListItem.reg('pg-agent-list-item');
export default AgentListItem;
