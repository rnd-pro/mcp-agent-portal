import { html } from '@symbiotejs/symbiote';

export default html`
  <button
    ref="trigger"
    class="nw-trigger shell-action"
    type="button"
    aria-haspopup="dialog"
    ${{
      onclick: 'onToggle',
      '@aria-expanded': 'isOpen',
      '@active': 'isOpen',
      title: 'triggerTitle',
    }}
  >
    <span class="material-symbols-outlined" aria-hidden="true">notifications</span>
    <span class="nw-trigger-label" ref="triggerLabel"></span>
  </button>
  <section
    ref="popover"
    class="nw-popover"
    role="dialog"
    aria-label="Notifications"
    ${{ '@hidden': '!isOpen' }}
  >
    <header class="nw-header">
      <strong ref="title"></strong>
      <div class="nw-header-actions">
        <button type="button" data-action="reset" ref="resetButton">
          <span class="material-symbols-outlined" aria-hidden="true">restart_alt</span>
        </button>
        <button type="button" data-action="open-full" ref="openFullButton">
          <span class="material-symbols-outlined" aria-hidden="true">open_in_full</span>
        </button>
      </div>
    </header>
    <div class="nw-compact" ref="compact"></div>
  </section>
`;
