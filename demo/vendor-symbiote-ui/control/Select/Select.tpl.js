import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-select-container">
    <button ref="trigger" type="button" class="sn-select-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false">
      <span ref="valueText" class="sn-select-value-text">{{displayLabel}}</span>
      <span class="material-symbols-outlined sn-select-arrow" aria-hidden="true">expand_more</span>
    </button>
    <div ref="dropdown" class="sn-select-dropdown" role="listbox" tabindex="-1">
      <ul ref="optionsContainer" class="sn-select-options-list"></ul>
    </div>
    <select ref="nativeSelect" style="display: none;"></select>
  </div>
`;
