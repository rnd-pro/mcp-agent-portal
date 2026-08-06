import { html } from '@symbiotejs/symbiote';

export let template = html`
  <div class="menu-container" ${{ '@hidden': '!visible' }}>
    <div class="menu-items" itemize="items">
      <template>
        <div
          class="menu-item"
          ${{ onclick: '^onItemClick', '@data-type': 'type', '@active': 'isActive' }}
        >
          <span class="material-symbols-outlined">{{icon}}</span>
          <span>{{title}}</span>
        </div>
      </template>
    </div>
  </div>
`;
