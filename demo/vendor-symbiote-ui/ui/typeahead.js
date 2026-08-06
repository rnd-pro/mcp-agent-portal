export class Typeahead {
  #buffer = '';
  #timeoutId = null;
  #timeoutMs;

  constructor(timeoutMs = 1000) {
    this.#timeoutMs = timeoutMs;
  }

  handleKey(key, items) {
    if (key.length !== 1) return null;

    clearTimeout(this.#timeoutId);
    this.#buffer += key;

    this.#timeoutId = setTimeout(() => {
      this.#buffer = '';
    }, this.#timeoutMs);

    const lower = this.#buffer.toLowerCase();
    const match = items.find(item => {
      const label = item.label || item.textContent || '';
      const isDisabled = item.disabled ?? item.hasAttribute?.('disabled') ?? false;
      return !isDisabled && label.toLowerCase().trim().startsWith(lower);
    });

    return match || null;
  }

  clear() {
    clearTimeout(this.#timeoutId);
    this.#buffer = '';
  }
}
