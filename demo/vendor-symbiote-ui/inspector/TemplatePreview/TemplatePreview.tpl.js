/**
 * TemplatePreview template
 * @module symbiote-ui/inspector/TemplatePreview.tpl
 */
import { html } from '@symbiotejs/symbiote';

export let template = html`
  <div class="tpl-preview-section">
    <div class="tpl-chips-label">
      <span class="material-symbols-outlined">sell</span> <span ${{ textContent: 'placeholdersLabel' }}></span>
    </div>
    <div class="tpl-chips" itemize="placeholderChips">
      <template>
        <span class="tpl-chip">{{name}}</span>
      </template>
    </div>
    <div class="tpl-chips-empty" ${{ '@hidden': '!noPlaceholders' }}>
      <span ${{ textContent: 'emptyLabel' }}></span>
    </div>
  </div>
  <div class="tpl-preview-section">
    <div class="tpl-preview-label">
      <span class="material-symbols-outlined">data_object</span> <span ${{ textContent: 'testDataLabel' }}></span>
    </div>
    <textarea class="tpl-test-data" rows="3" spellcheck="false"></textarea>
  </div>
  <div class="tpl-preview-section">
    <div class="tpl-preview-label">
      <span class="material-symbols-outlined">visibility</span> <span ${{ textContent: 'previewLabel' }}></span>
    </div>
    <div class="tpl-preview-result" ${{ textContent: 'previewText' }}></div>
  </div>
`;
