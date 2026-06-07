import {
  configureLocalization,
  getLocalization,
  normalizeLocaleMode,
  resolveLocaleForMode,
  translate,
} from 'symbiote-ui/locale';
import { PORTAL_LOCALE_MESSAGES } from './portal-locales.js';

export const PORTAL_LOCALE_STORAGE_KEY = 'agentPortal.localeMode';

const LOCALE_QUERY_KEYS = ['locale', 'lang'];
const TRANSLATABLE_ATTRIBUTES = [
  'placeholder',
  'title',
  'aria-label',
  'filter-placeholder',
  'empty-label',
];
const SKIP_TEXT_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA']);
const observedLocalizationRoots = new WeakSet();

function getStorage(options = {}) {
  return options.storage || globalThis.localStorage || null;
}

function getNavigatorPreferences(source = globalThis.navigator) {
  if (!source) return ['en'];
  let languages = Array.isArray(source.languages) ? source.languages : [];
  return languages.length > 0 ? languages : [source.language];
}

function getSearchLocaleMode(search = '') {
  let searchParams = new URLSearchParams(search || '');
  for (let key of LOCALE_QUERY_KEYS) {
    let value = searchParams.get(key);
    if (value) return normalizeLocaleMode(value);
  }
  return '';
}

function getStoredLocaleMode(storage) {
  try {
    return normalizeLocaleMode(storage?.getItem(PORTAL_LOCALE_STORAGE_KEY), { fallback: '' });
  } catch {
    return '';
  }
}

function getPathLocaleMode(pathname = '') {
  let path = String(pathname || '');
  if (path === '/ru' || path.startsWith('/ru/')) return 'ru';
  if (path === '/es' || path.startsWith('/es/')) return 'es';
  return '';
}

export function resolvePortalLocaleMode(options = {}) {
  let locationObj = options.location || globalThis.location;
  let queryMode = getSearchLocaleMode(locationObj?.search);
  if (queryMode) return queryMode;

  let settingsMode = normalizeLocaleMode(options.settings?.localization?.mode, { fallback: '' });
  if (settingsMode) return settingsMode;

  let storedMode = getStoredLocaleMode(getStorage(options));
  if (storedMode) return storedMode;

  let pathMode = getPathLocaleMode(locationObj?.pathname);
  return pathMode || 'auto';
}

export function configurePortalLocalization(options = {}) {
  let mode = resolvePortalLocaleMode(options);
  let preferences = options.preferences || getNavigatorPreferences(options.navigator);
  let locale = resolveLocaleForMode(mode, preferences);
  let localization = configureLocalization({
    mode,
    preferences,
    messages: PORTAL_LOCALE_MESSAGES,
    explicit: mode !== 'auto',
  });
  let doc = options.document || globalThis.document;
  if (doc?.documentElement) {
    doc.documentElement.lang = locale;
    doc.documentElement.dir = 'ltr';
    doc.documentElement.dataset.locale = locale;
    doc.documentElement.dataset.localeMode = mode;
  }
  return localization;
}

export function setPortalLocaleMode(mode, options = {}) {
  let nextMode = normalizeLocaleMode(mode);
  let storage = getStorage(options);
  try {
    storage?.setItem(PORTAL_LOCALE_STORAGE_KEY, nextMode);
  } catch {
    // Storage may be unavailable in private or embedded browser contexts.
  }
  let localization = configurePortalLocalization({
    ...options,
    settings: { localization: { mode: nextMode } },
  });
  let eventTarget = options.eventTarget || globalThis;
  eventTarget.dispatchEvent?.(new CustomEvent('portal-localization-changed', {
    detail: localization,
  }));
  return localization;
}

export function getPortalLocaleOptions() {
  return [
    { value: 'auto', label: tPortal('settings.language.auto') },
    { value: 'en', label: tPortal('settings.language.en') },
    { value: 'ru', label: tPortal('settings.language.ru') },
    { value: 'es', label: tPortal('settings.language.es') },
  ];
}

