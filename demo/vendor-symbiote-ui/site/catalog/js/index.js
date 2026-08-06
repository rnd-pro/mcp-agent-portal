import '../../../ui/index.js';
import { bootTheme } from '../shell/theme-boot.js';
import { loadCatalog } from '../shell/catalog-model.js';
import { mountShell } from '../shell/shell.js';
import { registerCatalogPanels } from '../shell/panels/CategoryPanel.js';
import { registerDemosPanel } from '../shell/panels/DemosPanel.js';

registerCatalogPanels();
registerDemosPanel();
bootTheme();

const { categories, byCategory } = await loadCatalog();
const { componentsEl, demosEl } = mountShell({ categories });

for (const category of categories) {
  const panel = document.createElement('catalog-category-panel');
  panel.models = byCategory.get(category.id);
  componentsEl.appendChild(panel);
}

demosEl.appendChild(document.createElement('catalog-demos-panel'));
