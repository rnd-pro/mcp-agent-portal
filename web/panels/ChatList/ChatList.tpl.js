export default /*html*/ `
<div class="chat-list-wrapper">
  <div class="chat-list-header">
    <span class="material-symbols-outlined" style="font-size:16px">forum</span>
    <span>Chats</span>
    <button class="new-chat-btn" ref="newChatBtn">
      <span class="material-symbols-outlined">add</span>
      New
    </button>
  </div>
  <div class="filter-bar">
    <button class="filter-btn" active data-filter="all">All</button>
    <button class="filter-btn" data-filter="project">By Project</button>
    <button class="filter-btn" data-filter="active">Active</button>
  </div>
  <div class="chat-items" ref="chatItems"></div>
</div>
`;
