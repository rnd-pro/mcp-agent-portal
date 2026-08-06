import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-editor-container">
    <div class="sn-editor-toolbar" ref="toolbar">
      <button type="button" class="sn-editor-btn" data-command="bold" title="Bold">
        <span class="material-symbols-outlined sn-editor-icon">format_bold</span>
      </button>
      <button type="button" class="sn-editor-btn" data-command="italic" title="Italic">
        <span class="material-symbols-outlined sn-editor-icon">format_italic</span>
      </button>
      <button type="button" class="sn-editor-btn" data-command="underline" title="Underline">
        <span class="material-symbols-outlined sn-editor-icon">format_underlined</span>
      </button>
      <button type="button" class="sn-editor-btn" data-command="insertUnorderedList" title="Bullet List">
        <span class="material-symbols-outlined sn-editor-icon">format_list_bulleted</span>
      </button>
      <button type="button" class="sn-editor-btn" data-command="insertOrderedList" title="Numbered List">
        <span class="material-symbols-outlined sn-editor-icon">format_list_numbered</span>
      </button>
      <button type="button" class="sn-editor-btn" data-command="createLink" title="Link">
        <span class="material-symbols-outlined sn-editor-icon">link</span>
      </button>
      <div ref="linkOverlay" class="sn-editor-link-overlay" hidden>
        <input type="text" ref="linkInput" placeholder="Enter URL..." class="sn-editor-link-input" />
        <button type="button" ref="linkConfirmBtn" class="sn-editor-link-btn confirm">Apply</button>
        <button type="button" ref="linkCancelBtn" class="sn-editor-link-btn cancel">Cancel</button>
      </div>
    </div>
    <div ref="editor" class="sn-editor-body" contenteditable="true"></div>
  </div>
`;
