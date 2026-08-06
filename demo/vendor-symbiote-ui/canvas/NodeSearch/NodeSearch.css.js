/**
 * NodeSearch styles
 * @module symbiote-ui/canvas/NodeSearch.css
 */
import { css } from '@symbiotejs/symbiote';
import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export let styles = css`
  node-search {
    position: absolute;
    top: var(--sn-step-8);
    left: 50%;
    transform: translateX(-50%);
    width: 360px;
    z-index: 200;
    font-family: var(--sn-font);

    &[hidden] {
      display: none;
    }

    & .search-bar {
      display: flex;
      align-items: center;
      gap: var(--sn-step-4);
      padding: var(--sn-step-4) var(--sn-step-7);
      background: var(--sn-sys-surface-raised);
      border: 1px solid var(--sn-sys-outline);
      border-radius: var(--sn-radius-lg, 10px);
      box-shadow: 0 8px 32px var(--sn-shadow-color);
    }

    & .search-icon {
      font-size: var(--sn-text-2xl);
      color: var(--sn-sys-on-surface-dim);
    }

    & .search-input {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      color: var(--sn-sys-on-surface);
      font-size: var(--sn-text-lg);
      font-family: inherit;
    }

    & .search-input::placeholder {
      color: var(--sn-sys-on-surface-dim);
    }

    & .search-hint {
      font-size: var(--sn-text-xs);
      color: var(--sn-sys-on-surface-dim);
      padding: var(--sn-step-1) var(--sn-step-3);
      border: 1px solid var(--sn-sys-outline);
      border-radius: var(--sn-radius-sm);
    }

    & .search-results {
      margin-top: var(--sn-step-2);
      background: var(--sn-sys-surface-raised);
      border-radius: var(--sn-radius-lg);
      border: 1px solid var(--sn-sys-outline);
      box-shadow: 0 4px 16px var(--sn-shadow-color);
      overflow: hidden;
      max-height: 300px;
      overflow-y: auto;
      ${themedScrollFadeBlockStyles}
    }

    & .search-results:empty {
      display: none;
    }
  }

  .search-result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sn-step-4) var(--sn-step-7);
    cursor: pointer;
    color: var(--sn-sys-on-surface);
    font-size: var(--sn-text-md);
    transition: background var(--sn-transition-fast) var(--sn-transition-easing);

    &:hover {
      background: color-mix(in oklab, currentColor 6%, transparent);
    }
  }

  .search-result-type {
    font-size: var(--sn-text-xs);
    color: var(--sn-sys-on-surface-dim);
    padding: var(--sn-step-0, 1px) var(--sn-step-3);
    border-radius: var(--sn-radius-sm);
    background: color-mix(in oklab, currentColor 5%, transparent);
  }
`;
