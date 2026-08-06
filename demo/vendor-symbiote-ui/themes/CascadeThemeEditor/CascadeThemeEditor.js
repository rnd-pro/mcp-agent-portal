import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { normalizeLocale, SUPPORTED_LOCALES } from '../../locale/index.js';
import {
  applyCascadeGeometryRegister,
  applyCascadeTheme,
  applyCascadeThemeBundle,
  CASCADE_THEME_DEFAULTS,
  clearCascadeGeometryRegister,
  clearCascadeThemeInlineTokens,
  getCascadeThemeControls,
  isCascadeThemeBundle,
  normalizeCascadeGeometryRegister,
  normalizeCascadeTabShape,
  normalizeCascadeThemeOptions,
  persistCascadeThemeScopeRegister,
  persistCascadeThemeScopeState,
  readCascadeThemeScopeState,
  removeCascadeThemeScopeState,
  resetCascadeThemeScopes,
  resolveCascadeThemeVariantState,
  serializeCascadeThemeBundle,
} from '../cascade-theme.js';
import template from './CascadeThemeEditor.tpl.js';
import css from './CascadeThemeEditor.css.js';

const DEFAULT_STORAGE_KEY = 'symbiote-ui:cascade-theme-editor';
const CONTROL_ICONS = getCascadeThemeControls()
  .map((control) => control.icon)
  .filter(Boolean);
const ICONS = [...new Set(['palette', 'content_copy', 'share', 'restart_alt', 'data_object', 'language', 'select_all', 'delete', ...CONTROL_ICONS])];
const LOCALE_VALUES = SUPPORTED_LOCALES.filter((locale) => ['en', 'ru', 'es'].includes(locale));

function parseStoredState(value) {
  if (!value) return null;
  try {
    let parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    void error;
    return null;
  }
}

function rangeProgress(value, min, max) {
  let lo = Number(min ?? 0);
  let hi = Number(max ?? 100);
  let range = hi - lo;
  let progress = range <= 0 ? 0 : ((Number(value) - lo) / range) * 100;
  return `${Math.min(100, Math.max(0, progress)).toFixed(2)}%`;
}

