import { Dialog } from '../../surface/Dialog/Dialog.js';
import dialogStyles from '../../surface/Dialog/Dialog.css.js';
import {
  start,
  rollback,
  commit,
  finalize,
  getPreviewState,
  getSnapshot,
} from '../cascade-theme-preview.js';
import {
  insertCascadeThemeUserPreset,
  listCascadeThemeUserPresets,
} from '../cascade-theme-presets.js';
import { decodeCascadeThemeShare } from '../cascade-theme-share.js';
import {
  applyCascadeTheme,
  applyCascadeGeometryRegister,
  createCascadeTheme,
  normalizeCascadeGeometryRegister,
  normalizeCascadeThemeOptions,
} from '../cascade-theme.js';
import { geometryRegisterScaleTokens } from '../../tokens/scale.js';
import tpl from './CascadeThemeImportDialog.tpl.js';
import componentStyles from './CascadeThemeImportDialog.css.js';

const DEFAULT_STORAGE_KEY = 'symbiote-ui:cascade-theme-editor';
const REGISTER_SUFFIX = '::geometry-register';

const DEFAULT_MESSAGES = Object.freeze({
  title: 'Import theme',
  promptPrefix: 'Would you like to import the shared theme',
  promptSuffix: '?',
  unnamedTheme: 'Unnamed theme',
  closeLabel: 'Close dialog',
  cancelLabel: 'Cancel',
  saveOnlyLabel: 'Save without applying',
  saveApplyLabel: 'Add and apply',
  statusDecoded: 'Theme decoded successfully.',
  statusFinalizing: 'Saving theme…',
  statusSuccessAddApply: 'Theme added and applied.',
  statusSuccessSaveOnly: 'Theme saved to presets.',
  statusCancel: 'Import cancelled.',
  failParse: 'The shared theme could not be opened: {error}',
  failSave: 'The theme could not be saved: {error}',
  failApply: 'The theme could not be applied: {error}',
  failRollback: 'The original theme could not be restored: {error}',
});

// These values are deliberately literal. Imported or inherited custom
// properties can therefore never restyle the confirmation surface.
const SAFE_DIALOG_TOKENS = Object.freeze({
  '--sn-dialog-backdrop-bg': 'rgba(0, 0, 0, 0.56)',
  '--sn-dialog-max-width': '560px',
  '--sn-dialog-max-height': '80vh',
  '--sn-sys-scrim': 'rgba(0, 0, 0, 0.56)',
  '--sn-sys-surface-overlay': '#202124',
  '--sn-sys-surface-toolbar': '#28292b',
  '--sn-sys-on-surface': '#f2f3f5',
  '--sn-sys-on-surface-dim': '#b8bbc2',
  '--sn-sys-outline': '#737780',
  '--sn-sys-outline-subtle': '#4a4d53',
  '--sn-sys-accent': '#4d8df7',
  '--sn-sys-focus-ring': '#8ab4ff',
  '--sn-sys-focus-ring-width': '2px',
  '--sn-sys-state-hover-mix': '18%',
  '--sn-panel-radius': '8px',
  '--sn-radius-sm': '4px',
  '--sn-sys-shadow-overlay': '0 12px 36px rgba(0, 0, 0, 0.42)',
  '--sn-transition-fast': '120ms',
  '--sn-transition-normal': '240ms',
  '--sn-step-2': '4px',
  '--sn-step-5': '12px',
  '--sn-step-6': '14px',
  '--sn-step-8': '16px',
  '--sn-step-9': '20px',
  '--sn-font': 'system-ui, sans-serif',
  '--sn-text-sm': '12px',
  '--sn-text-md': '13px',
  '--sn-text-2xl': '18px',
  '--sn-theme-density': '1',
  '--sn-theme-type-scale': '1',
  '--sn-theme-heading-scale': '1',
  '--sn-scroll-shadow-size': '14px',
  '--sn-scroll-fade-mask-color': '#f2f3f5',
  '--sn-button-bg': '#303236',
  '--sn-button-color': '#f2f3f5',
  '--sn-button-border': '#737780',
  '--sn-button-hover-bg': '#3b3e43',
  '--sn-button-hover-border': '#8a8f99',
  '--sn-button-primary-bg': '#4d8df7',
  '--sn-button-primary-border': '#4d8df7',
  '--sn-button-primary-color': '#101114',
  '--sn-button-padding': '6px 12px',
  '--sn-button-radius': '4px',
  '--sn-button-font-size': '12px',
  '--sn-button-font-weight': '500',
  '--sn-button-line-height': '1.2',
  '--sn-button-min-height': '30px',
  '--sn-button-disabled-opacity': '0.5',
});

