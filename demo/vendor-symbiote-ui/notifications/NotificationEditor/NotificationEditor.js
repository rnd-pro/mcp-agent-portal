import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import {
  NOTIFICATION_CONFIG_DEFAULTS,
  NOTIFICATION_BOARD_STAGES,
  NOTIFICATION_SOUND_WAVEFORMS,
  EVENT_LABEL_KEYS,
  listEventPresetOptions,
  normalizeNotificationConfig,
  parseNotificationConfig,
  resolveEventPreset,
  resolvePhraseVariants,
  resolveToneShape,
  serializeNotificationConfig,
  setPhraseVariants,
} from '../notification-config.js';
import {
  NARRATION_DEPTHS,
  NOTIFICATION_EVENT_TYPES,
} from '../../chat/notification-phrases.js';
import { createSoundEngine } from '../sound-engine.js';
import { NotificationNarrator } from '../../chat/notification-narrator.js';
import { getDefaultVoiceArbitrationChannel } from '../../chat/voice-arbitration.js';
import {
  createTranslator,
  normalizeLocale,
  resolveLocale,
  getNavigatorLocalePreferences,
} from '../../locale/index.js';
import css from './NotificationEditor.css.js';
import tpl from './NotificationEditor.tpl.js';

const DEFAULT_STORAGE_KEY = 'symbiote-ui:notification-widget';
const ICONS = ['notifications', 'restart_alt', 'play_arrow'];

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

/**
 * Full-surface editor for the detailed notification settings: per-event sound
 * presets, narration depth, per-board-stage narration toggles, and the editable
 * phrase bank. It is the host-opened counterpart to the compact
 * {@link NotificationWidget} popover — they share one persisted config (keyed by
 * `storage-key`) and stay in sync through the bubbling `notification-config-change`
 * event, exactly the way the cascade theme widget and its editor cooperate.
 */
export class NotificationEditor extends Symbiote {
  static observedAttributes = ['storage-key', 'locale'];

  #config = normalizeNotificationConfig(NOTIFICATION_CONFIG_DEFAULTS);
  #ready = false;
  #preview = null;

  initCallback() {
    ensureMaterialSymbols(ICONS);
  }

