import { html } from '@symbiotejs/symbiote';

export let progressBarTemplate = html`
  <div class="sn-progress-bar-fill" ${{ 'style.width': 'percentageHtml' }}></div>
`;

export let progressRingTemplate = html`
  <svg class="sn-progress-ring-svg" viewBox="0 0 36 36">
    <circle class="sn-progress-ring-track" cx="18" cy="18" r="16"></circle>
    <circle class="sn-progress-ring-fill" cx="18" cy="18" r="16"
      ${{
        'stroke-dasharray': 'strokeDashArray',
        'stroke-dashoffset': 'strokeDashOffset'
      }}></circle>
  </svg>
`;

export let spinnerTemplate = html`
  <span class="sn-spinner-indicator"></span>
`;
