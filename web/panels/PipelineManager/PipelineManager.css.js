export default `
:host {
  display: block;
  height: 100%;
}

sn-list-detail-shell {
  height: 100%;
}

.pm-step-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-block-end: 8px;
}

.pm-step-prompt {
  margin-block-end: 12px;
  color: var(--sn-text);
  font-family: var(--sn-font-mono, monospace);
  white-space: pre-wrap;
}

.pm-step-badges {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
`;
