import Symbiote from '@symbiotejs/symbiote';
import template from './VideoPlayer.tpl.js';
import css from './VideoPlayer.css.js';
import { createVideoFrameClock } from '../../ui/video-frame-clock.js';

class VideoPlayer extends Symbiote {
  static observedAttributes = ['src', 'autoplay', 'loop', 'muted'];

  #frameClock = null;

  #onPlayToggle = () => {
    const video = this.ref.video;
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  #onMuteToggle = () => {
    const video = this.ref.video;
    if (!video) return;

    video.muted = !video.muted;
    this.#updateVolumeVisuals();
  };

  #onVolumeInput = (event) => {
    const video = this.ref.video;
    if (!video) return;

    video.volume = Number(event.target.value);
    video.muted = video.volume === 0;
    this.#updateVolumeVisuals();
  };

  #onScrubInput = (event) => {
    const video = this.ref.video;
    if (!video || !video.duration) return;

    const percent = Number(event.target.value);
    video.currentTime = (percent / 100) * video.duration;
  };

  #onFullscreenToggle = () => {
    const container = this.shadowRoot ? this.shadowRoot.querySelector('.sn-video-container') : this.ref.video?.parentNode;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  #onVideoFrame = (detail) => {
    const video = this.ref.video;
    if (!video || !video.duration) return;

    const percent = (detail.mediaTime / video.duration) * 100;
    if (this.ref.scrubBar) {
      this.ref.scrubBar.value = String(percent);
    }
    this.#updateTimeDisplay(detail.mediaTime);
  };

  #onLoadedMetadata = () => {
    this.#updateTimeDisplay();
  };

  #onPlayStateChange = () => {
    const video = this.ref.video;
    if (this.ref.playIcon) {
      this.ref.playIcon.textContent = video?.paused ? 'play_arrow' : 'pause';
    }
  };

  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback?.();
    const video = this.ref.video;

    video?.addEventListener('click', this.#onPlayToggle);
    video?.addEventListener('loadedmetadata', this.#onLoadedMetadata);
    video?.addEventListener('play', this.#onPlayStateChange);
    video?.addEventListener('pause', this.#onPlayStateChange);

    this.ref.playBtn?.addEventListener('click', this.#onPlayToggle);
    this.ref.muteBtn?.addEventListener('click', this.#onMuteToggle);
    this.ref.volumeSlider?.addEventListener('input', this.#onVolumeInput);
    this.ref.scrubBar?.addEventListener('input', this.#onScrubInput);
    this.ref.fullscreenBtn?.addEventListener('click', this.#onFullscreenToggle);

    this.#frameClock = createVideoFrameClock(video, { onFrame: this.#onVideoFrame });
    this.#frameClock.start();

    this.#syncAttributes();
  }

  disconnectedCallback() {
    const video = this.ref.video;

    this.#frameClock?.dispose();
    this.#frameClock = null;

    video?.removeEventListener('click', this.#onPlayToggle);
    video?.removeEventListener('loadedmetadata', this.#onLoadedMetadata);
    video?.removeEventListener('play', this.#onPlayStateChange);
    video?.removeEventListener('pause', this.#onPlayStateChange);

    this.ref.playBtn?.removeEventListener('click', this.#onPlayToggle);
    this.ref.muteBtn?.removeEventListener('click', this.#onMuteToggle);
    this.ref.volumeSlider?.removeEventListener('input', this.#onVolumeInput);
    this.ref.scrubBar?.removeEventListener('input', this.#onScrubInput);
    this.ref.fullscreenBtn?.removeEventListener('click', this.#onFullscreenToggle);

    super.disconnectedCallback?.();
  }

  get src() {
    return this.getAttribute('src') || '';
  }

  set src(val) {
    this.setAttribute('src', String(val));
  }

  get autoplay() {
    return this.hasAttribute('autoplay');
  }

  set autoplay(val) {
    this.toggleAttribute('autoplay', Boolean(val));
  }

  get loop() {
    return this.hasAttribute('loop');
  }

  set loop(val) {
    this.toggleAttribute('loop', Boolean(val));
  }

  get muted() {
    return this.hasAttribute('muted');
  }

  set muted(val) {
    this.toggleAttribute('muted', Boolean(val));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this.#syncAttributes();
  }

  #syncAttributes() {
    const video = this.ref.video;
    if (!video) return;

    video.src = this.src;
    video.autoplay = this.autoplay;
    video.loop = this.loop;
    video.muted = this.muted;

    this.#updateVolumeVisuals();
  }

  #updateVolumeVisuals() {
    const video = this.ref.video;
    if (!video) return;

    if (this.ref.volumeSlider) {
      this.ref.volumeSlider.value = String(video.muted ? 0 : video.volume);
    }
    if (this.ref.volumeIcon) {
      if (video.muted || video.volume === 0) {
        this.ref.volumeIcon.textContent = 'volume_off';
      } else if (video.volume < 0.5) {
        this.ref.volumeIcon.textContent = 'volume_down';
      } else {
        this.ref.volumeIcon.textContent = 'volume_up';
      }
    }
  }

  #updateTimeDisplay(currentTime = this.ref.video?.currentTime) {
    const video = this.ref.video;
    const display = this.ref.timeDisplay;
    if (!video || !display) return;

    const current = this.#formatTime(Number.isFinite(currentTime) ? currentTime : video.currentTime);
    const duration = this.#formatTime(video.duration || 0);
    display.textContent = `${current} / ${duration}`;
  }

  #formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }
}

VideoPlayer.template = template;
VideoPlayer.rootStyles = css;
VideoPlayer.reg('sn-video-player');

export default VideoPlayer;
