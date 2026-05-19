import { Symbiote, html } from '@symbiotejs/symbiote';

const css = `
:host {
  display: block;
}

.mp-category {
  padding: 0 18px;
}

.mp-category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0 8px;
  border-bottom: 1px solid var(--sn-node-hover);
  margin-bottom: 12px;
}

.mp-category-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.4;
}

.mp-category-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.mp-badge-rnd-pro { background: linear-gradient(135deg, #a78bfa33, #7c3aed33); color: #a78bfa; }
.mp-badge-official { background: linear-gradient(135deg, #4a9eff33, #2563eb33); color: #4a9eff; }
.mp-badge-google { background: linear-gradient(135deg, #34d39933, #05966933); color: #34d399; }
.mp-badge-community { background: linear-gradient(135deg, #f59e0b33, #d9770633); color: #f59e0b; }

.mp-category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  padding-bottom: 8px;
}

.material-symbols-outlined {
  font-size: 14px;
  vertical-align: middle;
  margin-right: 4px;
}
`;

export class McpCatalogSection extends Symbiote {
  init$ = {
    categoryLabel: '',
    categoryIcon: 'inventory_2',
    badgeClass: 'mp-category-badge',
    count: 0,
    catalogItems: [],
    onServerAction: (e) => {
      this.getRootNode().host?.$.onServerAction?.(e);
    },
  };
}

McpCatalogSection.template = html`
<div class="mp-category">
  <div class="mp-category-header">
    <span class="mp-category-label">
      <span class="material-symbols-outlined" ${{ textContent: 'categoryIcon' }}></span>
      <span ${{ textContent: 'categoryLabel' }}></span>
    </span>
    <span ${{ className: 'badgeClass', textContent: 'count' }}></span>
  </div>
  <div class="mp-category-grid" ${{ itemize: 'catalogItems', 'item-tag': 'mp-server-card' }}></div>
</div>
`;

McpCatalogSection.rootStyles = css;
McpCatalogSection.reg('mp-catalog-section');

export default McpCatalogSection;
