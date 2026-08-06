import { html } from '@symbiotejs/symbiote';

export default html`
  <chat-sidebar-shell class="chat-workspace-sidebar" ref="sidebar"></chat-sidebar-shell>
  <section class="chat-workspace-main">
    <cell-bg class="chat-workspace-bg" ref="background"></cell-bg>
    <chat-transcript class="chat-workspace-transcript" ref="transcript"></chat-transcript>
    <chat-composer class="chat-workspace-composer" ref="composer"></chat-composer>
  </section>
`;
