/**
 * NodeSocket — connection endpoint circle
 *
 * Visual socket indicator for node ports.
 * Changes color via socket data attribute.
 *
 * @module symbiote-ui/components/NodeSocket
 */

import Symbiote from '@symbiotejs/symbiote';
import { template } from './NodeSocket.tpl.js';
import { styles } from './NodeSocket.css.js';

export class NodeSocket extends Symbiote {
  renderCallback() {
    this.sub('@data-socket-color', (val) => {
      if (val) {
        this.style.setProperty('--socket-color', val);
      }
    });
  }
}

NodeSocket.template = template;
NodeSocket.rootStyles = styles;
NodeSocket.reg('node-socket');
