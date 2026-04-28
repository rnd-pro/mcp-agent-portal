export default`
:host {
  display: block;
  height: 100%;
  overflow-y: auto;
  padding: 16px;
}

.pg-stg-metric {
  display: flex;
  justify-content: space-between;
  padding: 5px 0;
  border-bottom: 1px solid var(--sn-node-hover);
  font-size: 12px;
  color: var(--sn-text);
}

.pg-stg-metric:last-child {
  border-bottom: none;
}

.pg-stg-val {
  font-weight: 600;
  font-family: var(--sn-font-mono, 'JetBrains Mono', 'Fira Code', monospace);
}

.pg-stg-ok {
  color: var(--sn-success-color, #4caf50);
}

.pg-stg-warn {
  color: var(--sn-warning-color, #ff9800);
}

.pg-stg-pulse {
  animation: pg-stg-pulse 1.5s ease infinite;
}

@keyframes pg-stg-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`;