import { html } from '@symbiotejs/symbiote';

export default html`
<div class="psl-shell">
  <div class="psl-header">
    <div class="psl-title">
      <span class="material-symbols-outlined">view_in_ar</span>
      Spatial Layout
    </div>
    <div class="psl-controls">
      <label class="psl-control">
        <span>Layout</span>
        <select ref="sectionSelect"></select>
      </label>
      <label class="psl-control">
        <span>Scale</span>
        <input ref="scaleInput" type="range" min="80" max="170" value="118">
      </label>
      <label class="psl-control">
        <span>Depth</span>
        <input ref="depthInput" type="range" min="80" max="180" value="120">
      </label>
    </div>
  </div>

  <div class="psl-stage" ref="stage">
    <div class="psl-floor" aria-hidden="true"></div>
    <div class="psl-space" ref="space" aria-label="Projected spatial layout"></div>
    <div class="psl-ray" aria-hidden="true"></div>
  </div>

  <div class="psl-status" ref="status"></div>
</div>
`;