const PROTECTED_ATTRIBUTES = Object.freeze([
  'data-cascade-theme-variant',
  'data-cascade-tab-shape',
]);

export class CascadeThemeImportError extends Error {
  constructor(message, code, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'CascadeThemeImportError';
    this.code = code;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function formatMessage(template, error) {
  return String(template).replace('{error}', error?.message || String(error));
}

function rawStorageSnapshot(storage, key) {
  return storage.getItem(key);
}

function restoreRawStorage(storage, key, raw) {
  if (raw === null) storage.removeItem(key);
  else storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) {
    throw new CascadeThemeImportError(
      `Storage compensation failed for ${key}`,
      'IMPORT_COMPENSATION_FAILED'
    );
  }
}

function snapshotOriginalTarget(target) {
  const preview = getSnapshot(target);
  if (!preview) {
    throw new CascadeThemeImportError(
      'The original theme snapshot is unavailable',
      'IMPORT_SNAPSHOT_UNAVAILABLE'
    );
  }
  return {
    properties: new Map(Array.from(preview.properties, ([token, property]) => [
      token,
      { value: property.value, priority: property.priority },
    ])),
    attributes: new Map(preview.attributes),
  };
}

function restoreOriginalTarget(target, snapshot) {
  const failures = [];
  for (const [attribute, value] of snapshot.attributes) {
    try {
      if (value === null) target.removeAttribute(attribute);
      else target.setAttribute(attribute, value);
    } catch (error) {
      failures.push(error);
    }
  }
  for (const [token, property] of snapshot.properties) {
    try {
      if (property.value === '') target.style.removeProperty(token);
      else target.style.setProperty(token, property.value, property.priority);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) {
    throw new CascadeThemeImportError(
      'The original theme compensation failed',
      'IMPORT_COMPENSATION_FAILED',
      failures.length === 1 ? failures[0] : new AggregateError(failures)
    );
  }
}

export class CascadeThemeImportDialog extends Dialog {
  decoded = null;

  #target = null;
  #storage = null;
  #storageKey = DEFAULT_STORAGE_KEY;
  #messages = DEFAULT_MESSAGES;
  #phase = 'idle';
  #terminalEvent = null;
  #sessionEpoch = 0;
  #startingOwner = null;
  #pendingStartCancellation = null;
  #finalizationOwner = null;
  #pendingFinalizationDisconnect = null;
  #rollbackPending = false;
  #protectedProperties = new Set();

  #popstateHandler = () => {
    if (this.#phase !== 'previewing') return;
    try {
      this.cancel('navigation');
    } catch (error) {
      // cancel() emits the exclusive typed error and keeps the transaction
      // available for a later rollback retry.
      void error;
    }
  };

  init$ = {
    label: DEFAULT_MESSAGES.title,
    title: DEFAULT_MESSAGES.title,
    promptPrefix: DEFAULT_MESSAGES.promptPrefix,
    promptSuffix: DEFAULT_MESSAGES.promptSuffix,
    closeLabel: DEFAULT_MESSAGES.closeLabel,
    cancelLabel: DEFAULT_MESSAGES.cancelLabel,
    saveOnlyLabel: DEFAULT_MESSAGES.saveOnlyLabel,
    saveApplyLabel: DEFAULT_MESSAGES.saveApplyLabel,
    themeName: '',
    status: '',
    isFinalizing: false,
    isSettled: true,
    onCancel: (event) => {
      event?.preventDefault?.();
      this.#runUiAction(() => this.cancel('button'));
    },
    onSaveWithoutApplying: () => {
      this.#runUiAction(() => this.saveWithoutApplying());
    },
    onAddAndApply: () => {
      this.#runUiAction(() => this.addAndApply());
    },
  };

  /**
   * Opens a decoded theme preview. This method intentionally accepts exactly
   * one options object so hosts cannot depend on positional compatibility APIs.
   *
   * @param {{token: string, target?: HTMLElement, storage?: Storage, storageKey?: string, labels?: Object, messages?: Object}} options
   * @returns {{state: string, outcome: string}}
   */
  show(options) {
    if (this.#phase === 'finalizing') {
      throw new CascadeThemeImportError(
        'A finalizing import cannot be replaced',
        'IMPORT_FINALIZING'
      );
    }
    if (this.#phase === 'starting') {
      throw new CascadeThemeImportError(
        'A starting import cannot be replaced',
        'IMPORT_SHOW_INTERRUPTED'
      );
    }

    const replacementEpoch = this.#sessionEpoch;
    if (this.#phase === 'previewing') this.#settleCancel('replaced');
    else this.#closeNative();
    this.#assertLifecycleEpoch(replacementEpoch);

    const owner = Object.freeze({ epoch: ++this.#sessionEpoch });
    this.#resetSession();
    let target = null;

    const optionMessages = isPlainObject(options?.messages) ? options.messages : {};
    const optionLabels = isPlainObject(options?.labels) ? options.labels : {};
    this.#messages = Object.freeze({
      ...DEFAULT_MESSAGES,
      ...optionLabels,
      ...optionMessages,
    });
    this.#syncMessages();

    try {
      this.#assertShowOwner(owner);
      if (arguments.length !== 1 || !isPlainObject(options)) {
        throw new CascadeThemeImportError(
          'show() requires exactly one options object',
          'INVALID_IMPORT_OPTIONS'
        );
      }
      if (typeof options.token !== 'string' || options.token.length === 0) {
        throw new CascadeThemeImportError('A shared theme token is required', 'INVALID_IMPORT_TOKEN');
      }

      target = options.target ?? globalThis.document?.documentElement;
      if (!target?.style) {
        throw new CascadeThemeImportError('A style-capable import target is required', 'INVALID_IMPORT_TARGET');
      }
      if (options.storageKey !== undefined && (typeof options.storageKey !== 'string' || !options.storageKey)) {
        throw new CascadeThemeImportError('storageKey must be a non-empty string', 'INVALID_IMPORT_OPTIONS');
      }

      const decoded = decodeCascadeThemeShare(options.token);
      this.#target = target;
      this.#storage = options.storage ?? null;
      this.#storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
      this.decoded = decoded;
      this.$.themeName = decoded.name || this.#messages.unnamedTheme;
      this.$.status = this.#messages.statusDecoded;

      this.#phase = 'starting';
      this.#startingOwner = owner;
      this.$.isSettled = false;

      // Any older preview has already been restored. Protection therefore
      // snapshots the real host theme, never a previous imported preview.
      this.#protect(target, decoded.state);
      this.#assertShowOwner(owner);
      start(target, decoded.state, decoded.register);
      this.#assertShowOwner(owner);
      this.#startingOwner = null;
      this.#phase = 'previewing';

      globalThis.window?.addEventListener?.('popstate', this.#popstateHandler);
      super.show();
      this.#assertShowOwner(owner);
      return Object.freeze({ state: 'previewing', outcome: 'shown' });
    } catch (error) {
      const typed = error instanceof CascadeThemeImportError
        ? error
        : new CascadeThemeImportError(error.message, 'IMPORT_PARSE_FAILED', error);
      if (this.#pendingStartCancellation?.owner === owner) {
        throw this.#finishInterruptedStart(owner, target, typed);
      }
      if (!this.#ownsShow(owner)) throw typed;
      throw this.#finishError(typed, 'IMPORT_PARSE_FAILED', this.#messages.failParse);
    }
  }

  /**
   * User-facing close paths are cancellation paths. Internal terminal paths
   * call the Dialog implementation directly through #closeNative().
   */
  close() {
    if (this.#phase === 'starting') {
      return this.#requestStartingCancellation('close');
    }
    if (this.#phase === 'previewing') return this.cancel('close');
    if (this.#phase === 'finalizing') {
      return Object.freeze({ state: 'finalizing', outcome: 'ignored' });
    }
    this.#closeNative();
    return Object.freeze({ state: this.#phase, outcome: 'closed' });
  }

  cancel(reason = 'cancel') {
    if (this.#phase === 'starting') {
      return this.#requestStartingCancellation(reason);
    }
    if (this.#phase === 'finalizing') {
      return Object.freeze({ state: 'finalizing', outcome: 'ignored' });
    }
    if (this.#phase !== 'previewing') {
      return Object.freeze({ state: this.#phase, outcome: 'already-settled' });
    }
    return this.#settleCancel(reason);
  }

  addAndApply() {
    if (this.#phase === 'finalizing') {
      return Object.freeze({ state: 'finalizing', outcome: 'ignored' });
    }
    if (this.#phase !== 'previewing' || !this.decoded || !this.#target) {
      return Object.freeze({ state: this.#phase, outcome: 'already-settled' });
    }
    if (this.#rollbackPending) {
      return Object.freeze({ state: 'previewing', outcome: 'rollback-pending' });
    }

    const decoded = this.decoded;
    const target = this.#target;
    const originalTarget = snapshotOriginalTarget(target);
    const storageKey = this.#storageKey;
    const registerKey = storageKey + REGISTER_SUFFIX;
    let storage = null;
    let priorState = null;
    let priorRegister = null;
    const effects = {
      preset: null,
      activeStorageTouched: false,
      targetMutationStarted: false,
    };
    let theme = null;
    let owner = null;

    try {
      owner = this.#beginFinalization('add-and-apply');
      this.#assertFinalizationOwner(owner);
      storage = this.#resolveStorage();
      this.#assertFinalizationOwner(owner);
      priorState = rawStorageSnapshot(storage, storageKey);
      this.#assertFinalizationOwner(owner);
      priorRegister = rawStorageSnapshot(storage, registerKey);
      this.#assertFinalizationOwner(owner);
      const finalName = this.#uniqueName(storage);
      this.#assertFinalizationOwner(owner);
      effects.preset = insertCascadeThemeUserPreset({
        state: decoded.state,
        register: decoded.register,
        name: finalName,
      }, { storage });
      this.#assertFinalizationOwner(owner);

      const normalizedState = normalizeCascadeThemeOptions(decoded.state);
      const normalizedRegister = normalizeCascadeGeometryRegister(decoded.register);
      const serializedState = JSON.stringify(normalizedState);

      effects.activeStorageTouched = true;
      storage.setItem(storageKey, serializedState);
      this.#assertFinalizationOwner(owner);
      storage.setItem(registerKey, normalizedRegister);
      this.#assertFinalizationOwner(owner);
      const stateReadback = storage.getItem(storageKey);
      this.#assertFinalizationOwner(owner);
      if (stateReadback !== serializedState) {
        throw new CascadeThemeImportError('Active theme state readback did not match exact bytes', 'IMPORT_READBACK_FAILED');
      }
      const registerReadback = storage.getItem(registerKey);
      this.#assertFinalizationOwner(owner);
      if (registerReadback !== normalizedRegister) {
        throw new CascadeThemeImportError('Active geometry register readback did not match exact bytes', 'IMPORT_READBACK_FAILED');
      }

      effects.targetMutationStarted = true;
      theme = applyCascadeTheme(target, normalizedState, { notify: false });
      this.#assertFinalizationOwner(owner);
      applyCascadeGeometryRegister(target, normalizedRegister);
      this.#assertFinalizationOwner(owner);
      commit(target);
      this.#assertFinalizationOwner(owner);
    } catch (error) {
      const failures = [error];
      const disconnect = this.#disconnectFor(owner);
      const interrupted = !this.#ownsFinalization(owner)
        || (error instanceof CascadeThemeImportError
          && error.code === 'IMPORT_FINALIZATION_INTERRUPTED');
      if (disconnect?.rollbackError) failures.push(disconnect.rollbackError);
      if (interrupted && effects.targetMutationStarted) {
        try {
          restoreOriginalTarget(target, originalTarget);
        } catch (restoreError) {
          failures.push(restoreError);
        }
      }
      if (effects.activeStorageTouched && storage) {
        try {
          restoreRawStorage(storage, storageKey, priorState);
        } catch (restoreError) {
          failures.push(restoreError);
        }
        try {
          restoreRawStorage(storage, registerKey, priorRegister);
        } catch (restoreError) {
          failures.push(restoreError);
        }
      }
      if (effects.preset && storage) {
        try {
          const presetKey = `symbiote-ui:presets:v1:${effects.preset.id}`;
          storage.removeItem(presetKey);
          if (storage.getItem(presetKey) !== null) {
            throw new CascadeThemeImportError('New preset compensation failed', 'IMPORT_COMPENSATION_FAILED');
          }
        } catch (presetError) {
          failures.push(presetError);
        }
      }
      const cause = failures.length === 1 ? failures[0] : new AggregateError(failures);
      const typed = new CascadeThemeImportError(
        error.message,
        failures.length > 1
          ? 'IMPORT_COMPENSATION_FAILED'
          : (interrupted ? error.code : 'IMPORT_APPLY_FAILED'),
        cause
      );
      if (disconnect
        && error instanceof CascadeThemeImportError
        && error.code === 'IMPORT_FINALIZATION_INTERRUPTED'
        && failures.length === 1) {
        throw this.#finishInterruptedFinalization(typed);
      }
      throw this.#finishError(typed, typed.code, this.#messages.failApply);
    }

    const successEvent = this.#prepareSuccessfulSettlement(owner, this.#messages.statusSuccessAddApply, {
      action: 'add-and-apply',
      preset: effects.preset,
      state: decoded.state,
      register: decoded.register,
    });
    this.#closeNative();

    target.dispatchEvent(new CustomEvent('cascade-theme-change', {
      bubbles: true,
      composed: true,
      detail: {
        source: 'cascade-theme-import',
        state: theme.state,
        theme,
        targetSelector: null,
      },
    }));
    this.dispatchEvent(successEvent);
    return Object.freeze({ state: 'settled', outcome: 'added-and-applied', preset: effects.preset });
  }

  saveWithoutApplying() {
    if (this.#phase === 'finalizing') {
      return Object.freeze({ state: 'finalizing', outcome: 'ignored' });
    }
    if (this.#phase !== 'previewing' || !this.decoded || !this.#target) {
      return Object.freeze({ state: this.#phase, outcome: 'already-settled' });
    }
    if (this.#rollbackPending) {
      return Object.freeze({ state: 'previewing', outcome: 'rollback-pending' });
    }

    const decoded = this.decoded;
    const target = this.#target;
    const originalTarget = snapshotOriginalTarget(target);
    let storage = null;
    const effects = {
      preset: null,
      rollbackStarted: false,
    };
    let owner = null;

    try {
      owner = this.#beginFinalization('save-without-applying');
      this.#assertFinalizationOwner(owner);
      storage = this.#resolveStorage();
      this.#assertFinalizationOwner(owner);
      const finalName = this.#uniqueName(storage);
      this.#assertFinalizationOwner(owner);
      effects.preset = insertCascadeThemeUserPreset({
        state: decoded.state,
        register: decoded.register,
        name: finalName,
      }, { storage });
      this.#assertFinalizationOwner(owner);
      effects.rollbackStarted = true;
      rollback(target);
      this.#assertFinalizationOwner(owner);
    } catch (error) {
      const failures = [error];
      const disconnect = this.#disconnectFor(owner);
      const interrupted = !this.#ownsFinalization(owner)
        || (error instanceof CascadeThemeImportError
          && error.code === 'IMPORT_FINALIZATION_INTERRUPTED');
      if (disconnect?.rollbackError) failures.push(disconnect.rollbackError);
      if (interrupted && effects.rollbackStarted) {
        try {
          restoreOriginalTarget(target, originalTarget);
        } catch (restoreError) {
          failures.push(restoreError);
        }
      }
      if (effects.preset && storage) {
        try {
          const presetKey = `symbiote-ui:presets:v1:${effects.preset.id}`;
          storage.removeItem(presetKey);
          if (storage.getItem(presetKey) !== null) {
            throw new CascadeThemeImportError('New preset compensation failed', 'IMPORT_COMPENSATION_FAILED');
          }
        } catch (presetError) {
          failures.push(presetError);
        }
      }
      const cause = failures.length === 1 ? failures[0] : new AggregateError(failures);
      const typed = new CascadeThemeImportError(
        error.message,
        failures.length > 1
          ? 'IMPORT_COMPENSATION_FAILED'
          : (interrupted ? error.code : 'IMPORT_SAVE_FAILED'),
        cause
      );
      if (disconnect
        && error instanceof CascadeThemeImportError
        && error.code === 'IMPORT_FINALIZATION_INTERRUPTED'
        && failures.length === 1) {
        throw this.#finishInterruptedFinalization(typed);
      }
      throw this.#finishError(typed, typed.code, this.#messages.failSave);
    }

    const successEvent = this.#prepareSuccessfulSettlement(owner, this.#messages.statusSuccessSaveOnly, {
      action: 'save-without-applying',
      preset: effects.preset,
      state: decoded.state,
      register: decoded.register,
    });
    this.#closeNative();
    this.dispatchEvent(successEvent);
    return Object.freeze({ state: 'settled', outcome: 'saved', preset: effects.preset });
  }

  disconnectedCallback() {
    const phase = this.#phase;
    const finalizationOwner = this.#finalizationOwner;
    let terminal = null;
    let retainActionData = false;
    this.#sessionEpoch += 1;
    this.#finalizationOwner = null;

    if (phase === 'starting') {
      this.#pendingStartCancellation = {
        owner: this.#startingOwner,
        reason: 'disconnect',
      };
      this.#startingOwner = null;
      this.#phase = 'starting';
      this.$.isFinalizing = false;
      this.$.isSettled = false;
      retainActionData = true;
    } else if (phase === 'previewing' || phase === 'finalizing') {
      let rollbackError = null;
      try {
        rollback(this.#target);
      } catch (error) {
        // The owning synchronous rollback will finish after this callback.
        // PREVIEW_BUSY is therefore deferred work, not a failed restore.
        if (error?.code !== 'PREVIEW_BUSY') rollbackError = error;
      }
      if (phase === 'finalizing') {
        this.#pendingFinalizationDisconnect = {
          owner: finalizationOwner,
          rollbackError,
        };
      }
      if (rollbackError) {
        this.#phase = phase;
        this.#rollbackPending = true;
        this.$.isFinalizing = phase === 'finalizing';
        this.$.isSettled = false;
        retainActionData = true;
        const typed = new CascadeThemeImportError(
          rollbackError.message,
          'IMPORT_ROLLBACK_FAILED',
          rollbackError
        );
        terminal = ['cascade-theme-import-error', { error: typed, code: typed.code }];
      } else {
        this.#phase = 'settled';
        this.#rollbackPending = false;
        this.$.isFinalizing = false;
        this.$.isSettled = true;
      }
      if (phase === 'previewing' && !rollbackError) {
        terminal = ['cascade-theme-import-cancel', { reason: 'disconnect' }];
      }
    }
    globalThis.window?.removeEventListener?.('popstate', this.#popstateHandler);
    this.#clearProtection();
    if (!retainActionData) this.#clearActionData();
    super.disconnectedCallback?.();
    if (terminal) this.#dispatchTerminal(...terminal);
  }

  #runUiAction(action) {
    try {
      action();
    } catch (error) {
      // Public methods already emit the exclusive typed terminal error. Native
      // button handlers must not create an unhandled exception or console noise.
      void error;
    }
  }

  #beginFinalization(action) {
    finalize(this.#target);
    this.#phase = 'finalizing';
    const owner = Object.freeze({
      action,
      epoch: this.#sessionEpoch,
    });
    this.#finalizationOwner = owner;
    this.$.isFinalizing = true;
    this.$.status = this.#messages.statusFinalizing;
    return owner;
  }

  #assertFinalizationOwner(owner) {
    if (!this.#ownsFinalization(owner)) {
      throw new CascadeThemeImportError(
        'Theme import finalization was interrupted',
        'IMPORT_FINALIZATION_INTERRUPTED'
      );
    }
  }

  #ownsFinalization(owner) {
    return this.#phase === 'finalizing'
      && this.#finalizationOwner === owner
      && owner?.epoch === this.#sessionEpoch;
  }

  #ownsShow(owner) {
    return owner?.epoch === this.#sessionEpoch
      && this.isConnected
      && (this.#phase === 'idle' || this.#phase === 'starting' || this.#phase === 'previewing')
      && this.#pendingStartCancellation?.owner !== owner;
  }

  #assertShowOwner(owner) {
    if (!this.#ownsShow(owner)) {
      throw new CascadeThemeImportError(
        'Theme import show was interrupted',
        'IMPORT_SHOW_INTERRUPTED'
      );
    }
  }

  #assertLifecycleEpoch(epoch) {
    if (epoch !== this.#sessionEpoch || !this.isConnected) {
      throw new CascadeThemeImportError(
        'Theme import show was interrupted',
        'IMPORT_SHOW_INTERRUPTED'
      );
    }
  }

  #disconnectFor(owner) {
    return this.#pendingFinalizationDisconnect?.owner === owner
      ? this.#pendingFinalizationDisconnect
      : null;
  }

  #resolveStorage() {
    const storage = this.#storage ?? globalThis.window?.localStorage;
    if (!storage) {
      throw new CascadeThemeImportError('Browser storage is unavailable', 'IMPORT_STORAGE_UNAVAILABLE');
    }
    return storage;
  }

  #uniqueName(storage) {
    const base = this.$.themeName || this.decoded?.name || this.#messages.unnamedTheme;
    const names = new Set(listCascadeThemeUserPresets({ storage }).map((preset) => preset.name));
    if (!names.has(base)) return base;

    let index = 1;
    while (index < 10_000) {
      const suffix = ` (${index})`;
      const prefix = [...base].slice(0, Math.max(0, 64 - [...suffix].length)).join('');
      const candidate = prefix + suffix;
      if (!names.has(candidate)) return candidate;
      index += 1;
    }
    throw new CascadeThemeImportError('A unique preset name could not be allocated', 'IMPORT_NAME_COLLISION');
  }

  #requestStartingCancellation(reason) {
    const owner = this.#startingOwner;
    if (!owner) {
      return Object.freeze({ state: this.#phase, outcome: 'already-settled' });
    }
    if (this.#pendingStartCancellation?.owner !== owner) {
      this.#pendingStartCancellation = {
        owner,
        reason: String(reason || 'cancel'),
      };
    }
    return Object.freeze({ state: 'starting', outcome: 'cancellation-requested' });
  }

  #settleCancel(reason) {
    const epoch = this.#sessionEpoch;
    try {
      rollback(this.#target);
    } catch (error) {
      const typed = new CascadeThemeImportError(
        error.message,
        'IMPORT_ROLLBACK_FAILED',
        error
      );
      this.#rollbackPending = true;
      this.$.isFinalizing = false;
      this.$.isSettled = false;
      this.$.status = formatMessage(this.#messages.failRollback, typed);
      this.#dispatchTerminal('cascade-theme-import-error', {
        error: typed,
        code: typed.code,
      });
      throw typed;
    }
    this.#rollbackPending = false;
    this.#phase = 'settled';
    this.#finalizationOwner = null;
    this.$.isFinalizing = false;
    this.$.isSettled = true;
    this.$.status = this.#messages.statusCancel;
    globalThis.window?.removeEventListener?.('popstate', this.#popstateHandler);
    this.#clearProtection();
    this.#clearActionData();
    this.#dispatchTerminal('cascade-theme-import-cancel', { reason });
    if (epoch === this.#sessionEpoch && this.isConnected) super.close();
    return Object.freeze({ state: 'settled', outcome: 'cancelled' });
  }

  #finishInterruptedStart(owner, target, interruption) {
    const cancellation = this.#pendingStartCancellation;
    if (cancellation?.owner !== owner) return interruption;

    let rollbackError = null;
    try {
      rollback(target);
    } catch (error) {
      rollbackError = error;
    }

    this.#startingOwner = null;
    this.#pendingStartCancellation = null;
    this.#finalizationOwner = null;
    this.$.isFinalizing = false;

    if (rollbackError) {
      const error = new CascadeThemeImportError(
        'The interrupted theme preview could not be restored',
        'IMPORT_ROLLBACK_FAILED',
        new AggregateError([interruption, rollbackError])
      );
      this.#phase = 'previewing';
      this.#rollbackPending = true;
      this.$.isSettled = false;
      this.$.status = formatMessage(this.#messages.failRollback, error);
      if (this.isConnected) {
        globalThis.window?.addEventListener?.('popstate', this.#popstateHandler);
      }
      this.#dispatchTerminal('cascade-theme-import-error', {
        error,
        code: error.code,
      });
      return error;
    }

    this.#phase = 'settled';
    this.#rollbackPending = false;
    this.$.isSettled = true;
    globalThis.window?.removeEventListener?.('popstate', this.#popstateHandler);
    this.#clearProtection();
    this.#clearActionData();

    const error = interruption.code === 'IMPORT_SHOW_INTERRUPTED'
      ? interruption
      : new CascadeThemeImportError(
        'Theme import show was interrupted',
        'IMPORT_SHOW_INTERRUPTED',
        interruption
      );
    this.$.status = this.#messages.statusCancel;
    this.#dispatchTerminal('cascade-theme-import-cancel', { reason: cancellation.reason });
    return error;
  }

  #prepareSuccessfulSettlement(owner, status, detail) {
    this.#assertFinalizationOwner(owner);
    const terminalEvent = this.#claimTerminalEvent('cascade-theme-import-success', detail);
    this.#phase = 'settled';
    this.#startingOwner = null;
    this.#pendingStartCancellation = null;
    this.#finalizationOwner = null;
    this.#pendingFinalizationDisconnect = null;
    this.#rollbackPending = false;
    this.$.isFinalizing = false;
    this.$.isSettled = true;
    this.$.status = status;
    globalThis.window?.removeEventListener?.('popstate', this.#popstateHandler);
    this.#clearProtection();
    this.#clearActionData();
    return terminalEvent;
  }

  #finishInterruptedFinalization(error) {
    this.#phase = 'settled';
    this.#finalizationOwner = null;
    this.#pendingFinalizationDisconnect = null;
    this.#rollbackPending = false;
    this.$.isFinalizing = false;
    this.$.isSettled = true;
    this.$.status = this.#messages.statusCancel;
    globalThis.window?.removeEventListener?.('popstate', this.#popstateHandler);
    this.#clearProtection();
    this.#clearActionData();
    this.#dispatchTerminal('cascade-theme-import-cancel', { reason: 'disconnect' });
    return error;
  }

  #finishError(error, code, statusTemplate) {
    const failures = [error];
    let previewState = this.#target ? getPreviewState(this.#target) : null;
    if (this.#target && previewState !== null && previewState !== 'settled') {
      try {
        rollback(this.#target);
      } catch (rollbackError) {
        failures.push(rollbackError);
      }
      previewState = getPreviewState(this.#target);
    }
    const terminalError = failures.length === 1
      ? error
      : new CascadeThemeImportError(
        error.message,
        'IMPORT_ROLLBACK_FAILED',
        new AggregateError(failures)
      );
    this.$.status = formatMessage(statusTemplate, terminalError);

    if (previewState !== null && previewState !== 'settled') {
      this.#phase = 'previewing';
      this.#startingOwner = null;
      this.#pendingStartCancellation = null;
      this.#finalizationOwner = null;
      this.#pendingFinalizationDisconnect = null;
      this.#rollbackPending = true;
      this.$.isFinalizing = false;
      this.$.isSettled = false;
      globalThis.window?.addEventListener?.('popstate', this.#popstateHandler);
      this.#dispatchTerminal('cascade-theme-import-error', {
        error: terminalError,
        code: terminalError.code || code,
      });
      return terminalError;
    }

    this.#phase = 'settled';
    this.#startingOwner = null;
    this.#pendingStartCancellation = null;
    this.#finalizationOwner = null;
    this.#pendingFinalizationDisconnect = null;
    this.#rollbackPending = false;
    this.$.isFinalizing = false;
    this.$.isSettled = true;
    const epoch = this.#sessionEpoch;
    globalThis.window?.removeEventListener?.('popstate', this.#popstateHandler);
    this.#clearProtection();
    this.#clearActionData();
    this.#dispatchTerminal('cascade-theme-import-error', {
      error: terminalError,
      code: terminalError.code || code,
    });
    if (epoch === this.#sessionEpoch && this.isConnected) super.close();
    return terminalError;
  }

  #dispatchTerminal(type, detail) {
    const event = this.#claimTerminalEvent(type, detail);
    if (!event) return false;
    this.dispatchEvent(event);
    return true;
  }

  #claimTerminalEvent(type, detail) {
    if (this.#terminalEvent) return null;
    this.#terminalEvent = type;
    return new CustomEvent(type, {
      bubbles: true,
      composed: true,
      detail,
    });
  }

  #closeNative() {
    globalThis.window?.removeEventListener?.('popstate', this.#popstateHandler);
    this.#clearProtection();
    super.close();
  }

  #resetSession() {
    this.#startingOwner = null;
    this.#pendingStartCancellation = null;
    this.#finalizationOwner = null;
    this.#pendingFinalizationDisconnect = null;
    this.#rollbackPending = false;
    this.decoded = null;
    this.#target = null;
    this.#storage = null;
    this.#storageKey = DEFAULT_STORAGE_KEY;
    this.#phase = 'idle';
    this.#terminalEvent = null;
    this.$.isFinalizing = false;
    this.$.isSettled = true;
    this.$.themeName = '';
    this.$.status = '';
  }

  #clearActionData() {
    this.decoded = null;
    this.#target = null;
    this.#storage = null;
    this.#storageKey = DEFAULT_STORAGE_KEY;
  }

