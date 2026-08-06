export default /*css*/ `
sn-media-host {
  display: block;
  position: relative;
  width: 100%;
  box-sizing: border-box;
  font-family: var(--sn-font, sans-serif);
  background: var(--sn-media-bg, var(--sn-sys-surface-sunken));
  border-radius: var(--sn-panel-radius, 6px);
  overflow: hidden;
}

sn-media-host[hidden] {
  display: none;
}

.sn-media-poster {
  position: relative;
  display: block;
  width: 100%;
}

.sn-media-poster[hidden] {
  display: none;
}

.sn-media-poster-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: var(--sn-media-poster-bg, var(--sn-sys-surface-sunken));
}

.sn-media-activate {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: none;
  background: var(--sn-media-activate-bg, color-mix(in oklch, var(--sn-sys-scrim) 35%, transparent));
  color: var(--sn-media-activate-color, var(--sn-sys-on-status));
  cursor: pointer;
  transition: background var(--sn-transition-fast, 120ms);
}

.sn-media-activate:hover {
  background: var(--sn-media-activate-hover-bg, color-mix(in oklch, var(--sn-sys-scrim) 20%, transparent));
}

.sn-media-activate:focus-visible {
  outline: var(--sn-focus-ring-width, 2px) solid var(--sn-sys-accent);
  outline-offset: calc(var(--sn-focus-ring-width, 2px) * -2);
}

.sn-media-activate-label {
  display: inline-flex;
  align-items: center;
  gap: var(--sn-step-3);
  padding: var(--sn-step-3) var(--sn-step-6);
  border-radius: var(--sn-radius-md);
  background: var(--sn-media-activate-label-bg, color-mix(in oklch, var(--sn-sys-scrim) 55%, transparent));
  font-size: var(--sn-text-sm);
}

.sn-media-activate-label:empty {
  display: none;
}

.sn-media-stage {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: var(--sn-media-aspect, 16 / 9);
}

.sn-media-stage:empty {
  display: none;
}

.sn-media-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}

.sn-media-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sn-media-fallback {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-4);
  align-items: flex-start;
}

.sn-media-external-link {
  color: var(--sn-media-link-color, var(--sn-sys-accent));
  font-size: var(--sn-text-sm);
  text-decoration: underline;
}
`;
