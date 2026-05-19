export default `
  <div class="qo-overlay">
    <div class="qo-dialog" ${{onclick: 'onDialogClick'}}>
      <div class="qo-input-wrap">
        <span class="material-symbols-outlined qo-icon">search</span>
        <input class="qo-input" type="text" placeholder="Search files… (↑↓ navigate, Enter open)"
          ${{oninput: 'onInput', onkeydown: 'onKeydown'}}>
        <kbd class="qo-kbd">ESC</kbd>
      </div>
      <div class="qo-results" bind="innerHTML: resultsHTML"
        ${{onclick: 'onResultClick'}}></div>
    </div>
  </div>
`;
