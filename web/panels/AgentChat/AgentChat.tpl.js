import { html } from '@symbiotejs/symbiote';

export default html`
<div class="chat-shell">
  <chat-sidebar></chat-sidebar>

  <chat-workspace class="chat-workspace-view" ref="workspace" sidebar="hidden"></chat-workspace>
</div>
`;