export function tPortal(key, params = {}) {
  return translate(`portal.${key}`, params);
}

function getEnglishTextLookup() {
  let lookup = new Map();
  for (let [key, value] of Object.entries(PORTAL_LOCALE_MESSAGES.en)) {
    if (
      !key.startsWith('portal.text.')
      && !key.startsWith('portal.settings.')
      && key !== 'portal.topbar.workspaceNotSelected'
    ) {
      continue;
    }
    lookup.set(value, key);
  }
  lookup.set(PORTAL_LOCALE_MESSAGES.en['portal.chat.placeholder.ready'], 'portal.chat.placeholder.ready');
  return lookup;
}

function translateExactText(value) {
  let text = String(value || '');
  let match = text.match(/^(\s*)(.*?)(\s*)$/s);
  let normalized = match?.[2]?.replace(/\s+/g, ' ').trim();
  if (!normalized) return text;
  let key = getEnglishTextLookup().get(normalized);
  if (!key) return text;
  let translated = translate(key);
  return `${match[1]}${translated}${match[3]}`;
}

function shouldSkipTextNode(node) {
  let parent = node.parentElement;
  while (parent) {
    if (SKIP_TEXT_TAGS.has(parent.tagName)) return true;
    if (parent.matches?.('[data-no-localize], .no-localize')) return true;
    parent = parent.parentElement;
  }
  return false;
}

function localizeTextNodes(root) {
  let doc = root.ownerDocument || globalThis.document;
  if (!doc?.createTreeWalker) return;
  let walker = doc.createTreeWalker(root, 4);
  let node = walker.nextNode();
  while (node) {
    if (!shouldSkipTextNode(node)) {
      node.nodeValue = translateExactText(node.nodeValue);
    }
    node = walker.nextNode();
  }
}

function localizeAttributes(root) {
  let nodes = root.querySelectorAll ? [root, ...root.querySelectorAll('*')] : [root];
  for (let node of nodes) {
    if (!node.getAttribute || node.matches?.('[data-no-localize], .no-localize')) continue;
    for (let attr of TRANSLATABLE_ATTRIBUTES) {
      let value = node.getAttribute(attr);
      if (!value) continue;
      let translated = translateExactText(value);
      if (translated !== value) node.setAttribute(attr, translated);
    }
  }
}

function getShadowRoots(root) {
  let roots = [];
  let nodes = root.querySelectorAll ? [root, ...root.querySelectorAll('*')] : [root];
  for (let node of nodes) {
    if (node.shadowRoot) roots.push(node.shadowRoot);
  }
  return roots;
}

export function localizePortalTree(root = globalThis.document?.body) {
  if (!root || getLocalization().locale === 'en') return;
  localizeTextNodes(root);
  localizeAttributes(root);
  for (let shadowRoot of getShadowRoots(root)) {
    localizePortalTree(shadowRoot);
  }
}

export function installPortalDomLocalization(options = {}) {
  let doc = options.document || globalThis.document;
  if (!doc?.body || !globalThis.MutationObserver) {
    localizePortalTree(doc?.body);
    return null;
  }

  let observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      observeLocalizationRoots(doc.body);
      localizePortalTree(doc.body);
    });
  });

  function observeLocalizationRoots(root) {
    if (!root || observedLocalizationRoots.has(root)) return;
    observedLocalizationRoots.add(root);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES,
    });
    for (let shadowRoot of getShadowRoots(root)) {
      observeLocalizationRoots(shadowRoot);
    }
  }

  let pending = false;
  observeLocalizationRoots(doc.body);
  localizePortalTree(doc.body);
  return observer;
}

configurePortalLocalization();

if (globalThis.document?.readyState === 'loading') {
  globalThis.document.addEventListener('DOMContentLoaded', () => installPortalDomLocalization(), {
    once: true,
  });
} else {
  installPortalDomLocalization();
}
