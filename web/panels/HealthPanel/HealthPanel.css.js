export default `
:host {
  display: block;
}

  pg-health-panel { display:block; height:100%; overflow-y:auto; padding:16px; font-family:var(--sn-font, Georgia, serif); }
  .pg-health-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px,1fr)); gap:12px; align-content:start; }
  .pg-health-card {
    background: var(--sn-node-bg);
    border: 1px solid var(--sn-node-border);
    border-radius: 8px;
    padding: 14px;
  }
  .pg-health-score-card { text-align:center; grid-column:1/-1; padding:20px; }
  .pg-health-score { font-size:56px; font-weight:800; font-family:monospace; }
  .pg-health-score.good { color: var(--sn-success-color, hsl(150, 55%, 38%)); }
  .pg-health-score.warning { color: var(--sn-warning-color, hsl(38, 55%, 42%)); }
  .pg-health-score.critical { color: var(--sn-danger-color, hsl(4, 55%, 48%)); }
  .pg-health-score-label { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--sn-text-dim); margin-top:4px; }
  .pg-health-card-title {
    display: flex; align-items: center; gap: 6px;
    font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;
    color:var(--sn-text-dim); margin-bottom:8px;
  }
  .pg-metric { display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid var(--sn-node-hover); font-size:12px; color:var(--sn-text); }
  .pg-metric:last-child { border:none; }
  .pg-metric-val { font-weight:600; font-family:monospace; }
  .pg-metric-warn .pg-metric-val { color:var(--sn-warning-color); }
  .pg-health-note {
    display: flex; align-items: center; gap: 6px;
    margin-top: 12px; padding: 10px 12px;
    font-size: 11px; color: var(--sn-text-dim);
    background: var(--sn-node-bg);
    border: 1px solid var(--sn-node-border);
    border-radius: 6px;
  }
  .pg-placeholder { color:var(--sn-text-dim); text-align:center; padding:40px; font-style:italic; font-size:13px; }
  .pg-pulse { animation:pulse 1.5s ease infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
`;
