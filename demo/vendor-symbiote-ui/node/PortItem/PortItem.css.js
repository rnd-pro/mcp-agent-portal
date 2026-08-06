/**
 * PortItem styles
 * @module symbiote-ui/node/PortItem.css
 */
import { css } from '@symbiotejs/symbiote';

export let styles = css`
  port-item {
    display: flex;
    align-items: center;
    gap: var(--sn-port-gap, 6px);
    padding: var(--sn-port-padding, 3px 12px);
    min-height: var(--sn-port-min-height, 28px);
    --sn-port-item-socket-offset: calc((var(--sn-socket-size, 12px) + var(--sn-step-5, 10px)) * -1);

    &[data-side='input'] {
      flex-direction: row;

      & .sn-socket {
        margin-left: var(--sn-port-item-socket-offset);
      }
    }

    &[data-side='output'] {
      flex-direction: row-reverse;

      & .sn-socket {
        margin-right: var(--sn-port-item-socket-offset);
      }
    }

    & .sn-socket {
      position: relative;
      width: calc(var(--sn-socket-size) + 8px);
      height: calc(var(--sn-socket-size) + 8px);
      border-radius: 50%;
      background: transparent;
      cursor: crosshair;
      flex-shrink: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: center;

      &::after {
        content: '';
        width: var(--sn-socket-size);
        height: var(--sn-socket-size);
        border-radius: 50%;
        background: var(--socket-color, var(--sn-node-accent));
        border: var(--sn-socket-border-width) solid var(--sn-sys-surface-raised);
        transition:
          transform 0.2s ease-out,
          box-shadow 0.2s ease-out;
        pointer-events: none;
      }

      &[data-socket-shape='square']::after {
        border-radius: var(--sn-radius-xs);
      }

      &[data-socket-shape='diamond']::after {
        border-radius: var(--sn-radius-xs, 1px);
        transform: rotate(45deg) scale(0.85);
      }

      &[data-socket-shape='diamond']:hover::after {
        transform: rotate(45deg) scale(1.1);
      }

      &[data-socket-shape='triangle']::after {
        border-radius: 0;
        background: transparent;
        width: 0;
        height: 0;
        border: calc(var(--sn-socket-size) / 2) solid transparent;
        border-left: calc(var(--sn-socket-size) - var(--sn-socket-border-width)) solid
          var(--socket-color, var(--sn-node-accent));
        border-right: none;
      }

      &:hover::after {
        transform: scale(1.3);
        box-shadow: 0 0 8px var(--socket-color, var(--sn-node-accent));
      }
    }

    & .port-label {
      color: var(--sn-sys-on-surface-dim);
      font-size: var(--sn-port-label-size, 12px);
      white-space: nowrap;
    }
  }
`;
