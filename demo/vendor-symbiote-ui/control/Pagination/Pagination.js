import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import template from './Pagination.tpl.js';
import css from './Pagination.css.js';

export class Pagination extends Symbiote {
  static observedAttributes = ['current-page', 'total-pages', 'disabled'];

  init$ = {
    currentPage: 1,
    totalPages: 1,
    disabled: false,
    prevDisabled: true,
    nextDisabled: true,
    pagesHtml: '',

    onNavClick: (e) => {
      if (this.$.disabled) return;
      let btn = e.target.closest('.sn-pagination-btn');
      if (!btn || btn.hasAttribute('disabled')) return;

      let action = btn.dataset.action;
      let targetPage = this.$.currentPage;

      if (action === 'prev') {
        targetPage = Math.max(1, this.$.currentPage - 1);
      } else if (action === 'next') {
        targetPage = Math.min(this.$.totalPages, this.$.currentPage + 1);
      } else {
        let page = Number(btn.dataset.page);
        if (Number.isInteger(page)) {
          targetPage = page;
        }
      }

      if (targetPage !== this.$.currentPage) {
        this.currentPage = targetPage;
        this.dispatchEvent(new CustomEvent('sn-page-change', {
          bubbles: true,
          composed: true,
          detail: { page: targetPage }
        }));
      }
    }
  };

  connectedCallback() {
    super.connectedCallback?.();
    ensureMaterialSymbols(['chevron_left', 'chevron_right']);
    this.$.currentPage = Math.max(1, this.currentPage);
    this.$.totalPages = Math.max(1, this.totalPages);
    this.$.disabled = this.disabled;
    this.#render();
  }

  get currentPage() {
    return Number(this.getAttribute('current-page') || 1);
  }

  set currentPage(val) {
    this.setAttribute('current-page', String(val));
  }

  get totalPages() {
    return Number(this.getAttribute('total-pages') || 1);
  }

  set totalPages(val) {
    this.setAttribute('total-pages', String(val));
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    this.toggleAttribute('disabled', Boolean(val));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (!this.isConnected) return;
    if (name === 'current-page') {
      this.$.currentPage = Math.max(1, Number(newValue || 1));
      this.#render();
    } else if (name === 'total-pages') {
      this.$.totalPages = Math.max(1, Number(newValue || 1));
      this.#render();
    } else if (name === 'disabled') {
      this.$.disabled = newValue !== null;
      this.#render();
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  #render() {
    const current = this.$.currentPage;
    const total = this.$.totalPages;
    const disabled = this.$.disabled;

    this.$.prevDisabled = disabled || current <= 1;
    this.$.nextDisabled = disabled || current >= total;

    let htmlStr = '';

    const range = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => start + i);

    if (total <= 7) {
      range(1, total).forEach((p) => {
        htmlStr += this.#renderPageBtn(p, p === current, disabled);
      });
    } else {
      // Always show page 1
      htmlStr += this.#renderPageBtn(1, current === 1, disabled);

      if (current > 4) {
        htmlStr += '<span class="sn-pagination-ellipsis">&hellip;</span>';
      }

      // Middle pages
      const start = Math.max(2, current - 1);
      const end = Math.min(total - 1, current + 1);

      // Adjust range to ensure we render enough buttons
      let middlePages = [];
      if (current <= 4) {
        middlePages = range(2, 5);
      } else if (current >= total - 3) {
        middlePages = range(total - 4, total - 1);
      } else {
        middlePages = range(start, end);
      }

      middlePages.forEach((p) => {
        htmlStr += this.#renderPageBtn(p, p === current, disabled);
      });

      if (current < total - 3) {
        htmlStr += '<span class="sn-pagination-ellipsis">&hellip;</span>';
      }

      // Always show last page
      htmlStr += this.#renderPageBtn(total, current === total, disabled);
    }

    this.$.pagesHtml = htmlStr;
  }

  #renderPageBtn(page, isActive, disabled) {
    const activeAttr = isActive ? ' active' : '';
    const disabledAttr = disabled ? ' disabled' : '';
    const ariaLabel = `Go to page ${page}`;
    const ariaCurrent = isActive ? ' aria-current="page"' : '';
    return `<button class="sn-pagination-btn"${activeAttr}${disabledAttr}${ariaCurrent} data-page="${page}" aria-label="${ariaLabel}">${page}</button>`;
  }
}

Pagination.template = template;
Pagination.rootStyles = css;
Pagination.reg('sn-pagination');

export default Pagination;
