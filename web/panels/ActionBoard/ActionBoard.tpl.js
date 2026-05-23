export default`
<div class="ab-shell">
  <div class="ab-stats">
    <sn-metric variant="stacked"><span slot="label">Flywheel Invocations</span><span slot="value" bind="textContent: fwTotal">--</span></sn-metric>
    <sn-metric variant="stacked"><span slot="label">Avg Duration</span><span slot="value"><span bind="textContent: fwDuration">--</span><span class="ab-stat-unit">ms</span></span></sn-metric>
    <sn-metric variant="stacked" status="success"><span slot="label">Skills Created</span><span slot="value" bind="textContent: fwSkills">--</span></sn-metric>
  </div>
  <sn-event-feed ref="eventFeed"></sn-event-feed>
</div>
`;
