export default /*html*/ `
<div class="ui-sidebar" style="width:100%; border-right:none;">
  <div class="ui-sidebar-header">
    <span class="material-symbols-outlined" style="font-size:16px">forum</span>
    <span class="ui-title" style="flex:none">Chats</span>
    <button class="ui-btn" style="margin-left:auto; padding: 4px 10px;" ref="newChatBtn">
      <span class="material-symbols-outlined" style="font-size:14px">add</span>
      New
    </button>
  </div>
  <div class="filter-bar">
    <button class="filter-btn" active data-filter="all">All</button>
    <button class="filter-btn" data-filter="project">By Project</button>
    <button class="filter-btn" data-filter="active">Active</button>
  </div>
  <div class="ui-sidebar-content" style="padding: 4px 0" ref="chatItems"></div>
</div>
`;