function cssIdent(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

function normalizeShareName(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export class CascadeThemeEditor extends Symbiote {
  static observedAttributes = [
    'storage-key',
    'target-selector',
    'default-state',
    'pickable',
    'locale',
    'share-label',
  ];

  #controls = getCascadeThemeControls();
  #state = normalizeCascadeThemeOptions(CASCADE_THEME_DEFAULTS);
  #geometryRegister = '';
  #ready = false;
  #copyTimer = 0;
  #targetDefs = [];
  #activeTargetId = '';
  #switching = false;
  #picking = false;
  #pickHandlers = null;
  #pickHover = null;
  #locale = 'en';
  #controlSyncFrame = 0;
  #controlInputHandler = (event) => this.#handleControlInput(event);

  init$ = {
    // reactive scope picker: the host feeds `targets`; selecting one re-points the
    // editor's target-selector + storage-key (see #setActiveTarget). itemize renders
    // this list, so it updates live when the host adds/removes themeable windows.
    targets: [],
    hasTargets: false,
    // reactive slider list rebuilt from #state on every apply (see #syncControls).
    // Each item carries a precomputed range-fill `progress` string.
    controlsList: [],
    // segmented-control pressed flags, bound to aria-pressed.
    modeDark: 'true',
    modeLight: 'false',
    variantModern: 'false',
    variantClassic: 'true',
    tabShapeFrame: 'false',
    tabShapeEar: 'false',
    tabShapeClassicEar: 'true',
    registerDefault: 'true',
    registerProduct: 'false',
    registerTool: 'false',
    registerSpacious: 'false',
    hasLocale: false,
    localeEn: 'true',
    localeRu: 'false',
    localeEs: 'false',
    status: 'ready',
    params: '',
    shareLabel: 'Share theme',
    // eyedropper: when `pickable` (a host selector) is set, the pick button lets the
    // user click any matching element to theme it individually (see #enterPickMode).
    picking: 'false',
    pickable: '',
    onTargetPick: (event) => {
      let id = event.currentTarget?.dataset?.targetId;
      if (id) this.#pickTarget(id);
    },
    onTargetRemove: (event) => {
      event.preventDefault();
      event.stopPropagation();
      let id = event.currentTarget?.dataset?.targetId;
      if (id) this.removeTarget(id);
    },
    onPickStart: () => this.#enterPickMode(),
    onControlInput: (event) => {
      this.#handleControlInput(event);
    },
    onModePick: (event) => {
      let mode = event.currentTarget?.dataset?.themeMode;
      if (!mode) return;
      this.#state = normalizeCascadeThemeOptions({ ...this.#state, mode });
      this.#apply('mode');
    },
    onVariantPick: (event) => {
      let themeVariant = event.currentTarget?.dataset?.themeVariant;
      if (!themeVariant) return;
      this.#state = resolveCascadeThemeVariantState(themeVariant);
      this.#apply('variant');
    },
    onTabShapePick: (event) => {
      let tabShape = normalizeCascadeTabShape(event.currentTarget?.dataset?.tabShape);
      this.#state = normalizeCascadeThemeOptions({ ...this.#state, tabShape });
      this.#apply('tab-shape');
    },
    onRegisterPick: (event) => {
      let next = event.currentTarget?.dataset?.geometryRegister;
      this.#geometryRegister = normalizeCascadeGeometryRegister(next);
      this.#applyGeometryRegister('toggle');
      this.#syncRegisterButtons();
    },
    onLocalePick: (event) => {
      let locale = event.currentTarget?.dataset?.locale;
      this.setLocale(locale, { source: 'locale-control' });
    },
    onApplyAll: () => this.applyToAllTargets(),
    onCopy: () => void this.copyParameters(),
    onShare: () => this.shareTheme(),
    onReset: () => this.reset(),
  };

  initCallback() {
    ensureMaterialSymbols(ICONS);
  }

  disconnectedCallback() {
    this.#exitPickMode();
    this.ref.controls?.removeEventListener?.('input', this.#controlInputHandler);
    if (this.#copyTimer && typeof clearTimeout === 'function') {
      clearTimeout(this.#copyTimer);
    }
    if (this.#controlSyncFrame && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.#controlSyncFrame);
    }
    this.#controlSyncFrame = 0;
    super.disconnectedCallback?.();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'share-label') {
      this.$.shareLabel = newValue || 'Share theme';
      return;
    }
    if (this.#switching) return;
    if ((name === 'storage-key' || name === 'default-state') && this.#ready) {
      this.#loadStoredState();
      this.#syncControls();
      this.#syncRegisterButtons();
    }
    if (name === 'target-selector' && this.#ready) {
      this.#syncControls();
      this.#syncRegisterButtons();
    }
    if (name === 'pickable') {
      this.$.pickable = newValue || '';
    }
    if (name === 'locale') {
      this.#locale = normalizeLocale(newValue, { fallback: this.#locale || 'en' });
      this.#syncLocaleButtons();
    }
  }

  renderCallback() {
    if (this.#ready) return;
    this.#ready = true;
    this.$.shareLabel = this.shareLabel;
    this.$.pickable = this.getAttribute('pickable') || '';
    this.#locale = normalizeLocale(this.getAttribute('locale'), { fallback: 'en' });
    this.#bindControlEvents();
    this.#loadStoredState();
    this.#syncControls();
    this.#syncRegisterButtons();
    this.#syncLocaleButtons();
  }

  get geometryRegister() {
    return this.#geometryRegister;
  }

  set geometryRegister(value) {
    this.#geometryRegister = normalizeCascadeGeometryRegister(value);
    this.#applyGeometryRegister('property');
    this.#syncRegisterButtons();
  }

  get state() {
    return { ...this.#state };
  }

  set state(value) {
    this.setState(value, { source: 'property' });
  }

  get storageKey() {
    return this.getAttribute('storage-key') || DEFAULT_STORAGE_KEY;
  }

  get defaultState() {
    return parseStoredState(this.getAttribute('default-state')) || CASCADE_THEME_DEFAULTS;
  }

  get targetSelector() {
    return this.getAttribute('target-selector') || '';
  }

  get locale() {
    return this.#locale;
  }

  set locale(value) {
    this.setLocale(value, { source: 'property' });
  }

  get shareLabel() {
    return this.getAttribute('share-label') || 'Share theme';
  }

  set shareLabel(value) {
    if (value == null || value === '') this.removeAttribute('share-label');
    else this.setAttribute('share-label', String(value));
  }

  setLocale(value, options = {}) {
    let locale = normalizeLocale(value, { fallback: this.#locale || 'en' });
    if (!LOCALE_VALUES.includes(locale)) return this.#locale;
    let changed = locale !== this.#locale || this.getAttribute('locale') !== locale;
    this.#locale = locale;
    if (this.getAttribute('locale') !== locale) this.setAttribute('locale', locale);
    this.#syncLocaleButtons();
    if (changed) {
      this.dispatchEvent(new CustomEvent('cascade-theme-locale-change', {
        bubbles: true,
        composed: true,
        detail: { locale, source: options.source || 'set-locale' },
      }));
    }
    return this.#locale;
  }

  get targets() {
    return this.#targetDefs.slice();
  }

  // Host-fed list of theme scopes/windows: [{ id, label, selector, storageKey, icon?, hint? }].
  // Two or more makes the picker visible; selecting one re-points the editor at that
  // scope. The single-target capability (target-selector + storage-key) already exists —
  // this just drives it reactively from a list.
  set targets(list) {
    this.#targetDefs = Array.isArray(list) ? list.filter((entry) => entry && entry.id) : [];
    if (!this.#targetDefs.some((entry) => entry.id === this.#activeTargetId)) {
      this.#activeTargetId = this.#targetDefs[0]?.id || '';
    }
    this.#renderTargets();
    let active = this.#targetDefs.find((entry) => entry.id === this.#activeTargetId);
    if (active) this.#setActiveTarget(active);
  }

  #renderTargets() {
    this.$.targets = this.#targetDefs.map((entry) => ({
      id: entry.id,
      label: entry.label || entry.id,
      icon: entry.icon || 'web_asset',
      hint: entry.hint || entry.selector || '',
      active: String(entry.id === this.#activeTargetId),
      removable: this.#isRemovableTarget(entry),
      removeHidden: !this.#isRemovableTarget(entry),
      removeLabel: `Remove ${entry.label || entry.id}`,
    }));
    this.$.hasTargets = this.#targetDefs.length > 1;
  }

  #isRemovableTarget(target) {
    return Boolean(target?.removable || String(target?.id || '').startsWith('pick:'));
  }

  #targetEventDetail(target, extra = {}) {
    return {
      id: target.id,
      name: target.name || target.label || target.id,
      label: target.label || target.name || target.id,
      icon: target.icon || 'web_asset',
      selector: target.selector || '',
      storageKey: target.storageKey || '',
      picked: this.#isRemovableTarget(target),
      ...extra,
    };
  }

  #pickTarget(id) {
    let target = this.#targetDefs.find((entry) => entry.id === id);
    if (!target || id === this.#activeTargetId) return;
    this.#activeTargetId = id;
    this.#renderTargets();
    this.#setActiveTarget(target);
    this.dispatchEvent(new CustomEvent('cascade-theme-target-change', {
      bubbles: true,
      composed: true,
      detail: this.#targetEventDetail(target),
    }));
  }

  removeTarget(id, options = {}) {
    let index = this.#targetDefs.findIndex((entry) => entry.id === id);
    let target = this.#targetDefs[index];
    if (index < 0 || !this.#isRemovableTarget(target)) return false;
    this.#exitPickMode();
    let wasActive = target.id === this.#activeTargetId;
    this.#teardownTarget(target);
    this.#targetDefs.splice(index, 1);
    let active = this.#targetDefs.find((entry) => entry.id === this.#activeTargetId) || this.#targetDefs[0] || null;
    this.#activeTargetId = active ? active.id : '';
    this.#renderTargets();
    if (active) this.#setActiveTarget(active);
    else {
      this.#syncControls();
      this.#syncRegisterButtons();
    }
    this.#dispatchTargetRemove(target, options.source || 'remove-target');
    if (wasActive && active) {
      this.dispatchEvent(new CustomEvent('cascade-theme-target-change', {
        bubbles: true,
        composed: true,
        detail: this.#targetEventDetail(active, { source: options.source || 'remove-target' }),
      }));
    }
    return true;
  }

  #teardownTarget(target) {
    let element = this.#resolveScopeTarget(target);
    if (element) {
      clearCascadeThemeInlineTokens(element);
      clearCascadeGeometryRegister(element);
    }
    removeCascadeThemeScopeState({ storageKey: target.storageKey });
  }

  #dispatchTargetRemove(target, source) {
    this.dispatchEvent(new CustomEvent('cascade-theme-target-remove', {
      bubbles: true,
      composed: true,
      detail: this.#targetEventDetail(target, { source }),
    }));
  }

  // Re-point target-selector + storage-key and reload that scope's saved params.
  // Selecting a target is read-only: it updates controls, while input/mode/reset
  // are the actions that apply and persist a theme.
  #setActiveTarget(target) {
    this.#switching = true;
    if (target.defaultState !== undefined) this.setAttribute('default-state', JSON.stringify(target.defaultState || {}));
    if (target.selector != null) this.setAttribute('target-selector', String(target.selector));
    if (target.storageKey != null) this.setAttribute('storage-key', String(target.storageKey));
    this.#switching = false;
    if (!this.#ready) return;
    this.#loadStoredState();
    this.#syncControls();
    this.#syncRegisterButtons();
  }

  get pickable() {
    return this.getAttribute('pickable') || '';
  }

  // Eyedropper: enter pick mode, then the next click on an element matching `pickable`
  // becomes an individual theme target. The host marks pickable elements with
  // data-theme-id/-label/-key (or relies on the element id); the editor reads those.
  #enterPickMode() {
    if (this.#picking || !this.pickable) return;
    this.#picking = true;
    this.$.picking = 'true';
    let doc = this.ownerDocument || document;
    doc.documentElement.setAttribute('data-cascade-theme-picking', '');
    let onOver = (event) => {
      let element = event.target?.closest?.(this.pickable);
      if (element === this.#pickHover) return;
      this.#clearPickHover();
      if (element) {
        this.#pickHover = element;
        element.setAttribute('data-cascade-theme-pick-hover', '');
      }
    };
    let onClick = (event) => {
      let element = event.target?.closest?.(this.pickable);
      if (element) {
        event.preventDefault();
        event.stopPropagation();
        this.#applyPickedTarget(element);
      }
      this.#exitPickMode();
    };
    let onKey = (event) => { if (event.key === 'Escape') this.#exitPickMode(); };
    this.#pickHandlers = { doc, onOver, onClick, onKey };
    doc.addEventListener('pointerover', onOver, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKey, true);
  }

  #clearPickHover() {
    if (this.#pickHover) {
      this.#pickHover.removeAttribute('data-cascade-theme-pick-hover');
      this.#pickHover = null;
    }
  }

  #exitPickMode() {
    if (!this.#picking) return;
    this.#picking = false;
    this.$.picking = 'false';
    this.#clearPickHover();
    let handlers = this.#pickHandlers;
    if (handlers) {
      handlers.doc.removeEventListener('pointerover', handlers.onOver, true);
      handlers.doc.removeEventListener('click', handlers.onClick, true);
      handlers.doc.removeEventListener('keydown', handlers.onKey, true);
      handlers.doc.documentElement.removeAttribute('data-cascade-theme-picking');
      this.#pickHandlers = null;
    }
  }

  #applyPickedTarget(element) {
    let id = element.dataset.themeId || element.id;
    let selector = element.dataset.themeTarget || (element.id ? `#${cssIdent(element.id)}` : '');
    if (!id || !selector) return;
    // Key picked windows by their NAME (portable across rebuilds) so a copied bundle's
    // `named` entries match back via [data-theme-label]. Fall back to a visible title,
    // then the theme id.
    let name = element.dataset.themeLabel
      || element.getAttribute?.('title')
      || element.textContent?.trim()
      || element.dataset.themeId
      || id;
    // ensure the element advertises the name so resolveNamed can find it on apply.
    if (element.dataset.themeLabel !== name) element.dataset.themeLabel = name;
    let storageKey = element.dataset.themeKey || `${this.#targetDefs[0]?.storageKey || this.storageKey}::win::${name}`;
    if (!element.dataset.themeKey) element.dataset.themeKey = storageKey;
    let descriptor = {
      id: `pick:${id}`,
      name,
      label: name,
      icon: element.dataset.themeIcon || 'colorize',
      selector,
      storageKey,
    };
    let existing = this.#targetDefs.findIndex((entry) => entry.id === descriptor.id);
    if (existing >= 0) this.#targetDefs[existing] = descriptor;
    else {
      this.#targetDefs.push(descriptor);
      this.#seedPickedTarget(descriptor);
    }
    this.#activeTargetId = descriptor.id;
    this.#renderTargets();
    this.#setActiveTarget(descriptor);
    this.dispatchEvent(new CustomEvent('cascade-theme-target-change', {
      bubbles: true,
      composed: true,
      detail: this.#targetEventDetail(descriptor, { source: 'pick', picked: true }),
    }));
  }

  #seedPickedTarget(descriptor) {
    let target = this.#resolveScopeTarget(descriptor);
    let state = normalizeCascadeThemeOptions(this.#state);
    if (target) {
      let theme = applyCascadeTheme(target, state, { notify: false });
      state = theme.state;
      applyCascadeGeometryRegister(target, this.#geometryRegister);
    }
    persistCascadeThemeScopeState({ storageKey: descriptor.storageKey }, {
      ...state,
      register: this.#geometryRegister,
    });
  }

  setState(value, options = {}) {
    if (isCascadeThemeBundle(value)) {
      applyCascadeThemeBundle(
        value,
        this.#targetDefs.map((entry) => ({ id: entry.id, selector: entry.selector, storageKey: entry.storageKey })),
        {
          applyState: (target, state) => { applyCascadeTheme(target, state, { notify: false }); },
          namedStorageBase: this.#targetDefs[0]?.storageKey || this.storageKey,
          resolveNamed: (name) => Array.from(
            (this.ownerDocument || document).querySelectorAll(`[data-theme-label="${CSS.escape(name)}"]`)
          ),
        }
      );
      // reload the active scope so the editor UI reflects the applied bundle
      this.#loadStoredState();
      this.#apply(options.source || 'set-bundle');
      this.#applyGeometryRegister(options.source || 'set-bundle');
      this.#syncRegisterButtons();
      return;
    }
    this.#state = normalizeCascadeThemeOptions(value);
    this.#apply(options.source || 'set-state');
  }

  applyToAllTargets(options = {}) {
    let state = normalizeCascadeThemeOptions(this.#state);
    let register = normalizeCascadeGeometryRegister(this.#geometryRegister);
    let scopes = this.#targetDefs.length
      ? this.#targetDefs
      : [{ id: 'active', selector: this.targetSelector, storageKey: this.storageKey, defaultState: this.defaultState }];
    let applied = [];
    for (let scope of scopes) {
      if (!scope) continue;
      let target = this.#resolveScopeTarget(scope);
      let appliedState = state;
      let appliedRegister = register;
      if (target) {
        let theme = applyCascadeTheme(target, state, { notify: false });
        appliedState = theme.state;
        appliedRegister = applyCascadeGeometryRegister(target, register);
      }
      persistCascadeThemeScopeState({ storageKey: scope.storageKey }, {
        ...appliedState,
        register: appliedRegister,
      });
      applied.push({
        id: scope.id,
        selector: scope.selector || '',
        storageKey: scope.storageKey || '',
        state: appliedState,
        register: appliedRegister,
      });
    }
    this.#state = state;
    this.#geometryRegister = register;
    this.#syncControls();
    this.#syncRegisterButtons();
    this.#setStatus('saved');
    let detail = {
      source: options.source || 'apply-all',
      state: this.state,
      register: this.#geometryRegister || 'default',
      targetSelector: this.targetSelector,
      storageKey: this.storageKey,
      targets: applied,
    };
    this.dispatchEvent(new CustomEvent('cascade-theme-apply-all', {
      bubbles: true,
      composed: true,
      detail,
    }));
    this.dispatchEvent(new CustomEvent('cascade-theme-change', {
      bubbles: true,
      composed: true,
      detail,
    }));
    this.dispatchEvent(new CustomEvent('cascade-geometry-register-change', {
      bubbles: true,
      composed: true,
      detail: {
        source: detail.source,
        register: detail.register,
        targetSelector: this.targetSelector,
        targets: applied,
      },
    }));
    return applied;
  }

  // With multiple targets the reset is global: every host-fed scope returns to its
  // own default (a target may carry a `defaultState`; otherwise the cascade default),
  // and every individually-picked scope is cleared back to inherited and dropped.
  reset() {
    let def = this.defaultState;
    let defs = this.#targetDefs;
    let scopes = defs.length
      ? defs
      : [{ id: 'active', selector: this.targetSelector, storageKey: this.storageKey, defaultState: def }];
    let originalId = this.#activeTargetId;
    let removedTargets = defs.filter((target) => this.#isRemovableTarget(target));
    let result = resetCascadeThemeScopes(scopes, {
      source: 'reset',
      defaultState: def,
      activeId: originalId,
      activeSelector: this.targetSelector,
      activeStorageKey: this.storageKey,
      isNamedScope: (target) => this.#isRemovableTarget(target),
      resolveScopeTarget: (target) => this.#resolveScopeTarget(target),
      namedSelector: '[data-theme-key]',
    });
    this.#geometryRegister = result.activeRegister || '';
    this.#state = result.activeState || normalizeCascadeThemeOptions(def);
    if (defs.length) {
      this.#targetDefs = result.keptScopes;
      let active = this.#targetDefs.find((entry) => entry.id === originalId) || this.#targetDefs[0] || null;
      this.#activeTargetId = active ? active.id : '';
      this.#renderTargets();
      if (active) this.#setActiveTarget(active);
    } else {
      this.#syncControls();
    }
    for (let target of removedTargets) this.#dispatchTargetRemove(target, 'reset');
    this.#syncRegisterButtons();
    this.#setStatus('saved');
    this.dispatchEvent(new CustomEvent('cascade-theme-change', {
      bubbles: true,
      composed: true,
      detail: {
        source: 'reset',
        state: this.state,
        storageKey: this.storageKey,
        targetSelector: this.targetSelector,
      },
    }));
    this.dispatchEvent(new CustomEvent('cascade-geometry-register-change', {
      bubbles: true,
      composed: true,
      detail: {
        source: 'reset',
        register: this.#geometryRegister || 'default',
        targetSelector: this.targetSelector,
      },
    }));
  }

  async copyParameters() {
    let bundle = serializeCascadeThemeBundle(
      this.#targetDefs.map((entry) => ({ id: entry.id, storageKey: entry.storageKey, defaultState: entry.defaultState }))
    );
    let payload = JSON.stringify(bundle, null, 2);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(payload);
        } catch (error) {
          this.#copyWithFallback(payload);
        }
      } else {
        this.#copyWithFallback(payload);
      }
      this.#setStatus('copied');
      this.dispatchEvent(new CustomEvent('cascade-theme-copy', {
        bubbles: true,
        composed: true,
        detail: { state: this.state, text: payload },
      }));
    } catch (error) {
      this.#setStatus('copy failed');
      this.dispatchEvent(new CustomEvent('cascade-theme-copy-error', {
        bubbles: true,
        composed: true,
        detail: { error },
      }));
    }
  }

  shareTheme() {
    let active = this.#targetDefs.find((entry) => entry.id === this.#activeTargetId);
    let name = normalizeShareName(this.getAttribute('theme-name'))
      || normalizeShareName(active?.name)
      || normalizeShareName(active?.label);
    let detail = {
      state: this.state,
      register: this.#geometryRegister,
    };
    if (name) detail.name = name;

    this.dispatchEvent(new CustomEvent('cascade-theme-share-request', {
      bubbles: true,
      composed: true,
      detail,
    }));
  }

  #loadStoredState() {
    let active = this.#targetDefs.find((entry) => entry.id === this.#activeTargetId);
    let state = readCascadeThemeScopeState({
      storageKey: this.storageKey,
      defaultState: active && active.defaultState ? active.defaultState : this.defaultState,
    });
    let { register, ...params } = state;
    this.#state = normalizeCascadeThemeOptions(params);
    this.#geometryRegister = normalizeCascadeGeometryRegister(register);
  }

  #persistState() {
    persistCascadeThemeScopeState({ storageKey: this.storageKey }, this.#state);
  }

  #apply(source) {
    let theme = applyCascadeTheme(this.#resolveTarget(), this.#state, { notify: false });
    this.#state = theme.state;
    this.#persistState();
    this.#syncControls();
    this.#setStatus('saved');
    this.dispatchEvent(new CustomEvent('cascade-theme-change', {
      bubbles: true,
      composed: true,
      detail: {
        source,
        state: this.state,
        theme,
        storageKey: this.storageKey,
        targetSelector: this.targetSelector,
      },
    }));
  }

  // Rebuild the reactive slider list and mode pressed-flags from #state. Reassigning
  // this.$.controlsList re-renders the itemize template; each item carries a
  // precomputed --cte-range-progress fill string for the current value.
  #syncControls() {
    this.$.controlsList = this.#controls
      .filter((control) => control.type !== 'enum')
      .map((control) => {
        let value = this.#state[control.name];
        return {
          name: control.name,
          inputId: `cte-${control.name}`,
          icon: control.icon || 'tune',
          description: control.description || control.name,
          min: control.min,
          max: control.max,
          value,
          progress: rangeProgress(value, control.min, control.max),
        };
      });
    this.$.modeDark = String(this.#state.mode === 'dark');
    this.$.modeLight = String(this.#state.mode === 'light');
    this.$.variantModern = String(this.#state.themeVariant === 'modern');
    this.$.variantClassic = String(this.#state.themeVariant === 'classic');
    this.$.tabShapeFrame = String(this.#state.tabShape === 'frame');
    this.$.tabShapeEar = String(this.#state.tabShape === 'ear');
    this.$.tabShapeClassicEar = String(this.#state.tabShape === 'classic-ear');
    this.$.params = JSON.stringify(this.#state, null, 2);
    this.#queueControlDomSync();
  }

  #bindControlEvents() {
    this.ref.controls?.removeEventListener?.('input', this.#controlInputHandler);
    this.ref.controls?.addEventListener?.('input', this.#controlInputHandler);
  }

  #handleControlInput(event) {
    if (event.__cascadeThemeHandled) return;
    event.__cascadeThemeHandled = true;
    let input = event.target?.closest?.('[data-theme-control]');
    if (!input || !this.ref.controls?.contains?.(input)) return;
    let name = input.dataset.themeControl;
    if (!name) return;
    this.#state = normalizeCascadeThemeOptions({ ...this.#state, [name]: Number(input.value) });
    this.#apply('input');
  }

  #queueControlDomSync() {
    this.#syncControlDom();
    if (typeof requestAnimationFrame !== 'function') return;
    if (this.#controlSyncFrame) cancelAnimationFrame(this.#controlSyncFrame);
    this.#controlSyncFrame = requestAnimationFrame(() => {
      this.#controlSyncFrame = 0;
      this.#syncControlDom();
    });
  }

  #syncControlDom() {
    let root = this.ref.controls || this;
    if (!root?.querySelector) return;
    for (let control of this.#controls) {
      if (control.type === 'enum') continue;
      let value = this.#state[control.name] ?? control.default;
      let text = String(value);
      let selector = `[data-theme-control="${control.name}"]`;
      let input = root.querySelector(`input${selector}`);
      if (input && input.value !== text) input.value = text;
      input?.style?.setProperty('--cte-range-progress', rangeProgress(value, control.min, control.max));
      let output = root.querySelector(`output[data-theme-output="${control.name}"]`);
      if (output && output.textContent !== text) output.textContent = text;
    }
  }

  #resolveTarget() {
    if (typeof document === 'undefined') return this;
    if (this.targetSelector) {
      return document.querySelector(this.targetSelector) || document.documentElement;
    }
    return document.documentElement;
  }

  #resolveScopeTarget(scope) {
    if (typeof document === 'undefined') return null;
    let doc = this.ownerDocument || document;
    if (scope?.selector) return doc.querySelector(scope.selector);
    return doc.documentElement;
  }

  // Preview a canonical geometry register on the target: writes the register's
  // density knobs (--sn-base / --sn-density / --sn-theme-density|spacing-scale|
  // radius-scale) so the step ladder AND every density-scaled semantic token
  // shift together — the same knobs the density slider drives. Empty register
  // reverts to the provider root.
  #applyGeometryRegister(source) {
    let target = this.#resolveTarget();
    if (!target?.style) return;
    this.#geometryRegister = applyCascadeGeometryRegister(target, this.#geometryRegister);
    if (!this.#geometryRegister) {
      let theme = applyCascadeTheme(target, this.#state, { notify: false });
      this.#state = theme.state;
      this.#syncControls();
    }
    persistCascadeThemeScopeRegister({ storageKey: this.storageKey }, this.#geometryRegister);
    this.dispatchEvent(new CustomEvent('cascade-geometry-register-change', {
      bubbles: true,
      composed: true,
      detail: {
        source,
        register: this.#geometryRegister || 'default',
        targetSelector: this.targetSelector,
      },
    }));
  }

  // Drive the geometry-register buttons' aria-pressed reactively from the active
  // register. Empty register means the Default button is pressed.
  #syncRegisterButtons() {
    let active = this.#geometryRegister;
    this.$.registerDefault = String(active === '');
    this.$.registerProduct = String(active === 'product');
    this.$.registerTool = String(active === 'tool');
    this.$.registerSpacious = String(active === 'spacious');
  }

  #syncLocaleButtons() {
    let hasLocale = this.hasAttribute('locale');
    this.$.hasLocale = hasLocale;
    this.$.localeEn = String(this.#locale === 'en');
    this.$.localeRu = String(this.#locale === 'ru');
    this.$.localeEs = String(this.#locale === 'es');
  }

  #setStatus(value) {
    this.$.status = value;
    if (value === 'copied' && typeof setTimeout === 'function') {
      if (this.#copyTimer) clearTimeout(this.#copyTimer);
      this.#copyTimer = setTimeout(() => this.#setStatus('saved'), 1400);
    }
  }

  #copyWithFallback(payload) {
    if (typeof document === 'undefined') return;
    let textarea = document.createElement('textarea');
    textarea.value = payload;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.append(textarea);
    textarea.select();
    document.execCommand?.('copy');
    textarea.remove();
  }
}

CascadeThemeEditor.template = template;
CascadeThemeEditor.rootStyles = css;
CascadeThemeEditor.reg('cascade-theme-editor');

export default CascadeThemeEditor;
