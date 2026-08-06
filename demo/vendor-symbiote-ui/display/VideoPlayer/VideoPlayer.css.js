export default /*css*/ `
sn-video-player {
  display: block;
  font-family: var(--sn-font, sans-serif);
  width: 100%;
  box-sizing: border-box;
}

.sn-video-container {
  position: relative;
  width: 100%;
  background-color: var(--sn-video-bg, var(--sn-sys-surface-sunken));
  border-radius: var(--sn-panel-radius, 6px);
  overflow: hidden;
  box-sizing: border-box;
}

.sn-video-element {
  width: 100%;
  display: block;
}

.sn-video-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--sn-video-controls-bg, linear-gradient(transparent, color-mix(in oklch, var(--sn-sys-scrim) 85%, transparent)));
  padding: var(--sn-step-4) var(--sn-step-6);
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-3);
  z-index: 10;
  opacity: 0;
  transition: opacity var(--sn-transition-normal, 240ms);
}

.sn-video-container:hover .sn-video-controls {
  opacity: 1;
}

.sn-video-controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sn-step-6);
}

.sn-video-controls-group {
  display: flex;
  align-items: center;
  gap: var(--sn-step-4);
}

.sn-video-btn {
  background: none;
  border: none;
  color: var(--sn-video-btn-color, var(--sn-sys-on-status));
  cursor: pointer;
  padding: var(--sn-step-2);
  border-radius: var(--sn-radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color var(--sn-transition-fast, 120ms);
}

.sn-video-btn:hover {
  color: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-video-btn-color, var(--sn-sys-on-status)));
}

.sn-video-scrub-bar {
  -webkit-appearance: none;
  width: 100%;
  height: 4px;
  background: var(--sn-video-track, color-mix(in oklch, var(--sn-sys-on-status) 30%, transparent));
  border-radius: var(--sn-radius-xs);
  outline: none;
  cursor: pointer;
}

.sn-video-scrub-bar::-webkit-slider-runnable-track {
  width: 100%;
  height: 4px;
}

.sn-video-scrub-bar::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--sn-sys-accent);
  cursor: pointer;
  margin-top: var(--sn-step-0, -3px);
}

.sn-video-time {
  font-size: var(--sn-text-xs);
  color: var(--sn-video-text, var(--sn-sys-on-status));
  font-variant-numeric: tabular-nums;
}

.sn-video-volume-slider {
  -webkit-appearance: none;
  width: 60px;
  height: 4px;
  background: var(--sn-video-track, color-mix(in oklch, var(--sn-sys-on-status) 30%, transparent));
  border-radius: var(--sn-radius-xs);
  outline: none;
  cursor: pointer;
}

.sn-video-volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--sn-video-thumb, var(--sn-sys-on-status));
}
`;
