import { Symbiote } from '@symbiotejs/symbiote';
import template from './SkillListItem.tpl.js';

export class SkillListItem extends Symbiote {
  init$ = {
    name: '',
    description: '',
    
    // ^onSkillSelect is called from template via ^ prefix
  };
}

SkillListItem.template = template;
SkillListItem.reg('pg-skill-list-item');
export default SkillListItem;
