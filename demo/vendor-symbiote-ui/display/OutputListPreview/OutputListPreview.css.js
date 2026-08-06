export default /*css*/ `
:host,
output-list-preview {
  display: block;
  color: var(--sn-sys-on-surface);
  font-family: var(--sn-font-ui, inherit);
}

:host([hidden]),
output-list-preview[hidden] {
  display: none !important;
}

.output-list-preview {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--sn-output-preview-gap);
  min-width: 0;
  padding: var(--sn-output-preview-padding);
  border: 1px solid var(--sn-output-preview-border);
  border-radius: var(--sn-output-preview-radius);
  background: var(--sn-output-preview-bg);
}

.output-list-preview-head,
.output-list-preview-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sn-step-5);
  min-height: 18px;
  color: var(--sn-output-preview-muted, var(--sn-sys-on-surface-dim));
  font-size: var(--sn-text-xs);
}

.output-list-preview-title {
  overflow: hidden;
  color: var(--sn-output-preview-title, var(--sn-sys-on-surface));
  font-size: var(--sn-text-sm);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.output-list-preview-count,
.output-list-preview-foot {
  font-family: var(--sn-font-mono, monospace);
}

.output-list-preview-items {
  display: flex;
  flex-direction: column;
  gap: var(--sn-step-3);
  min-width: 0;
}

.output-list-preview-empty {
  padding: var(--sn-step-4) 0;
  color: var(--sn-output-preview-muted, var(--sn-sys-on-surface-dim));
  font-size: var(--sn-text-sm);
}

.output-list-preview-item {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--sn-step-1, 3px) var(--sn-step-5);
  min-height: 38px;
  padding: var(--sn-step-4) var(--sn-step-5);
  border: 1px solid var(--sn-output-preview-item-border);
  border-radius: var(--sn-output-preview-item-radius);
  background: var(--sn-output-preview-item-bg);
}

.output-list-preview-label,
.output-list-preview-description,
.output-list-preview-meta,
.output-list-preview-status {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.output-list-preview-label {
  color: var(--sn-output-preview-label, var(--sn-sys-on-surface));
  font-size: var(--sn-text-sm);
  font-weight: 500;
}

.output-list-preview-description {
  grid-column: 1 / -1;
  color: var(--sn-output-preview-muted, var(--sn-sys-on-surface-dim));
  font-size: var(--sn-text-xs);
  line-height: 1.35;
}

.output-list-preview-meta,
.output-list-preview-status {
  color: var(--sn-output-preview-muted, var(--sn-sys-on-surface-dim));
  font-family: var(--sn-font-mono, monospace);
  font-size: var(--sn-text-2xs);
}

.output-list-preview-status {
  justify-self: end;
  max-width: 120px;
}
`;
