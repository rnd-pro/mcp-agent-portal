/**
 * Breadcrumb styles
 * @module symbiote-ui/canvas/Breadcrumb.css
 */
import { css } from '@symbiotejs/symbiote';

export let styles = css`
  graph-breadcrumb {
    display: flex;
    align-items: center;
    gap: var(--sn-step-1);
    padding: var(--sn-step-3) var(--sn-step-6);
    font-family: var(--sn-font);
    font-size: var(--sn-text-sm);
    color: var(--sn-sys-on-surface-dim);
    background: var(--sn-sys-surface-overlay);
    border-radius: var(--sn-radius-md);
    backdrop-filter: blur(8px);
    pointer-events: auto;
    user-select: none;
    position: absolute;
    top: var(--sn-step-5);
    left: var(--sn-step-5);
    z-index: 50;
    box-shadow: 0 2px 8px var(--sn-shadow-color);
    border: 1px solid var(--sn-sys-outline);
    transition: opacity var(--sn-transition-normal) var(--sn-transition-easing);

    &[hidden] {
      display: none;
    }
  }

  breadcrumb-item {
    display: contents;

    &[data-active] .bc-label {
      color: var(--sn-sys-on-surface);
      font-weight: 500;
      cursor: default;
    }
  }

  .bc-label {
    padding: var(--sn-step-1, 3px) var(--sn-step-4);
    border-radius: var(--sn-radius-sm);
    cursor: pointer;
    transition:
      background 0.15s ease-out,
      color 0.15s ease-out;
    display: flex;
    align-items: center;
    gap: var(--sn-step-2);

    breadcrumb-item:not([data-active]) &:hover {
      background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-overlay));
      color: var(--sn-sys-on-surface);
    }

    & .material-symbols-outlined {
      font-size: var(--sn-text-lg);
    }
  }

  .bc-sep {
    color: var(--sn-sys-on-surface-dim);
    opacity: 0.5;
    font-size: var(--sn-text-xs);
    padding: 0 var(--sn-step-1);
  }
`;
