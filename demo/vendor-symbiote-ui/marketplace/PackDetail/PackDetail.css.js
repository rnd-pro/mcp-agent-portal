export default /*css*/ `
sn-pack-detail {
  display: block;
  box-sizing: border-box;
  min-width: 0;
  font-family: var(--sn-font);
  color: var(--sn-sys-on-surface);
}

sn-pack-detail[hidden] {
  display: none !important;
}

sn-pack-detail .sn-pack-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sn-pack-detail-head-gap, 8px);
  text-transform: none;
}

sn-pack-detail .sn-pack-detail-name {
  min-width: 0;
  color: var(--sn-pack-detail-name-color, var(--sn-sys-on-surface));
  font-size: var(--sn-pack-detail-name-size, var(--sn-text-lg, 16px));
  font-weight: var(--sn-pack-detail-name-weight, 600);
  overflow: hidden;
  text-overflow: ellipsis;
}

sn-pack-detail .sn-pack-detail-description {
  margin-block: var(--sn-pack-detail-description-margin, 8px);
  color: var(--sn-pack-detail-description-color, var(--sn-sys-on-surface-dim));
  font-size: var(--sn-pack-detail-description-size, var(--sn-text-sm, 12px));
  line-height: var(--sn-pack-detail-description-line-height, 1.5);
}

sn-pack-detail .sn-pack-detail-readiness-banner {
  display: flex;
  align-items: center;
  gap: var(--sn-pack-detail-readiness-gap, 8px);
  margin-block: var(--sn-pack-detail-readiness-margin, 8px);
}

sn-pack-detail .sn-pack-detail-next-action {
  color: var(--sn-pack-detail-next-action-color, var(--sn-sys-on-surface-dim));
  font-size: var(--sn-pack-detail-next-action-size, var(--sn-text-sm, 12px));
}

sn-pack-detail .sn-pack-detail-section {
  margin-block-start: var(--sn-pack-detail-section-margin, 12px);
}

sn-pack-detail .sn-pack-detail-section:empty {
  display: none;
}

sn-pack-detail .sn-pack-detail-section-title {
  margin: 0 0 var(--sn-pack-detail-title-margin, 6px);
  color: var(--sn-pack-detail-title-color, var(--sn-sys-on-surface-dim));
  font-size: var(--sn-pack-detail-title-size, var(--sn-text-xs, 11px));
  font-weight: var(--sn-pack-detail-title-weight, 600);
  text-transform: uppercase;
  letter-spacing: var(--sn-pack-detail-title-spacing, 0.04em);
}

sn-pack-detail .sn-pack-detail-missing-row {
  display: flex;
  align-items: center;
  gap: var(--sn-pack-detail-missing-gap, 8px);
  padding-block: var(--sn-pack-detail-missing-padding, 4px);
  font-size: var(--sn-pack-detail-missing-size, var(--sn-text-sm, 12px));
}

sn-pack-detail .sn-pack-detail-missing-group {
  color: var(--sn-pack-detail-missing-group-color, var(--sn-sys-on-surface-dim));
}

sn-pack-detail .sn-pack-detail-missing-id {
  color: var(--sn-pack-detail-missing-id-color, var(--sn-sys-on-surface));
  font-family: var(--sn-font-mono, monospace);
}

sn-pack-detail .sn-pack-detail-footer {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sn-pack-detail-footer-gap, 6px);
}

sn-pack-detail .sn-pack-detail-action {
  box-sizing: border-box;
  padding: var(--sn-pack-detail-action-padding, 6px 12px);
  border: 1px solid var(--sn-pack-detail-action-border, color-mix(in oklab, currentColor 16%, transparent));
  border-radius: var(--sn-pack-detail-action-radius, var(--sn-radius-sm, 4px));
  background: var(--sn-pack-detail-action-bg, transparent);
  color: var(--sn-pack-detail-action-color, var(--sn-sys-on-surface));
  font-family: inherit;
  font-size: var(--sn-pack-detail-action-size, var(--sn-text-sm, 12px));
  cursor: pointer;
  transition: background var(--sn-transition-fast, 120ms) var(--sn-transition-easing, ease),
              border-color var(--sn-transition-fast, 120ms) var(--sn-transition-easing, ease);
}

sn-pack-detail .sn-pack-detail-action:hover {
  background: var(--sn-pack-detail-action-hover-bg, color-mix(in oklab, currentColor 8%, transparent));
}

sn-pack-detail .sn-pack-detail-action:focus-visible {
  outline: var(--sn-pack-detail-action-focus-ring, 2px solid var(--sn-sys-focus-ring));
  outline-offset: 2px;
}

sn-pack-detail .sn-pack-detail-action-primary {
  border-color: var(--sn-pack-detail-action-primary-border, var(--sn-accent, currentColor));
  background: var(--sn-pack-detail-action-primary-bg, var(--sn-accent, transparent));
  color: var(--sn-pack-detail-action-primary-color, var(--sn-accent-contrast, var(--sn-sys-on-surface)));
}
`;
