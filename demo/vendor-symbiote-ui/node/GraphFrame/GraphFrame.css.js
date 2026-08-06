/**
 * GraphFrame styles
 * @module symbiote-ui/node/GraphFrame.css
 */
import { css } from '@symbiotejs/symbiote';

export let styles = css`
  graph-frame {
    position: absolute;
    display: block;
    border: var(--sn-frame-border-width) var(--sn-frame-border-style)
      color-mix(in oklab, var(--frame-color, var(--sn-sys-accent)) 60%, transparent);
    border-radius: var(--sn-frame-radius);
    background: color-mix(in oklab, var(--frame-color, var(--sn-sys-accent)) 8%, transparent);
    z-index: -1;
    pointer-events: all;
    min-width: 120px;
    min-height: 80px;

    & .sn-frame-header {
      display: flex;
      align-items: center;
      gap: var(--sn-step-3);
      padding: var(--sn-step-3) var(--sn-step-6);
      font-family: var(--sn-frame-font);
      font-size: var(--sn-frame-font-size);
      font-weight: 600;
      color: color-mix(in oklab, var(--frame-color, var(--sn-sys-accent)) 90%, var(--sn-sys-on-surface));
      user-select: none;
      cursor: grab;
      border-bottom: 1px solid color-mix(in oklab, var(--frame-color, var(--sn-sys-accent)) 20%, transparent);
    }

    & .sn-frame-icon {
      font-size: var(--sn-text-xl);
      opacity: 0.7;
    }

    & .sn-frame-label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    & .sn-frame-resize {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 16px;
      height: 16px;
      cursor: nwse-resize;
      border-right: 3px solid color-mix(in oklab, var(--frame-color, var(--sn-sys-accent)) 40%, transparent);
      border-bottom: 3px solid color-mix(in oklab, var(--frame-color, var(--sn-sys-accent)) 40%, transparent);
      border-radius: 0 0 var(--sn-radius-lg, 10px) 0;
    }

    &:hover {
      border-color: color-mix(in oklab, var(--frame-color, var(--sn-sys-accent)) 80%, transparent);
    }

    &[data-selected] {
      border-color: var(--frame-color, var(--sn-sys-accent));
      box-shadow: 0 0 12px color-mix(in oklab, var(--frame-color, var(--sn-sys-accent)) 30%, transparent);
    }
  }
`;
