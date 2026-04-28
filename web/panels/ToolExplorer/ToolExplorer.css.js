export default `
.te-tools-grid {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  align-content: start;
}

.te-tool-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--sn-node-selected);
  font-family: var(--sn-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
}

.te-tool-desc {
  font-size: 12px;
  opacity: 0.8;
  line-height: 1.5;
}

.te-schema-block {
  background: var(--sn-bg);
  padding: 10px;
  border-radius: 6px;
  font-family: var(--sn-font-mono, ui-monospace, SFMono-Regular, monospace);
  font-size: 11px;
  overflow-x: auto;
  color: #a8b2d1;
  white-space: pre-wrap;
  border: 1px solid var(--sn-node-border);
}

.te-schema-title {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--sn-text-dim);
  margin-bottom: 6px;
}
`;
