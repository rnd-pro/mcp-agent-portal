import { themedScrollFadeInlineStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
sn-segmented-control {
  display: inline-flex;
  box-sizing: border-box;
  background: var(--sn-segmented-bg, color-mix(in oklab, var(--sn-sys-on-surface) 5%, transparent));
  border: 1px solid var(--sn-segmented-border, color-mix(in oklab, var(--sn-sys-on-surface) 12%, transparent));
  border-radius: var(--sn-segmented-radius, var(--sn-field-control-radius, 4px));
  padding: var(--sn-step-1);
  max-width: 100%;
  overflow-x: auto;
  ${themedScrollFadeInlineStyles}
  font-family: var(--sn-font);
  color: var(--sn-sys-on-surface);
  gap: var(--sn-segmented-gap, 2px);
}

sn-segmented-control[disabled] {
  opacity: var(--sn-segmented-disabled-opacity, 0.5);
  pointer-events: none;
}

/* Children (segments) */
sn-segmented-control > * {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: var(--sn-segmented-font-size, 11px);
  font-weight: var(--sn-segmented-font-weight, 500);
  line-height: var(--sn-segmented-line-height, 1.35);
  padding: var(--sn-segmented-padding, 4px 12px);
  min-height: var(--sn-segmented-item-min-height, 20px);
  border-radius: calc(var(--sn-segmented-radius, var(--sn-field-control-radius, 4px)) - var(--sn-radius-xs, 2px));
  cursor: pointer;
  white-space: nowrap;
  outline: none;
  transition:
    background var(--sn-transition-normal, 150ms) var(--sn-transition-easing, ease),
    color var(--sn-transition-normal, 150ms) var(--sn-transition-easing, ease),
    box-shadow var(--sn-transition-normal, 150ms) var(--sn-transition-easing, ease);
}

sn-segmented-control > *:hover:not([disabled]):not([aria-checked="true"]) {
  background: var(--sn-segmented-hover-bg, color-mix(in oklab, var(--sn-sys-on-surface) 8%, transparent));
}

sn-segmented-control > *[aria-checked="true"] {
  background: var(--sn-segmented-selected-bg, var(--sn-sys-accent));
  color: var(--sn-segmented-selected-color, var(--sn-sys-on-accent));
  box-shadow: var(--sn-segmented-selected-shadow, var(--sn-sys-shadow-raised));
}

sn-segmented-control > *:focus-visible {
  outline: var(--sn-segmented-focus-ring, 2px solid var(--sn-sys-focus-ring, currentColor));
  outline-offset: -1px;
}
`;
