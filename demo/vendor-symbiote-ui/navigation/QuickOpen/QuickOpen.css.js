import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default `
:host,
quick-open {
  display: block;
}

  :host { position: fixed; inset: 0; z-index: 9999; pointer-events: none; }
  quick-open { position: fixed; inset: 0; z-index: 9999; pointer-events: none; }
  .qo-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: var(--sn-sys-scrim);
    display: flex; justify-content: center; padding-top: 15vh;
    pointer-events: all;
    animation: qo-fadein var(--sn-animation-duration-fast, 100ms) ease;
  }
  .qo-overlay[hidden] { display: none !important; }
  .qo-hidden { display: none !important; pointer-events: none; }
  .qo-dialog {
    width: 520px;
    max-height: 420px;
    background: var(--sn-quick-open-bg, var(--sn-sys-surface-overlay));
    border: 1px solid var(--sn-quick-open-border, var(--sn-sys-outline));
    border-radius: var(--sn-radius-lg, 10px);
    box-shadow: 0 20px 60px var(--sn-sys-shadow-overlay, var(--sn-sys-scrim));
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .qo-input-wrap {
    display: flex;
    align-items: center;
    padding: var(--sn-step-4) var(--sn-step-6);
    gap: var(--sn-step-4);
    border-bottom: 1px solid var(--sn-quick-open-border, var(--sn-sys-outline));
  }
  .qo-icon { color: var(--sn-sys-on-surface-dim); font-size: 20px; }
  .qo-input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--sn-sys-on-surface);
    font-size: var(--sn-text-lg, 15px);
    font-family: inherit;
    outline: none;
    padding: var(--sn-step-3) 0;
  }
  .qo-input::placeholder { color: var(--sn-sys-on-surface-dim); }
  .qo-kbd {
    font-size: var(--sn-text-2xs);
    padding: var(--sn-step-1) var(--sn-step-3);
    border-radius: var(--sn-radius-sm);
    background: var(--sn-quick-open-kbd-bg, var(--sn-sys-surface-raised));
    border: 1px solid var(--sn-quick-open-border, var(--sn-sys-outline));
    color: var(--sn-sys-on-surface-dim);
    font-family: monospace;
  }
  .qo-results {
    overflow-y: auto;
    ${themedScrollFadeBlockStyles}
    padding: var(--sn-step-2) 0;
    max-height: 350px;
  }
  .qo-item {
    display: flex;
    align-items: center;
    gap: var(--sn-step-4);
    padding: var(--sn-step-4) var(--sn-step-8);
    cursor: pointer;
    transition: background var(--sn-transition-fast, 80ms) ease;
  }
  .qo-item:hover { background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent); }
  .qo-item.qo-selected {
    background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), transparent);
  }
  .qo-name {
    font-size: var(--sn-text-md);
    color: var(--sn-sys-on-surface);
    font-weight: 500;
  }
  .qo-path {
    font-size: var(--sn-text-xs);
    color: var(--sn-sys-on-surface-dim);
    margin-left: auto;
    font-family: var(--sn-font-mono);
  }
  .qo-empty {
    padding: var(--sn-step-9);
    text-align: center;
    color: var(--sn-sys-on-surface-dim);
    font-style: italic;
  }
  @keyframes qo-fadein { from { opacity: 0; } to { opacity: 1; } }
`;
