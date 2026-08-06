/**
 * Multi-voice dialogue stage.
 *
 * Lets several personas speak in parallel through the browser speech engine so
 * "subagent" voices can talk over each other (podcast cross-talk). A single
 * `window.speechSynthesis` is one serial queue, but every same-origin iframe
 * owns an independent `contentWindow.speechSynthesis` queue, and those queues
 * play simultaneously. So each persona gets its own hidden iframe channel and
 * speaks through that channel's `speechSynthesis` / `SpeechSynthesisUtterance`.
 *
 * Node-safe at import time: no top-level DOM, window, or speechSynthesis access.
 * Every browser touch is lazy and guarded, so the module imports as a pure
 * side-effect-free layer; in a non-browser env the stage degrades to safe
 * no-ops and `isSupported()` returns false.
 */

import { detectBrowserLocale } from '../ui/locale.js';
import { sanitizeVoiceResponseText } from './voice-response-sanitizer.js';

const PITCH_RANGE = { min: 0, max: 2 };
const RATE_RANGE = { min: 0.1, max: 10 };
const VOLUME_RANGE = { min: 0, max: 1 };

/** Short locale -> BCP-47 lang used for utterance.lang and voice selection. */
const LOCALE_LANG = { en: 'en-US', ru: 'ru-RU', es: 'es-ES' };

/**
 * Resolve a short locale ('en'|'ru'|'es') or a full BCP-47 lang to a BCP-47
 * lang. Short locales map through LOCALE_LANG; anything already containing a
 * region (or otherwise non-mappable) is returned as-is.
 */
