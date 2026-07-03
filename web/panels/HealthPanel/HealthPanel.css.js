export default `
:host {
  display: block;
}

  pg-health-panel { display:block; height:100%; overflow-y:auto; padding:16px; font-family:var(--sn-font); }
  .pg-health-content { min-height: 100%; }
  .pg-health-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px,1fr)); gap:12px; align-content:start; }
  sn-card { --sn-card-margin-block-end: 0; }
  .pg-health-score-card { text-align:center; grid-column:1/-1; padding:20px; }
  .pg-health-score { font-size:56px; font-weight:800; font-family:var(--sn-font-mono); }
  .pg-health-score.good { color: var(--sn-sys-success); }
  .pg-health-score.warning { color: var(--sn-sys-warning); }
  .pg-health-score.critical { color: var(--sn-sys-danger); }
  .pg-health-score-label { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--sn-sys-on-surface-dim); margin-top:4px; }
  .pg-health-title {
    display: flex; align-items: center; gap: 6px;
    font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;
    color:var(--sn-sys-on-surface-dim); margin-bottom:8px;
  }
  .pg-health-title .material-symbols-outlined { font-size: var(--sn-button-icon-font-size); }
  sn-banner {
    display: flex; align-items: center; gap: 6px;
    margin-top: 12px;
  }
  sn-banner .material-symbols-outlined { font-size: var(--sn-badge-font-size); }
  sn-empty-state { padding:40px; font-style:italic; font-size:13px; }
  .pg-health-error { color:var(--sn-sys-danger); }
  .pg-pulse { animation:pulse 1.5s ease infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
`;
