export default /*css*/ `
sn-empty-state {
  display: flex;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  gap: var(--sn-empty-state-gap);
  width: 100%;
  min-height: var(--sn-empty-state-min-height);
  height: var(--sn-empty-state-height);
  padding: var(--sn-empty-state-padding);
  color: var(--sn-empty-state-color);
  font-family: var(--sn-font);
  font-size: var(--sn-empty-state-font-size);
  font-style: var(--sn-empty-state-font-style);
  line-height: var(--sn-empty-state-line-height);
  text-align: center;
}

sn-empty-state[hidden] {
  display: none !important;
}

sn-empty-state[variant="error"] {
  color: var(--sn-empty-state-error-color);
}

sn-empty-state .material-symbols-outlined {
  flex: 0 0 auto;
  font-size: var(--sn-empty-state-icon-size);
  line-height: 1;
}
`;
