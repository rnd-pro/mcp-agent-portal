import { html } from '@symbiotejs/symbiote';

export default html`
<div class="chat-shell">
  <chat-sidebar></chat-sidebar>

  <div class="chat-view" ref="chatView">
    <cell-bg ref="cellBg"></cell-bg>

    <chat-transcript ref="chatTranscript"></chat-transcript>

    <chat-composer ref="composer"></chat-composer>
  </div>
</div>
`;
