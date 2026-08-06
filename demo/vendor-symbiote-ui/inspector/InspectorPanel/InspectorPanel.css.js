/**
 * InspectorPanel styles
 * @module symbiote-ui/inspector/InspectorPanel.css
 */
import { css } from '@symbiotejs/symbiote';
import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export let styles = css`
  inspector-panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 280px;
    background: var(--sn-sys-surface-raised);
    border-left: 1px solid var(--sn-sys-outline);
    display: flex;
    flex-direction: column;
    z-index: 100;
    font-family: var(--sn-font);
    color: var(--sn-sys-on-surface);
    overflow-y: auto;
    ${themedScrollFadeBlockStyles}
    transition: transform var(--sn-transition-normal, 0.2s) ease;

    &[hidden] {
      display: none;
    }

    & .insp-resize-handle {
      position: absolute;
      top: 0;
      left: var(--sn-step-0, -2px);
      width: 5px;
      height: 100%;
      cursor: col-resize;
      z-index: 110;
      transition: background var(--sn-transition-fast, 0.15s);

      &:hover {
        background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
      }

      &.dragging {
        background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-dragged-mix), var(--sn-sys-surface-panel));
      }
    }

    & .insp-header {
      display: flex;
      align-items: center;
      gap: var(--sn-step-4);
      padding: var(--sn-step-6) var(--sn-step-8);
      font-size: var(--sn-text-lg);
      font-weight: 600;
      border-bottom: 1px solid var(--sn-sys-outline);
      background: var(--sn-sys-surface-raised);
    }

    & .insp-header .material-symbols-outlined {
      font-size: var(--sn-text-2xl);
      opacity: 0.7;
    }

    & .insp-body {
      flex: 1;
      padding: var(--sn-step-12, 44px) var(--sn-step-8) var(--sn-step-6);
    }

    & .insp-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--sn-step-4);
      padding: var(--sn-step-12, 40px) 0;
      color: var(--sn-sys-on-surface-dim);
      font-size: var(--sn-text-md);

      &[hidden] {
        display: none;
      }
    }

    & .insp-empty .material-symbols-outlined {
      font-size: var(--sn-text-2xl, 32px);
      opacity: 0.4;
    }

    & .insp-field {
      margin-bottom: var(--sn-step-6);
    }

    & .insp-field label {
      display: block;
      font-size: var(--sn-text-xs);
      font-weight: 600;
      text-transform: uppercase;
      color: var(--sn-sys-on-surface-dim);
      margin-bottom: var(--sn-step-2);
      letter-spacing: 0.5px;
    }

    & .insp-value {
      font-size: var(--sn-text-md);
      padding: var(--sn-step-3) var(--sn-step-4);
      background: color-mix(in oklab, currentColor 4%, transparent);
      border-radius: var(--sn-radius-sm);
    }

    & .insp-tag {
      display: inline-block;
      padding: var(--sn-step-1) var(--sn-step-4);
      font-size: var(--sn-text-xs);
      border-radius: var(--sn-radius-sm);
      background: color-mix(in oklab, var(--sn-cat-server) 15%, transparent);
      color: var(--sn-cat-server);
    }

    & .insp-mono {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: var(--sn-text-xs);
      opacity: 0.6;
    }

    & .insp-section {
      margin-top: var(--sn-step-8);
    }

    & .insp-section-title {
      display: flex;
      align-items: center;
      gap: var(--sn-step-3);
      font-size: var(--sn-text-sm);
      font-weight: 600;
      color: var(--sn-sys-on-surface-dim);
      margin-bottom: var(--sn-step-4);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    & .insp-section-title .material-symbols-outlined {
      font-size: var(--sn-text-xl);
      opacity: 0.6;
    }
  }

  .insp-port {
    display: flex;
    align-items: center;
    gap: var(--sn-step-4);
    padding: var(--sn-step-2) var(--sn-step-4);
    font-size: var(--sn-text-sm);
    border-radius: var(--sn-radius-sm);
    margin-bottom: var(--sn-step-1);
  }

  .insp-port:hover {
    background: color-mix(in oklab, currentColor 4%, transparent);
  }

  .insp-port-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--sn-cat-server);
    flex-shrink: 0;
  }

  .insp-port-label {
    flex: 1;
  }

  .insp-port-type {
    font-size: var(--sn-text-2xs);
    color: var(--sn-sys-on-surface-dim);
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .insp-ctrl {
    margin-bottom: var(--sn-step-6);
  }

  .insp-ctrl-label {
    display: block;
    font-size: var(--sn-text-xs);
    font-weight: 600;
    text-transform: uppercase;
    color: var(--sn-sys-on-surface-dim);
    margin-bottom: var(--sn-step-2);
    letter-spacing: 0.5px;
  }

  .insp-ctrl-input-el,
  .insp-ctrl-select {
    width: 100%;
    padding: var(--sn-step-3) var(--sn-step-4);
    font-size: var(--sn-text-sm);
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: var(--sn-sys-on-surface);
    background: color-mix(in oklab, currentColor 6%, transparent);
    border: 1px solid var(--sn-field-control-subtle-border);
    border-radius: var(--sn-radius-sm);
    outline: none;
    box-sizing: border-box;
    transition: border-color var(--sn-transition-fast, 0.15s);

    &:focus {
      border-color: var(--sn-sys-accent);
    }
  }

  .insp-ctrl-textarea {
    width: 100%;
    padding: var(--sn-step-3) var(--sn-step-4);
    font-size: var(--sn-text-xs);
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: var(--sn-sys-on-surface);
    background: color-mix(in oklab, currentColor 6%, transparent);
    border: 1px solid var(--sn-field-control-subtle-border);
    border-radius: var(--sn-radius-sm);
    outline: none;
    resize: vertical;
    min-height: 80px;
    box-sizing: border-box;
    line-height: 1.4;
    transition: border-color var(--sn-transition-fast, 0.15s);

    &:focus {
      border-color: var(--sn-sys-accent);
    }
  }

  .insp-ctrl-select {
    appearance: none;
    cursor: pointer;
    background-image: var(--sn-field-select-indicator);
    background-repeat: no-repeat;
    background-position:
      right 10px center,
      right 6px center;
    background-size:
      6px 6px,
      6px 6px;
    padding-right: var(--sn-step-10);

    & option {
      background: var(--sn-sys-surface-raised);
      color: var(--sn-sys-on-surface);
    }
  }

  .insp-ctrl-toggle {
    position: relative;
    display: inline-block;
    width: 36px;
    height: 20px;
    cursor: pointer;

    & input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    & .insp-ctrl-slider {
      position: absolute;
      inset: 0;
      background: var(--sn-field-toggle-bg);
      border-radius: var(--sn-radius-lg, 10px);
      transition: background var(--sn-transition-normal, 0.2s);

      &::before {
        content: '';
        position: absolute;
        width: 14px;
        height: 14px;
        left: var(--sn-step-1, 3px);
        bottom: var(--sn-step-1, 3px);
        background: var(--sn-field-toggle-thumb-bg);
        border-radius: 50%;
        transition:
          transform 0.2s,
          background 0.2s;
      }
    }

    & input:checked + .insp-ctrl-slider {
      background: var(--sn-sys-accent);

      &::before {
        transform: translateX(16px);
        background: var(--sn-field-toggle-thumb-active-bg);
      }
    }
  }

  .insp-enter-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sn-step-4);
    width: 100%;
    padding: var(--sn-step-5) var(--sn-step-8);
    margin-top: var(--sn-step-6);
    border: 1px solid var(--sn-subgraph-border);
    border-radius: var(--sn-radius-lg);
    background: var(--sn-subgraph-bg);
    color: var(--sn-subgraph-accent);
    font-family: var(--sn-font);
    font-size: var(--sn-text-md);
    font-weight: 500;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      transform 0.1s;
  }

  .insp-enter-btn:hover {
    background: linear-gradient(
      135deg,
      color-mix(in oklch, var(--sn-subgraph-accent) 22%, transparent) 0%,
      color-mix(in oklch, var(--sn-subgraph-accent) 15%, transparent) 100%
    );
    border-color: color-mix(in oklch, var(--sn-subgraph-accent) 50%, transparent);
  }

  .insp-enter-btn:active {
    transform: scale(0.97);
  }

  .insp-enter-btn .material-symbols-outlined {
    font-size: var(--sn-text-2xl);
  }

  .insp-fire {
    padding: var(--sn-step-6) var(--sn-step-8);
  }

  .insp-fire-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sn-step-3);
    width: 100%;
    padding: var(--sn-step-5) var(--sn-step-8);
    border: 1px solid color-mix(in oklch, var(--sn-sys-success) 40%, transparent);
    border-radius: var(--sn-radius-lg);
    background: var(--sn-sys-success-container);
    color: var(--sn-sys-success);
    font-family: var(--sn-font);
    font-size: var(--sn-text-md);
    font-weight: 600;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      transform 0.1s;

    &:hover {
      background: color-mix(in oklch, var(--sn-sys-success) var(--sn-sys-state-hover-mix), var(--sn-sys-success-container));
      border-color: var(--sn-sys-success);
    }

    &:active {
      transform: scale(0.97);
    }

    .material-symbols-outlined {
      font-size: var(--sn-text-2xl, 20px);
    }
  }

  .insp-template-preview {
    padding: 0 var(--sn-step-8) var(--sn-step-6);
    border-top: 1px solid var(--sn-field-control-subtle-border);
    margin-top: var(--sn-step-4);

    &[hidden] {
      display: none;
    }
  }
`;
