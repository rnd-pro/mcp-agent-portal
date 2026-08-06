/**
 * QuickToolbar styles
 * @module symbiote-ui/toolbar/QuickToolbar.css
 */
import { css } from '@symbiotejs/symbiote';

export let styles = css`
  quick-toolbar {
    --sn-overlay-z-tier: local;
    --sn-overlay-z-base: var(--sn-toolbar-z, var(--sn-canvas-overlay-z-base, 12000));
    position: absolute;
    top: 0;
    left: 0;
    z-index: var(--sn-toolbar-z, var(--sn-canvas-overlay-z-base, 12000));
    pointer-events: all;
    transform-origin: center bottom;

    &[data-overlay-portal] {
      position: fixed;
    }

    &[hidden] {
      display: none;
    }

    & .toolbar {
      position: relative;
      isolation: isolate;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0;
      padding: 0;
      border-radius: var(--sn-radius-lg, 10px);
      background: var(--sn-toolbar-bg);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--sn-toolbar-border);
      box-shadow:
        0 8px 32px var(--sn-shadow-color),
        0 0 0 1px var(--sn-shadow-color);
      transform: translateX(-50%) scale(var(--sn-toolbar-scale, 1));
      transform-origin: center top;
      animation: toolbar-in var(--sn-animation-duration-fast, 0.2s) ease-out;
      inline-size: var(--sn-toolbar-fit-width, max-content);
      min-inline-size: 0;
      max-inline-size: calc(100vw - 32px);
      overflow: hidden;
      clip-path: inset(
        var(--sn-toolbar-clip-top, 0px)
        var(--sn-toolbar-clip-right, 0px)
        var(--sn-toolbar-clip-bottom, 0px)
        var(--sn-toolbar-clip-left, 0px)
        round 10px
      );
    }

    &[data-has-title] .toolbar {
      min-inline-size: min(var(--sn-toolbar-title-min-width), calc(100vw - 32px));
      max-inline-size: min(var(--sn-toolbar-title-max-width), calc(100vw - 32px));
    }

    & .toolbar::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      border-radius: inherit;
      background: var(--sn-toolbar-occlusion-bg);
    }

    & .toolbar-title {
      box-sizing: border-box;
      padding: var(--sn-step-4) var(--sn-step-5) var(--sn-step-3, 7px);
      border-bottom: 1px solid var(--sn-toolbar-border);
      color: var(--sn-toolbar-title-color);
      font-size: var(--sn-toolbar-title-font-size);
      font-weight: var(--sn-toolbar-title-font-weight);
      line-height: var(--sn-toolbar-title-line-height);
      text-align: center;
      white-space: normal;
      text-wrap: balance;
      overflow-wrap: anywhere;
    }

    & .toolbar-title[hidden] {
      display: none;
    }

    & .toolbar-title-text {
      display: -webkit-box;
      min-inline-size: 0;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: var(--sn-toolbar-title-lines, 2);
    }

    & .toolbar-actions {
      display: flex;
      justify-content: center;
      gap: var(--sn-step-1);
      padding: var(--sn-step-2);
    }
  }

  @keyframes toolbar-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(6px) scale(calc(var(--sn-toolbar-scale, 1) * 0.92));
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(var(--sn-toolbar-scale, 1));
    }
  }

  .tb-btn {
    --sn-button-icon-size: 32px;
    --sn-button-icon-font-size: 18px;
    --sn-button-border: transparent;
    --sn-button-radius: 6px;
    --sn-button-bg: transparent;
    --sn-button-hover-bg: var(--sn-toolbar-hover);
    --sn-button-hover-border: transparent;
    --sn-button-color: var(--sn-toolbar-color);
    --sn-button-focus-ring: var(--sn-effect-focus-ring);
    color: var(--sn-toolbar-color);
    transition:
      background 0.12s,
      color 0.12s,
      transform 0.12s;

    &[hidden] {
      display: none;
    }

    &:hover {
      color: var(--sn-toolbar-active, var(--sn-sys-on-surface));
      background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
      transform: scale(1.1);
    }

    &:active {
      background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-pressed-mix), transparent);
      transform: scale(0.95);
    }
  }

  .tb-btn--danger:hover {
    --sn-button-hover-bg: var(--sn-toolbar-danger, color-mix(in oklch, var(--sn-sys-danger) var(--sn-sys-state-hover-mix), transparent));
    color: var(--sn-toolbar-danger-color, var(--sn-sys-danger));
  }

  .tb-btn--enter:hover {
    --sn-button-hover-bg: color-mix(in oklch, var(--sn-cat-data, var(--sn-sys-accent)) var(--sn-sys-state-hover-mix), transparent);
    color: var(--sn-cat-data, var(--sn-sys-accent));
  }

  .tb-icon {
    font-size: var(--sn-text-2xl);
    pointer-events: none;
  }
`;
