import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-source-diff">
    <div class="sn-source-diff-toolbar">
      <div class="sn-source-diff-info">
        <span class="sn-source-diff-filename">{{path}}</span>
        <span class="sn-source-diff-stats" ${{ textContent: 'statsText' }}></span>
      </div>
      <div class="sn-source-diff-actions">
        <button class="sn-source-diff-mode-btn" ${{ onclick: 'onToggleLayout' }}>
          <span class="material-symbols-outlined" ${{ textContent: 'layoutIcon' }}></span>
          <span ${{ textContent: 'layoutText' }}></span>
        </button>
        <button class="sn-source-diff-btn sn-source-diff-accept" ${{ onclick: 'onAcceptAll' }}>
          <span class="material-symbols-outlined">check_circle</span>
          <span>Accept All</span>
        </button>
        <button class="sn-source-diff-btn sn-source-diff-reject" ${{ onclick: 'onRejectAll' }}>
          <span class="material-symbols-outlined">cancel</span>
          <span>Reject All</span>
        </button>
        <button class="sn-source-diff-btn sn-source-diff-request" ${{ onclick: 'onRequestChanges' }}>
          <span class="material-symbols-outlined">rate_review</span>
          <span>Request Changes</span>
        </button>
      </div>
    </div>
    <div class="sn-source-diff-body" ${{ innerHTML: 'diffHtml', onclick: 'onBodyClick' }}></div>
  </div>
`;
