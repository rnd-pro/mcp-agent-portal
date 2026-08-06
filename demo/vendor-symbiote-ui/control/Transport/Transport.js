import Symbiote from '@symbiotejs/symbiote';
import template from './Transport.tpl.js';
import css from './Transport.css.js';

const TRANSPORT_ATTRIBUTES = [
  'playing',
  'current',
  'duration',
  'fps',
  'disabled',
  'show-scrub',
];

/**
 * Standalone media/timeline transport bar. Decoupled from any `<video>`
 * element: it owns no media and drives a host timeline or viewport purely
 * through events, so the host stays the single source of playback truth.
 */
export class Transport extends Symbiote {
  static observedAttributes = TRANSPORT_ATTRIBUTES;

  #onPlayToggle = () => {
    if (this.disabled) return;
    let next = !this.playing;
    this.playing = next;
    this._emit(next ? 'play' : 'pause', { playing: next });
  };

  #onStop = () => {
    if (this.disabled) return;
    this.playing = false;
    this._emit('stop', { playing: false });
  };

  #onStepBack = () => {
    if (this.disabled) return;
    this._emit('step', { dir: -1 });
  };

  #onStepForward = () => {
    if (this.disabled) return;
    this._emit('step', { dir: 1 });
  };

  #onSkipStart = () => {
    if (this.disabled) return;
    this._emit('skip', { to: 'start' });
  };

  #onSkipEnd = () => {
    if (this.disabled) return;
    this._emit('skip', { to: 'end' });
  };

  #onScrubInput = (event) => {
    if (this.disabled) {
      event.preventDefault();
      this._sync();
      return;
    }
    let value = Number(event.target.value);
    let frame = Math.round(value);
    this.current = frame;
    this._emit('seek', { value, frame });
  };

  connectedCallback() {
    super.connectedCallback?.();
    this.ref.skipStartBtn?.addEventListener('click', this.#onSkipStart);
    this.ref.stepBackBtn?.addEventListener('click', this.#onStepBack);
    this.ref.playBtn?.addEventListener('click', this.#onPlayToggle);
    this.ref.stopBtn?.addEventListener('click', this.#onStop);
    this.ref.stepForwardBtn?.addEventListener('click', this.#onStepForward);
    this.ref.skipEndBtn?.addEventListener('click', this.#onSkipEnd);
    this.ref.scrub?.addEventListener('input', this.#onScrubInput);
    this._sync();
  }

  disconnectedCallback() {
    this.ref.skipStartBtn?.removeEventListener('click', this.#onSkipStart);
    this.ref.stepBackBtn?.removeEventListener('click', this.#onStepBack);
    this.ref.playBtn?.removeEventListener('click', this.#onPlayToggle);
    this.ref.stopBtn?.removeEventListener('click', this.#onStop);
    this.ref.stepForwardBtn?.removeEventListener('click', this.#onStepForward);
    this.ref.skipEndBtn?.removeEventListener('click', this.#onSkipEnd);
    this.ref.scrub?.removeEventListener('input', this.#onScrubInput);
    super.disconnectedCallback?.();
  }

  /** @returns {boolean} Whether playback is currently running. */
  get playing() {
    return this.hasAttribute('playing');
  }

  set playing(val) {
    this.toggleAttribute('playing', Boolean(val));
  }

  /** @returns {number} Current playhead frame. */
  get current() {
    return Number(this.getAttribute('current')) || 0;
  }

  set current(val) {
    this.setAttribute('current', String(Number(val) || 0));
  }

  /** @returns {number} Total timeline length in frames. */
  get duration() {
    return Number(this.getAttribute('duration')) || 0;
  }

  set duration(val) {
    this.setAttribute('duration', String(Number(val) || 0));
  }

  /** @returns {number} Frames per second used to derive the time display. */
  get fps() {
    return Number(this.getAttribute('fps')) || 30;
  }

  set fps(val) {
    this.setAttribute('fps', String(Number(val) || 30));
  }

  /** @returns {boolean} Whether all controls are disabled. */
  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(val) {
    this.toggleAttribute('disabled', Boolean(val));
  }

  /** @returns {boolean} Whether the range scrubber is shown. */
  get showScrub() {
    return this.hasAttribute('show-scrub');
  }

  set showScrub(val) {
    this.toggleAttribute('show-scrub', Boolean(val));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this._sync();
  }

  _sync() {
    let buttons = [
      this.ref.skipStartBtn,
      this.ref.stepBackBtn,
      this.ref.playBtn,
      this.ref.stopBtn,
      this.ref.stepForwardBtn,
      this.ref.skipEndBtn,
    ];
    let disabled = this.disabled;

    for (let button of buttons) {
      if (!button) continue;
      button.disabled = disabled;
    }

    if (disabled) {
      this.setAttribute('aria-disabled', 'true');
    } else {
      this.removeAttribute('aria-disabled');
    }

    let playing = this.playing;
    this.ref.playIcon?.toggleAttribute('hidden', playing);
    this.ref.pauseIcon?.toggleAttribute('hidden', !playing);
    this.ref.playBtn?.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    this.ref.playBtn?.setAttribute('aria-pressed', playing ? 'true' : 'false');

    if (this.ref.time) {
      let current = this._formatTime(this.current / this.fps);
      let duration = this._formatTime(this.duration / this.fps);
      this.ref.time.textContent = `${current} / ${duration}`;
    }

    let scrub = this.ref.scrub;
    if (scrub) {
      let show = this.showScrub;
      scrub.toggleAttribute('hidden', !show);
      scrub.disabled = disabled;
      scrub.max = String(this.duration);
      scrub.value = String(this.current);
    }
  }

  _formatTime(seconds) {
    let safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    let mins = Math.floor(safe / 60);
    let secs = Math.floor(safe % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  _emit(action, extra = {}) {
    let detail = {
      control: 'transport',
      action,
      current: this.current,
      duration: this.duration,
      fps: this.fps,
      ...extra,
    };
    this.dispatchEvent(new CustomEvent('sn-control-change', {
      bubbles: true,
      composed: true,
      detail,
    }));
    this.dispatchEvent(new CustomEvent(`sn-transport-${action}`, {
      bubbles: true,
      composed: true,
      detail,
    }));
  }
}

Transport.template = template;
Transport.rootStyles = css;
Transport.reg('sn-transport');

export default Transport;
