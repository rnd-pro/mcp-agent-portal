export default `
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
    background: var(--sn-bg-overlay, rgba(20, 20, 25, 0.85));
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--sn-cat-server, rgba(76, 139, 245, 0.25));
    box-shadow: 0 8px 32px var(--sn-bg-overlay, rgba(0, 0, 0, 0.4)), 0 0 16px rgba(76, 139, 245, 0.1);
    font-family: 'Inter', -apple-system, sans-serif;
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
    white-space: nowrap;
    max-width: 500px;
  }

  .fr-icon {
    font-family: 'Material Symbols Outlined';
    font-size: 16px;
    color: var(--sn-cat-server, #4c8bf5);
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
    color: rgba(255, 255, 255, 0.4);
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
