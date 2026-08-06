/**
 * Minimap styles
 * @module symbiote-ui/canvas/Minimap.css
 */
import { css } from '@symbiotejs/symbiote';

export let styles = css`
  node-minimap {
    position: absolute;
    bottom: var(--sn-step-8);
    right: var(--sn-step-8);
    width: 200px;
    height: 140px;
    border-radius: var(--sn-radius-lg);
    overflow: hidden;
    border: 1px solid var(--sn-sys-outline);
    box-shadow: 0 4px 16px var(--sn-shadow-color);
    z-index: 90;
    cursor: crosshair;
    opacity: 1;
    transition: opacity var(--sn-transition-slow) var(--sn-transition-easing);

    &[hidden] {
      display: none;
    }

    &[data-fading] {
      opacity: 0;
      pointer-events: none;
    }

    & canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  }

  .sn-minimap-toggle {
    position: absolute;
    bottom: var(--sn-step-8);
    right: var(--sn-step-8);
    width: 32px;
    height: 32px;
    border-radius: var(--sn-radius-md);
    border: 1px solid var(--sn-sys-outline);
    background: var(--sn-sys-surface-raised);
    color: var(--sn-sys-on-surface-dim);
    cursor: pointer;
    z-index: 89;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition:
      color 0.15s,
      border-color 0.15s;

    & .material-symbols-outlined {
      font-size: var(--sn-text-2xl);
    }

    &:hover {
      background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-raised));
      color: var(--sn-sys-on-surface);
    }

    &[data-active] {
      color: var(--sn-sys-accent);
      border-color: var(--sn-sys-accent);
    }
  }
`;
