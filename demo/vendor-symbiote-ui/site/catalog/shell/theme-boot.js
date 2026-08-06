import { applyTheme, DEFAULT_PROVIDER_THEME } from '../../../themes/Theme.js';
import { applyCascadeTheme } from '../../../themes/cascade-theme.js';

const STORAGE_KEY = 'symbiote-ui:catalog-theme';

function readStoredState() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function bootTheme() {
  const root = document.documentElement;
  applyTheme(root, DEFAULT_PROVIDER_THEME);
  applyCascadeTheme(root, readStoredState(), {
    notify: false,
    source: 'catalog-boot',
    targetSelector: ':root',
  });
}