  // Listeners are (idempotently) bound on connect and released on disconnect, so
  // a layout that reparents the panel keeps them balanced. Crucially nothing here
  // re-renders: the rendered DOM persists across reparenting, so the panel's
  // measured size stays stable and the layout's responsive pass converges.
  connectedCallback() {
    super.connectedCallback?.();
    this.addEventListener('input', this.#onInput);
    this.addEventListener('change', this.#onInput);
    this.addEventListener('click', this.#onClick);
    if (typeof document !== 'undefined') {
      document.addEventListener('notification-config-change', this.#onExternalChange);
    }
  }

  disconnectedCallback() {
    this.removeEventListener('input', this.#onInput);
    this.removeEventListener('change', this.#onInput);
    this.removeEventListener('click', this.#onClick);
    if (typeof document !== 'undefined') {
      document.removeEventListener('notification-config-change', this.#onExternalChange);
    }
    this.#preview?.narrator?.cancel?.();
    this.#preview?.sound?.dispose?.();
    this.#preview = null;
    super.disconnectedCallback?.();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.#ready) return;
    if (name === 'storage-key') this.#loadStoredConfig();
    this.#render();
  }

  renderCallback() {
    if (this.#ready) return;
    this.#ready = true;
    this.#loadStoredConfig();
    this.#render();
  }

  get storageKey() {
    return this.getAttribute('storage-key') || DEFAULT_STORAGE_KEY;
  }

  get config() {
    return normalizeNotificationConfig(this.#config);
  }

  /** Active locale for labels + phrase bank (attribute > config > navigator). */
  get locale() {
    let attr = this.getAttribute('locale');
    if (attr) return normalizeLocale(attr);
    if (this.#config.locale && this.#config.locale !== 'auto') return normalizeLocale(this.#config.locale);
    return resolveLocale(getNavigatorLocalePreferences(), { fallback: 'en' });
  }

  /** Reset detailed settings to defaults (also persists + notifies). */
  reset() {
    this.#config = normalizeNotificationConfig(NOTIFICATION_CONFIG_DEFAULTS);
    this.#render();
    this.#apply('reset');
  }

  #loadStoredConfig() {
    let raw = getStorage()?.getItem(this.storageKey);
    this.#config = parseNotificationConfig(raw);
  }

  #persistConfig() {
    getStorage()?.setItem(this.storageKey, serializeNotificationConfig(this.#config));
  }

  /** Persist + announce a config change so the compact widget re-applies it. */
  #apply(source) {
    this.#persistConfig();
    this.dispatchEvent(new CustomEvent('notification-config-change', {
      bubbles: true,
      composed: true,
      detail: { source, config: this.config, storageKey: this.storageKey },
    }));
  }

  // A change from elsewhere (the compact widget, another editor) for our storage
  // key: adopt it and re-render. We never re-announce, so there is no loop.
  #onExternalChange = (event) => {
    if (event.target === this) return;
    let detail = event.detail;
    if (!detail || detail.storageKey !== this.storageKey) return;
    this.#config = normalizeNotificationConfig(detail.config ?? this.config);
    this.#render();
  };

  #t() {
    return createTranslator({ locale: this.locale });
  }

  #render() {
    if (!this.#ready) return;
    let t = this.#t();
    if (this.ref.title) this.ref.title.textContent = t('notification.detailed.title');
    if (this.ref.resetButton) {
      this.ref.resetButton.title = t('notification.widget.reset');
      this.ref.resetButton.setAttribute('aria-label', t('notification.widget.reset'));
    }
    this.#renderBody(t);
  }

  #renderBody(t) {
    let host = this.ref.body;
    if (!host) return;
    let c = this.#config;
    let presetOptions = listEventPresetOptions();

    let soundRows = NOTIFICATION_EVENT_TYPES.map((type) => {
      let selected = resolveEventPreset(c, type);
      let options = presetOptions
        .map((key) => `<option value="${escapeHtml(key)}" ${key === selected ? 'selected' : ''}>${escapeHtml(key)}</option>`)
        .join('');
      let previewLabel = t('notification.editor.preview');
      return `
        <div class="ne-row">
          <label>${escapeHtml(t(EVENT_LABEL_KEYS[type] || 'notification.event.generic'))}</label>
          <div class="ne-control-group">
            <button type="button" class="ne-play" data-preview="${escapeHtml(type)}" title="${escapeHtml(previewLabel)}" aria-label="${escapeHtml(previewLabel)}">
              <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>
            </button>
            <select class="ne-select" data-event-preset="${escapeHtml(type)}">${options}</select>
          </div>
        </div>`;
    }).join('');

    let waveformOptions = NOTIFICATION_SOUND_WAVEFORMS
      .map((wave) => `<option value="${escapeHtml(wave)}" ${wave === c.soundWaveform ? 'selected' : ''}>${escapeHtml(t(`notification.sound.wave.${wave}`))}</option>`)
      .join('');

    let stageRows = NOTIFICATION_BOARD_STAGES.map((stage) => `
      <div class="ne-row">
        <label for="ne-stage-${escapeHtml(stage)}">${escapeHtml(t(`notification.stage.${stage}`))}</label>
        <input id="ne-stage-${escapeHtml(stage)}" type="checkbox" data-stage="${escapeHtml(stage)}" ${c.stageNarration[stage] ? 'checked' : ''}>
      </div>`).join('');

    let depthButtons = NARRATION_DEPTHS.map((depth) => `
      <button type="button" data-depth="${escapeHtml(depth)}" aria-pressed="${String(depth === c.narrationDepth)}">
        ${escapeHtml(t(`notification.depth.${depth}`))}
      </button>`).join('');

    let phraseBlocks = NOTIFICATION_EVENT_TYPES.map((type) => {
      let variants = resolvePhraseVariants(c, { type, locale: this.locale, depth: c.narrationDepth });
      return `
        <div class="ne-phrase">
          <div class="ne-phrase-head">
            <span>${escapeHtml(t(EVENT_LABEL_KEYS[type] || 'notification.event.generic'))}</span>
            <button type="button" data-phrase-reset="${escapeHtml(type)}">${escapeHtml(t('notification.detailed.phraseReset'))}</button>
          </div>
          <textarea data-phrase="${escapeHtml(type)}" rows="2">${escapeHtml(variants.join('\n'))}</textarea>
        </div>`;
    }).join('');

    host.innerHTML = `
      <div class="ne-section">
        <div class="ne-section-title">${escapeHtml(t('notification.detailed.soundSection'))}</div>
        ${soundRows}
      </div>
      <div class="ne-section">
        <div class="ne-section-title">${escapeHtml(t('notification.sound.section'))}</div>
        <div class="ne-row">
          <label for="ne-waveform">${escapeHtml(t('notification.sound.waveform'))}</label>
          <select id="ne-waveform" class="ne-select" data-config-sound="waveform">${waveformOptions}</select>
        </div>
        <div class="ne-row">
          <label for="ne-pitch">${escapeHtml(t('notification.sound.pitch'))}</label>
          <input id="ne-pitch" type="range" min="-12" max="12" step="1" value="${c.soundPitch}" data-config-sound="pitch">
        </div>
        <div class="ne-row">
          <label for="ne-duration">${escapeHtml(t('notification.sound.duration'))}</label>
          <input id="ne-duration" type="range" min="0.5" max="2" step="0.1" value="${c.soundDuration}" data-config-sound="duration">
        </div>
        <div class="ne-hint">${escapeHtml(t('notification.sound.hint'))}</div>
      </div>
      <div class="ne-section">
        <div class="ne-section-title">${escapeHtml(t('notification.detailed.depth'))}</div>
        <div class="ne-depth" aria-label="${escapeHtml(t('notification.detailed.depth'))}">${depthButtons}</div>
      </div>
      <div class="ne-section">
        <div class="ne-section-title">${escapeHtml(t('notification.detailed.stageSection'))}</div>
        ${stageRows}
      </div>
      <div class="ne-section">
        <div class="ne-section-title">${escapeHtml(t('notification.detailed.phraseSection'))}</div>
        <div class="ne-hint">${escapeHtml(t('notification.detailed.phraseHint'))}</div>
        ${phraseBlocks}
      </div>
    `;
  }

  #onInput = (event) => {
    let target = event.target;
    if (!target) return;

    let soundKey = target.dataset?.configSound;
    if (soundKey) {
      let field = soundKey === 'waveform' ? 'soundWaveform' : soundKey === 'pitch' ? 'soundPitch' : 'soundDuration';
      let value = soundKey === 'waveform' ? target.value : Number(target.value);
      this.#config = normalizeNotificationConfig({ ...this.#config, [field]: value });
      this.#apply('sound-shape');
      return;
    }

    let eventPreset = target.dataset?.eventPreset;
    if (eventPreset) {
      this.#config = normalizeNotificationConfig({
        ...this.#config,
        eventPresets: { ...this.#config.eventPresets, [eventPreset]: target.value },
      });
      this.#apply('event-preset');
      return;
    }

    let stage = target.dataset?.stage;
    if (stage) {
      this.#config = normalizeNotificationConfig({
        ...this.#config,
        stageNarration: { ...this.#config.stageNarration, [stage]: Boolean(target.checked) },
      });
      this.#apply('stage');
      return;
    }

    let phraseType = target.dataset?.phrase;
    if (phraseType && event.type === 'change') {
      let variants = String(target.value).split('\n');
      this.#config = setPhraseVariants(this.#config, {
        type: phraseType,
        locale: this.locale,
        depth: this.#config.narrationDepth,
        variants,
      });
      this.#apply('phrase');
    }
  };

  #onClick = (event) => {
    let previewButton = event.target.closest?.('[data-preview]');
    if (previewButton && this.contains(previewButton)) {
      this.#previewEvent(previewButton.dataset.preview);
      return;
    }

    let depthButton = event.target.closest?.('[data-depth]');
    if (depthButton && this.contains(depthButton)) {
      let depth = depthButton.dataset.depth;
      if (NARRATION_DEPTHS.includes(depth)) {
        this.#config = normalizeNotificationConfig({ ...this.#config, narrationDepth: depth });
        this.#render();
        this.#apply('depth');
      }
      return;
    }

    let phraseReset = event.target.closest?.('[data-phrase-reset]');
    if (phraseReset && this.contains(phraseReset)) {
      this.#config = setPhraseVariants(this.#config, {
        type: phraseReset.dataset.phraseReset,
        locale: this.locale,
        depth: this.#config.narrationDepth,
        variants: [],
      });
      this.#render();
      this.#apply('phrase-reset');
      return;
    }

