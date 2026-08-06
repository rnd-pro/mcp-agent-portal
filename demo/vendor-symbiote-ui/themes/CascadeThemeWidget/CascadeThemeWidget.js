import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import {
  applyCascadeGeometryRegister,
  applyCascadeTheme,
  applyCascadeThemeBundle,
  CASCADE_THEME_DEFAULTS,
  getCascadeThemeControls,
  isCascadeThemeBundle,
  normalizeCascadeGeometryRegister,
  normalizeCascadeTabShape,
  normalizeCascadeThemeOptions,
  persistCascadeThemeScopeRegister,
  persistCascadeThemeScopeState,
  readCascadeThemeScopeState,
  resetCascadeThemeScopes,
  resolveCascadeThemeVariantState,
  serializeCascadeThemeBundle,
} from '../cascade-theme.js';
import {
  bringOverlayToFront,
  mountOverlayToDocument,
  restoreOverlayHome,
  syncOverlayTheme,
} from '../../ui/overlay-stack.js';
import { positionOverlay } from '../../ui/overlay-positioner.js';
import { broadcastPopoverOpen, registerPopoverDismissal } from '../../ui/popover-coordinator.js';
import css from './CascadeThemeWidget.css.js';
import tpl from './CascadeThemeWidget.tpl.js';

const DEFAULT_STORAGE_KEY = 'symbiote-ui:cascade-theme-editor';
const COMPACT_CONTROLS = ['brightness', 'contrast', 'chroma', 'hue', 'pattern'];
const CONTROL_ICONS = getCascadeThemeControls()
  .map((control) => control.icon)
  .filter(Boolean);
const TARGET_ICONS = ['web_asset', 'dashboard', 'tab', 'colorize'];
const ICONS = [...new Set(['palette', 'content_copy', 'share', 'restart_alt', 'open_in_full', ...TARGET_ICONS, ...CONTROL_ICONS])];

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

