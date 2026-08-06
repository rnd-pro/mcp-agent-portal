import { HYDRATE_FIXTURES } from '../tiers.js';
import { synthesizeSnippet } from '../snippet.js';
import { renderApiTables } from '../api-tables.js';

const demoObserver = new IntersectionObserver((entries, observer) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    observer.unobserve(entry.target);
    entry.target.__mount?.();
  }
}, { rootMargin: '200px' });

function mountLiveDemo(model, demoEl) {
  const { tag, tier } = model;

  if (tier === 'CLIENT') {
    const ref = document.createElement('code');
    ref.className = 'demo-ref';
    ref.textContent = `<${tag}>`;
    const note = document.createElement('p');
    note.className = 'demo-note';
    note.textContent = 'interactive — requires host context';
    demoEl.append(ref, note);
    return;
  }

  let el;
  try {
    el = document.createElement(tag);
    demoEl.appendChild(el);
  } catch {
    const ref = document.createElement('code');
    ref.className = 'demo-ref';
    ref.textContent = `<${tag}>`;
    demoEl.appendChild(ref);
    return;
  }

  if (tier === 'HYDRATE') {
    const fixture = HYDRATE_FIXTURES[tag];
    if (fixture) {
      customElements.whenDefined(tag).then(() => {
        try { fixture(el); } catch { /* fixtures are best-effort */ }
      }).catch(() => {});
    } else {
      const note = document.createElement('p');
      note.className = 'demo-note';
      note.textContent = 'needs host data';
      demoEl.appendChild(note);
    }
  }
}

export class ComponentCard extends HTMLElement {
  #model = null;

  set model(value) {
    this.#model = value;
    this.#render();
  }

  get model() {
    return this.#model;
  }

  disconnectedCallback() {
    const demoEl = this.querySelector('.card-demo');
    if (demoEl) demoObserver.unobserve(demoEl);
  }

  #render() {
    const model = this.#model;
    if (!model) return;

    this.dataset.tag = model.tag;
    this.dataset.tier = model.tier;
    this.dataset.category = model.category;
    this.replaceChildren();

    const head = document.createElement('div');
    head.className = 'card-head';

    const tagCode = document.createElement('code');
    tagCode.className = 'card-tag';
    tagCode.textContent = `<${model.tag}>`;

    const badge = document.createElement('span');
    const tierLower = model.tier.toLowerCase();
    badge.className = `tier-badge tier-${tierLower}`;
    badge.textContent = model.tier;
    head.append(tagCode, badge);

    const desc = document.createElement('p');
    desc.className = 'card-desc';
    desc.textContent = model.description || '';

    const demo = document.createElement('div');
    demo.className = 'card-demo';
    demo.__mount = () => mountLiveDemo(model, demo);

    const snippet = synthesizeSnippet(model);

    const snippetWrap = document.createElement('div');
    snippetWrap.className = 'card-snippet';
    const pre = document.createElement('pre');
    pre.className = 'snippet-pre';
    const code = document.createElement('code');
    code.className = 'snippet-code';
    code.textContent = snippet;
    pre.appendChild(code);
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(snippet).then(() => {
        copyBtn.textContent = 'Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
      }).catch(() => {});
    });
    snippetWrap.append(pre, copyBtn);

    const api = document.createElement('details');
    api.className = 'card-api';
    const summary = document.createElement('summary');
    summary.textContent = 'API';
    const apiTables = document.createElement('div');
    apiTables.className = 'api-tables';
    apiTables.appendChild(renderApiTables(model));
    api.append(summary, apiTables);

    this.append(head, desc, demo, snippetWrap, api);

    demoObserver.observe(demo);
  }
}

export function registerComponentCard() {
  if (!customElements.get('catalog-component-card')) {
    customElements.define('catalog-component-card', ComponentCard);
  }
}

registerComponentCard();
