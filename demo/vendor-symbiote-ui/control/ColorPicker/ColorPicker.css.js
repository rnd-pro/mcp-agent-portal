export default /*css*/ `
sn-color-picker {
  display: block;
  font-family: var(--sn-font, sans-serif);
  position: relative;
  width: 100%;
}

.sn-color-container {
  position: relative;
  width: 100%;
}

.sn-color-trigger {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  width: 100%;
  min-height: calc(36px * var(--sn-theme-density, 1));
  padding: 0 calc(12px * var(--sn-theme-density, 1));
  background: var(--sn-field-control-bg, var(--sn-sys-surface));
  border: 1px solid var(--sn-field-control-border, var(--sn-outline-color-soft, var(--sn-sys-outline-subtle)));
  border-radius: var(--sn-field-control-radius, var(--sn-panel-radius, 6px));
  color: var(--sn-sys-on-surface);
  font-size: calc(13px * var(--sn-theme-type-scale, 1));
  cursor: pointer;
  text-align: left;
}

.sn-color-trigger:focus-visible {
  outline: none;
  border-color: var(--sn-field-control-focus-border, var(--sn-sys-accent));
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--sn-sys-accent) 25%, transparent);
}

.sn-color-swatch-preview {
  width: 18px;
  height: 18px;
  border-radius: var(--sn-radius-sm);
  border: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  margin-right: var(--sn-step-4);
  box-sizing: border-box;
}

.sn-color-dropdown {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 1000;
  margin-top: var(--sn-step-2);
  background-color: var(--sn-sys-surface-panel);
  border: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  border-radius: var(--sn-panel-radius, 6px);
  box-shadow: var(--sn-panel-shadow, var(--sn-sys-shadow-overlay));
  padding: var(--sn-step-6);
  box-sizing: border-box;
  min-width: 220px;
}

.sn-color-dropdown[data-visible] {
  display: block;
}

.sn-color-canvas-wrap {
  position: relative;
  width: 100%;
  height: 120px;
  border-radius: var(--sn-radius-sm);
  overflow: hidden;
  margin-bottom: var(--sn-step-4);
  cursor: crosshair;
}

.sn-color-canvas-wrap:focus-visible {
  outline: 2px solid var(--sn-sys-accent);
  outline-offset: 2px;
}

.sn-color-canvas-bg {
  width: 100%;
  height: 100%;
  background: linear-gradient(to bottom, transparent, var(--sn-shadow-color, var(--sn-sys-scrim))), linear-gradient(to right, var(--sn-sys-on-surface), transparent);
}

.sn-color-canvas-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid var(--sn-sys-on-surface);
  border-radius: 50%;
  box-shadow: 0 0 4px var(--sn-shadow-color, var(--sn-sys-shadow-raised));
  margin-left: var(--sn-step-0, -6px);
  margin-top: var(--sn-step-0, -6px);
  pointer-events: none;
}

.sn-color-native-input {
  display: none;
}

.sn-color-hue-slider {
  -webkit-appearance: none;
  width: 100%;
  height: 10px;
  border-radius: var(--sn-radius-sm, 5px);
  outline: none;
  margin-bottom: var(--sn-step-6);
  /* deliberate exception: this is the full-spectrum HSV hue ramp the slider lets the user pick
     from, not a themeable design-system color — a T2 role cannot represent it. */
  background: linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%); /* audit-ok: hue-ramp data */
}

.sn-color-hue-slider:focus-visible {
  outline: 2px solid var(--sn-sys-accent);
  outline-offset: 2px;
}

.sn-color-hue-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--sn-sys-on-surface);
  border: 2px solid var(--sn-outline-color-soft, var(--sn-sys-outline));
  cursor: pointer;
  box-shadow: 0 1px 3px var(--sn-shadow-color, var(--sn-sys-shadow-raised));
}

.sn-color-presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sn-step-3);
  margin-bottom: var(--sn-step-4);
}

.sn-color-preset-swatch {
  box-sizing: border-box;
  padding: 0;
  width: 20px;
  height: 20px;
  border-radius: var(--sn-radius-sm);
  cursor: pointer;
  border: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
}

.sn-color-preset-swatch:hover {
  transform: scale(1.1);
}

.sn-color-preset-swatch:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--sn-sys-accent) 60%, transparent);
}

.sn-color-input-wrap {
  display: flex;
  gap: var(--sn-step-4);
}

.sn-color-text-input {
  box-sizing: border-box;
  flex: 1;
  background: var(--sn-field-control-bg, var(--sn-sys-surface));
  border: 1px solid var(--sn-outline-color-soft, var(--sn-sys-outline-subtle));
  color: var(--sn-sys-on-surface);
  border-radius: var(--sn-radius-sm);
  padding: var(--sn-step-2) var(--sn-step-4);
  font-size: var(--sn-text-sm);
  outline: none;
}

.sn-color-text-input:focus {
  border-color: var(--sn-sys-accent);
  box-shadow: 0 0 0 1px color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), transparent);
}

sn-color-picker[disabled] .sn-color-trigger {
  cursor: not-allowed;
  opacity: 0.6;
}
`;
