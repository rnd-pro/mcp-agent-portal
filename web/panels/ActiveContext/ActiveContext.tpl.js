export default`
<div class="ctx-shell">
  <div class="ctx-header">
    <div class="ctx-title">Tracked Context</div>
    <sn-button variant="icon" ${{onclick: 'onRefresh'}}>
      <span class="material-symbols-outlined">refresh</span>
    </sn-button>
  </div>
  <div class="ctx-file-list" ref="fileList"></div>
</div>
`;
