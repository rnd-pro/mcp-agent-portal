import { html } from '@symbiotejs/symbiote';

export let template = html`
  <div class="sn-node-header">
    <span class="sn-node-icon material-symbols-outlined">{{nodeIcon}}</span>
    <span class="sn-node-label">{{nodeLabel}}</span>
  </div>
  <div class="sn-node-media" ${{ '@hidden': '!mediaSrc' }}>
    <img ref="mediaImage" class="sn-node-media-img" draggable="false" alt="{{mediaAlt}}" ${{ src: 'mediaSrc' }}>
    <button ref="mediaActivate" type="button" class="sn-node-media-activate" ${{ '@hidden': '!isMediaActivatable', '@aria-label': 'mediaActivateLabel', onpointerdown: 'onMediaPointerDown', onclick: 'onMediaActivate' }}></button>
  </div>
  <div class="sn-node-body">
    <div class="inputs" ${{ itemize: 'inputPorts', 'item-tag': 'port-item' }}></div>
    <div class="sn-node-content" ${{ '@hidden': '!summary' }}>
      <p class="sn-node-summary">{{summary}}</p>
      <a ref="contentLink" class="sn-node-link" ${{ '@hidden': '!href', '@href': 'linkHref', '@target': 'linkTarget', '@rel': 'linkRel' }}>
        <span>{{linkLabel}}</span>
        <span class="material-symbols-outlined">{{linkIcon}}</span>
      </a>
    </div>
    <div class="sn-node-items" itemize="itemsList" ${{ '@hidden': '!hasItems' }}>
      <template>
        <a class="sn-node-item" ${{ '@href': 'href', '@target': 'target', '@rel': 'rel' }}>
          <span class="sn-node-item-kicker">{{kicker}}</span>
          <span class="sn-node-item-title">{{title}}</span>
          <span class="sn-node-item-summary">{{summary}}</span>
        </a>
      </template>
    </div>
    <div class="controls" ${{ itemize: 'controlsList', 'item-tag': 'ctrl-item' }}></div>
    <div class="outputs" ${{ itemize: 'outputPorts', 'item-tag': 'port-item' }}></div>
  </div>
  <div ref="previewArea" class="sn-preview" hidden></div>
`;
