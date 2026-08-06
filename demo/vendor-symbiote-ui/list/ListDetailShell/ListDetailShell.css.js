import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
sn-list-detail-shell {
  display: grid;
  grid-template-columns: var(--sn-list-detail-sidebar-width) minmax(0, 1fr);
  min-width: 0;
  min-height: var(--sn-list-detail-min-height);
  height: var(--sn-list-detail-height);
  border: 1px solid var(--sn-list-detail-border);
  border-radius: var(--sn-list-detail-radius);
  background: var(--sn-list-detail-bg);
  color: var(--sn-list-detail-color);
  font-family: var(--sn-font);
  overflow: hidden;
}

sn-list-detail-shell[hidden] {
  display: none !important;
}

sn-list-detail-shell .sn-list-detail-sidebar,
sn-list-detail-shell .sn-list-detail-main {
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
}

sn-list-detail-shell .sn-list-detail-sidebar {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  border-inline-end: 1px solid var(--sn-list-detail-border);
  background: var(--sn-list-detail-sidebar-bg);
}

sn-list-detail-shell .sn-list-detail-main {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: var(--sn-list-detail-main-bg);
}

sn-list-detail-shell .sn-list-detail-header {
  display: flex;
  align-items: center;
  gap: var(--sn-list-detail-header-gap);
  min-width: 0;
  min-height: var(--sn-list-detail-header-min-height);
  padding: var(--sn-list-detail-header-padding);
  border-block-end: 1px solid var(--sn-list-detail-border);
  background: var(--sn-list-detail-header-bg);
}

sn-list-detail-shell .sn-list-detail-icon {
  flex: 0 0 auto;
  color: var(--sn-list-detail-icon-color);
  font-size: var(--sn-list-detail-icon-size);
  line-height: 1;
}

sn-list-detail-shell .sn-list-detail-title,
sn-list-detail-shell .sn-list-detail-description {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

sn-list-detail-shell .sn-list-detail-title {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--sn-list-detail-title-color);
  font-size: var(--sn-list-detail-title-size);
  font-weight: var(--sn-list-detail-title-weight);
  text-transform: var(--sn-list-detail-title-transform);
}

sn-list-detail-shell .sn-list-detail-heading {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--sn-step-1);
  min-width: 0;
}

sn-list-detail-shell .sn-list-detail-description {
  color: var(--sn-list-detail-description-color);
  font-size: var(--sn-list-detail-description-size);
}

sn-list-detail-shell .sn-list-detail-list,
sn-list-detail-shell .sn-list-detail-body {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  ${themedScrollFadeBlockStyles}
}

sn-list-detail-shell .sn-list-detail-list {
  padding: var(--sn-list-detail-list-padding);
}

sn-list-detail-shell .sn-list-detail-body {
  padding: var(--sn-list-detail-main-padding);
}

sn-list-detail-shell .sn-list-detail-list-empty,
sn-list-detail-shell .sn-list-detail-empty {
  padding: var(--sn-list-detail-empty-padding);
}

sn-list-detail-shell[has-detail] .sn-list-detail-empty,
sn-list-detail-shell:not([has-detail]) .sn-list-detail-body {
  display: none;
}

sn-list-detail-shell[detail-mode="compact"] {
  --sn-list-detail-main-padding: var(--sn-list-detail-compact-main-padding, 8px);
  --sn-list-detail-header-min-height: var(--sn-list-detail-compact-header-min-height, 36px);
}

@media (max-width: 720px) {
  sn-list-detail-shell {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(180px, 40%) minmax(0, 1fr);
  }

  sn-list-detail-shell .sn-list-detail-sidebar {
    border-inline-end: 0;
    border-block-end: 1px solid var(--sn-list-detail-border);
  }
}
`;
