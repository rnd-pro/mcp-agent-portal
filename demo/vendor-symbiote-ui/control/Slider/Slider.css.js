export default /*css*/ `
sn-slider {
  display: inline-block;
  box-sizing: border-box;
  width: 100%;
  font-family: var(--sn-font);
  color: var(--sn-sys-on-surface);
  margin-block: var(--sn-slider-margin, 4px);
}

.sn-slider-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  inline-size: 100%;
  block-size: var(--sn-slider-wrapper-height, 20px);
}

.sn-slider-track-wrap {
  position: relative;
  inline-size: 100%;
  block-size: var(--sn-slider-track-height, 4px);
  background: var(--sn-slider-track-bg, color-mix(in oklab, var(--sn-sys-on-surface) 12%, transparent));
  border-radius: var(--sn-radius-full);
  pointer-events: none;
}

.sn-slider-active-track {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  background: var(--sn-slider-active-bg, var(--sn-sys-accent));
  border-radius: var(--sn-radius-full);
}

.sn-slider-thumb {
  position: absolute;
  top: 50%;
  inline-size: var(--sn-slider-thumb-size, 12px);
  block-size: var(--sn-slider-thumb-size, 12px);
  border-radius: var(--sn-radius-full);
  background: var(--sn-slider-thumb-bg, var(--sn-sys-on-accent));
  border: 1px solid var(--sn-slider-thumb-border, var(--sn-slider-active-bg, var(--sn-sys-accent)));
  box-shadow: var(--sn-slider-thumb-shadow, var(--sn-sys-shadow-raised));
  transform: translate(-50%, -50%);
  pointer-events: none;
  transition: transform var(--sn-transition-fast, 100ms) ease, background-color var(--sn-transition-fast, 100ms) ease;
}

.sn-slider-input {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
  z-index: 2;
}

.sn-slider-wrapper:focus-within .sn-slider-track-wrap {
  outline: var(--sn-slider-focus-ring, 2px solid var(--sn-sys-focus-ring, currentColor));
  outline-offset: 4px;
}

sn-slider[disabled] {
  opacity: var(--sn-slider-disabled-opacity, 0.5);
}

sn-slider[disabled] .sn-slider-input {
  cursor: not-allowed;
}

sn-slider[readonly] .sn-slider-input {
  cursor: default;
}
`;
