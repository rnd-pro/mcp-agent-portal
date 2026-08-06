import { html } from '@symbiotejs/symbiote';

export default html`
  <slot name="toolbar"></slot>
  <slot name="legend"></slot>
  <slot name="overlay"></slot>
  <div class="graph-explorer-canvas-layer">
    <slot name="canvas"></slot>
    <slot></slot>
  </div>
  <slot name="stats"></slot>
`;
