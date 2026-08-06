import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-date-container">
    <button ref="trigger" type="button" class="sn-date-trigger" aria-haspopup="dialog" aria-expanded="false">
      <span class="sn-date-value-text">{{displayLabel}}</span>
      <span class="material-symbols-outlined sn-date-calendar-icon" aria-hidden="true">calendar_today</span>
    </button>
    <div ref="dropdown" class="sn-date-dropdown" role="dialog" aria-label="Calendar dropdown" aria-modal="false" tabindex="-1">
      <div class="sn-calendar-header">
        <button ref="prevBtn" type="button" class="sn-calendar-nav-btn" aria-label="Previous month"><span class="material-symbols-outlined" aria-hidden="true">chevron_left</span></button>
        <span ref="title" class="sn-calendar-title" aria-live="polite">{{calendarTitle}}</span>
        <button ref="nextBtn" type="button" class="sn-calendar-nav-btn" aria-label="Next month"><span class="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>
      </div>
      <div class="sn-calendar-grid" ref="calendarGrid" role="grid" aria-label="Calendar"></div>
    </div>
    <input ref="nativeInput" type="date" class="sn-date-native-input" tabindex="-1" aria-hidden="true">
  </div>
`;
