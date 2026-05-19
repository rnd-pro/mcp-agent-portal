import { html } from '@symbiotejs/symbiote';

export default html`
<div class="chat-shell">
  <chat-sidebar></chat-sidebar>

  <div class="chat-view" ref="chatView">
    <cell-bg ref="cellBg"></cell-bg>

    <div ref="chatMessages" class="chat-messages" ${{ itemize: 'messageItems', 'item-tag': 'chat-message-item' }}></div>
    <button class="scroll-bottom-btn" ref="scrollBottomBtn" title="Scroll to bottom" ${{ onclick: 'onScrollToBottom' }}>
      <span class="material-symbols-outlined">arrow_downward</span>
    </button>

    <div class="chat-composer" ref="composer" ${{ ondragover: 'onDragOver', ondragleave: 'onDragLeave', ondrop: 'onDrop' }}>
      <div class="chat-context-bar" itemize="attachedContext">
        <div class="context-chip" title="{{title}}">
          <span class="material-symbols-outlined icon-sm">{{icon}}</span>
          <span class="context-path">{{name}}</span>
          <button class="context-remove" ${{ '@data-key': 'key', onclick: '^onRemoveContext' }}>×</button>
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
