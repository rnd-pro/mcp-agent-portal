import Symbiote from '@symbiotejs/symbiote';
import { escapeHtml } from '../markdown-formatter.js';
import { normalizeOutputList } from '../output-preview.js';
import template from './OutputListPreview.tpl.js';
import css from './OutputListPreview.css.js';

function renderItem(item) {
  let status = item.status
    ? `<span class="output-list-preview-status">${escapeHtml(item.status)}</span>`
    : '';
  let description = item.description
    ? `<span class="output-list-preview-description">${escapeHtml(item.description)}</span>`
    : '';
  let meta = item.meta
    ? `<span class="output-list-preview-meta">${escapeHtml(item.meta)}</span>`
    : `<span class="output-list-preview-meta">${escapeHtml(item.kind)}</span>`;

  return `
    <article class="output-list-preview-item" data-kind="${escapeHtml(item.kind)}">
      <span class="output-list-preview-label">${escapeHtml(item.label)}</span>
      ${status}
      ${description}
      ${meta}
    </article>
  `;
}

export class OutputListPreview extends Symbiote {
  init$ = {
    title: 'Output',
    countText: '0 items',
    emptyText: 'No output',
    itemsHtml: '',
    truncatedText: '',
    isEmpty: true,
    isTruncated: false,
    showHeader: true,
  };

  #normalized = normalizeOutputList([]);

  renderCallback() {
    this.sub('isEmpty', (value) => {
      this.toggleAttribute('empty', Boolean(value));
    });
  }

  setValue(value, options = {}) {
    this.setData(normalizeOutputList(value, options));
  }

  setItems(value, options = {}) {
    this.setValue(value, options);
  }

  setData(data = normalizeOutputList([])) {
    this.#normalized = data;
    let plural = data.visible === 1 ? 'item' : 'items';
    this.set$({
      countText: `${data.visible}/${data.total} ${plural}`,
      itemsHtml: data.items.map(renderItem).join(''),
      truncatedText: data.truncated ? `${data.total - data.visible} more not shown` : '',
      isEmpty: data.empty,
      isTruncated: data.truncated,
    });
  }

  getData() {
    return this.#normalized;
  }
}

OutputListPreview.template = template;
OutputListPreview.rootStyles = css;
OutputListPreview.reg('output-list-preview');

export default OutputListPreview;
