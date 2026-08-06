export default `
:host {
  display: block;
}

  sn-status-ribbon {
    position: fixed;
    bottom: var(--sn-status-ribbon-bottom, 20px);
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    z-index: 9999;
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--sn-transition-slow) var(--sn-transition-easing), transform var(--sn-transition-slow) var(--sn-transition-easing);
  }

  sn-status-ribbon[visible] {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }

  .fr-inner {
    display: flex;
    align-items: center;
    gap: var(--sn-status-ribbon-gap, 10px);
    padding: var(--sn-status-ribbon-padding, 8px 20px);
    border-radius: var(--sn-status-ribbon-radius, 24px);
    background: var(--sn-status-ribbon-bg, var(--sn-sys-surface-overlay));
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--sn-status-ribbon-border, var(--sn-sys-accent));
    box-shadow: var(--sn-sys-shadow-overlay);
    font-family: var(--sn-font-ui);
    font-size: var(--sn-status-ribbon-size, 12px);
    font-weight: 500;
    color: var(--sn-status-ribbon-color, var(--sn-sys-on-surface));
    white-space: nowrap;
    max-width: var(--sn-status-ribbon-max-width, 500px);
  }

  .fr-icon {
    font-family: var(--sn-icon-font, 'Material Symbols Outlined');
    font-size: var(--sn-status-ribbon-icon-size, 16px);
    color: var(--sn-sys-accent);
    animation: fr-pulse var(--sn-animation-duration-slower) var(--sn-transition-easing) infinite;
    animation-play-state: var(--sn-animation-play-state);
  }

  .fr-text {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .fr-dots::after {
    content: '...';
    animation: fr-dots var(--sn-animation-duration-slow) steps(3) infinite;
    animation-play-state: var(--sn-animation-play-state);
    display: inline-block;
    width: var(--sn-status-ribbon-dots-width, 16px);
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
`
