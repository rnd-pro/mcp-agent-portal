export default /*css*/ `
:host,
output-graph-preview {
  display: block;
  color: var(--sn-sys-on-surface);
  font-family: var(--sn-font-ui, inherit);
}

:host([hidden]),
output-graph-preview[hidden] {
  display: none !important;
}

.output-graph-preview {
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

.output-graph-preview-head,
.output-graph-preview-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sn-step-5);
  min-height: 18px;
  color: var(--sn-output-preview-muted, var(--sn-sys-on-surface-dim));
  font-size: var(--sn-text-xs);
}

.output-graph-preview-title {
  overflow: hidden;
  color: var(--sn-output-preview-title, var(--sn-sys-on-surface));
  font-size: var(--sn-text-sm);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.output-graph-preview-count,
.output-graph-preview-foot {
  font-family: var(--sn-font-mono, monospace);
}

.output-graph-preview-empty {
  padding: var(--sn-step-4) 0;
  color: var(--sn-output-preview-muted, var(--sn-sys-on-surface-dim));
  font-size: var(--sn-text-sm);
}

.output-graph-preview-canvas {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
  gap: var(--sn-step-5);
  min-height: 96px;
  padding: var(--sn-step-4);
  border-radius: var(--sn-output-preview-canvas-radius);
  background:
    linear-gradient(var(--sn-output-preview-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--sn-output-preview-grid) 1px, transparent 1px);
  background-size: 16px 16px;
}

.output-graph-preview-node {
  box-sizing: border-box;
  min-width: 0;
  min-height: 52px;
  padding: var(--sn-step-4) var(--sn-step-5);
  border: 1px solid var(--sn-output-preview-item-border);
  border-radius: var(--sn-output-preview-item-radius);
  background: var(--sn-output-preview-item-bg);
}

.output-graph-preview-node-label,
.output-graph-preview-node-kind,
.output-graph-preview-node-description,
.output-graph-preview-edge {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.output-graph-preview-node-label {
  color: var(--sn-output-preview-label, var(--sn-sys-on-surface));
  font-size: var(--sn-text-sm);
  font-weight: 500;
}

.output-graph-preview-node-kind,
.output-graph-preview-node-description,
.output-graph-preview-edge {
  color: var(--sn-output-preview-muted, var(--sn-sys-on-surface-dim));
  font-size: var(--sn-text-2xs);
  line-height: 1.35;
}

.output-graph-preview-node-kind,
.output-graph-preview-edge {
  font-family: var(--sn-font-mono, monospace);
}

.output-graph-preview-edges {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: var(--sn-step-3);
}

.output-graph-preview-edge {
  max-width: 100%;
  padding: var(--sn-step-1, 3px) var(--sn-step-3);
  border-radius: var(--sn-radius-full);
  background: var(--sn-output-preview-edge-bg);
}
`;
