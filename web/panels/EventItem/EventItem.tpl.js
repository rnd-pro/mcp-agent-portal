// @ctx .context/web/panels/EventItem/EventItem.tpl.ctx
export default`
<div class="event-row">
  <span class="event-icon" ref="statusIcon">
    <span class="material-symbols-outlined">{{icon}}</span>
  </span>
  <span class="event-time" ref="time"></span>
  <span class="event-type" ref="typeLabel">{{type}}</span>
  <span class="event-tool">{{tool}}</span>
  <span class="event-project">{{_projectName}}</span>
  <span class="event-duration">{{durationText}}</span>
  <span class="event-chevron">
    <span class="material-symbols-outlined" ref="chevron">expand_more</span>
  </span>
</div>
<div class="event-details" ref="details">
  <pre class="event-args">{{detailsText}}</pre>
</div>
`;