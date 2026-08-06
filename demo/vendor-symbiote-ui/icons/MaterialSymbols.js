const MATERIAL_SYMBOLS_LOCAL_URL = new URL('./material-symbols.css', import.meta.url).href;

const ICON_NAME_RE = /^[a-z0-9_]+$/;

/** @type {Set<string>} */
const loadedIcons = new Set();

const LINK_SELECTOR = 'link[data-sn-material-symbols="managed"]';
const HOST_STYLESHEET_SELECTOR = [
  'link[rel~="stylesheet"][href$="/packages/symbiote-ui/icons/material-symbols.css"]',
  'link[rel~="stylesheet"][href$="icons/material-symbols.css"]',
].join(',');

/** @type {{ autoload: boolean, hrefBuilder: ((iconNames: string[]) => string)|null }} */
const config = {
  autoload: true,
  hrefBuilder: null,
};

/**
 * Configure Material Symbols loading for host apps with strict CSP, privacy,
 * or alternative font delivery requirements.
 * @param {{ autoload?: boolean, hrefBuilder?: ((iconNames: string[]) => string)|null }} options
 */
export function configureMaterialSymbols(options = {}) {
  if (typeof options.autoload === 'boolean') config.autoload = options.autoload;
  if ('hrefBuilder' in options) config.hrefBuilder = options.hrefBuilder || null;
}

/**
 * Ensure Material Symbols ligatures used by built-in UI are available.
 * Components declare the icons they own so hosts can still use a custom
 * `hrefBuilder` for subset font loading. The default provider path is a
 * self-hosted font to keep public demos and embedded browsers deterministic.
 * @param {string[]} iconNames
 */
export function ensureMaterialSymbols(iconNames) {
  if (!config.autoload || !isBrowserDocument()) return;

  const names = [...new Set(iconNames.filter((name) => typeof name === 'string' && ICON_NAME_RE.test(name)))].sort();
  if (names.length === 0) return;

  let changed = false;
  for (const name of names) {
    if (loadedIcons.has(name)) continue;
    loadedIcons.add(name);
    changed = true;
  }
  if (!changed) return;

  const iconList = [...loadedIcons].sort();
  let link = findMaterialSymbolsLink();
  const href = config.hrefBuilder
    ? config.hrefBuilder(iconList)
    : link?.href || MATERIAL_SYMBOLS_LOCAL_URL;
  if (!href) return;

  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    document.head.append(link);
  }
  link.dataset.snMaterialSymbols = 'managed';
  link.href = href;
  link.dataset.snMaterialSymbolsIcons = iconList.join(',');
}

function findMaterialSymbolsLink() {
  return document.querySelector(LINK_SELECTOR)
    || document.querySelector(HOST_STYLESHEET_SELECTOR);
}

function isBrowserDocument() {
  return typeof document !== 'undefined'
    && typeof window !== 'undefined'
    && document.nodeType === 9
    && !!document.head;
}
