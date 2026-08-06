import { html } from '@symbiotejs/symbiote';

export default html`
  <div ref="popover" class="sn-tour-popover" role="dialog" aria-label="Tour Popover">
    <div class="sn-tour-header">
      <span class="sn-tour-title">{{currentTitle}}</span>
      <button ref="closeBtn" type="button" class="sn-tour-close-btn" aria-label="Close tour">
        <span class="material-symbols-outlined sn-tour-icon">close</span>
      </button>
    </div>
    <div class="sn-tour-body">{{currentDescription}}</div>
    <div class="sn-tour-footer">
      <span class="sn-tour-progress">{{progressText}}</span>
      <div class="sn-tour-buttons">
        <button ref="prevBtn" type="button" class="sn-tour-btn">Back</button>
        <button ref="nextBtn" type="button" class="sn-tour-btn" data-primary>{{nextBtnLabel}}</button>
      </div>
    </div>
  </div>
`;