function toBcp47(locale) {
  if (typeof locale !== 'string' || !locale) return '';
  return LOCALE_LANG[locale.toLowerCase()] || locale;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

function hasDocument() {
  return typeof document !== 'undefined' && Boolean(document?.body);
}

function lowerOrEmpty(value) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

/**
 * Resolve a voice for a persona profile from a list of available voices.
 * Match order: `profile.voice` by voiceURI or name (case-insensitive), then the
 * first voice whose `lang` starts with the requested lang (the persona's own
 * `lang`, else `fallbackLang`), then the first voice.
 */
function resolveVoice(voices, profile, fallbackLang) {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  let wanted = lowerOrEmpty(profile?.voice);
  if (wanted) {
    let byVoice = voices.find(
      (v) => lowerOrEmpty(v?.voiceURI) === wanted || lowerOrEmpty(v?.name) === wanted,
    );
    if (byVoice) return byVoice;
  }

  let lang = lowerOrEmpty(profile?.lang) || lowerOrEmpty(fallbackLang);
  if (lang) {
    let byLang = voices.find((v) => lowerOrEmpty(v?.lang).startsWith(lang));
    if (byLang) return byLang;
  }

  return voices[0] || null;
}

/**
 * Create a multi-voice dialogue stage.
 *
 * @param {object} [options]
 * @param {Document} [options.document] - injectable document (defaults to the global one).
 * @param {string} [options.locale] - default locale personas inherit for TTS: a
 *   short locale ('en'|'ru'|'es') or a full BCP-47 lang. Defaults to the
 *   browser-detected locale. A persona's own `lang` always wins over this.
 * @returns {object} stage
 */
export function createDialogueStage(options = {}) {
  let doc = options.document || (typeof document !== 'undefined' ? document : null);
  // Default stage locale: explicit option, else browser-detected (lazy, Node-safe).
  let stageLang = toBcp47(options.locale != null ? options.locale : detectBrowserLocale());
  // Map<personaId, { profile, iframe, synthesis, UtteranceCtor, utterance, voiceListener }>
  let channels = new Map();
  let disposed = false;

  function supported() {
    return !disposed && Boolean(doc?.body && doc.createElement);
  }

  /** Lazily create (or fetch) the hidden iframe channel for a persona. */
  function ensureChannel(personaId) {
    let channel = channels.get(personaId);
    if (channel) return channel;
    if (!supported()) return null;

    let iframe = doc.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    iframe.srcdoc = '';
    iframe.style.cssText =
      'position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none;';

    channel = {
      profile: {},
      iframe,
      synthesis: null,
      UtteranceCtor: null,
      utterance: null,
      voiceListener: null,
    };
    channels.set(personaId, channel);

    doc.body.appendChild(iframe);
    return channel;
  }

  /** Resolve the channel's own speechSynthesis + utterance ctor lazily. */
  function bindBrowserSpeech(channel) {
    if (!channel?.iframe) return false;
    let frameWindow = channel.iframe.contentWindow;
    if (!frameWindow) return false;
    if (!channel.synthesis && frameWindow.speechSynthesis) {
      channel.synthesis = frameWindow.speechSynthesis;
    }
    if (!channel.UtteranceCtor && frameWindow.SpeechSynthesisUtterance) {
      channel.UtteranceCtor = frameWindow.SpeechSynthesisUtterance;
    }
    return Boolean(channel.synthesis && channel.UtteranceCtor);
  }

  /**
   * Resolve a voice for the channel. getVoices() may be empty initially (it
   * populates asynchronously), so we resolve at speak time and also register a
   * one-shot 'voiceschanged' listener that re-resolves once voices arrive.
   */
  function pickVoice(channel) {
    if (!channel?.synthesis) return null;
    let voices = [];
    try {
      voices = channel.synthesis.getVoices() || [];
    } catch (_) {
      voices = [];
    }

    if (voices.length === 0 && !channel.voiceListener) {
      let frameWindow = channel.iframe?.contentWindow;
      let listener = () => {
        channel.voiceListener = null;
        try {
          frameWindow?.speechSynthesis?.removeEventListener?.('voiceschanged', listener);
        } catch (_) {}
      };
      channel.voiceListener = listener;
      try {
        channel.synthesis.addEventListener?.('voiceschanged', listener);
      } catch (_) {
        channel.voiceListener = null;
      }
    }

    return resolveVoice(voices, channel.profile, stageLang);
  }

  function clearUtteranceHandlers(utterance) {
    if (!utterance) return;
    utterance.onstart = null;
    utterance.onend = null;
    utterance.onerror = null;
  }

  function cancelChannel(channel) {
    if (!channel) return;
    let utterance = channel.utterance;
    channel.utterance = null;
    clearUtteranceHandlers(utterance);
    if (channel.synthesis) {
      try {
        channel.synthesis.cancel();
      } catch (_) {}
    }
  }

  let stage = {
    /**
     * Set the default locale personas inherit for TTS. Accepts a short locale
     * ('en'|'ru'|'es') or a full BCP-47 lang; takes effect on the next speak.
     */
    setLocale(locale) {
      stageLang = toBcp47(locale);
      return stage;
    },

    /** Current stage locale as a BCP-47 lang (e.g. 'en-US'). */
    getLocale() {
      return stageLang;
    },

    /** Register or update a persona profile. */
    persona(id, profile = {}) {
      if (id == null) return stage;
      let channel = ensureChannel(id);
      if (channel) {
        channel.profile = { ...profile };
      } else {
        // No DOM: keep the profile so a later supported call can use it.
        channels.set(id, { profile: { ...profile }, iframe: null });
      }
      return stage;
    },

    /**
     * Speak `text` as `personaId`. Resolves when the utterance ends, rejects on
     * error. Applies the persona's voice, pitch, rate, and volume. In a
     * non-browser env this resolves immediately and never throws.
     *
     * The text is sanitized for TTS by default (markdown, code, symbols, and
     * decorative punctuation stripped via `sanitizeVoiceResponseText`); pass
     * `sanitize: false` to speak the raw text verbatim.
     */
    speak(personaId, text, { onStart, onEnd, onError, sanitize } = {}) {
      if (!supported()) return Promise.resolve();

      let channel = ensureChannel(personaId);
      if (!channel || !bindBrowserSpeech(channel)) return Promise.resolve();

      let spoken = sanitize === false ? String(text || '') : sanitizeVoiceResponseText(text);
      if (!spoken) spoken = String(text || '').trim();
      let body = spoken;

      return new Promise((resolve, reject) => {
        let utterance;
        try {
          utterance = new channel.UtteranceCtor(body);
        } catch (err) {
          if (typeof onError === 'function') onError(err);
          reject(err);
          return;
        }

        let profile = channel.profile || {};
        let voice = pickVoice(channel);
        if (voice) utterance.voice = voice;

        let pitch = clamp(profile.pitch, PITCH_RANGE.min, PITCH_RANGE.max);
        let rate = clamp(profile.rate, RATE_RANGE.min, RATE_RANGE.max);
        let volume = clamp(profile.volume, VOLUME_RANGE.min, VOLUME_RANGE.max);
        if (pitch !== undefined) utterance.pitch = pitch;
        if (rate !== undefined) utterance.rate = rate;
        if (volume !== undefined) utterance.volume = volume;
        let lang = profile.lang || stageLang || voice?.lang;
        if (lang) utterance.lang = lang;

        // Replace any in-flight utterance on this persona's own channel.
        let previous = channel.utterance;
        clearUtteranceHandlers(previous);
        channel.utterance = utterance;

        let settled = false;
        let finish = (err) => {
          if (settled) return;
          settled = true;
          if (channel.utterance === utterance) channel.utterance = null;
          clearUtteranceHandlers(utterance);
          if (err) {
            if (typeof onError === 'function') onError(err);
            reject(err);
          } else {
            if (typeof onEnd === 'function') onEnd();
            resolve();
          }
        };

        utterance.onstart = () => {
          if (typeof onStart === 'function') onStart();
        };
        utterance.onend = () => finish(null);
        utterance.onerror = (event) => {
          let reason = event?.error || 'speech-error';
          finish(reason instanceof Error ? reason : new Error(String(reason)));
        };

        try {
          channel.synthesis.speak(utterance);
        } catch (err) {
          finish(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },

    /** Cancel one persona's channel, or every channel when `personaId` is omitted. */
    cancel(personaId) {
      if (personaId === undefined) {
        for (let channel of channels.values()) cancelChannel(channel);
      } else {
        cancelChannel(channels.get(personaId));
      }
      return stage;
    },

    /** Resume each channel's speechSynthesis (some engines pause until a gesture). */
    unlock() {
      for (let channel of channels.values()) {
        if (bindBrowserSpeech(channel) && channel.synthesis) {
          try {
            channel.synthesis.resume();
          } catch (_) {}
        }
      }
      return stage;
    },

    /** Pause every channel's in-flight speech; no-op where unsupported. */
    pause() {
      for (let channel of channels.values()) {
        if (channel.synthesis) {
          try {
            channel.synthesis.pause();
          } catch (_) {}
        }
      }
      return stage;
    },

    /** Resume every channel's paused speech; no-op where unsupported. */
    resume() {
      for (let channel of channels.values()) {
        if (channel.synthesis) {
          try {
            channel.synthesis.resume();
          } catch (_) {}
        }
      }
      return stage;
    },

    /**
     * Install a one-shot gesture unlock. On the first pointerdown/keydown/
     * touchstart on `target`, call `unlock()`. Returns a detach function.
     */
    installGestureUnlock(target = typeof window !== 'undefined' ? window : null) {
      if (!target?.addEventListener) return () => {};
      let events = ['pointerdown', 'keydown', 'touchstart'];
      let detach = () => {
        for (let type of events) {
          try {
            target.removeEventListener(type, handler);
          } catch (_) {}
        }
      };
      let handler = () => {
        detach();
        stage.unlock();
      };
      for (let type of events) {
        try {
          target.addEventListener(type, handler, { once: true, passive: true });
        } catch (_) {}
      }
      return detach;
    },

    /** Whether a persona (or any persona) is currently speaking. */
    isSpeaking(personaId) {
      let check = (channel) => {
        if (!channel?.synthesis) return false;
        try {
          return Boolean(channel.synthesis.speaking);
        } catch (_) {
          return false;
        }
      };
      if (personaId === undefined) {
        for (let channel of channels.values()) {
          if (check(channel)) return true;
        }
        return false;
      }
      return check(channels.get(personaId));
    },

    /** Whether the host environment can drive the stage. */
    isSupported() {
      return supported();
    },

    /** Cancel every channel and remove all iframes. */
    dispose() {
      for (let channel of channels.values()) {
        cancelChannel(channel);
        if (channel.voiceListener) {
          try {
            channel.iframe?.contentWindow?.speechSynthesis?.removeEventListener?.(
              'voiceschanged',
              channel.voiceListener,
            );
          } catch (_) {}
          channel.voiceListener = null;
        }
        if (channel.iframe?.parentNode) {
          try {
            channel.iframe.parentNode.removeChild(channel.iframe);
          } catch (_) {}
        }
      }
      channels.clear();
      disposed = true;
      return stage;
    },
  };

  return stage;
}
