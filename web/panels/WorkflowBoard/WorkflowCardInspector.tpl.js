import { html } from '@symbiotejs/symbiote';

export default html`
<div class="wci-shell">
  <header class="wci-header">
    <span class="wci-title" ref="title"></span>
    <span class="wci-badge" ref="statusBadge" hidden></span>
  </header>
  <div class="wci-empty" ref="empty"></div>
  <div class="wci-content" ref="content" hidden>
    <section class="wci-agent" ref="agentSection">
      <span class="wci-agent-dot" aria-hidden="true"></span>
      <span class="wci-agent-name" ref="agentName"></span>
      <button type="button" class="wci-chat-btn" ref="chatBtn" hidden></button>
    </section>
    <section class="wci-metrics">
      <div class="wci-metric">
        <span class="wci-metric-label" ref="lblStatus"></span>
        <span class="wci-metric-value" ref="mStatus">—</span>
      </div>
      <div class="wci-metric">
        <span class="wci-metric-label" ref="lblDuration"></span>
        <span class="wci-metric-value" ref="mDuration">—</span>
      </div>
      <div class="wci-metric">
        <span class="wci-metric-label" ref="lblTokens"></span>
        <span class="wci-metric-value" ref="mTokens">—</span>
      </div>
    </section>
    <section class="wci-section" ref="historySection" hidden>
      <div class="wci-section-label" ref="lblHistory"></div>
      <ul class="wci-history-list" ref="historyList"></ul>
    </section>
    <section class="wci-section wci-body-section">
      <div class="wci-section-label" ref="lblBody"></div>
      <code-block class="wci-view" ref="viewer"></code-block>
    </section>
  </div>
</div>
`;
