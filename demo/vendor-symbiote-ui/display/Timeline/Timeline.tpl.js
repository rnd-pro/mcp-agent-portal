import { html } from '@symbiotejs/symbiote';

export let timelineTemplate = html`
  <slot></slot>
`;

export let timelineItemTemplate = html`
  <div class="sn-timeline-badge-container">
    <div class="sn-timeline-indicator"></div>
    <div class="sn-timeline-connector"></div>
  </div>
  <div class="sn-timeline-item-content">
    <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px;">
      <span class="sn-timeline-title" ${{ textContent: 'title', '@hidden': '!title' }}></span>
      <span class="sn-timeline-time" ${{ textContent: 'time', '@hidden': '!time' }}></span>
    </div>
    <div class="sn-timeline-body">
      <slot></slot>
    </div>
  </div>
`;
