import { html } from '@symbiotejs/symbiote';

export default html`
<div class="ui-header">
  <div class="ui-title-large">
    <span class="material-symbols-outlined">monitor_heart</span>
    Runtime Control
  </div>
  <sn-button ref="refreshBtn" title="Refresh runtime status">
    <span class="material-symbols-outlined rtc-btn-icon">refresh</span>
    Refresh
  </sn-button>
</div>

<div class="rtc-main">
  <div class="rtc-state" ref="stateBanner" hidden></div>

  <div class="rtc-summary" ref="summaryGrid"></div>

  <div class="rtc-section-head">
    <div>
      <div class="ui-card-title">Active Instances</div>
    </div>
    <div class="rtc-updated" ref="updatedAt"></div>
  </div>

  <sn-empty-state class="rtc-empty" ref="instanceEmpty" hidden></sn-empty-state>
  <div class="rtc-instance-list" ref="instanceGrid" ${{ itemize: 'instances', 'item-tag': 'rc-instance-item' }}></div>
</div>
`;
