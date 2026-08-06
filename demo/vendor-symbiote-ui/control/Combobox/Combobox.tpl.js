import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-combobox-wrapper" ref="wrapper">
    <input ref="nativeInput" type="hidden" />
    <div class="sn-combobox-input-container">
      <input ref="input"
             type="text"
             class="sn-combobox-input"
             ${{ '@placeholder': 'placeholder' }}
             role="combobox"
             aria-autocomplete="list"
             aria-expanded="false" />
      <button ref="trigger" type="button" class="sn-combobox-trigger" aria-label="Toggle options">
        <span class="material-symbols-outlined">arrow_drop_down</span>
      </button>
    </div>

    <div ref="dropdown" class="sn-combobox-dropdown" role="listbox">
      <ul ref="optionsContainer" class="sn-combobox-options"></ul>
      <div ref="empty" class="sn-combobox-empty">No matches found</div>
    </div>
  </div>
`;
