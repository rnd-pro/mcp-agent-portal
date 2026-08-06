export default /*css*/ `
:host,
sn-tree-view {
  display: block;
  color: var(--sn-sys-on-surface);
  font-family: var(--sn-font-family);
}

:host([hidden]),
sn-tree-view[hidden] {
  display: none !important;
}

.sn-tree-view {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 0;
  width: 100%;
  outline: none;
}

.sn-tree-row {
  --sn-tree-depth-indent: 0px;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: var(--sn-tree-toggle-width) var(--sn-tree-icon-width) minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--sn-tree-gap);
  min-height: var(--sn-tree-row-min-height, var(--sn-tree-row-height));
  padding-block: var(--sn-tree-row-padding-block);
  padding-inline: var(--sn-tree-depth-indent) var(--sn-step-4, 8px);
  border: 1px solid transparent;
  border-radius: var(--sn-tree-row-radius);
  background: var(--sn-tree-row-bg, transparent);
  color: inherit;
  cursor: pointer;
  user-select: none;
  outline: none;
}

.sn-tree-row:hover {
  background: var(--sn-tree-row-hover-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), var(--sn-sys-surface-panel)));
}

.sn-tree-row:focus-visible {
  outline: var(--sn-sys-focus-ring-width) solid var(--sn-tree-row-focus-border, var(--sn-sys-focus-ring));
  outline-offset: calc(-1 * var(--sn-sys-focus-ring-width));
}

.sn-tree-row[aria-selected="true"] {
  background: var(--sn-tree-row-selected-bg, color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-selected-mix), var(--sn-sys-surface-panel)));
  border-color: var(--sn-tree-row-selected-border, var(--sn-sys-accent));
}

.sn-tree-row[muted] {
  color: var(--sn-tree-muted-color, var(--sn-sys-on-surface-dim));
}

.sn-tree-toggle,
.sn-tree-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--sn-tree-icon-width);
  height: var(--sn-tree-icon-width);
  color: var(--sn-tree-icon-color, var(--sn-sys-on-surface-dim));
  font-family: var(--sn-icon-font);
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20;
  font-size: var(--sn-tree-icon-size);
  line-height: 1;
}

.sn-tree-toggle {
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}

.sn-tree-toggle[hidden] {
  visibility: hidden;
}

.sn-tree-label {
  min-width: 0;
  overflow: hidden;
  color: var(--sn-tree-label-color, var(--sn-sys-on-surface));
  font-size: var(--sn-tree-label-size);
  font-weight: var(--sn-tree-label-weight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sn-tree-kind {
  overflow: hidden;
  max-width: var(--sn-tree-kind-max-width);
  color: var(--sn-tree-kind-color, var(--sn-sys-on-surface-dim));
  font-size: var(--sn-tree-kind-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sn-tree-badges {
  display: inline-flex;
  align-items: center;
  gap: var(--sn-tree-badge-gap, 4px);
  min-width: 0;
}

.sn-tree-badge {
  max-width: var(--sn-tree-badge-max-width);
  overflow: hidden;
  padding: var(--sn-tree-badge-padding, 1px 5px);
  border-radius: var(--sn-tree-badge-radius);
  background: var(--sn-tree-badge-bg, var(--sn-sys-accent-container));
  color: var(--sn-tree-badge-color, var(--sn-sys-on-surface-dim));
  font-size: var(--sn-tree-badge-size);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`;
