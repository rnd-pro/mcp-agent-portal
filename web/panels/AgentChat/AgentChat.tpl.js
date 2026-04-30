import { html } from '@symbiotejs/symbiote';

export default html`
<div class="chat-shell">
  <div class="chat-nav">
    <div class="chat-nav-header">
      <button class="nav-btn nav-btn-add" ${{ onclick: 'onNewChat' }} title="New chat">
        <span class="material-symbols-outlined">add</span>
      </button>
      <span class="nav-title">Chats</span>
      <div class="nav-spacer"></div>
      <button class="nav-btn" ${{ onclick: 'onToggleNav' }}>
        <span class="material-symbols-outlined chat-nav-collapse-icon">chevron_left</span>
      </button>
    </div>
    <div class="chat-items"></div>
  </div>

  <div class="chat-view" ref="chatView">
    <cell-bg ref="cellBg"></cell-bg>

    <div class="chat-messages" ref="chatMessages" style="position: relative; z-index: 1;"></div>

    <div class="chat-composer" ref="composer" ${{ ondragover: 'onDragOver', ondragleave: 'onDragLeave', ondrop: 'onDrop' }}>
      <div class="chat-context-bar" itemize="attachedContext">
        <div class="context-chip">
          <span class="material-symbols-outlined" style="font-size:14px">description</span>
          <span class="context-path">{{path}}</span>
          <button class="context-remove" data-path="{{path}}" ${{ onclick: '^onRemoveContext' }}>×</button>
        </div>
      </div>
      <div class="composer-body">
        <textarea ref="chatInput" rows="1"
          ${{ disabled: 'isInputDisabled', placeholder: 'inputPlaceholder',
              oninput: 'onInput', onkeydown: 'onKeyDown' }}></textarea>
        <button class="btn-send" ref="btnSend" ${{ onclick: 'onSend' }}>
          <span class="material-symbols-outlined" ref="sendIcon">arrow_upward</span>
        </button>
      </div>
      <div class="composer-footer" ${{ innerHTML: 'composerFooterHtml', onchange: 'onParamChangeDelegated' }}></div>
      <div class="autocomplete-popup" ref="autocompletePopup"></div>
    </div>
  </div>
</div>
`;
