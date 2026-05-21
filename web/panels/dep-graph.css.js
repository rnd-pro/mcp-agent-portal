// Portal-only styles for project graph metadata, semantic legend, and pin overlays.
export default `
:host {
  display: block;
}

pg-dep-graph {
  display: block;
  height: 100%;
}

.pcb-clusters {
  position: absolute;
  top: 48px;
  right: 8px;
  display: grid;
  gap: 4px;
  z-index: 160;
  max-width: 260px;
  max-height: calc(100% - 112px);
  overflow: hidden auto;
  padding: 6px;
  border: 1px solid var(--sn-border-subtle, rgba(255, 255, 255, 0.1));
  min-width: 240px;
  background: var(--sn-bg-overlay, rgba(18, 18, 18, 0.9));
  box-shadow: var(--sn-shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.2));
}

.pcb-clusters[hidden] {
  display: none;
}

.pcb-cluster-row {
  min-height: 24px;
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  padding: 3px 4px;
  color: var(--sn-text, #e0e0e0);
  font-family: var(--sn-font, 'SF Mono', monospace);
  font-size: 10px;
}

.pcb-cluster-label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pcb-cluster-swatch {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1px solid var(--sn-border-subtle, rgba(255, 255, 255, 0.18));
}

.pcb-metadata-dialog {
  width: min(760px, calc(100vw - 32px));
  height: min(640px, calc(100vh - 32px));
  padding: 0;
  border: 1px solid var(--sn-border-subtle, rgba(255, 255, 255, 0.14));
  border-radius: 6px;
  background: var(--sn-bg, #1a1a1a);
  color: var(--sn-text, #e0e0e0);
  z-index: 500;
  box-sizing: border-box;
}

.pcb-metadata-dialog::backdrop {
  background: var(--sn-bg-overlay, rgba(0, 0, 0, 0.55));
}

.pcb-metadata-dialog form {
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.pcb-metadata-dialog header,
.pcb-metadata-dialog footer {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.035);
  box-sizing: border-box;
}

.pcb-metadata-dialog header {
  justify-content: space-between;
  border-bottom: 1px solid var(--sn-border-subtle, rgba(255, 255, 255, 0.08));
  min-width: 0;
}

.pcb-metadata-dialog footer {
  justify-content: flex-end;
  flex-wrap: wrap;
  border-top: 1px solid var(--sn-border-subtle, rgba(255, 255, 255, 0.08));
  min-width: 0;
}

.pcb-metadata-dialog h3 {
  margin: 0;
  font-family: var(--sn-font, 'SF Mono', monospace);
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pcb-metadata-dialog textarea {
  width: 100%;
  min-width: 0;
  min-height: 0;
  resize: none;
  border: 0;
  outline: 0;
  padding: 12px;
  box-sizing: border-box;
  background: var(--sn-bg-overlay, rgba(0, 0, 0, 0.28));
  color: var(--sn-text, #e0e0e0);
  font-family: var(--sn-font, 'SF Mono', monospace);
  font-size: 11px;
  line-height: 1.55;
  tab-size: 2;
}

.pcb-icon-btn {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid var(--sn-border-subtle, rgba(255, 255, 255, 0.1));
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--sn-text, #e0e0e0);
  cursor: pointer;
}

.pcb-icon-btn:focus-visible {
  outline: 2px solid var(--sn-node-selected, #4c8bf5);
  outline-offset: 2px;
}

.pcb-icon-btn:hover {
  background: var(--sn-node-hover, #2d2d2d);
}

.pcb-icon-btn .material-symbols-outlined {
  font-size: 16px;
}

.pcb-metadata-status {
  flex: 1 1 180px;
  min-width: 0;
  color: var(--sn-text-dim, #888888);
  font-family: var(--sn-font, 'SF Mono', monospace);
  font-size: 10px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.pcb-metadata-status[data-error] {
  color: var(--sn-danger-color, #f44336);
}

.pcb-metadata-status[data-success] {
  color: var(--sn-success-color, #4caf50);
}

.pcb-metadata-dialog[data-saving] .graph-explorer-btn,
.pcb-metadata-dialog[data-saving] .pcb-icon-btn {
  opacity: 0.58;
  pointer-events: none;
}

.pcb-pin-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
  opacity: 0;
  transition: opacity 0.25s ease-in-out;
}

.pcb-pin-overlay[data-visible] {
  opacity: 1;
}

.pcb-pin {
  position: absolute;
  font-family: var(--sn-font, 'JetBrains Mono', monospace);
  font-size: 8px;
  line-height: 1;
  white-space: nowrap;
  color: var(--sn-text-dim, #888);
  pointer-events: auto;
  cursor: default;
}

.pcb-pin::before {
  content: '';
  position: absolute;
  top: 50%;
  width: 4px;
  height: 4px;
  background: var(--sn-conn-color, #4c8bf5);
  border-radius: 50%;
  transform: translateY(-50%);
}

.pcb-pin[data-side="left"] {
  left: -4px;
  transform: translateX(-100%);
  text-align: right;
  padding-right: 8px;
}

.pcb-pin[data-side="left"]::before {
  right: 0;
}

.pcb-pin[data-side="right"] {
  right: -4px;
  transform: translateX(100%);
  text-align: left;
  padding-left: 8px;
}

.pcb-pin[data-side="right"]::before {
  left: 0;
}

.pcb-pin[data-kind="class"] {
  color: var(--sn-cat-control, #ff9800);
  font-weight: 600;
}

.pcb-pin[data-kind="fn"] {
  color: var(--sn-text, #e0e0e0);
}

.pcb-pin:hover {
  color: var(--sn-node-selected, #4c8bf5);
  text-shadow: var(--sn-accent-glow, 0 0 4px rgba(76, 139, 245, 0.4));
}

.pcb-pin[style*="cursor: pointer"]:hover::after {
  content: '->';
  margin-left: 3px;
  font-size: 7px;
  opacity: 0.6;
}
`;
