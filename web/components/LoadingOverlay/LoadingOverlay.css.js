export default /*css*/`
  .pcb-loader {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background: var(--sn-bg, #1a1a1a);
    z-index: 500;
    transition: opacity 0.3s ease-out;
    pointer-events: none;
  }
  .pcb-loader[data-hidden="true"] {
    opacity: 0;
    pointer-events: none;
  }
  .pcb-loader-logo {
    font-family: var(--sn-font, 'SF Mono', monospace);
    font-size: 11px;
    letter-spacing: 0.25em;
    color: var(--sn-text-dim, #888);
    text-transform: uppercase;
  }
  .pcb-loader-phase {
    font-family: var(--sn-font, 'SF Mono', monospace);
    font-size: 10px;
    color: var(--sn-node-selected, #d4a04a);
    letter-spacing: 0.15em;
    text-transform: uppercase;
    min-height: 14px;
  }
  .pcb-loader-track {
    width: 200px;
    height: 2px;
    background: rgba(255,255,255,0.08);
    border-radius: 1px;
    overflow: hidden;
  }
  .pcb-loader-bar {
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, #c87533, #d4a04a);
    border-radius: 1px;
    transition: width 0.35s ease-out;
    box-shadow: 0 0 8px rgba(212,160,74,0.5);
  }
  .pcb-loader-sub {
    font-family: var(--sn-font, 'SF Mono', monospace);
    font-size: 9px;
    color: var(--sn-text-dim, #888);
    min-height: 12px;
  }
`;
