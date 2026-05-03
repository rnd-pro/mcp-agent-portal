import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="pcb-loader" set="@data-hidden: hidden">
    <div class="pcb-loader-logo">Project Graph</div>
    <div class="pcb-loader-phase">{{phase}}</div>
    <div class="pcb-loader-track">
      <div class="pcb-loader-bar" style="width: {{pct}}%"></div>
    </div>
    <div class="pcb-loader-sub">{{sub}}</div>
  </div>
`;
