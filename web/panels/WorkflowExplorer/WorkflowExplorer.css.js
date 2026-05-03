export default `
:host {
  display: block;
  height: 100%;
}
.step-card {
  margin-bottom: 12px;
  background: var(--sn-node-bg, rgba(0,0,0,0.1));
  border: 1px solid var(--sn-node-border, rgba(255,255,255,0.1));
  border-radius: 6px;
  overflow: hidden;
}
.step-header {
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  background: rgba(0,0,0,0.05);
  font-weight: 500;
}
.step-header:hover {
  background: rgba(255,255,255,0.05);
}
.step-content {
  padding: 16px;
  border-top: 1px solid var(--sn-node-border, rgba(255,255,255,0.1));
  display: none;
}
.step-card.expanded .step-content {
  display: block;
}
.step-card.expanded .step-header {
  background: rgba(255,255,255,0.05);
}
.node-id {
  font-size: 11px;
  font-family: monospace;
  color: var(--sn-text-dim);
  background: rgba(0,0,0,0.2);
  padding: 2px 6px;
  border-radius: 4px;
}
`;
