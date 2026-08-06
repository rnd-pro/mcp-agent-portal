import { registerComponentCard } from './ComponentCard.js';

export class CategoryPanel extends HTMLElement {
  #models = null;

  set models(value) {
    this.#models = value;
    this.#render();
  }

  get models() {
    return this.#models;
  }

  #render() {
    const models = this.#models;
    if (!models) return;

    this.replaceChildren();

    const category = models[0]?.category || '';
    if (category) this.id = `cat-${category}`;

    const heading = document.createElement('h2');
    heading.className = 'category-heading';
    heading.textContent = `${category} (${models.length})`;

    const grid = document.createElement('div');
    grid.className = 'category-grid';
    for (const model of models) {
      const card = document.createElement('catalog-component-card');
      card.model = model;
      grid.appendChild(card);
    }

    this.append(heading, grid);
  }
}

export function registerCatalogPanels() {
  registerComponentCard();
  if (!customElements.get('catalog-category-panel')) {
    customElements.define('catalog-category-panel', CategoryPanel);
  }
}

registerCatalogPanels();