  #syncMessages() {
    this.$.label = this.#messages.title;
    this.$.title = this.#messages.title;
    this.$.promptPrefix = this.#messages.promptPrefix;
    this.$.promptSuffix = this.#messages.promptSuffix;
    this.$.closeLabel = this.#messages.closeLabel;
    this.$.cancelLabel = this.#messages.cancelLabel;
    this.$.saveOnlyLabel = this.#messages.saveOnlyLabel;
    this.$.saveApplyLabel = this.#messages.saveApplyLabel;
  }

  #protect(target, state) {
    this.#clearProtection();
    const computed = globalThis.getComputedStyle?.(target) || null;
    const themeTokens = Object.keys(createCascadeTheme(state).tokens);
    const geometryTokens = Object.keys(geometryRegisterScaleTokens('product'));
    const elements = [this, this.ref.dialog].filter(Boolean);

    for (const element of elements) {
      for (const token of new Set([...themeTokens, ...geometryTokens])) {
        const value = computed?.getPropertyValue?.(token)?.trim();
        element.style.setProperty(token, value || 'initial');
        this.#protectedProperties.add(token);
      }
      for (const [token, fallback] of Object.entries(SAFE_DIALOG_TOKENS)) {
        element.style.setProperty(token, fallback);
        this.#protectedProperties.add(token);
      }
      for (const attr of PROTECTED_ATTRIBUTES) {
        const value = target.getAttribute(attr);
        if (value === null) element.removeAttribute(attr);
        else element.setAttribute(attr, value);
      }
    }
  }

  #clearProtection() {
    for (const element of [this, this.ref?.dialog].filter(Boolean)) {
      for (const token of this.#protectedProperties) element.style.removeProperty(token);
      for (const attr of PROTECTED_ATTRIBUTES) element.removeAttribute(attr);
    }
    this.#protectedProperties.clear();
  }
}

CascadeThemeImportDialog.template = tpl;
CascadeThemeImportDialog.rootStyles = `${dialogStyles}\n${componentStyles}`;
CascadeThemeImportDialog.reg('sn-theme-import-dialog');

export default CascadeThemeImportDialog;
