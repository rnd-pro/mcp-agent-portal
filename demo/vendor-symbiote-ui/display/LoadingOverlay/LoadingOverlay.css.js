export default /*css*/ `
:host,
sn-loading-overlay,
loading-overlay {
  position: absolute;
  inset: 0;
  display: block;
  color: var(--sn-sys-on-surface);
  font-family: var(--sn-font-ui);
  z-index: var(--sn-loading-overlay-z);
  pointer-events: none;
}

:host([hidden]),
sn-loading-overlay[hidden],
loading-overlay[hidden] {
  display: none !important;
}

.sn-loading-overlay {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: var(--sn-loading-overlay-gap);
  width: 100%;
  height: 100%;
  background: var(--sn-loading-overlay-bg);
  opacity: 1;
  transition: opacity var(--sn-transition-normal) var(--sn-transition-easing);
}

:host([hidden-state]) .sn-loading-overlay,
sn-loading-overlay[hidden-state] .sn-loading-overlay,
loading-overlay[hidden-state] .sn-loading-overlay {
  opacity: 0;
}

.sn-loading-label,
.sn-loading-phase,
.sn-loading-sub {
  max-width: min(320px, 80%);
  overflow: hidden;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sn-loading-label {
  color: var(--sn-loading-label-color);
  font-family: var(--sn-font-mono);
  font-size: var(--sn-loading-label-size);
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.sn-loading-phase {
  min-height: 14px;
  color: var(--sn-loading-phase-color);
  font-family: var(--sn-font-mono);
  font-size: var(--sn-loading-phase-size);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.sn-loading-track {
  width: var(--sn-loading-track-width);
  max-width: 80%;
  height: var(--sn-loading-track-height);
  overflow: hidden;
  border-radius: var(--sn-loading-track-radius);
  background: var(--sn-loading-track-bg);
}

.sn-loading-bar {
  height: 100%;
  width: var(--sn-loading-progress, 0%);
  border-radius: inherit;
  background: var(--sn-loading-bar-bg);
  box-shadow: var(--sn-loading-bar-shadow);
  transition: width var(--sn-transition-normal) var(--sn-transition-easing);
}

.sn-loading-sub {
  min-height: 12px;
  color: var(--sn-loading-sub-color);
  font-family: var(--sn-font-mono);
  font-size: var(--sn-loading-sub-size);
}
`;
