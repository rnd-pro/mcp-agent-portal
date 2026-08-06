/**
 * InspectorPanel template
 * @module symbiote-ui/inspector/InspectorPanel.tpl
 */
import { html } from '@symbiotejs/symbiote';

export let template = html`
  <div class="insp-resize-handle"></div>

  <div class="insp-body">
    <div class="insp-empty">
      <span class="material-symbols-outlined">touch_app</span>
      <span ${{ textContent: 'emptyLabel' }}></span>
    </div>

    <div class="insp-content" hidden>
      <div class="insp-field">
        <label ${{ textContent: 'labelLabel' }}></label>
        <div class="insp-value">{{nodeLabel}}</div>
      </div>
      <div class="insp-field">
        <label ${{ textContent: 'typeLabel' }}></label>
        <div class="insp-value insp-tag">{{nodeType}}</div>
      </div>
      <div class="insp-field">
        <label ${{ textContent: 'categoryLabel' }}></label>
        <div class="insp-value insp-tag">{{nodeCategory}}</div>
      </div>
      <div class="insp-field">
        <label>ID</label>
        <div class="insp-value insp-mono">{{nodeId}}</div>
      </div>

      <div class="insp-section">
        <div class="insp-section-title">
          <span class="material-symbols-outlined">input</span> <span ${{ textContent: 'inputsLabel' }}></span>
        </div>
        <div ${{ itemize: 'inputsList', 'item-tag': 'insp-port-item' }}></div>
      </div>

      <div class="insp-section">
        <div class="insp-section-title">
          <span class="material-symbols-outlined">output</span> <span ${{ textContent: 'outputsLabel' }}></span>
        </div>
        <div ${{ itemize: 'outputsList', 'item-tag': 'insp-port-item' }}></div>
      </div>

      <div class="insp-section">
        <div class="insp-section-title">
          <span class="material-symbols-outlined">tune</span> <span ${{ textContent: 'controlsLabel' }}></span>
        </div>
        <div ${{ itemize: 'controlsList', 'item-tag': 'insp-ctrl-item' }}></div>
      </div>

      <div class="insp-template-preview" ${{ '@hidden': '!isTemplateBuilder' }}>
        <template-preview></template-preview>
      </div>

      <div class="insp-fire" ${{ '@hidden': '!isFireable' }}>
        <button class="insp-fire-btn" ${{ onclick: 'onFire' }}>
          <span class="material-symbols-outlined">play_arrow</span>
          <span ${{ textContent: 'fireLabel' }}></span>
        </button>
      </div>

      <div class="insp-subgraph" hidden>
        <div class="insp-section-title">
          <span class="material-symbols-outlined">account_tree</span> <span ${{ textContent: 'subgraphLabel' }}></span>
        </div>
        <div class="insp-field">
          <label ${{ textContent: 'innerNodesLabel' }}></label>
          <div class="insp-value">{{innerNodeCount}}</div>
        </div>
        <button class="insp-enter-btn" ${{ onclick: 'onEnterSubgraph' }}>
          <span class="material-symbols-outlined">login</span>
          <span ${{ textContent: 'enterSubgraphLabel' }}></span>
        </button>
      </div>
    </div>
  </div>
`;

export let inspPortItemTemplate = html`
  <div class="insp-port">
    <span class="insp-port-dot"></span>
    <span class="insp-port-label">{{label}}</span>
    <span class="insp-port-type">{{socketType}}</span>
  </div>
`;

export let inspCtrlItemTemplate = html`
  <div class="insp-ctrl">
    <label class="insp-ctrl-label">{{label}}</label>
    <div class="insp-ctrl-input"></div>
  </div>
`;
