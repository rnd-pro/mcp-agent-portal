import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-color-container">
    <button ref="trigger" type="button" class="sn-color-trigger" aria-label="Choose color" aria-haspopup="dialog" aria-expanded="false">
      <div ref="previewSwatch" class="sn-color-swatch-preview"></div>
      <span class="sn-color-value-text">{{value}}</span>
    </button>
    <div ref="dropdown" class="sn-color-dropdown" role="dialog" aria-label="Color picker" tabindex="-1">
      <div ref="canvas" class="sn-color-canvas-wrap" role="slider" tabindex="0" aria-label="Saturation and brightness" aria-valuemin="0" aria-valuemax="100">
        <div class="sn-color-canvas-bg" ref="canvasBg"></div>
        <div ref="handle" class="sn-color-canvas-handle"></div>
      </div>
      <input ref="hueSlider" type="range" class="sn-color-hue-slider" min="0" max="360" value="0" aria-label="Hue">
      <div ref="presets" class="sn-color-presets" role="group" aria-label="Preset colors"></div>
      <div class="sn-color-input-wrap">
        <input ref="hexInput" type="text" class="sn-color-text-input" placeholder="#000000" maxlength="7" aria-label="Hex color value">
      </div>
    </div>
    <input ref="nativeInput" type="color" class="sn-color-native-input" tabindex="-1" aria-hidden="true">
  </div>
`;
