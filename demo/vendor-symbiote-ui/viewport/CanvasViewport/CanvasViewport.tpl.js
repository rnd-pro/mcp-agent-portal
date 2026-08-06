import { html } from '@symbiotejs/symbiote';

export let canvasViewportTemplate = html`
  <div class="vp-header">
    <select ${{ onchange: 'aspectChange' }}>
      <option value="16:9">16:9</option>
      <option value="9:16">9:16</option>
      <option value="1:1">1:1</option>
      <option value="4:3">4:3</option>
      <option value="21:9">21:9</option>
    </select>
    <select ${{ onchange: 'resChange' }}>
      <option value="1920x1080">1920×1080</option>
      <option value="1280x720">1280×720</option>
      <option value="1080x1920">1080×1920</option>
      <option value="1080x1080">1080×1080</option>
      <option value="3840x2160">4K</option>
    </select>
    <button data-action="safe-zone" title="Toggle Safe Zone">⊞</button>
    <div class="vp-spacer"></div>
    <span class="vp-frame-label" ${{ textContent: 'frameLabel' }}></span>
    <span class="vp-zoom-label" ${{ textContent: 'zoomLabel' }}></span>
    <button data-action="zoom-fit" title="Fit">Fit</button>
    <button data-action="zoom-100" title="100%">1:1</button>
  </div>
  <div class="vp-canvas-wrap" ${{ '@hidden': '!hasData' }}>
    <div class="vp-canvas-frame" ref="canvasFrame">
      <canvas ref="viewport"></canvas>
      <div class="vp-safe-zone"></div>
    </div>
  </div>
  <div class="vp-empty" ${{ '@hidden': 'hasData' }}>
    No composition loaded
  </div>
`;
