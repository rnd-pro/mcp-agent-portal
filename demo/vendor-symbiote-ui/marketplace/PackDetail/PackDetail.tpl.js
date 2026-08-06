import { html } from '@symbiotejs/symbiote';

export const packDetailTemplate = html`
  <sn-card class="sn-pack-detail-surface" variant="panel">
    <div slot="title" class="sn-pack-detail-head">
      <span class="sn-pack-detail-name" ${{ textContent: 'name' }}></span>
      <sn-badge class="sn-pack-detail-version" variant="info" ${{ textContent: 'version' }}></sn-badge>
    </div>

    <p class="sn-pack-detail-description" ${{ '@hidden': '!hasDescription', textContent: 'description' }}></p>

    <sn-banner class="sn-pack-detail-readiness-banner" ${{ '@hidden': '!hasReadiness' }}>
      <sn-status-light ${{ variant: 'readinessVariant', textContent: 'readinessLabel' }}></sn-status-light>
      <span class="sn-pack-detail-next-action" ${{ '@hidden': '!hasNextAction', textContent: 'nextActionText' }}></span>
    </sn-banner>

    <section class="sn-pack-detail-section">
      <h4 class="sn-pack-detail-section-title" ${{ textContent: 'manifestTitle' }}></h4>
      <sn-description-list class="sn-pack-detail-manifest" ref="manifest"></sn-description-list>
    </section>

    <section class="sn-pack-detail-section" ${{ '@hidden': '!hasMissing' }}>
      <h4 class="sn-pack-detail-section-title" ${{ textContent: 'missingTitle' }}></h4>
      <div class="sn-pack-detail-missing" ${{ itemize: 'missingList', 'item-tag': 'sn-pack-detail-missing-item' }}></div>
    </section>

    <section class="sn-pack-detail-section">
      <sn-empty-state class="sn-pack-detail-no-missing" ${{ '@hidden': 'hasMissing || !hasReadiness', textContent: 'noMissingText' }}></sn-empty-state>
    </section>

    <section class="sn-pack-detail-section" ${{ '@hidden': '!showPreview' }}>
      <h4 class="sn-pack-detail-section-title" ${{ textContent: 'previewTitle' }}></h4>
      <template-preview class="sn-pack-detail-preview"></template-preview>
    </section>

    <div slot="footer" class="sn-pack-detail-footer">
      <button class="sn-pack-detail-action" ${{ '@hidden': '!showPreview', onclick: 'onPreview' }}>
        <span ${{ textContent: 'previewLabel' }}></span>
      </button>
      <button class="sn-pack-detail-action sn-pack-detail-action-primary" ${{ '@hidden': '!showInstall', onclick: 'onInstall' }}>
        <span ${{ textContent: 'installLabel' }}></span>
      </button>
    </div>
  </sn-card>
`;

export const packDetailMissingTemplate = html`
  <div class="sn-pack-detail-missing-row">
    <sn-status-light variant="error"></sn-status-light>
    <span class="sn-pack-detail-missing-group" ${{ textContent: 'group' }}></span>
    <span class="sn-pack-detail-missing-id" ${{ textContent: 'id' }}></span>
  </div>
`;
