/**
 * QuickToolbar template
 * @module symbiote-ui/toolbar/QuickToolbar.tpl
 */
import { html } from '@symbiotejs/symbiote';

export let template = html`
  <div class="toolbar" ${{ onclick: 'onBtnClick' }}>
    <div class="toolbar-title" ref="titleRow" ${{ hidden: '!hasTitle' }}>
      <span class="toolbar-title-text" ref="titleText" ${{ textContent: 'nodeTitle' }}></span>
    </div>
    <div class="toolbar-actions">
      <sn-button class="tb-btn tb-btn--enter" variant="icon" data-action="enter" ${{ title: 'enterSubgraphTitle' }} hidden>
        <span class="material-symbols-outlined tb-icon">login</span>
      </sn-button>
      <sn-button class="tb-btn" variant="icon" data-action="explore" ${{ title: 'exploreConnectionsTitle' }}>
        <span class="material-symbols-outlined tb-icon">hub</span>
      </sn-button>
      <sn-button class="tb-btn" variant="icon" data-action="view-code" ${{ title: 'viewCodeTitle' }}>
        <span class="material-symbols-outlined tb-icon">code</span>
      </sn-button>
      <sn-button class="tb-btn" variant="icon" data-action="duplicate" ${{ title: 'duplicateTitle' }}>
        <span class="material-symbols-outlined tb-icon">content_copy</span>
      </sn-button>

      <sn-button class="tb-btn" variant="icon" data-action="mute" ${{ title: 'muteTitle' }}>
        <span class="material-symbols-outlined tb-icon">visibility_off</span>
      </sn-button>
      <sn-button class="tb-btn tb-btn--danger" variant="icon" data-action="delete" ${{ title: 'deleteTitle' }}>
        <span class="material-symbols-outlined tb-icon">delete</span>
      </sn-button>
    </div>
  </div>
`;
