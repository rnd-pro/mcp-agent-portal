import { Symbiote } from '@symbiotejs/symbiote';
import template from './AgentListItem.tpl.js';

export class AgentListItem extends Symbiote {
  init$ = {
    name: '',
    description: '',
    tier: '',
    icon: 'smart_toy',
    color: '#888',
    isActive: false,

    onClick: () => {
      // Fire a generic action up to the parent
      // Note: In itemize, you often just bind to a parent handler via ^
    }
  };

  renderCallback() {
    this.sub('isActive', (val) => {
      if (val) {
        this.setAttribute('active', '');
      } else {
        this.removeAttribute('active');
      }
    });
  }
}

AgentListItem.template = template;
AgentListItem.reg('pg-agent-list-item');
export default AgentListItem;
