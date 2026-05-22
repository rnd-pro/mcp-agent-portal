export default `
:host {
  display: block;
  height: 100%;
}

.at-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.at-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--sn-node-border);
  background: var(--sn-panel-bg);
}

.at-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--sn-text);
  font-size: 16px;
  font-weight: 600;
}

.at-title .material-symbols-outlined {
  color: var(--sn-node-selected);
}

.at-main {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px;
}

.at-refreshing {
  opacity: 0.5;
}
`;
