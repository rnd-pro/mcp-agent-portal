export default`
<div class="ab-shell">
  <div class="ab-stats">
    <div>
      <div class="ab-stat-label">Flywheel Invocations</div>
      <div class="ab-stat-value" bind="textContent: fwTotal">--</div>
    </div>
    <div>
      <div class="ab-stat-label">Avg Duration</div>
      <div class="ab-stat-value"><span bind="textContent: fwDuration">--</span><span class="ab-stat-unit">ms</span></div>
    </div>
    <div>
      <div class="ab-stat-label">Skills Created</div>
      <div class="ab-stat-value" style="color:var(--sn-success-color);" bind="textContent: fwSkills">--</div>
    </div>
  </div>
  <div class="ab-events" itemize="eventsItems" item-tag="pg-event-item"></div>
</div>
`;