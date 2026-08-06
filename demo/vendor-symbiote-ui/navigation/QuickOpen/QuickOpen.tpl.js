import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="qo-overlay">
    <div class="qo-dialog" ${{onclick: 'onDialogClick'}}>
      <div class="qo-input-wrap">
        <span class="material-symbols-outlined qo-icon">search</span>
        <input class="qo-input" type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="qo-results-list"
          aria-expanded="false"
          aria-activedescendant=""
          ${{placeholder: 'placeholder', oninput: 'onInput', onkeydown: 'onKeydown'}}>
        <kbd class="qo-kbd">ESC</kbd>
      </div>
      <div class="qo-results" id="qo-results-list" role="listbox" aria-label="Search results" bind="innerHTML: resultsHTML"
        ${{onclick: 'onResultClick'}}></div>
    </div>
  </div>
`;
