import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import {
  bringOverlayToFront,
  mountOverlayToDocument,
  restoreOverlayHome,
  syncOverlayTheme,
} from '../../ui/overlay-stack.js';
import { positionOverlay } from '../../ui/overlay-positioner.js';
import { broadcastPopoverOpen, registerPopoverDismissal } from '../../ui/popover-coordinator.js';
import {
  createNotificationDebouncer,
  normalizeNotificationItem,
} from '../notification-queue.js';
import { createSoundEngine } from '../sound-engine.js';
import {
  NOTIFICATION_CONFIG_DEFAULTS,
  isStageNarrationEnabled,
  normalizeNotificationConfig,
  parseNotificationConfig,
  resolveEventPreset,
  resolvePhraseVariants,
  resolveToneShape,
  serializeNotificationConfig,
} from '../notification-config.js';
import { NotificationNarrator } from '../../chat/notification-narrator.js';
import { getDefaultVoiceArbitrationChannel } from '../../chat/voice-arbitration.js';
import { NOTIFICATION_EVENT_TYPES } from '../../chat/notification-phrases.js';
import {
  createTranslator,
  normalizeLocale,
  resolveLocale,
  getNavigatorLocalePreferences,
} from '../../locale/index.js';
import css from './NotificationWidget.css.js';
import tpl from './NotificationWidget.tpl.js';

