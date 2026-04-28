export default`
<div class="ui-card-title">Actions</div>
<div style="display:flex;gap:8px;margin-bottom:16px">
<button class="ui-btn" ref="refreshBtn">↻ Refresh</button>
<button class="ui-btn danger" ref="restartBtn">⟳ Restart</button>
<button class="ui-btn danger" ref="stopBtn">⏹ Stop</button>
</div>
<div ref="restartStatus" style="margin-bottom:16px;font-size:11px;color:var(--sn-text-dim)"></div>

<div class="ui-card-title">Backend</div>
<div class="ui-card" ref="backendCard"></div>

<div class="ui-card-title">Active Instances</div>
<div ref="instanceList"></div>

<div class="ui-card-title">Server Lifecycle</div>
<div class="ui-card" ref="lifecycleCard">
  <div class="pg-stg-metric"><span>Auto-shutdown</span><span class="pg-stg-val" ref="shutdownTimer">—</span></div>
  <div class="pg-stg-metric"><span>Uptime</span><span class="pg-stg-val" ref="uptimeVal">—</span></div>
</div>
`;