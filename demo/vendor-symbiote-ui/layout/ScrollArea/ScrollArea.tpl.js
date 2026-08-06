import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-scroll-container" ref="container">
    <div class="sn-scroll-viewport" ref="viewport">
      <slot></slot>
    </div>
    <div class="sn-scrollbar sn-scrollbar-vertical" ref="vScrollbar">
      <div class="sn-scrollbar-thumb" ref="vThumb"></div>
    </div>
    <div class="sn-scrollbar sn-scrollbar-horizontal" ref="hScrollbar">
      <div class="sn-scrollbar-thumb" ref="hThumb"></div>
    </div>
  </div>
`;
