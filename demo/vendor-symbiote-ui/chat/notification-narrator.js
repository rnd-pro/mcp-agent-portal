/**
 * Notification narration primitive.
 *
 * Speaks localized, randomized notification phrases through the browser
 * `speechSynthesis` API while honoring the shared voice-arbitration channel so
 * narration yields to chat voice and never overlaps active microphone capture.
 *
 * Node-safe at import time: no top-level DOM/speechSynthesis access. Phrase
 * selection (`compose`) is pure; only `narrate` touches the browser.
 */

import { composeNarration } from './notification-phrases.js';
import {
  getDefaultVoiceArbitrationChannel,
  VOICE_ARBITRATION_ROLES,
} from './voice-arbitration.js';

function defaultSynthesis() {
  return typeof globalThis !== 'undefined' ? globalThis.speechSynthesis : undefined;
}

function defaultUtteranceFactory() {
  return typeof globalThis !== 'undefined' ? globalThis.SpeechSynthesisUtterance : undefined;
}

export class NotificationNarrator {
  constructor({
    arbitration = getDefaultVoiceArbitrationChannel(),
    getLocale = () => 'en',
    getDepth = () => 'terse',
    getLanguage = (locale) => locale,
    getVariants = null,
    getVoiceParams = () => ({}),
    enabled = true,
    random,
    synthesis,
    utteranceFactory,
    onStart = () => {},
    onEnd = () => {},
    onSkip = () => {},
  } = {}) {
    this.arbitration = arbitration;
    this.getLocale = getLocale;
    this.getDepth = getDepth;
    this.getLanguage = getLanguage;
    this.getVariants = getVariants;
    this.getVoiceParams = getVoiceParams;
    this.enabled = enabled;
    this.random = random;
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.onSkip = onSkip;

    this._synthesis = synthesis || null;
    this._utteranceFactory = utteranceFactory || null;
    this._utterance = null;
    this._floorToken = null;
    this.speaking = false;
  }

  static get hasSpeechSynthesis() {
    return Boolean(defaultSynthesis() && defaultUtteranceFactory());
  }

  get hasSpeechSynthesis() {
    return Boolean(this._resolveSynthesis() && this._resolveUtteranceFactory());
  }

  _resolveSynthesis() {
    return this._synthesis || defaultSynthesis();
  }

  _resolveUtteranceFactory() {
    return this._utteranceFactory || defaultUtteranceFactory();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.cancel();
  }

  /**
   * Pure phrase selection for an event. Does not speak.
   * @param {{ type: string, params?: object, locale?: string, depth?: string }} event
   */
  compose(event = {}) {
    let locale = event.locale ?? this.getLocale();
    let depth = event.depth ?? this.getDepth();
    // A host can supply the user's edited phrase bank; otherwise the built-in
    // bank is used. Explicit event.variants win over the provider.
    let variants = event.variants ?? this.getVariants?.({ type: event.type, locale, depth });
    return composeNarration({
      type: event.type,
      params: event.params || {},
      locale,
      depth,
      random: this.random,
      variants,
    });
  }

  /**
   * Narrate an event. Returns a result describing whether it was spoken and why.
   * @returns {{ spoken: boolean, reason?: string, narration: object }}
   */
  narrate(event = {}) {
    let narration = this.compose(event);

    if (!this.enabled) {
      this.onSkip({ reason: 'disabled', narration });
      return { spoken: false, reason: 'disabled', narration };
    }
    if (!narration.text) {
      this.onSkip({ reason: 'empty', narration });
      return { spoken: false, reason: 'empty', narration };
    }

    let token = this.arbitration?.request?.({
      role: VOICE_ARBITRATION_ROLES.notification,
      onPreempt: () => this._stopSpeaking({ release: false }),
    });
    // When no channel is wired, treat the floor as freely available.
    if (this.arbitration && !token) {
      this.onSkip({ reason: 'arbitration', narration });
      return { spoken: false, reason: 'arbitration', narration };
    }

    let synthesis = this._resolveSynthesis();
    let UtteranceCtor = this._resolveUtteranceFactory();
    if (!synthesis || !UtteranceCtor) {
      if (token) this.arbitration.release(token);
      this.onSkip({ reason: 'unsupported', narration });
      return { spoken: false, reason: 'unsupported', narration };
    }

    this._stopSpeaking({ release: false, silent: true });
    this._floorToken = token || null;

    let utterance = new UtteranceCtor(narration.text);
    utterance.lang = this.getLanguage(narration.locale) || narration.locale;
    let params = this.getVoiceParams(narration) || {};
    if (Number.isFinite(params.pitch)) utterance.pitch = params.pitch;
    if (Number.isFinite(params.rate)) utterance.rate = params.rate;
    if (Number.isFinite(params.volume)) utterance.volume = params.volume;
    if (params.voice) utterance.voice = params.voice;
    this._utterance = utterance;

    let finish = () => {
      if (this._utterance !== utterance) return;
      this._utterance = null;
      this.speaking = false;
      let releasedToken = this._floorToken;
      this._floorToken = null;
      if (releasedToken) this.arbitration?.release?.(releasedToken);
      this.onEnd({ narration });
    };

    utterance.onend = finish;
    utterance.onerror = finish;

    this.speaking = true;
    this.onStart({ narration });
    synthesis.speak(utterance);

    return { spoken: true, narration };
  }

  _stopSpeaking({ release = true, silent = false } = {}) {
    let wasSpeaking = this.speaking;
    let utterance = this._utterance;
    this._utterance = null;
    this.speaking = false;

    if (utterance) {
      utterance.onend = null;
      utterance.onerror = null;
    }
    let synthesis = this._resolveSynthesis();
    if (wasSpeaking && synthesis) {
      try {
        synthesis.cancel();
      } catch (_) {}
    }

    let token = this._floorToken;
    this._floorToken = null;
    if (release && token) this.arbitration?.release?.(token);

    if (wasSpeaking && !silent) this.onEnd({ narration: null, cancelled: true });
  }

  /** Stop any in-progress narration and release the arbitration floor. */
  cancel() {
    this._stopSpeaking({ release: true });
  }

  destroy() {
    this.cancel();
  }
}
