export default `
  <div class="qo-overlay">
    <div class="qo-dialog" onclick="event.stopPropagation()">
      <div class="qo-input-wrap">
        <span class="material-symbols-outlined qo-icon">search</span>
        <input class="qo-input" type="text" placeholder="Search files… (↑↓ navigate, Enter open)"
          oninput="this.closest('pg-quick-open')._onInput(event)"
          onkeydown="this.closest('pg-quick-open')._onKeydown(event)">
        <kbd class="qo-kbd">ESC</kbd>
      </div>
      <div class="qo-results" bind="innerHTML: resultsHTML"
        onclick="const item=event.target.closest('.qo-item');if(item){this.closest('pg-quick-open').$.selectedIdx=+item.dataset.idx;this.closest('pg-quick-open')._onKeydown({key:'Enter',preventDefault(){}});}"></div>
    </div>
  </div>
`;
