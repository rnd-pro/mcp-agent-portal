export class Collection {
  #container;
  #selector;
  #items = [];

  constructor(container, selector = 'option, [role="option"]') {
    this.#container = container;
    this.#selector = selector;
    this.sync();
  }

  sync() {
    if (!this.#container) return [];
    const elements = Array.from(this.#container.querySelectorAll(this.#selector));
    this.#items = elements.map((el, index) => {
      const id = el.id || el.getAttribute('id') || `sn-item-${index}-${Math.random().toString(36).substring(2, 9)}`;
      if (!el.id) el.id = id;

      const value = el.value ?? el.getAttribute('data-value') ?? el.getAttribute('value') ?? el.textContent.trim();
      const label = el.getAttribute('label') ?? el.textContent.trim();
      const disabled = el.disabled ?? el.hasAttribute('disabled') ?? false;

      return {
        id,
        value,
        label,
        disabled,
        element: el,
      };
    });
    return this.#items;
  }

  getItems() {
    return this.#items;
  }

  getItemByValue(value) {
    return this.#items.find(item => item.value === value);
  }

  getItemById(id) {
    return this.#items.find(item => item.id === id);
  }

  getEnabledItems() {
    return this.#items.filter(item => !item.disabled);
  }

  findMatchingItem(prefix) {
    if (!prefix) return null;
    const lower = prefix.toLowerCase();
    return this.#items.find(item => !item.disabled && item.label.toLowerCase().startsWith(lower));
  }
}
