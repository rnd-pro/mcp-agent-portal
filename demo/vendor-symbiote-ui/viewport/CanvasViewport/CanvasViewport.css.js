let css = /*css*/`
  sn-canvas-viewport {
    display: flex;
    flex-direction: column;
    min-height: 100px;
    height: 100%;
    background: var(--sn-sys-surface-panel);
    color: var(--sn-sys-on-surface);
    font-family: var(--sn-font);
    font-size: var(--sn-text-xs);
    overflow: hidden;
    --vp-border: var(--sn-viewport-border, var(--sn-sys-outline));
    --vp-safe-zone: var(--sn-viewport-safe-zone, color-mix(in oklch, var(--sn-sys-on-surface) 12%, transparent));
    --vp-checker-light: var(--sn-viewport-checker-light, color-mix(in oklch, var(--sn-sys-on-surface) 4%, transparent));
    --vp-checker-dark: var(--sn-viewport-checker-dark, color-mix(in oklch, var(--sn-sys-surface-sunken) 10%, transparent));
  }

  /* ── Header bar ── */
  .vp-header {
    display: flex;
    align-items: center;
    gap: var(--sn-step-3);
    height: 28px;
    padding: 0 var(--sn-step-4);
    background: var(--sn-sys-surface-panel);
    border-bottom: 1px solid var(--vp-border);
    flex-shrink: 0;
  }

  .vp-header select {
    background: var(--sn-sys-surface-raised);
    border: 1px solid var(--vp-border);
    color: var(--sn-sys-on-surface-dim);
    padding: var(--sn-step-0, 1px) var(--sn-step-2);
    border-radius: calc(3px * var(--sn-theme-radius-scale, 1));
    font-family: inherit;
    font-size: var(--sn-text-2xs);
    cursor: pointer;
    transition: var(--sn-effect-hover-transition);
  }

  .vp-header select:hover {
    border-color: var(--sn-viewport-control-hover-border, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--vp-border)));
  }

  .vp-header button {
    background: var(--sn-sys-surface-raised);
    border: 1px solid var(--vp-border);
    color: var(--sn-sys-on-surface-dim);
    padding: var(--sn-step-1) var(--sn-step-3);
    border-radius: calc(3px * var(--sn-theme-radius-scale, 1));
    cursor: pointer;
    font-family: inherit;
    font-size: var(--sn-text-2xs);
    transition: var(--sn-effect-hover-transition);
  }

  .vp-header button:hover {
    background: var(--sn-viewport-control-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel)));
    color: var(--sn-sys-on-surface);
  }

  .vp-spacer { flex: 1; }

  .vp-zoom-label {
    font-size: var(--sn-text-2xs);
    color: var(--sn-sys-on-surface-dim);
    font-family: var(--sn-font-mono);
  }

  .vp-frame-label {
    font-size: var(--sn-text-2xs);
    color: var(--sn-sys-on-surface-dim);
    font-family: var(--sn-font-mono);
  }

  /* ── Canvas area ── */
  .vp-canvas-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
    background:
      repeating-conic-gradient(
        var(--vp-checker-light) 0% 25%,
        var(--vp-checker-dark) 0% 50%)
      50% / 16px 16px;
  }

  .vp-canvas-frame {
    position: relative;
    box-shadow: var(--sn-shadow-lg);
    overflow: hidden;
    transition: width var(--sn-transition-normal, 0.3s) ease, height var(--sn-transition-normal, 0.3s) ease;
  }

  .vp-canvas-frame canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* ── Safe zone overlay ── */
  .vp-safe-zone {
    position: absolute;
    inset: 0;
    pointer-events: none;
    border: 1px dashed var(--vp-safe-zone);
    margin: 10%;
    opacity: 0;
    transition: opacity var(--sn-transition-fast);
  }

  sn-canvas-viewport[show-safe-zone] .vp-safe-zone {
    opacity: 1;
  }

  /* ── Empty state ── */
  .vp-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--sn-sys-on-surface-dim);
    font-size: var(--sn-text-sm);
    font-style: italic;
    opacity: 0.5;
  }

  .vp-empty[hidden] {
    display: none;
  }

  .vp-canvas-wrap[hidden] {
    display: none;
  }
`;

export default css;
