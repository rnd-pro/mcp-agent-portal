import Symbiote from "@symbiotejs/symbiote";
import { CodeBlock } from "symbiote-node/ui";

export class CodeWidget extends Symbiote {
  init$ = {
    '@source': '',
    truncatedSource: '',
    expanded: false,
    hasMore: false,
  };

  renderCallback() {
    this.sub('@source', (src) => {
      if (!src) return;
      let lines = src.split('\n');
      if (lines.length > 10) {
        this.$.hasMore = true;
        this.$.truncatedSource = lines.slice(0, 10).join('\n') + '\n...';
      } else {
        this.$.hasMore = false;
        this.$.truncatedSource = src;
      }
      this._syncCodeBlock();
    });
  }

  _syncCodeBlock() {
    let block = this.ref.block;
    if (!block) return;
    if (block instanceof CodeBlock || block.$) {
      block.$.lang = 'plain';
      block.$.code = this.$.truncatedSource;
      return;
    }
    block.textContent = this.$.truncatedSource;
  }
}

CodeWidget.template = `
<div class="code-widget">
  <code-block ref="block"></code-block>
</div>
`;

CodeWidget.reg('pg-code-widget');
