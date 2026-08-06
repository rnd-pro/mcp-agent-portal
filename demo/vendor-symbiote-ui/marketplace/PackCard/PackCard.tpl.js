import { html } from '@symbiotejs/symbiote';

export const packCardTemplate = html`
  <sn-card class="sn-pack-card-surface" variant="panel" interactive ${{ onclick: 'onActivate' }}>
    <div slot="title" class="sn-pack-card-head">
      <span class="sn-pack-card-name" ${{ textContent: 'name' }}></span>
      <sn-badge class="sn-pack-card-version" variant="info" ${{ textContent: 'version' }}></sn-badge>
    </div>

    <div class="sn-pack-card-meta">
      <sn-badge class="sn-pack-card-author" ${{ '@hidden': '!hasAuthor', variant: 'authorVariant' }}>
        <span class="material-symbols-outlined sn-pack-card-verified" ${{ '@hidden': '!verified' }}>verified</span>
        <span ${{ textContent: 'author' }}></span>
      </sn-badge>
      <sn-badge class="sn-pack-card-price" variant="success" ${{ '@hidden': '!hasPrice', textContent: 'price' }}></sn-badge>
    </div>

    <p class="sn-pack-card-description" ${{ '@hidden': '!hasDescription', textContent: 'description' }}></p>

    <div class="sn-pack-card-tags" ${{ '@hidden': '!hasTags', itemize: 'tagList', 'item-tag': 'sn-pack-card-tag' }}></div>

    <div slot="footer" class="sn-pack-card-footer">
      <sn-status-light class="sn-pack-card-readiness" ${{ variant: 'readinessVariant', textContent: 'readinessLabel' }}></sn-status-light>
      <span class="sn-pack-card-actions">
        <button class="sn-pack-card-action" ${{ '@hidden': '!showPreview', onclick: 'onPreview' }}>
          <span ${{ textContent: 'previewLabel' }}></span>
        </button>
        <button class="sn-pack-card-action sn-pack-card-action-primary" ${{ '@hidden': '!showInstall', onclick: 'onInstall' }}>
          <span ${{ textContent: 'installLabel' }}></span>
        </button>
      </span>
    </div>
  </sn-card>
`;

export const packCardTagTemplate = html`<sn-tag variant="neutral">{{label}}</sn-tag>`;
