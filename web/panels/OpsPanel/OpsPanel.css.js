export default `
:host {
  display: block;
}

  pg-ops-panel { display:flex; flex-direction:column; height:100%; overflow:hidden; font-size:12px; font-family:var(--sn-font); }
  .pg-mon-header { padding:6px 12px; border-bottom:1px solid var(--sn-node-border); background:var(--sn-node-header-bg); font-size:11px; color:var(--sn-text-dim); flex-shrink: 0; }
  .pg-mon-body { flex:1; overflow-y:auto; padding:8px; display: flex; flex-direction: column; gap: 8px; }
  
  pg-event-widget { display: block; border: 1px solid var(--sn-node-border); border-radius: 6px; background: var(--sn-bg-overlay); }
  .pg-mon-event { padding: 8px; animation: slideIn 0.2s ease; }
  .event-header { display:flex; align-items:center; gap:8px; font-family:var(--sn-font-mono); font-size:11px; margin-bottom: 6px; }
  .pg-mon-arrow { font-weight:bold; width:14px; }
  .pg-mon-event[data-is-call="true"] .pg-mon-arrow { color: var(--sn-cat-server); }
  .pg-mon-event[data-is-call="false"] .pg-mon-arrow { color: var(--sn-success-color); }
  .pg-mon-tool { color:var(--sn-text); font-weight:600; min-width:100px; }
  .pg-mon-time { color:var(--sn-text-dim); font-size:10px; flex:1; text-align:right; }
  .pg-mon-duration { color: var(--sn-cat-data); font-size: 10px; }
  
  .event-body { font-family: var(--sn-font-mono); font-size: 11px; color: var(--sn-text-dim); background: var(--sn-bg-overlay); padding: 6px; border-radius: 4px; word-break: break-all; }
  .result-body { color: var(--sn-text); }
  
  .code-widget pre { margin: 0; white-space: pre-wrap; font-family: var(--sn-font-mono); font-size: 10px; color: var(--sn-text-dim); }
  
  .raw-output { margin: 0; white-space: pre-wrap; font-size: 10px; max-height: 200px; overflow-y: auto; color: var(--sn-text-dim); }
  .error-msg { color: var(--sn-danger-color); font-weight: bold; }
  
  .pg-placeholder { color:var(--sn-text-dim); text-align:center; padding:30px; font-style:italic; }
  @keyframes slideIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
`;
