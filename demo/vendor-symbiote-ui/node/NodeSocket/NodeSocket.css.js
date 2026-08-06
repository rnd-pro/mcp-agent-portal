/**
 * NodeSocket styles
 * @module symbiote-ui/node/NodeSocket.css
 */
import { css } from '@symbiotejs/symbiote';

export let styles = css`
  node-socket {
    display: block;
    width: var(--sn-socket-size);
    height: var(--sn-socket-size);
    border-radius: 50%;
    background: var(--socket-color, var(--sn-node-accent));
    border: var(--sn-socket-border-width) solid var(--sn-sys-surface-raised);
    cursor: crosshair;
    flex-shrink: 0;
    transition:
      transform 0.2s ease-out,
      box-shadow 0.2s ease-out;
    z-index: 10;
    position: relative;

    &::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: var(--sn-socket-hit-size, 44px);
      height: var(--sn-socket-hit-size, 44px);
      transform: translate(-50%, -50%);
    }

    &:hover {
      transform: scale(1.3);
      box-shadow: 0 0 8px var(--socket-color, var(--sn-node-accent));
    }

    &[data-socket-shape='square'] {
      border-radius: var(--sn-radius-xs);
    }

    &[data-socket-shape='diamond'] {
      border-radius: var(--sn-radius-xs, 1px);
      transform: rotate(45deg) scale(0.85);

      &:hover {
        transform: rotate(45deg) scale(1.1);
      }
    }

    &[data-socket-shape='triangle'] {
      border-radius: 0;
      background: transparent;
      width: 0;
      height: 0;
      border: calc(var(--sn-socket-size) / 2) solid transparent;
      border-left: calc(var(--sn-socket-size) - var(--sn-socket-border-width)) solid
        var(--socket-color, var(--sn-node-accent));
      border-right: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    node-socket {
      transition: none;
    }
  }
`;
