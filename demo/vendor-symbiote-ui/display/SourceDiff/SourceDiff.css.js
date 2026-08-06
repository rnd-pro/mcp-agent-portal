import { themedScrollFadeBlockStyles } from '../../themes/scroll-fade-styles.js';

export default /*css*/ `
sn-source-diff {
  display: block;
  font-family: var(--sn-font, sans-serif);
  width: 100%;
  box-sizing: border-box;
}

.sn-source-diff {
  background: var(--sn-sys-surface-panel);
  border: 1px solid var(--sn-sys-outline-subtle);
  border-radius: var(--sn-panel-radius, 6px);
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.sn-source-diff-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--sn-step-5) var(--sn-step-8);
  background: var(--sn-sys-surface-toolbar);
  border-block-end: 1px solid var(--sn-sys-outline-subtle);
  flex-wrap: wrap;
  gap: var(--sn-step-4);
}

.sn-source-diff-info {
  display: flex;
  align-items: center;
  gap: var(--sn-step-6);
}

.sn-source-diff-filename {
  font-weight: 500;
  font-size: var(--sn-text-md);
  color: var(--sn-sys-on-surface);
}

.sn-source-diff-stats {
  font-size: var(--sn-text-xs);
  color: var(--sn-sys-on-surface-dim);
}

.sn-source-diff-actions {
  display: flex;
  gap: var(--sn-step-4);
}

.sn-source-diff-mode-btn,
.sn-source-diff-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--sn-step-3);
  background: transparent;
  border: 1px solid var(--sn-sys-outline-subtle);
  border-radius: var(--sn-radius-sm);
  color: var(--sn-sys-on-surface-dim);
  padding: var(--sn-step-2) var(--sn-step-5);
  font-size: var(--sn-text-sm);
  cursor: pointer;
  outline: none;
  transition: background 0.15s, color 0.15s;
}

.sn-source-diff-mode-btn:hover,
.sn-source-diff-btn:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
  color: var(--sn-sys-on-surface);
}

.sn-source-diff-mode-btn .material-symbols-outlined,
.sn-source-diff-btn .material-symbols-outlined {
  font-size: var(--sn-text-xl);
}

.sn-source-diff-accept {
  border-color: var(--sn-sys-success);
  color: var(--sn-sys-success);
}
.sn-source-diff-accept:hover {
  background: color-mix(in oklch, var(--sn-sys-success) var(--sn-sys-state-hover-mix), transparent);
  color: var(--sn-sys-success);
}

.sn-source-diff-reject {
  border-color: var(--sn-sys-danger);
  color: var(--sn-sys-danger);
}
.sn-source-diff-reject:hover {
  background: color-mix(in oklch, var(--sn-sys-danger) var(--sn-sys-state-hover-mix), transparent);
  color: var(--sn-sys-danger);
}

.sn-source-diff-request {
  border-color: var(--sn-sys-warning);
  color: var(--sn-sys-warning);
}

.sn-source-diff-request:hover {
  background: color-mix(in oklch, var(--sn-sys-warning) var(--sn-sys-state-hover-mix), transparent);
  color: var(--sn-sys-warning);
}

.sn-source-diff-body {
  overflow: auto;
  ${themedScrollFadeBlockStyles}
  max-height: 500px;
  min-height: 100px;
}

.sn-source-diff-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--sn-code-font-family, monospace);
  font-size: var(--sn-code-font-size, 12px);
  color: var(--sn-sys-on-surface);
}

/* Hunk Header style */
.sn-source-diff-hunk-header {
  background: color-mix(in oklch, var(--sn-sys-accent) 10%, transparent);
  color: var(--sn-sys-accent);
  font-weight: 500;
  padding: var(--sn-step-3) var(--sn-step-6);
  user-select: none;
  border-bottom: 1px solid var(--sn-sys-outline-subtle);
  border-top: 1px solid var(--sn-sys-outline-subtle);
}

.sn-source-diff-hunk-header td {
  padding: var(--sn-step-3) var(--sn-step-6);
}

.sn-source-diff-hunk-actions {
  display: inline-flex;
  gap: var(--sn-step-4);
  float: right;
}

.sn-source-diff-hunk-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: var(--sn-step-1);
  color: var(--sn-sys-on-surface-dim);
  border-radius: var(--sn-radius-sm);
}
.sn-source-diff-hunk-btn:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
  color: var(--sn-sys-on-surface);
}

.sn-source-diff-row {
  transition: background 0.1s;
}

.sn-source-diff-row:hover {
  background: color-mix(in oklch, var(--sn-sys-accent) var(--sn-sys-state-hover-mix), transparent);
}

.sn-source-diff-gutter {
  width: 45px;
  text-align: right;
  padding: var(--sn-step-1) var(--sn-step-5) var(--sn-step-1) var(--sn-step-2);
  color: var(--sn-sys-on-surface-faint);
  user-select: none;
  border-right: 1px solid var(--sn-sys-outline-subtle);
  vertical-align: top;
  position: relative;
}

/* Comment add anchor button */
.sn-source-diff-comment-btn {
  display: none;
  position: absolute;
  right: var(--sn-step-1);
  top: 50%;
  transform: translateY(-50%);
  background: var(--sn-sys-surface-toolbar);
  border: 1px solid var(--sn-sys-outline);
  color: var(--sn-sys-on-surface);
  border-radius: 50%;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: var(--sn-text-sm);
  font-weight: bold;
}

.sn-source-diff-row:hover .sn-source-diff-comment-btn {
  display: inline-flex;
}

.sn-source-diff-diagnostic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  height: 14px;
  margin-inline-start: var(--sn-step-2);
  border-radius: var(--sn-radius-full);
  background: var(--sn-sys-info);
  color: var(--sn-sys-on-status);
  font-family: var(--sn-font, sans-serif);
  font-size: var(--sn-text-2xs, 9px);
  font-weight: 700;
  line-height: 1;
}

.sn-source-diff-diagnostic[data-severity="error"] {
  background: var(--sn-sys-danger);
}

.sn-source-diff-diagnostic[data-severity="warning"] {
  background: var(--sn-sys-warning);
}

.sn-source-diff-diagnostic[data-severity="hint"] {
  background: var(--sn-sys-on-surface-faint);
}

.sn-source-diff-code {
  padding: var(--sn-step-1) var(--sn-step-6);
  white-space: pre-wrap;
  word-break: break-all;
  vertical-align: top;
}

/* Unified deletion line coloring */
.sn-source-diff-line-delete {
  background-color: color-mix(in oklch, var(--sn-sys-danger) 15%, transparent);
}
.sn-source-diff-line-delete .sn-source-diff-code {
  color: var(--sn-sys-danger);
}

/* Unified addition line coloring */
.sn-source-diff-line-add {
  background-color: color-mix(in oklch, var(--sn-sys-success) 15%, transparent);
}
.sn-source-diff-line-add .sn-source-diff-code {
  color: var(--sn-sys-success);
}

/* Empty placeholder styling for side-by-side */
.sn-source-diff-empty-cell {
  background-color: var(--sn-sys-scrim);
  opacity: 0.5;
}

/* Side by side columns width */
.sn-source-diff-side-by-side td {
  width: 50%;
}
`;
