export default /*css*/ `
sn-pack-card {
  display: block;
  box-sizing: border-box;
  min-width: 0;
  font-family: var(--sn-font);
  color: var(--sn-sys-on-surface);
}

sn-pack-card[hidden] {
  display: none !important;
}

sn-pack-card .sn-pack-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sn-pack-card-head-gap, 8px);
  text-transform: none;
}

sn-pack-card .sn-pack-card-name {
  min-width: 0;
  color: var(--sn-pack-card-name-color, var(--sn-sys-on-surface));
  font-size: var(--sn-pack-card-name-size, var(--sn-text-md, 14px));
  font-weight: var(--sn-pack-card-name-weight, 600);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

sn-pack-card .sn-pack-card-version {
  flex-shrink: 0;
}

sn-pack-card .sn-pack-card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sn-pack-card-meta-gap, 6px);
  margin-block-start: var(--sn-pack-card-meta-margin, 6px);
}

sn-pack-card .sn-pack-card-meta:empty {
  display: none;
}

sn-pack-card .sn-pack-card-verified {
  font-size: var(--sn-pack-card-verified-size, 14px);
}

sn-pack-card .sn-pack-card-description {
  margin-block: var(--sn-pack-card-description-margin, 8px);
  color: var(--sn-pack-card-description-color, var(--sn-sys-on-surface-dim));
  font-size: var(--sn-pack-card-description-size, var(--sn-text-sm, 12px));
  line-height: var(--sn-pack-card-description-line-height, 1.4);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

sn-pack-card .sn-pack-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sn-pack-card-tags-gap, 4px);
  margin-block-start: var(--sn-pack-card-tags-margin, 6px);
}

sn-pack-card .sn-pack-card-footer {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sn-pack-card-footer-gap, 8px);
  min-width: 0;
}

sn-pack-card .sn-pack-card-actions {
  display: flex;
  align-items: center;
  gap: var(--sn-pack-card-actions-gap, 6px);
  flex-shrink: 0;
}

sn-pack-card .sn-pack-card-action {
  box-sizing: border-box;
  padding: var(--sn-pack-card-action-padding, 4px 10px);
  border: 1px solid var(--sn-pack-card-action-border, color-mix(in oklab, currentColor 16%, transparent));
  border-radius: var(--sn-pack-card-action-radius, var(--sn-radius-sm, 4px));
  background: var(--sn-pack-card-action-bg, transparent);
  color: var(--sn-pack-card-action-color, var(--sn-sys-on-surface));
  font-family: inherit;
  font-size: var(--sn-pack-card-action-size, var(--sn-text-sm, 12px));
  cursor: pointer;
  transition: background var(--sn-transition-fast, 120ms) var(--sn-transition-easing, ease),
              border-color var(--sn-transition-fast, 120ms) var(--sn-transition-easing, ease);
}

sn-pack-card .sn-pack-card-action:hover {
  background: var(--sn-pack-card-action-hover-bg, color-mix(in oklab, currentColor 8%, transparent));
}

sn-pack-card .sn-pack-card-action:focus-visible {
  outline: var(--sn-pack-card-action-focus-ring, 2px solid var(--sn-sys-focus-ring));
  outline-offset: 2px;
}

sn-pack-card .sn-pack-card-action-primary {
  border-color: var(--sn-pack-card-action-primary-border, var(--sn-accent, currentColor));
  background: var(--sn-pack-card-action-primary-bg, var(--sn-accent, transparent));
  color: var(--sn-pack-card-action-primary-color, var(--sn-accent-contrast, var(--sn-sys-on-surface)));
}
`;