const DEFAULT_STORAGE_KEY = 'symbiote-ui:notification-widget';
const ICONS = ['notifications', 'restart_alt', 'open_in_full', 'graphic_eq', 'record_voice_over'];

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  return null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export class NotificationWidget extends Symbiote {
  static observedAttributes = ['storage-key', 'locale'];

  #config = normalizeNotificationConfig(NOTIFICATION_CONFIG_DEFAULTS);
  #ready = false;
  #popoverBound = false;
  #overlayListenersBound = false;
  #dismissalCleanup = null;
  #sound = null;
  #narrator = null;
  #debouncer = createNotificationDebouncer();
  #flushTimer = 0;

  init$ = {
    isOpen: false,
    triggerTitle: 'Notifications',
    onToggle: () => {
      this.#setOpen(!this.$.isOpen);
    },
  };

  initCallback() {
    ensureMaterialSymbols(ICONS);
    this.addEventListener('click', this.#onClick);
    this.addEventListener('input', this.#onInput);
    if (typeof document !== 'undefined') {
      document.addEventListener('notification-config-change', this.#onExternalConfigChange);
    }
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('input', this.#onInput);
    this.#unbindPopoverEvents();
    this.#setOpen(false);
    this.#clearFlushTimer();
    this.#narrator?.cancel?.();
    this.#sound?.dispose?.();
    this.#sound = null;
    this.#narrator = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('notification-config-change', this.#onExternalConfigChange);
    }
    super.disconnectedCallback?.();
  }

  // The notification-editor (or another widget) changed our shared config: adopt
  // it and re-apply to the live runtime without re-announcing (no feedback loop).
  #onExternalConfigChange = (event) => {
    if (event.target === this || !this.#ready) return;
    let detail = event.detail;
    if (!detail || detail.storageKey !== this.storageKey) return;
    this.#config = normalizeNotificationConfig(detail.config ?? this.config);
    this.#render();
    this.#applyConfig('external', { emit: false });
  };

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.#ready) return;
    if (name === 'storage-key') this.#loadStoredConfig();
    this.#render();
    this.#applyConfig('attribute');
  }

  renderCallback() {
    if (this.#ready) return;
    this.#ready = true;
    this.#bindPopoverEvents();
    this.#loadStoredConfig();
    this.#render();
    this.#ensureRuntime();
    this.#applyConfig('init');
    if (this.$.isOpen) this.#openPopover();
  }

  get storageKey() {
    return this.getAttribute('storage-key') || DEFAULT_STORAGE_KEY;
  }

  get config() {
    return normalizeNotificationConfig(this.#config);
  }

  /** Replace the whole config (normalized + persisted + applied). */
  setConfig(value, options = {}) {
    this.#config = normalizeNotificationConfig(value);
    if (this.#ready) this.#render();
    this.#applyConfig(options.source || 'set-config');
  }

  /** Reset to defaults. */
  reset() {
    this.setConfig(NOTIFICATION_CONFIG_DEFAULTS, { source: 'reset' });
  }

  /** Active locale for narration + labels (attribute > config > navigator). */
  get locale() {
    let attr = this.getAttribute('locale');
    if (attr) return normalizeLocale(attr);
    if (this.#config.locale && this.#config.locale !== 'auto') return normalizeLocale(this.#config.locale);
    return resolveLocale(getNavigatorLocalePreferences(), { fallback: 'en' });
  }

  /**
   * Feed a raw notification event in. It is debounced/coalesced, then a flush is
   * scheduled; on flush it plays the per-event sound preset and narrates the
   * phrase (honoring stage muting + voice arbitration). Safe in Node: the
   * runtime only acts in a browser.
   */
  notify(rawEvent) {
    let item = normalizeNotificationItem(rawEvent, 0);
    let now = this.#now();
    this.#debouncer.push({ ...rawEvent, ...item, stage: rawEvent?.stage, params: rawEvent?.params }, now);
    this.#scheduleFlush();
    return item;
  }

  // -- config plumbing -------------------------------------------------------

  #loadStoredConfig() {
    let raw = getStorage()?.getItem(this.storageKey);
    this.#config = parseNotificationConfig(raw);
  }

  #persistConfig() {
    getStorage()?.setItem(this.storageKey, serializeNotificationConfig(this.#config));
  }

  #applyConfig(source, { emit = true } = {}) {
    // Skip the write-back when adopting an already-persisted external change.
    if (emit) this.#persistConfig();
    let sound = this.#ensureSound();
    if (sound) {
      sound.setMuted(!this.#config.enabled || !this.#config.soundEnabled);
      sound.setMasterGain(this.#config.soundVolume);
      sound.setToneShape(resolveToneShape(this.#config));
    }
    let narrator = this.#ensureNarrator();
    if (narrator) narrator.setEnabled(this.#config.enabled && this.#config.narrationEnabled);
    if (!emit) return;
    this.dispatchEvent(new CustomEvent('notification-config-change', {
      bubbles: true,
      composed: true,
      detail: { source, config: this.config, storageKey: this.storageKey },
    }));
  }

  // -- runtime (browser-only) ------------------------------------------------

  #ensureRuntime() {
    this.#ensureSound();
    this.#ensureNarrator();
  }

  #ensureSound() {
    if (this.#sound) return this.#sound;
    if (typeof window === 'undefined') return null;
    this.#sound = createSoundEngine({
      masterGain: this.#config.soundVolume,
      toneShape: resolveToneShape(this.#config),
      muted: !this.#config.enabled || !this.#config.soundEnabled,
    });
    this.#sound.installGestureUnlock(window);
    return this.#sound;
  }

  #ensureNarrator() {
    if (this.#narrator) return this.#narrator;
    if (typeof window === 'undefined') return null;
    this.#narrator = new NotificationNarrator({
      arbitration: getDefaultVoiceArbitrationChannel(),
      enabled: this.#config.enabled && this.#config.narrationEnabled,
      getLocale: () => this.locale,
      getDepth: () => this.#config.narrationDepth,
      getVariants: ({ type, locale, depth }) => resolvePhraseVariants(this.#config, { type, locale, depth }),
      getVoiceParams: () => ({ volume: this.#config.voiceVolume }),
    });
    return this.#narrator;
  }

  #scheduleFlush() {
    if (typeof window === 'undefined' || typeof setTimeout !== 'function') return;
    let due = this.#debouncer.nextDueAt();
    if (due === null) return;
    let delay = Math.max(0, due - this.#now());
    this.#clearFlushTimer();
    this.#flushTimer = setTimeout(() => {
      this.#flushTimer = 0;
      this.#drain();
      this.#scheduleFlush();
    }, delay);
  }

  #clearFlushTimer() {
    if (this.#flushTimer && typeof clearTimeout === 'function') clearTimeout(this.#flushTimer);
    this.#flushTimer = 0;
  }

  #drain() {
    let flushed = this.#debouncer.flush(this.#now());
    for (let event of flushed) this.#emit(event);
  }

  // Play the sound + narrate one coalesced event. The sound preset is keyed by
  // event type; narration yields to chat voice via the shared arbitration floor.
  #emit(event) {
    if (!this.#config.enabled) return;
    let type = NOTIFICATION_EVENT_TYPES.includes(event.type) ? event.type : 'generic';
    if (this.#config.soundEnabled) {
      this.#ensureSound()?.play(resolveEventPreset(this.#config, type));
    }
    let stage = event.stage || event.params?.stage;
    if (this.#config.narrationEnabled && (!stage || isStageNarrationEnabled(this.#config, stage))) {
      this.#ensureNarrator()?.narrate({
        type,
        params: event.params || { title: event.message, stage },
        locale: this.locale,
        depth: this.#config.narrationDepth,
      });
    }
    this.dispatchEvent(new CustomEvent('notification-emit', {
      bubbles: true,
      composed: true,
      detail: { event, config: this.config },
    }));
  }

  #now() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return Date.now();
  }

  // -- rendering -------------------------------------------------------------

  #t() {
    return createTranslator({ locale: this.locale });
  }

  #render() {
    let t = this.#t();
    let trigger = this.ref.triggerLabel;
    if (trigger) trigger.textContent = t('notification.widget.trigger');
    this.$.triggerTitle = t('notification.widget.trigger');
    if (this.ref.title) this.ref.title.textContent = t('notification.widget.trigger');
    if (this.ref.resetButton) {
      this.ref.resetButton.title = t('notification.widget.reset');
      this.ref.resetButton.setAttribute('aria-label', t('notification.widget.reset'));
    }
    if (this.ref.openFullButton) {
      let label = t('notification.widget.openFull');
      this.ref.openFullButton.title = label;
      this.ref.openFullButton.setAttribute('aria-label', label);
    }
    this.#renderCompact(t);
  }

  #renderCompact(t) {
    let host = this.ref.compact;
    if (!host) return;
    let c = this.#config;
    host.innerHTML = `
      <div class="nw-row">
        <label for="nw-enabled">${escapeHtml(t('notification.widget.master'))}</label>
        <input id="nw-enabled" type="checkbox" data-config="enabled" ${c.enabled ? 'checked' : ''}>
      </div>
      <div class="nw-row">
        <label for="nw-sound-volume">
          <span class="material-symbols-outlined" aria-hidden="true">graphic_eq</span>
          ${escapeHtml(t('notification.widget.soundVolume'))}
        </label>
        <input id="nw-sound-volume" type="range" min="0" max="100" step="1" value="${Math.round(c.soundVolume * 100)}" data-config="soundVolume">
      </div>
      <div class="nw-row">
        <label for="nw-voice-volume">
          <span class="material-symbols-outlined" aria-hidden="true">record_voice_over</span>
          ${escapeHtml(t('notification.widget.voiceVolume'))}
        </label>
        <input id="nw-voice-volume" type="range" min="0" max="100" step="1" value="${Math.round(c.voiceVolume * 100)}" data-config="voiceVolume">
      </div>
      <div class="nw-row">
        <label for="nw-narration">${escapeHtml(t('notification.widget.narration'))}</label>
        <input id="nw-narration" type="checkbox" data-config="narrationEnabled" ${c.narrationEnabled ? 'checked' : ''}>
      </div>
    `;
  }

  // -- interaction -----------------------------------------------------------

  #onInput = (event) => {
    let target = event.target;
    if (!target || !this.#elementTargetsWidget(target)) return;

    let configKey = target.dataset?.config;
    if (!configKey) return;
    let next = { ...this.#config };
    if (configKey === 'soundVolume' || configKey === 'voiceVolume') next[configKey] = Number(target.value) / 100;
    else next[configKey] = Boolean(target.checked);
    this.#config = normalizeNotificationConfig(next);
    this.#applyConfig('input');
  };

  #onClick = (event) => {
    let action = event.target.closest?.('[data-action]')?.dataset.action;
    if (!action || !this.#elementTargetsWidget(event.target)) return;
    if (action === 'reset') {
      this.reset();
      this.#render();
    } else if (action === 'open-full') {
      this.#openFull();
    }
  };

  // Hand the detailed settings off to the host, which opens the full
  // notification-editor panel — mirroring the cascade theme widget's open-full.
  #openFull() {
    this.#setOpen(false);
    this.dispatchEvent(new CustomEvent('notification-open-full', {
      bubbles: true,
      composed: true,
      detail: { config: this.config, storageKey: this.storageKey },
    }));
  }

  // -- overlay lifecycle (mirrors CascadeThemeWidget) ------------------------

  #bindPopoverEvents() {
    let popover = this.ref.popover;
    if (!popover || this.#popoverBound) return;
    popover.addEventListener('click', this.#onClick);
    popover.addEventListener('input', this.#onInput);
    popover.addEventListener('change', this.#onInput);
    this.#popoverBound = true;
  }

  #unbindPopoverEvents() {
    let popover = this.ref.popover;
    if (!popover || !this.#popoverBound) return;
    popover.removeEventListener('click', this.#onClick);
    popover.removeEventListener('input', this.#onInput);
    popover.removeEventListener('change', this.#onInput);
    this.#popoverBound = false;
  }

  #setOpen(open) {
    let nextOpen = Boolean(open);
    if (nextOpen === this.$.isOpen) {
      if (nextOpen) this.#openPopover();
      return;
    }
    this.$.isOpen = nextOpen;
    if (nextOpen) this.#openPopover();
    else this.#closePopover();
  }

  #openPopover() {
    let popover = this.ref.popover;
    if (!popover) return;
    this.#bindPopoverEvents();
    popover.hidden = false;
    mountOverlayToDocument(popover, this.#resolveTarget());
    bringOverlayToFront(popover);
    this.#positionPopover();
    this.#bindOverlayListeners();
    this.#bindDismissal();
    this.#ensureRuntime();
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
    let trigger = this.ref.trigger || this.querySelector('.nw-trigger');
    if (!popover || !trigger || typeof window === 'undefined') return;
    if (window.matchMedia?.('(max-width: 820px)')?.matches) {
      popover.style.removeProperty('top');
      popover.style.removeProperty('left');
      return;
    }
    let offset = Number.parseFloat(
      getComputedStyle(trigger).getPropertyValue('--sn-notification-widget-offset') || '8',
    );
    positionOverlay(trigger, popover, 'bottom-end', {
      offset: Number.isFinite(offset) ? offset : 8,
    });
    syncOverlayTheme(popover, this.#resolveTarget());
  }

  #eventTargetsWidget(event) {
    let path = event.composedPath?.() || [];
    let popover = this.ref.popover;
    return path.includes(this) || (popover && (path.includes(popover) || popover.contains(event.target)));
  }

  #elementTargetsWidget(element) {
    let popover = this.ref.popover;
    return this.contains(element) || Boolean(popover?.contains(element));
  }

  #resolveTarget() {
    if (typeof document === 'undefined') return this;
    return this.parentElement || document.documentElement;
  }
}

NotificationWidget.template = tpl;
NotificationWidget.rootStyles = css;
NotificationWidget.reg('notification-widget');

export default NotificationWidget;
