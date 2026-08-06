import { css } from '@symbiotejs/symbiote';

export const styles = css`
  node-callout {
    --sn-overlay-z-tier: local;
    --sn-overlay-z-base: var(--sn-node-callout-z, var(--sn-canvas-overlay-z-base, 12000));
    position: fixed;
    inset: 0 auto auto 0;
    z-index: var(--sn-node-callout-z, var(--sn-canvas-overlay-z-base, 12000));
    display: block;
    inline-size: max-content;
    max-inline-size: min(var(--sn-node-callout-max-width, 520px), calc(100vw - 32px));
    pointer-events: none;
    contain: layout style;

    &[hidden] {
      display: none !important;
    }

    &[trigger='hover']:not([data-open]) {
      visibility: hidden;
    }

    .sn-node-callout {
      position: relative;
      box-sizing: border-box;
      max-inline-size: inherit;
      padding: var(--sn-node-callout-padding, 10px 12px);
      border: 1px solid var(--sn-node-callout-border, var(--sn-sys-outline));
      border-radius: var(--sn-node-callout-radius, var(--sn-node-radius));
      background: var(--sn-node-callout-bg, var(--sn-sys-surface-raised));
      box-shadow: var(--sn-node-callout-shadow, var(--sn-shadow-lg));
      color: var(--sn-node-callout-color, var(--sn-sys-on-surface));
      font-family: var(--sn-font);
      font-size: var(--sn-node-callout-font-size, 12px);
      font-weight: var(--sn-node-callout-font-weight, 700);
      line-height: var(--sn-node-callout-line-height, 1.35);
      text-align: center;
      text-wrap: balance;
      white-space: normal;
      overflow-wrap: anywhere;
      opacity: 1;
      transform: translateY(0);
      transition:
        opacity 120ms ease,
        transform 120ms ease;
      -webkit-font-smoothing: antialiased;
    }

    &[trigger='hover']:not([data-open]) .sn-node-callout {
      opacity: 0;
      transform: translateY(2px);
    }

    .sn-node-callout::after {
      content: '';
      position: absolute;
      inline-size: var(--sn-node-callout-arrow-size, 10px);
      block-size: var(--sn-node-callout-arrow-size, 10px);
      border-inline-end: 1px solid var(--sn-node-callout-border, var(--sn-sys-outline));
      border-block-end: 1px solid var(--sn-node-callout-border, var(--sn-sys-outline));
      background: var(--sn-node-callout-bg, var(--sn-sys-surface-raised));
      transform: rotate(45deg);
    }

    &[placement='top'] .sn-node-callout::after {
      inset-block-end: calc(var(--sn-node-callout-arrow-size, 10px) / -2 - 1px);
      inset-inline-start: calc(50% - var(--sn-node-callout-arrow-size, 10px) / 2);
    }

    &[placement='bottom'] .sn-node-callout::after {
      inset-block-start: calc(var(--sn-node-callout-arrow-size, 10px) / -2 - 1px);
      inset-inline-start: calc(50% - var(--sn-node-callout-arrow-size, 10px) / 2);
      transform: rotate(225deg);
    }

    &[placement='left'] .sn-node-callout::after {
      inset-inline-end: calc(var(--sn-node-callout-arrow-size, 10px) / -2 - 1px);
      inset-block-start: calc(50% - var(--sn-node-callout-arrow-size, 10px) / 2);
      transform: rotate(-45deg);
    }

    &[placement='right'] .sn-node-callout::after {
      inset-inline-start: calc(var(--sn-node-callout-arrow-size, 10px) / -2 - 1px);
      inset-block-start: calc(50% - var(--sn-node-callout-arrow-size, 10px) / 2);
      transform: rotate(135deg);
    }

    .sn-node-callout-text[hidden] {
      display: none;
    }
  }
`;
