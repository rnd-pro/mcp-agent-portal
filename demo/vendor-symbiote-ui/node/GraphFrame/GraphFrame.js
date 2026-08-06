/**
 * GraphFrame — visual grouping frame component (Blender-style)
 *
 * Colored rectangle with label that groups nodes spatially.
 * Moving the frame moves all nodes whose positions fall within its bounds.
 *
 * @module symbiote-ui/components/GraphFrame
 */

import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { template } from './GraphFrame.tpl.js';
import { styles } from './GraphFrame.css.js';

export class GraphFrame extends Symbiote {
  init$ = {
    label: 'Group',
    color: 'var(--sn-sys-accent)',
  };

  renderCallback() {
    ensureMaterialSymbols(['dashboard']);

    this.sub('color', (val) => {
      if (val) this.style.setProperty('--frame-color', val);
    });
  }
}

GraphFrame.template = template;
GraphFrame.rootStyles = styles;
GraphFrame.reg('graph-frame');
