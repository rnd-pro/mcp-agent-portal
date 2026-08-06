/**
 * CtrlItem — itemize item for node embedded controls
 *
 * Rendered by GraphNode via itemize API.
 * Receives {key, label, inputType, value, isReadonly} from parent data.
 *
 * @module symbiote-ui/components/CtrlItem
 */

import Symbiote from '@symbiotejs/symbiote';
import { template } from './CtrlItem.tpl.js';
import { styles } from './CtrlItem.css.js';

export class CtrlItem extends Symbiote {
  key = '';
  label = '';
  inputType = 'text';
  value = '';
  isReadonly = false;
}

CtrlItem.template = template;
CtrlItem.rootStyles = styles;
CtrlItem.reg('ctrl-item');
