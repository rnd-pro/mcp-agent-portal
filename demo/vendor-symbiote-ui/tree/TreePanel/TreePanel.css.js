import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
:host,
sn-tree-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-block-size: 0;
  overflow: hidden;
  font-family: var(--sn-font);
  font-size: var(--sn-tree-panel-font-size);
}

:host([hidden]),
sn-tree-panel[hidden] {
  display: none !important;
}

.sn-tree-panel-shell {
  box-sizing: border-box;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  inline-size: 100%;
  block-size: 100%;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
}

.sn-tree-panel-title {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--sn-tree-panel-title-gap);
  padding: var(--sn-tree-panel-title-padding);
  border-bottom: 1px solid var(--sn-sys-outline);
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-tree-panel-title-size);
  font-weight: var(--sn-tree-panel-title-weight);
  text-transform: uppercase;
}

.sn-tree-panel-title[hidden] {
  display: none;
}

.sn-tree-panel-title-icon,
.sn-tree-panel-toolbar-icon {
  font-size: var(--sn-tree-panel-icon-size);
}

.sn-tree-panel-toolbar {
  display: flex;
  flex: 0 0 auto;
  gap: var(--sn-tree-panel-toolbar-gap);
  padding: var(--sn-tree-panel-toolbar-padding);
  border-bottom: 1px solid var(--sn-sys-outline);
}

.sn-tree-panel-filter {
  flex: 1;
  min-width: 0;
  padding: var(--sn-tree-panel-input-padding);
  border: 1px solid var(--sn-sys-outline);
  border-radius: var(--sn-tree-panel-input-radius);
  outline: none;
  background: var(--sn-sys-surface);
  color: var(--sn-sys-on-surface);
  font-family: inherit;
  font-size: var(--sn-tree-panel-input-size);
}

.sn-tree-panel-filter:focus {
  outline: var(--sn-sys-focus-ring-width) solid var(--sn-sys-focus-ring);
  outline-offset: var(--sn-sys-focus-ring-offset);
}

.sn-tree-panel-collapse {
  --sn-button-icon-size: auto;
  --sn-button-icon-font-size: var(--sn-tree-panel-icon-size);
  --sn-button-padding: var(--sn-tree-panel-collapse-padding);
  --sn-button-border: var(--sn-sys-outline);
  --sn-button-radius: var(--sn-tree-panel-input-radius);
  --sn-button-bg: var(--sn-sys-surface);
  --sn-button-hover-bg: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface));
  --sn-button-hover-border: var(--sn-sys-outline);
  --sn-button-color: var(--sn-sys-on-surface);
  --sn-button-focus-ring: var(--sn-effect-focus-ring);
  color: var(--sn-sys-on-surface);
  transition: background var(--sn-transition-fast) var(--sn-transition-easing);
}

.sn-tree-panel-content {
  flex: 1 1 auto;
  min-block-size: 0;
  overflow: auto;
  ${themedScrollFadeBlockStyles}
  padding: var(--sn-tree-panel-content-padding);
}

.sn-tree-panel-placeholder {
  padding: var(--sn-tree-panel-placeholder-padding);
  color: var(--sn-sys-on-surface-dim);
  font-size: var(--sn-tree-panel-placeholder-size);
}

.sn-tree-panel-placeholder[hidden] {
  display: none;
}

sn-tree-view {
  display: block;
  min-block-size: 0;
  --sn-tree-gap: var(--sn-tree-panel-gap, var(--sn-tree-gap));
  --sn-tree-indent: var(--sn-tree-panel-indent, var(--sn-tree-indent));
  --sn-tree-row-min-height: var(--sn-tree-panel-row-min-height, var(--sn-tree-row-height));
  --sn-tree-row-padding-block: var(--sn-tree-panel-row-padding-block, var(--sn-tree-row-padding-block));
  --sn-tree-row-radius: var(--sn-tree-panel-row-radius, var(--sn-tree-row-radius));
  --sn-tree-row-hover-bg: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel));
  --sn-tree-row-selected-bg: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), var(--sn-sys-surface-panel));
  --sn-tree-row-selected-border: transparent;
  --sn-tree-label-color: var(--sn-sys-on-surface-dim);
  --sn-tree-label-size: var(--sn-tree-panel-label-size, var(--sn-tree-label-size));
  --sn-tree-label-weight: var(--sn-tree-panel-label-weight, var(--sn-tree-label-weight));
  --sn-tree-muted-color: var(--sn-sys-on-surface-dim);
  --sn-tree-icon-size: var(--sn-tree-panel-icon-size, var(--sn-tree-icon-size));
  --sn-tree-badge-radius: var(--sn-tree-panel-badge-radius, var(--sn-tree-badge-radius));
  --sn-tree-badge-bg: var(--sn-sys-accent-container);
  --sn-tree-badge-color: var(--sn-sys-on-surface-dim);
  --sn-tree-badge-size: var(--sn-tree-panel-badge-size, var(--sn-tree-badge-size));
}

sn-tree-view[hidden] {
  display: none;
}
`;
