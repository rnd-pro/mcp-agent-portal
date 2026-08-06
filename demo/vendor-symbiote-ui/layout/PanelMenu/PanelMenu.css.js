import { css } from '@symbiotejs/symbiote';

export let styles = css`
  panel-menu {
    position: fixed;
    z-index: var(--sn-panel-menu-z, var(--sn-overlay-z-base, 20000));
    pointer-events: none;

    .menu-container {
      pointer-events: auto;
      background: var(--sn-sys-surface-overlay);
      border: var(--sn-panel-menu-border-width, 1px) solid var(--sn-ctx-border);
      border-radius: var(--sn-panel-menu-radius, 6px);
      box-shadow: 0 4px 12px var(--sn-shadow-color);
      min-width: var(--sn-panel-menu-min-width, 160px);
      padding: var(--sn-panel-menu-padding, 4px 0);
    }

    .menu-item {
      display: flex;
      align-items: center;
      gap: var(--sn-panel-menu-item-gap, 8px);
      padding: var(--sn-panel-menu-item-padding, 8px 12px);
      cursor: pointer;
      color: var(--sn-sys-on-surface);
      font-size: var(--sn-panel-menu-item-size, 0.85rem);
      transition: background var(--sn-transition-fast) var(--sn-transition-easing);

      &:hover {
        background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-overlay));
      }

      &[active] {
        color: var(--sn-sys-accent);
      }

      .material-symbols-outlined {
        font-size: var(--sn-panel-menu-icon-size, 18px);
        opacity: 0.8;
      }
    }
  }
`;
