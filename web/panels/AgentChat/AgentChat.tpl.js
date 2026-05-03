import { html } from '@symbiotejs/symbiote';

export default html`
<div class="chat-shell">
  <chat-sidebar></chat-sidebar>

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
