export default`
<div class="ui-main" style="display:flex; flex-direction:column; height:100%;">
  <div style="padding:16px; border-bottom:1px solid var(--sn-node-border); display:flex; gap:24px; background:var(--sn-node-bg, rgba(0,0,0,0.1)); flex-shrink:0;">
    <div>
      <div style="font-size:11px; text-transform:uppercase; color:var(--sn-text-dim);">Flywheel Invocations</div>
      <div style="font-size:24px; font-weight:600; font-family:monospace;" bind="textContent: fwTotal">--</div>
    </div>
    <div>
      <div style="font-size:11px; text-transform:uppercase; color:var(--sn-text-dim);">Avg Duration</div>
      <div style="font-size:24px; font-weight:600; font-family:monospace;"><span bind="textContent: fwDuration">--</span><span style="font-size:14px; color:var(--sn-text-dim);">ms</span></div>
    </div>
    <div>
      <div style="font-size:11px; text-transform:uppercase; color:var(--sn-text-dim);">Skills Created</div>
      <div style="font-size:24px; font-weight:600; font-family:monospace; color:var(--sn-success-color);" bind="textContent: fwSkills">--</div>
    </div>
  </div>
  <div class="ui-main" style="flex:1; overflow-y:auto;" itemize="eventsItems" item-tag="pg-event-item"></div>
</div>
`;