import { Symbiote } from '@symbiotejs/symbiote';
import 'symbiote-ui/ui';
import { syncListItem } from 'symbiote-ui/ui';
import template from './SkillListItem.tpl.js';
import css from './SkillListItem.css.js';

export class SkillListItem extends Symbiote {
  init$ = {
    name: '',
    description: '',
  };

  renderCallback() {
    this.#syncListItem();
    this.sub('name', () => this.#syncListItem());
    this.sub('description', () => this.#syncListItem());
  }

  #syncListItem() {
    syncListItem(this, {
      label: this.$.name,
      description: this.$.description,
      icon: 'bolt',
      name: this.$.name,
    });
  }
}

SkillListItem.template = template;
SkillListItem.rootStyles = css;
SkillListItem.reg('pg-skill-list-item');
export default SkillListItem;