function normalizeShareName(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export class CascadeThemeWidget extends Symbiote {
  static observedAttributes = [
    'storage-key',
    'target-selector',
    'default-state',
    'scopes',
    'overlay-theme-selector',
    'share-label',
  ];

  #controls = getCascadeThemeControls().filter((control) => COMPACT_CONTROLS.includes(control.name));
  #state = normalizeCascadeThemeOptions(CASCADE_THEME_DEFAULTS);
  #geometryRegister = '';
  #scopes = [];
  #ready = false;
  #switching = false;
  #controlSyncFrame = 0;
  #controlInputHandler = (event) => this.#handleControlInput(event);

  init$ = {
    isOpen: false,
    ariaExpanded: 'false',
    triggerTitle: 'Theme quick controls',
    shareLabel: 'Share theme',
    // Compact slider list rendered by itemize on .ctw-controls. Reassigning
    // controlsList (see #syncControls) re-renders the values reactively.
    controlsList: [],
    targets: [],
    hasTargets: false,
    // segmented-control pressed flags, bound to aria-pressed.
    // Kept in sync from #syncControls and #syncRegisterButtons.
    modeDarkActive: 'true',
    modeLightActive: 'false',
    variantModernActive: 'false',
    variantClassicActive: 'true',
    tabShapeFrameActive: 'false',
    tabShapeEarActive: 'false',
    tabShapeClassicEarActive: 'true',
    registerDefaultActive: 'true',
    registerProductActive: 'false',
    registerToolActive: 'false',
    registerSpaciousActive: 'false',

    onToggle: () => {
      this.#setOpen(!this.$.isOpen);
    },
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
    onTargetPick: (event) => {
      let id = event.currentTarget?.dataset?.targetId;
      if (id) this.#pickScope(id);
    },
    onCopy: () => {
      void this.copyParameters();
    },
    onShare: () => {
      this.shareTheme();
    },
    onReset: () => {
      this.reset();
    },
    onOpenFull: () => {
      this.#setOpen(false);
      this.dispatchEvent(new CustomEvent('cascade-theme-open-full', {
        bubbles: true,
        composed: true,
        detail: { state: this.state, storageKey: this.storageKey, targetSelector: this.targetSelector },
      }));
    },
  };

  initCallback() {
    ensureMaterialSymbols(ICONS);
  }

  disconnectedCallback() {
    this.#setOpen(false);
    this.ref.controls?.removeEventListener?.('input', this.#controlInputHandler);
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
    if (!this.#ready) return;
    if (this.#switching) return;
    if (name === 'overlay-theme-selector') {
      this.#syncPopoverTheme();
      return;
    }
    if (name === 'scopes') {
      this.#renderTargets();
      return;
    }
    if (name === 'storage-key' || name === 'default-state') {
      this.#loadStoredState();
    }
    this.#apply(name);
    this.#applyGeometryRegister(name);
    this.#syncRegisterButtons();
    if (name === 'storage-key' || name === 'target-selector') this.#renderTargets();
  }

  renderCallback() {
    if (this.#ready) return;
    this.#ready = true;
    this.$.shareLabel = this.shareLabel;
    this.#renderControls();
    this.#bindControlEvents();
    this.#loadStoredState();
    this.#apply('init');
    this.#applyGeometryRegister('init');
    this.#syncRegisterButtons();
    this.#renderTargets();
    if (this.$.isOpen) this.#openPopover();
  }

  get state() {
    return { ...this.#state };
  }

  setState(value, options = {}) {
    let source = options.source || 'set-state';
    let scopes = this.scopes;
    // a full bundle restores every scope (and named window) at once when the host
    // has fed the scope set; afterwards reload this widget's own scope so the
    // sliders reflect what was applied
    if (isCascadeThemeBundle(value) && scopes.length) {
      applyCascadeThemeBundle(value, scopes, {
        applyState: (target, state) => { applyCascadeTheme(target, state, { notify: false }); },
        namedStorageBase: scopes[0]?.storageKey,
        resolveNamed: (name) => Array.from(
          (this.ownerDocument || document).querySelectorAll(`[data-theme-label="${CSS.escape(name)}"]`)
        ),
      });
      this.#loadStoredState();
      this.#apply(source);
      this.#applyGeometryRegister(source);
      this.#syncRegisterButtons();
      return;
    }
    let params = value;
    // a snapshot may carry the geometry profile alongside the parameters (see
    // copyParameters); split it back out so the preset round-trips too
    let hasRegister = value && typeof value === 'object' && 'register' in value;
    if (hasRegister) {
      let { register, ...rest } = value;
      params = rest;
      this.#geometryRegister = normalizeCascadeGeometryRegister(register);
    }
    this.#state = normalizeCascadeThemeOptions(params);
    this.#apply(source);
    if (hasRegister) {
      this.#applyGeometryRegister(source);
      this.#syncRegisterButtons();
    }
  }

  get storageKey() {
    return this.getAttribute('storage-key') || DEFAULT_STORAGE_KEY;
  }

  // The first-visit default and the target the reset button restores to. Consumers
  // declare it via the default-state attribute (JSON); without it the built-in
  // cascade defaults stand. Stored state always wins, so this never overwrites edits.
  get defaultState() {
    return parseStoredState(this.getAttribute('default-state')) || CASCADE_THEME_DEFAULTS;
  }

  get targetSelector() {
    return this.getAttribute('target-selector') || '';
  }

  get overlayThemeSelector() {
    return this.getAttribute('overlay-theme-selector') || '';
  }

  get shareLabel() {
    return this.getAttribute('share-label') || 'Share theme';
  }

  set shareLabel(value) {
    if (value == null || value === '') this.removeAttribute('share-label');
    else this.setAttribute('share-label', String(value));
  }

  setTarget(target = {}, options = {}) {
    let selector = target.targetSelector ?? target.selector;
    this.#switching = true;
    if (target.defaultState !== undefined) this.setAttribute('default-state', JSON.stringify(target.defaultState || {}));
    if (selector != null) this.setAttribute('target-selector', String(selector));
    if (target.storageKey != null) this.setAttribute('storage-key', String(target.storageKey));
    this.#switching = false;
    if (!this.#ready) return;
    if (options.state) {
      let hasRegister = options.state && typeof options.state === 'object' && 'register' in options.state;
      let params = options.state;
      if (hasRegister) {
        let { register, ...rest } = options.state;
        params = rest;
        this.#geometryRegister = normalizeCascadeGeometryRegister(register);
      }
      this.#state = normalizeCascadeThemeOptions(params);
    } else {
      this.#loadStoredState();
    }
    this.#syncControls();
    this.#syncPopoverTheme();
    this.#syncRegisterButtons();
    this.#renderTargets();
    this.dispatchEvent(new CustomEvent('cascade-theme-target-change', {
      bubbles: true,
      composed: true,
      detail: {
        source: options.source || 'target-switch',
        state: this.state,
        register: this.#geometryRegister || 'default',
        storageKey: this.storageKey,
        targetSelector: this.targetSelector,
      },
    }));
  }

  // The structural + picked scopes the bundle copy/apply spans, set by the host
  // like the editor's targets: Array<{ id, selector, storageKey }>. Falls back to
  // a `scopes` attribute (JSON) so a host can declare them declaratively.
  get scopes() {
    if (this.#scopes.length) return this.#scopes;
    let parsed = parseStoredState(this.getAttribute('scopes'));
    return Array.isArray(parsed) ? parsed : [];
  }

  set scopes(value) {
    this.#scopes = Array.isArray(value) ? value : [];
    if (this.#ready) this.#renderTargets();
  }

  reset() {
    let def = this.defaultState;
    let scopes = this.scopes.length
      ? this.scopes
      : [{ id: 'active', selector: this.targetSelector, storageKey: this.storageKey, defaultState: def }];
    let result = resetCascadeThemeScopes(scopes, {
      source: 'reset',
      defaultState: def,
      activeSelector: this.targetSelector,
      activeStorageKey: this.storageKey,
      resolveScopeTarget: (scope) => this.#resolveScopeTarget(scope),
      namedSelector: '[data-theme-key]',
    });
    this.#geometryRegister = result.activeRegister || '';
    this.#state = result.activeState || normalizeCascadeThemeOptions(def);
    this.#syncControls();
    this.#syncPopoverTheme();
    this.#syncRegisterButtons();
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
      detail: { source: 'reset', register: this.#geometryRegister || 'default', targetSelector: this.targetSelector },
    }));
  }

  async copyParameters() {
    // with host-fed scopes, copy the whole multi-scope bundle (every structural
    // and picked scope plus named windows) so the snapshot round-trips through
    // setState; otherwise copy this scope's parameters plus its geometry profile.
    let scopes = this.scopes;
    let payload = scopes.length
      ? serializeCascadeThemeBundle(scopes.map((scope) => ({ id: scope.id, storageKey: scope.storageKey, defaultState: scope.defaultState })))
      : this.#geometryRegister
        ? { ...this.#state, register: this.#geometryRegister }
        : { ...this.#state };
    let text = JSON.stringify(payload, null, 2);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
      } catch (error) {
        void error;
        this.#copyWithFallback(text);
      }
    } else {
      this.#copyWithFallback(text);
    }
    this.dispatchEvent(new CustomEvent('cascade-theme-copy', {
      bubbles: true,
      composed: true,
      detail: { state: this.state, register: this.#geometryRegister || 'default', text },
    }));
  }

  shareTheme() {
    let scopes = this.scopes;
    let activeId = this.#activeScopeId(scopes);
    let active = scopes.find((entry) => entry.id === activeId);
    let name = normalizeShareName(this.getAttribute('theme-name'))
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

  #setOpen(open) {
    let nextOpen = Boolean(open);
    if (nextOpen === this.$.isOpen) {
      this.$.ariaExpanded = String(nextOpen);
      if (nextOpen) this.#openPopover();
      return;
    }
    this.$.isOpen = nextOpen;
    this.$.ariaExpanded = String(nextOpen);
    if (nextOpen) {
      this.#openPopover();
    } else {
      this.#closePopover();
    }
  }

  #openPopover() {
    let popover = this.ref.popover;
    if (!popover) return;
    popover.hidden = false;
    mountOverlayToDocument(popover, this.#resolveOverlayThemeTarget(this.#resolveTarget()));
    bringOverlayToFront(popover);
    this.#positionPopover();
    this.#bindOverlayListeners();
    this.#bindDismissal();
    broadcastPopoverOpen(this);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        if (this.$.isOpen) this.#positionPopover();
      });
    }
  }

  #closePopover() {
    let popover = this.ref.popover;
    this.#unbindDismissal();
    this.#unbindOverlayListeners();
    if (!popover) return;
    popover.hidden = true;
    popover.style.removeProperty('top');
    popover.style.removeProperty('left');
    restoreOverlayHome(popover);
  }

  #overlayListenersBound = false;
  #dismissalCleanup = null;

  // Coordinated dismissal: a capture-phase outside-pointerdown closes this
  // popover, and any other widget opening its popover broadcasts so this one
  // closes too — enforcing at most one open popover at a time.
  #bindDismissal() {
    if (this.#dismissalCleanup) return;
    this.#dismissalCleanup = registerPopoverDismissal({
      owner: this,
      isInside: (event) => this.#eventTargetsWidget(event),
      onDismiss: () => this.#setOpen(false),
    });
  }

  #unbindDismissal() {
    this.#dismissalCleanup?.();
    this.#dismissalCleanup = null;
  }

  #bindOverlayListeners() {
    if (this.#overlayListenersBound || typeof window === 'undefined') return;
    window.addEventListener('resize', this.#onOverlayReposition);
    window.addEventListener('scroll', this.#onOverlayReposition, true);
    this.#overlayListenersBound = true;
  }

  #unbindOverlayListeners() {
    if (!this.#overlayListenersBound || typeof window === 'undefined') return;
    window.removeEventListener('resize', this.#onOverlayReposition);
    window.removeEventListener('scroll', this.#onOverlayReposition, true);
    this.#overlayListenersBound = false;
  }

  #onOverlayReposition = () => {
    if (this.$.isOpen) this.#positionPopover();
  };

  #positionPopover() {
    let popover = this.ref.popover;
    let trigger = this.ref.trigger || this.querySelector('.ctw-trigger');
    if (!popover || !trigger || typeof window === 'undefined') return;
    if (window.matchMedia?.('(max-width: 820px)')?.matches) {
      popover.style.removeProperty('top');
      popover.style.removeProperty('left');
      return;
    }
    let offset = Number.parseFloat(
      getComputedStyle(trigger).getPropertyValue('--sn-ctw-offset') || '8'
    );
    positionOverlay(trigger, popover, 'bottom-end', {
      offset: Number.isFinite(offset) ? offset : 8,
    });
  }

  #eventTargetsWidget(event) {
    let path = event.composedPath?.() || [];
    let popover = this.ref.popover;
    return path.includes(this) || (popover && (path.includes(popover) || popover.contains(event.target)));
  }

  #renderControls() {
    this.$.controlsList = this.#controls.map((control) => ({
      name: control.name,
      icon: control.icon || 'tune',
      inputId: `ctw-${control.name}`,
      min: control.min,
      max: control.max,
      value: this.#state[control.name] ?? control.default,
    }));
  }

  #renderTargets() {
    let scopes = this.scopes;
    let active = this.#activeScopeId(scopes);
    this.$.targets = scopes.map((scope) => ({
      id: scope.id,
      label: scope.label || scope.id,
      icon: scope.icon || 'web_asset',
      hint: scope.hint || scope.selector || '',
      active: String(scope.id === active),
    }));
    this.$.hasTargets = scopes.length > 1;
  }

  #activeScopeId(scopes = this.scopes) {
    let storageKey = this.storageKey;
    let selector = this.targetSelector;
    return scopes.find((scope) => scope.storageKey === storageKey || scope.selector === selector)?.id || '';
  }

  #pickScope(id) {
    let scope = this.scopes.find((entry) => entry.id === id);
    if (!scope || scope.id === this.#activeScopeId()) return;
    this.setTarget(scope, { source: 'target-switch' });
  }

  #loadStoredState() {
    let active = this.scopes.find((entry) => entry.id === this.#activeScopeId());
    let state = readCascadeThemeScopeState({
      storageKey: this.storageKey,
      defaultState: active?.defaultState || this.defaultState,
    });
    let { register, ...params } = state;
    this.#state = normalizeCascadeThemeOptions(params);
    this.#geometryRegister = normalizeCascadeGeometryRegister(register);
  }

  #persistState() {
    persistCascadeThemeScopeState({ storageKey: this.storageKey }, this.#state);
  }

  #apply(source) {
    let target = this.#resolveTarget();
    let theme = applyCascadeTheme(target, this.#state, { notify: false });
    this.#state = theme.state;
    this.#persistState();
    this.#syncControls();
    this.#syncPopoverTheme(target);
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

  // Push current #state into the reactive scope: the mode toggle's aria-pressed
  // flags derive from #state.mode and the slider list re-renders its values from
  // controlsList. Reactive bindings survive the popover portal move, so this keeps
  // the inline host DOM and the document-mounted popover in sync from one place.
  #syncControls() {
    this.$.modeDarkActive = String(this.#state.mode === 'dark');
    this.$.modeLightActive = String(this.#state.mode === 'light');
    this.$.variantModernActive = String(this.#state.themeVariant === 'modern');
    this.$.variantClassicActive = String(this.#state.themeVariant === 'classic');
    this.$.tabShapeFrameActive = String(this.#state.tabShape === 'frame');
    this.$.tabShapeEarActive = String(this.#state.tabShape === 'ear');
    this.$.tabShapeClassicEarActive = String(this.#state.tabShape === 'classic-ear');
    this.$.controlsList = this.#controls.map((control) => ({
      name: control.name,
      icon: control.icon || 'tune',
      inputId: `ctw-${control.name}`,
      min: control.min,
      max: control.max,
      value: this.#state[control.name],
    }));
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
    let root = this.ref.popover || this;
    if (!root?.querySelector) return;
    for (let control of this.#controls) {
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

  // Preview a canonical geometry register: writes the register's density knobs
  // (--sn-base / --sn-density / --sn-theme-density|spacing-scale|radius-scale) so
  // the step ladder and every density-scaled semantic token shift together — the
  // same knobs the density slider drives. Empty register reverts to root.
  #applyGeometryRegister(source) {
    let target = this.#resolveTarget();
    if (!target?.style) return;
    this.#geometryRegister = applyCascadeGeometryRegister(target, this.#geometryRegister);
    if (!this.#geometryRegister) {
      let theme = applyCascadeTheme(target, this.#state, { notify: false });
      this.#state = theme.state;
      this.#syncControls();
      this.#syncPopoverTheme(target);
    }
    persistCascadeThemeScopeRegister({ storageKey: this.storageKey }, this.#geometryRegister);
    this.dispatchEvent(new CustomEvent('cascade-geometry-register-change', {
      bubbles: true,
      composed: true,
      detail: { source, register: this.#geometryRegister || 'default', targetSelector: this.targetSelector },
    }));
  }

  // Drive the geometry-register buttons' aria-pressed reactively from the active
  // register. Empty register means the Default button is pressed.
  #syncRegisterButtons() {
    let active = this.#geometryRegister;
    this.$.registerDefaultActive = String(active === '');
    this.$.registerProductActive = String(active === 'product');
    this.$.registerToolActive = String(active === 'tool');
    this.$.registerSpaciousActive = String(active === 'spacious');
  }

  #syncPopoverTheme(target = this.#resolveTarget()) {
    let popover = this.ref.popover;
    if (!popover) return;
    syncOverlayTheme(popover, this.#resolveOverlayThemeTarget(target));
  }

  #resolveOverlayThemeTarget(fallback) {
    if (typeof document === 'undefined') return fallback;
    if (this.overlayThemeSelector) {
      return document.querySelector(this.overlayThemeSelector) || fallback;
    }
    return fallback;
  }

  #copyWithFallback(text) {
    if (typeof document === 'undefined') return;
    let textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.append(textarea);
    textarea.select();
    document.execCommand?.('copy');
    textarea.remove();
  }
}

CascadeThemeWidget.template = tpl;
CascadeThemeWidget.rootStyles = css;
CascadeThemeWidget.reg('cascade-theme-widget');

export default CascadeThemeWidget;
