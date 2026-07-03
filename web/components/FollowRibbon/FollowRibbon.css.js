export default `
:host {
  display: block;
}

  follow-ribbon {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    z-index: 9999;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.4s ease, transform 0.4s ease;
  }

  follow-ribbon[visible] {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }

  .fr-inner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 20px;
    border-radius: 24px;
    background: var(--sn-bg-overlay);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--sn-cat-server);
    box-shadow: var(--sn-shadow-lg), var(--sn-accent-glow);
    font-family: var(--sn-font-ui);
    font-size: 12px;
    font-weight: 500;
    color: var(--sn-sys-on-surface);
    white-space: nowrap;
    max-width: 500px;
  }

  .fr-icon {
    font-family: 'Material Symbols Outlined';
    font-size: 16px;
    color: var(--sn-cat-server);
    animation: fr-pulse 2s ease-in-out infinite;
  }

  .fr-text {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .fr-dots::after {
    content: '...';
    animation: fr-dots 1.5s steps(3) infinite;
    display: inline-block;
    width: 16px;
    text-align: left;
    color: var(--sn-sys-on-surface-dim);
  }

  @keyframes fr-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @keyframes fr-dots {
    0% { content: ''; }
    33% { content: '.'; }
    66% { content: '..'; }
    100% { content: '...'; }
  }
`;