    let action = event.target.closest?.('[data-action]')?.dataset.action;
    if (action === 'reset') this.reset();
  };

  // -- preview ---------------------------------------------------------------

  // Lazily build a private sound engine + narrator so a play button can demo an
  // event exactly as it will fire on the board, honoring the current volumes,
  // depth, and edited phrase bank. The user's click unlocks Web Audio.
  #ensurePreview() {
    if (this.#preview || typeof window === 'undefined') return this.#preview;
    let sound = createSoundEngine({ masterGain: this.#config.soundVolume, toneShape: resolveToneShape(this.#config) });
    sound.installGestureUnlock(window);
    let narrator = new NotificationNarrator({
      arbitration: getDefaultVoiceArbitrationChannel(),
      getLocale: () => this.locale,
      getDepth: () => this.#config.narrationDepth,
      getVariants: ({ type, locale, depth }) => resolvePhraseVariants(this.#config, { type, locale, depth }),
      getVoiceParams: () => ({ volume: this.#config.voiceVolume }),
    });
    this.#preview = { sound, narrator };
    return this.#preview;
  }

  // Sample interpolation values so a previewed phrase reads naturally.
  #sampleParams() {
    let t = this.#t();
    return { title: t('notification.editor.sampleTitle'), stage: t('notification.stage.execute') };
  }

  #previewEvent(type) {
    let preview = this.#ensurePreview();
    if (!preview) return;
    preview.sound.setMasterGain(this.#config.soundVolume);
    preview.sound.setToneShape(resolveToneShape(this.#config));
    preview.sound.setMuted(false);
    preview.sound.unlock();
    preview.sound.play(resolveEventPreset(this.#config, type));
    preview.narrator.setEnabled(true);
    preview.narrator.narrate({
      type,
      params: this.#sampleParams(),
      locale: this.locale,
      depth: this.#config.narrationDepth,
    });
  }
}

NotificationEditor.template = tpl;
NotificationEditor.rootStyles = css;
NotificationEditor.reg('notification-editor');

export default NotificationEditor;
