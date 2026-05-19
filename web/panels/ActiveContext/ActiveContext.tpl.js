export default`
<div class="ctx-shell">
  <div class="ctx-header">
    <div class="ctx-title">Tracked Context</div>
    <button class="ui-btn-icon" ${{onclick: 'onRefresh'}}>
      <span class="material-symbols-outlined">refresh</span>
    </button>
  </div>
  <div class="ctx-file-list" ref="fileList"></div>
</div>
`;
