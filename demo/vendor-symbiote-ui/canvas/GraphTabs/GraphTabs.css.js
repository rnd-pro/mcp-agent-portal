/**
 * GraphTabs styles
 * @module symbiote-ui/canvas/GraphTabs.css
 */
import { css } from '@symbiotejs/symbiote';
import { themedScrollFadeInlineStyles } from '../../themes/scroll-fade-styles.js';

export let styles = css`
  graph-tabs {
    display: flex;
    align-items: stretch;
    height: 32px;
    background: var(--sn-sys-surface-overlay);
    border-bottom: 1px solid var(--sn-sys-outline);
    font-family: var(--sn-font);
    font-size: var(--sn-text-sm);
    color: var(--sn-sys-on-surface-dim);
    overflow-x: auto;
    overflow-y: hidden;
    ${themedScrollFadeInlineStyles}
    user-select: none;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  tab-item {
    display: flex;
    align-items: center;
    gap: var(--sn-step-3);
    padding: 0 var(--sn-step-7);
    cursor: pointer;
    white-space: nowrap;
    border-right: 1px solid var(--sn-sys-outline);
    transition:
      background 0.15s ease-out,
      color 0.15s ease-out;
    position: relative;

    &:hover {
      background: color-mix(in oklab, currentColor 4%, transparent);
      color: var(--sn-sys-on-surface);
    }

    &[data-active] {
      background: var(--sn-sys-surface-raised);
      color: var(--sn-sys-on-surface);

      &::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--sn-sys-accent);
      }
    }

    & .material-symbols-outlined {
      font-size: var(--sn-text-lg);
    }

    & .tab-close {
      font-size: var(--sn-text-lg);
      opacity: 0;
      transition: opacity var(--sn-transition-fast) var(--sn-transition-easing);
      padding: var(--sn-step-1);
      border-radius: var(--sn-radius-xs, 3px);

      &:hover {
        background: color-mix(in oklab, currentColor 10%, transparent);
      }
    }

    &:hover .tab-close {
      opacity: 0.7;
    }
  }

  .tab-add {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    cursor: pointer;
    color: var(--sn-sys-on-surface-dim);
    transition:
      background 0.15s ease-out,
      color 0.15s ease-out;

    &:hover {
      background: color-mix(in oklab, currentColor 4%, transparent);
      color: var(--sn-sys-on-surface);
    }

    & .material-symbols-outlined {
      font-size: var(--sn-text-xl);
    }
  }
`;
