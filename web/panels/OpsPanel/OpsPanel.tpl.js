export default `
  <div class="pg-mon-header">
    <span>Events: </span><span bind="textContent: eventCount"></span>
  </div>
  <div class="pg-mon-body">
    <div \${{ itemize: 'eventsList', 'item-tag': 'pg-event-widget' }}></div>
    <div class="pg-placeholder" \${{ hidden: 'eventCount' }}>Waiting for tool calls...</div>
  </div>
`;
