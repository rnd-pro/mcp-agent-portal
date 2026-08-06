import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-chart-container">
    <div class="sn-chart-header" ref="header">
      <div class="sn-chart-title">{{title}}</div>
      <div class="sn-chart-legend" ref="legend"></div>
    </div>
    <div class="sn-chart-svg-wrap">
      <svg ref="svg" class="sn-chart-svg" 
           ${{ onpointerdown: 'onPointerDown', onpointermove: 'onPointerMove', onpointerup: 'onPointerUp', ondblclick: 'onDblClick' }}></svg>
      <div ref="tooltip" class="sn-chart-tooltip" hidden></div>
    </div>
  </div>
`;
