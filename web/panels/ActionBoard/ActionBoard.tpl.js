export default`
<div class="ab-shell">
  <header class="ab-header">
    <div>
      <div class="ab-eyebrow">Operations</div>
      <h2>Action Board</h2>
      <p bind="textContent: statusText">Loading operational summary</p>
    </div>
    <div class="ab-header-meta">
      <sn-badge variant="info" bind="textContent: runtimeStatus">Loading</sn-badge>
      <span bind="textContent: lastUpdatedText">Waiting for activity</span>
    </div>
  </header>

  <sn-banner class="ab-status-banner" ref="statusBanner" hidden></sn-banner>

  <div class="ab-main">
    <section class="ab-workspace" aria-label="Operations activity">
      <div class="ab-stats">
        <sn-metric variant="stacked"><span slot="label">Tool calls</span><span slot="value" bind="textContent: fwTotal">Loading</span></sn-metric>
        <sn-metric variant="stacked"><span slot="label">Avg latency</span><span slot="value"><span bind="textContent: fwDuration">Loading</span><span class="ab-stat-unit" ref="durationUnit" hidden>ms</span></span></sn-metric>
        <sn-metric variant="stacked" status="success"><span slot="label">Generated skills</span><span slot="value" bind="textContent: fwSkills">Loading</span></sn-metric>
        <sn-metric variant="stacked"><span slot="label">Active events</span><span slot="value" bind="textContent: eventsCount">0</span></sn-metric>
      </div>

      <section class="ab-feed-panel">
        <header class="ab-section-head">
          <span>Activity feed</span>
          <span bind="textContent: feedSummary">No events</span>
        </header>
        <sn-event-feed ref="eventFeed"></sn-event-feed>
        <sn-empty-state class="ab-empty-note" ref="feedEmpty" hidden>No tool activity in this demo session yet</sn-empty-state>
      </section>
    </section>

    <aside class="ab-next-actions" aria-label="Next actions">
      <header class="ab-section-head">
        <span>Next actions</span>
        <span>Demo-safe</span>
      </header>
      <ol class="ab-action-list">
        <li>
          <span class="material-symbols-outlined">forum</span>
          <div><strong>Review public chat flow</strong><span>Confirm the service conversation stays aligned with the demo brief.</span></div>
        </li>
        <li>
          <span class="material-symbols-outlined">account_tree</span>
          <div><strong>Inspect project graph</strong><span>Use the graph route to check structure and navigation readiness.</span></div>
        </li>
        <li>
          <span class="material-symbols-outlined">monitor_heart</span>
          <div><strong>Check runtime health</strong><span>Verify the public demo remains available before client review.</span></div>
        </li>
        <li>
          <span class="material-symbols-outlined">visibility</span>
          <div><strong>Watch activity feed</strong><span>Tool calls appear here as the session produces observable work.</span></div>
        </li>
      </ol>
    </aside>
  </div>
</div>
`;
