import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-transfer-container">
    <div class="sn-transfer-panel">
      <div ref="sourceHeader" class="sn-transfer-panel-header">{{sourceTitle}}</div>
      <ul ref="sourceList" class="sn-transfer-list" role="listbox" aria-multiselectable="true"></ul>
    </div>

    <div class="sn-transfer-buttons">
      <button ref="toTargetBtn" type="button" class="sn-transfer-btn" aria-label="Move selected right">
        <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
      </button>
      <button ref="toSourceBtn" type="button" class="sn-transfer-btn" aria-label="Move selected left">
        <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
      </button>
    </div>

    <div class="sn-transfer-panel">
      <div ref="targetHeader" class="sn-transfer-panel-header">{{targetTitle}}</div>
      <ul ref="targetList" class="sn-transfer-list" role="listbox" aria-multiselectable="true"></ul>
    </div>
  </div>
`;
