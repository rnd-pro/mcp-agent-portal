/**
 * TimelineEditor - NLE-style timeline editor component.
 *
 * Provides a multi-track timeline with one shared geometry model for ruler,
 * clips, markers, and playhead. Transport and track headers stay in DOM for
 * accessibility and real icon controls, while the timeline body uses canvas for
 * stable media-editor geometry.
 *
 * @element sn-timeline-editor
 *
 * Events:
 * - playhead-change: { frame: number, time: number }
 * - clip-select: { clipId: string, trackId: string }
 * - clip-move: { clipId: string, start: number, end: number }
 * - transport-change: { action: 'play' | 'pause' | 'stop' }
 * - zoom-change: { pixelsPerFrame: number }
 */

import Symbiote from '@symbiotejs/symbiote';
import { timelineEditorTemplate } from './TimelineEditor.tpl.js';
import css from './TimelineEditor.css.js';

const TRACK_COLOR_VARS = {
  video: '--sn-dom-timeline-clip-video',
  audio: '--sn-dom-timeline-clip-audio',
  voice: '--sn-dom-timeline-clip-audio',
  text: '--sn-dom-timeline-clip-text',
  captions: '--sn-dom-timeline-clip-text',
  caption: '--sn-dom-timeline-clip-text',
  effect: '--sn-dom-timeline-clip-effect',
  actions: '--sn-dom-timeline-clip-effect',
  action: '--sn-dom-timeline-clip-effect',
  default: '--sn-dom-timeline-clip-default',
};

function emit(el, type, detail = {}) {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

function finiteNumber(value, fallback = 0) {
  let number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimecode(frame, fps) {
  let totalSeconds = frame / fps;
  let minutes = Math.floor(totalSeconds / 60);
  let seconds = Math.floor(totalSeconds % 60);
  let frames = Math.floor(frame % fps);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

function cssPixelValue(computed, property, fallback) {
  let raw = computed.getPropertyValue(property).trim();
  let value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function cssValue(computed, property, fallback = '') {
  return computed.getPropertyValue(property).trim() || fallback;
}

function normalizeClip(clip = {}, index = 0, duration = 1) {
  let start = finiteNumber(clip.start ?? clip.from, 0);
  let end = clip.end == null
    ? start + finiteNumber(clip.duration, duration - start)
    : finiteNumber(clip.end, start + 1);
  start = Math.max(0, Math.min(Math.round(start), duration));
  end = Math.max(start + 1, Math.min(Math.round(end), duration));
  return {
    ...clip,
    id: clip.id || `clip-${index + 1}`,
    start,
    end,
    label: clip.label || clip.title || clip.text || clip.id || `clip ${index + 1}`,
  };
}

function isSequenceClip(clip = {}) {
  return clip.kind === 'frame-sequence'
    || clip.kind === 'sequence'
    || clip.sequenceFormat
    || Number(clip.sampleCount || clip.frameCount || 0) > 1;
}

function normalizeMarkerFrame(marker, fps) {
  if (typeof marker === 'number') return Math.round(marker);
  if (Number.isFinite(Number(marker?.frame))) return Math.round(Number(marker.frame));
  if (Number.isFinite(Number(marker?.time))) return Math.round(Number(marker.time) * fps);
  return null;
}

function normalizeTimelineData(data = {}) {
  let fps = Math.max(1, Math.round(finiteNumber(data.fps, 30)));
  let duration = Math.max(1, Math.round(finiteNumber(data.duration, fps * 15)));
  let tracks = (Array.isArray(data.tracks) ? data.tracks : []).map((track, trackIndex) => {
    let id = track.id || `track-${trackIndex + 1}`;
    let type = track.type || 'default';
    let clips = (Array.isArray(track.clips) ? track.clips : [])
      .map((clip, clipIndex) => normalizeClip(clip, clipIndex, duration));
    return {
      ...track,
      id,
      type,
      label: track.label || id,
      clips,
    };
  });
  let markers = (Array.isArray(data.markers) ? data.markers : [])
    .map((marker) => {
      let frame = normalizeMarkerFrame(marker, fps);
      return frame == null ? null : { ...(typeof marker === 'object' ? marker : {}), frame };
    })
    .filter(Boolean);
  return {
    ...data,
    fps,
    duration,
    tracks,
    markers,
    focusFrame: Number.isFinite(Number(data.focusFrame)) ? Math.max(0, Math.min(Math.round(Number(data.focusFrame)), duration)) : null,
    selectedClipId: data.selectedClipId == null ? '' : String(data.selectedClipId),
  };
}

export class TimelineEditor extends Symbiote {

  /** @type {{ fps: number, duration: number, tracks: Array, markers?: Array } | null} */
  #data = null;

  /** @type {number} Current playhead frame */
  #playheadFrame = 0;

  /** @type {number} Pixels per frame */
  #pixelsPerFrame = 4;

  /** @type {number|null} Animation frame ID */
  #animationId = null;

  /** @type {number|null} Render frame ID */
  #renderId = null;

  /** @type {boolean} Is playing */
  #playing = false;

  /** @type {number} Playback start timestamp */
  #playStartTime = 0;

  /** @type {number} Playback start frame */
  #playStartFrame = 0;

  /** @type {string|null} Selected clip ID */
  #selectedClipId = null;

  /** @type {number|null} Timeline frame to scroll into view after layout */
  #pendingFocusFrame = null;

  /** @type {ResizeObserver|null} */
  #resizeObserver = null;

  /** @type {number} Timestamp until which automatic horizontal follow is paused */
  #manualScrollUntil = 0;

  /** @type {boolean} */
  #internalScroll = false;

  /** @type {{ trackH: number, rulerH: number, contentW: number, contentH: number, tracksH: number, dpr: number }} */
  #metrics = {
    trackH: 36,
    rulerH: 28,
    contentW: 0,
    contentH: 0,
    tracksH: 0,
    dpr: 1,
  };

  /** @type {Record<string, string>} */
  #theme = {};

  init$ = {
    timeDisplay: '00:00:00',
    playing: false,
    playIcon: 'play_arrow',
    hasData: false,
    zoomLabel: '4 px/fr',

    timelineClick: (e) => this.#handleTimelineClick(e),
    timelineScroll: () => this.#handleTimelineScroll(),
  };

  connectedCallback() {
    super.connectedCallback?.();

    this.addEventListener('click', this.#onTransportClick);

    this.#resizeObserver = new ResizeObserver(() => {
      if (this.#data) this.#scheduleRender(true);
    });
    this.#resizeObserver.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this.removeEventListener('click', this.#onTransportClick);
    this.#stopPlayback();
    if (this.#renderId) cancelAnimationFrame(this.#renderId);
    this.#renderId = null;
    this.#resizeObserver?.disconnect();
  }

  #onTransportClick = (e) => {
    let btn = e.target.closest('[data-action]');
    if (!btn) return;

    switch (btn.dataset.action) {
      case 'play':
        if (this.#playing) {
          this.#pausePlayback();
        } else {
          this.#startPlayback();
        }
        break;
      case 'stop':
        this.#stopPlayback();
        this.#setPlayhead(0);
        break;
      case 'skip-start':
        this.#stopPlayback();
        this.#setPlayhead(0);
        break;
      case 'skip-end':
        this.#stopPlayback();
        if (this.#data) this.#setPlayhead(this.#data.duration);
        break;
      case 'zoom-in':
        this.#setZoom(this.#pixelsPerFrame * 1.4);
        break;
      case 'zoom-out':
        this.#setZoom(this.#pixelsPerFrame / 1.4);
        break;
      case 'fit':
        this.#fitToView();
        break;
    }
  };

  /**
   * Load timeline data.
   * @param {{ fps: number, duration: number, tracks: Array<{ id: string, type?: string, label: string, clips: Array<{ id: string, start?: number, end?: number, from?: number, duration?: number, label?: string }> }>, markers?: Array<{ frame?: number, time?: number, label?: string }|number> }} data
   */
  loadTimeline(data) {
    this.#stopPlayback();
    this.#data = normalizeTimelineData(data);
    this.#playheadFrame = 0;
    this.#pendingFocusFrame = this.#data.focusFrame;
    let requestedSelectedClipId = this.#data.selectedClipId;
    let selectedClipStillExists = this.#data.tracks.some((track) => {
      return track.clips.some((clip) => clip.id === this.#selectedClipId);
    });
    this.#selectedClipId = requestedSelectedClipId || (selectedClipStillExists ? this.#selectedClipId : null);
    let hasTracks = this.#data.tracks.length > 0;
    this.set$({
      hasData: hasTracks,
      timeDisplay: formatTimecode(0, this.#data.fps),
      playing: false,
      playIcon: 'play_arrow',
    });
    this.#renderHeaders();
    this.#scheduleRender(true);
  }

  /** Get current playhead frame */
  get currentFrame() {
    return this.#playheadFrame;
  }

  /** Set current playhead frame */
  set currentFrame(frame) {
    this.#setPlayhead(frame);
  }

  /** Get current time in seconds */
  get currentTime() {
    if (!this.#data) return 0;
    return this.#playheadFrame / this.#data.fps;
  }

  /** Get timeline data */
  get timelineData() {
    return this.#data;
  }

  /** Set playhead to specific frame from an external source. */
  setFrame(frame, options = {}) {
    this.#setPlayhead(frame, options?.silent === true);
  }

  /** Update transport visuals when an external player owns the clock. */
  setPlaybackState(playing) {
    this.#setPlaybackUi(Boolean(playing));
  }

  /** Scroll the timeline viewport to a frame without changing the playhead. */
  focusFrame(frame) {
    if (!this.#data) return;
    this.#pendingFocusFrame = Math.max(0, Math.min(Math.round(Number(frame) || 0), this.#data.duration));
    this.#applyPendingFocusFrame();
  }

  #setPlayhead(frame, silent = false) {
    if (!this.#data) return;
    this.#playheadFrame = Math.max(0, Math.min(Math.round(frame), this.#data.duration));
    this.$.timeDisplay = formatTimecode(this.#playheadFrame, this.#data.fps);
    this.#positionPlayhead();
    this.#focusPlayhead();
    if (!silent) {
      emit(this, 'playhead-change', {
        frame: this.#playheadFrame,
        time: this.#playheadFrame / this.#data.fps,
      });
    }
  }

  #positionPlayhead() {
    let el = this.ref.playhead;
    if (!el) return;
    let x = this.#playheadFrame * this.#pixelsPerFrame;
    el.style.left = `${x}px`;
    el.style.height = `${this.#metrics.contentH || 1}px`;
  }

  #focusPlayhead() {
    let scroll = this.ref.timelineScroll;
    if (!scroll) return;
    if (Date.now() < this.#manualScrollUntil) return;

    let x = this.#playheadFrame * this.#pixelsPerFrame;
    let target = Math.max(0, x - scroll.clientWidth * 0.5);
    if (this.#playing) {
      this.#internalScroll = true;
      scroll.scrollLeft += (target - scroll.scrollLeft) * 0.12;
      requestAnimationFrame(() => { this.#internalScroll = false; });
    } else {
      let min = scroll.scrollLeft + Math.max(40, scroll.clientWidth * 0.12);
      let max = scroll.scrollLeft + scroll.clientWidth - Math.max(40, scroll.clientWidth * 0.12);
      if (x < min || x > max) {
        this.#internalScroll = true;
        scroll.scrollLeft = target;
        requestAnimationFrame(() => { this.#internalScroll = false; });
      }
    }
  }

  #applyPendingFocusFrame() {
    if (!this.#data || this.#pendingFocusFrame === null) return;
    let scroll = this.ref.timelineScroll;
    if (!scroll) return;
    let x = this.#pendingFocusFrame * this.#pixelsPerFrame;
    this.#internalScroll = true;
    scroll.scrollLeft = Math.max(0, x - scroll.clientWidth * 0.5);
    requestAnimationFrame(() => { this.#internalScroll = false; });
    this.#pendingFocusFrame = null;
  }

  #setZoom(ppf) {
    this.#pixelsPerFrame = Math.max(0.5, Math.min(20, ppf));
    let label = this.#pixelsPerFrame >= 1
      ? `${this.#pixelsPerFrame.toFixed(1)} px/fr`
      : `${(1 / this.#pixelsPerFrame).toFixed(1)} fr/px`;
    this.$.zoomLabel = label;
    this.#scheduleRender(true);
    emit(this, 'zoom-change', { pixelsPerFrame: this.#pixelsPerFrame });
  }

  #fitToView() {
    if (!this.#data) return;
    let scroll = this.ref.timelineScroll;
    if (!scroll) return;
    let width = Math.max(1, scroll.clientWidth - 20);
    this.#setZoom(width / this.#data.duration);
  }

  #setPlaybackUi(playing) {
    this.#playing = Boolean(playing);
    this.$.playing = this.#playing;
    if (this.#playing) {
      this.$.playIcon = 'pause';
      this.toggleAttribute('playing', true);
    } else {
      this.$.playIcon = 'play_arrow';
      this.toggleAttribute('playing', false);
    }
    if (!this.#playing && this.#animationId) {
      cancelAnimationFrame(this.#animationId);
      this.#animationId = null;
    }
  }

  #startPlayback() {
    if (!this.#data || this.#playing) return;
    this.#setPlaybackUi(true);
    this.#playStartTime = performance.now();
    this.#playStartFrame = this.#playheadFrame >= this.#data.duration ? 0 : this.#playheadFrame;
    if (this.#playheadFrame >= this.#data.duration) this.#playheadFrame = 0;

    emit(this, 'transport-change', { action: 'play' });
    this.#animationLoop();
  }

  #pausePlayback() {
    this.#setPlaybackUi(false);
    emit(this, 'transport-change', { action: 'pause' });
  }

  #stopPlayback() {
    this.#setPlaybackUi(false);
    emit(this, 'transport-change', { action: 'stop' });
  }

  #animationLoop = () => {
    if (!this.#playing || !this.#data) return;

    let elapsed = (performance.now() - this.#playStartTime) / 1000;
    let frame = this.#playStartFrame + Math.floor(elapsed * this.#data.fps);

    if (frame >= this.#data.duration) {
      frame = this.#data.duration;
      this.#setPlayhead(frame);
      this.#stopPlayback();
      return;
    }

    this.#setPlayhead(frame);
    this.#animationId = requestAnimationFrame(this.#animationLoop);
  };

  #renderHeaders() {
    if (!this.#data || !this.ref.headersList) return;
    let markup = this.#data.tracks.map((track) => {
      let type = escapeHtml(track.type || 'default');
      return `<div class="te-header-track">
        <span class="te-header-icon" data-track-type="${type}" aria-hidden="true"></span>
        <span class="te-header-label">${escapeHtml(track.label || track.id)}</span>
        <button class="te-header-mute" title="Mute" aria-label="Mute ${escapeHtml(track.label || track.id)}"><span class="material-symbols-outlined" aria-hidden="true">volume_off</span></button>
      </div>`;
    }).join('');
    this.ref.headersList.innerHTML = markup;
  }

  #handleTimelineScroll() {
    let scroll = this.ref.timelineScroll;
    if (!scroll) return;
    if (!this.#internalScroll) this.#manualScrollUntil = Date.now() + 2000;
    this.#syncHeaderScroll();
  }

  #syncHeaderScroll() {
    let scroll = this.ref.timelineScroll;
    if (!scroll || !this.ref.headersList) return;
    this.ref.headersList.style.transform = `translateY(${-scroll.scrollTop}px)`;
  }

  #handleTimelineClick(e) {
    if (!this.#data || !this.ref.timelineScroll) return;
    let scroll = this.ref.timelineScroll;
    let rect = scroll.getBoundingClientRect();
    let x = Math.max(0, e.clientX - rect.left + scroll.scrollLeft);
    let viewportY = e.clientY - rect.top;
    let contentY = viewportY + scroll.scrollTop;
    let frame = Math.max(0, Math.min(Math.round(x / this.#pixelsPerFrame), this.#data.duration));

    if (viewportY <= this.#metrics.rulerH || e.target === this.ref.rulerCanvas) {
      this.#selectedClipId = null;
      this.#setPlayhead(frame);
      this.#renderTracks();
      return;
    }

    let trackIndex = Math.floor((contentY - this.#metrics.rulerH) / this.#metrics.trackH);
    let track = this.#data.tracks[trackIndex];
    if (track) {
      let clip = track.clips?.find(c => frame >= c.start && frame <= c.end);
      if (clip) {
        this.#selectedClipId = clip.id;
        this.#setPlayhead(frame);
        this.#renderTracks();
        emit(this, 'clip-select', { clipId: clip.id, trackId: track.id, clip });
        return;
      }
    }

    this.#selectedClipId = null;
    this.#setPlayhead(frame);
    this.#renderTracks();
  }

  #scheduleRender(updateTheme = false) {
    if (this.#renderId) cancelAnimationFrame(this.#renderId);
    this.#renderId = requestAnimationFrame(() => {
      this.#renderId = null;
      this.#renderAll(updateTheme);
    });
  }

  #readTheme() {
    let computed = getComputedStyle(this);
    this.#metrics.trackH = cssPixelValue(computed, '--te-track-height', 36);
    this.#metrics.rulerH = cssPixelValue(computed, '--te-ruler-height', 28);
    this.#theme = {
      border: cssValue(computed, '--te-border'),
      marker: cssValue(computed, '--te-marker-color'),
      playhead: cssValue(computed, '--te-playhead-color'),
      trackBg: cssValue(computed, '--te-track-bg'),
      trackBgAlt: cssValue(computed, '--te-track-bg-alt'),
      surfacePanel: cssValue(computed, '--sn-sys-surface-panel'),
      onSurface: cssValue(computed, '--sn-sys-on-surface'),
      onSurfaceDim: cssValue(computed, '--sn-sys-on-surface-dim'),
      onAccent: cssValue(computed, '--sn-sys-on-accent', cssValue(computed, '--sn-sys-on-surface')),
      hoverMix: cssValue(computed, '--sn-sys-state-hover-mix', '10%'),
      selectedMix: cssValue(computed, '--sn-sys-state-selected-mix', '34%'),
      font: cssValue(computed, '--sn-font', 'Inter, system-ui, sans-serif'),
      mono: cssValue(computed, '--sn-font-mono', 'ui-monospace, SFMono-Regular, Menlo, monospace'),
    };
    for (let [name, property] of Object.entries(TRACK_COLOR_VARS)) {
      this.#theme[`clip:${name}`] = cssValue(computed, property, this.#theme.onSurfaceDim);
    }
  }

  #clipColor(type) {
    return this.#theme[`clip:${type}`] || this.#theme['clip:default'] || this.#theme.onSurfaceDim;
  }

  #renderAll(updateTheme = false) {
    if (!this.#data) return;
    if (updateTheme || !this.#theme.onSurface) this.#readTheme();
    this.#layoutTimeline();
    this.#renderRuler();
    this.#renderTracks();
    this.#positionPlayhead();
    this.#syncHeaderScroll();
    this.#applyPendingFocusFrame();
  }

  #layoutTimeline() {
    let scroll = this.ref.timelineScroll;
    let content = this.ref.timelineContent;
    let ruler = this.ref.rulerCanvas;
    let tracks = this.ref.tracksCanvas;
    if (!scroll || !content || !ruler || !tracks || !this.#data) return;

    let dpr = window.devicePixelRatio || 1;
    let tracksH = this.#data.tracks.length * this.#metrics.trackH;
    let naturalW = this.#data.duration * this.#pixelsPerFrame + 20;
    let contentW = Math.max(scroll.clientWidth || 1, naturalW);
    let contentH = Math.max(scroll.clientHeight || 1, this.#metrics.rulerH + tracksH);

    this.#metrics = {
      ...this.#metrics,
      contentW,
      contentH,
      tracksH,
      dpr,
    };

    content.style.width = `${contentW}px`;
    content.style.height = `${contentH}px`;
    ruler.style.width = `${contentW}px`;
    ruler.style.height = `${this.#metrics.rulerH}px`;
    tracks.style.width = `${contentW}px`;
    tracks.style.height = `${tracksH}px`;
    tracks.style.top = `${this.#metrics.rulerH}px`;
    if (this.ref.headersList) this.ref.headersList.style.height = `${tracksH}px`;

    this.#resizeCanvas(ruler, contentW, this.#metrics.rulerH, dpr);
    this.#resizeCanvas(tracks, contentW, tracksH, dpr);
  }

  #resizeCanvas(canvas, width, height, dpr) {
    let nextW = Math.max(1, Math.round(width * dpr));
    let nextH = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== nextW) canvas.width = nextW;
    if (canvas.height !== nextH) canvas.height = nextH;
  }

  #renderRuler() {
    let canvas = this.ref.rulerCanvas;
    if (!canvas || !this.#data) return;
    let ctx = canvas.getContext('2d');
    let { contentW, rulerH, dpr } = this.#metrics;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, contentW, rulerH);
    ctx.fillStyle = this.#theme.surfacePanel;
    ctx.fillRect(0, 0, contentW, rulerH);

    let fps = this.#data.fps;
    let ppf = this.#pixelsPerFrame;
    let duration = this.#data.duration;
    let secondWidth = ppf * fps;
    let tickInterval;
    if (secondWidth > 200) tickInterval = fps / 4;
    else if (secondWidth > 60) tickInterval = fps;
    else if (secondWidth > 15) tickInterval = fps * 5;
    else tickInterval = fps * 10;
    let majorInterval = tickInterval * 4;

    ctx.strokeStyle = this.#theme.border;
    ctx.fillStyle = this.#theme.onSurfaceDim;
    ctx.font = `9px ${this.#theme.mono || this.#theme.font}`;
    ctx.textBaseline = 'top';

    for (let f = 0; f <= duration; f += tickInterval) {
      let x = Math.round(f * ppf) + 0.5;
      if (x > contentW) break;
      let isMajor = f % majorInterval < tickInterval;
      ctx.beginPath();
      ctx.moveTo(x, isMajor ? 8 : 18);
      ctx.lineTo(x, rulerH);
      ctx.stroke();
      if (isMajor) ctx.fillText(formatTimecode(f, fps), x + 2, 2);
    }

    if (this.#data.markers) {
      ctx.strokeStyle = this.#theme.marker;
      for (let marker of this.#data.markers) {
        let x = Math.round(marker.frame * ppf) + 0.5;
        if (x > contentW) continue;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, rulerH);
        ctx.stroke();
      }
    }
  }

  #renderTracks() {
    let canvas = this.ref.tracksCanvas;
    if (!canvas || !this.#data) return;
    let ctx = canvas.getContext('2d');
    let { contentW, tracksH, trackH, dpr } = this.#metrics;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, contentW, tracksH);

    let labelColor = `color-mix(in oklch, ${this.#theme.onAccent} 85%, transparent)`;
    let handleColor = `color-mix(in oklch, ${this.#theme.onAccent} 50%, transparent)`;
    let selectedOutline = this.#theme.onAccent;

    this.#data.tracks.forEach((track, i) => {
      let y = i * trackH;
      ctx.fillStyle = i % 2 === 0 ? this.#theme.trackBg : this.#theme.trackBgAlt;
      ctx.fillRect(0, y, contentW, trackH);

      ctx.strokeStyle = this.#theme.border;
      ctx.beginPath();
      ctx.moveTo(0, y + trackH + 0.5);
      ctx.lineTo(contentW, y + trackH + 0.5);
      ctx.stroke();

      let clipColor = this.#clipColor(track.type || 'default');
      for (let clip of track.clips || []) {
        let cx = clip.start * this.#pixelsPerFrame;
        let cw = Math.max(1, (clip.end - clip.start) * this.#pixelsPerFrame);
        let cy = y + 3;
        let ch = Math.max(1, trackH - 6);
        let isSelected = this.#selectedClipId === clip.id;

        ctx.fillStyle = clipColor;
        ctx.globalAlpha = isSelected ? 1 : 0.78;
        this.#roundRect(ctx, cx, cy, cw, ch, 3);
        ctx.fill();

        if (isSequenceClip(clip) && cw > 8) {
          let sampleCount = Math.max(2, Math.round(Number(clip.sampleCount || clip.samples?.length || clip.frameCount || 0) || 0));
          let visibleTicks = Math.min(sampleCount, Math.max(2, Math.floor(cw / 7)));
          ctx.save();
          ctx.beginPath();
          this.#roundRect(ctx, cx, cy, cw, ch, 3);
          ctx.clip();
          ctx.globalAlpha = isSelected ? 0.34 : 0.24;
          ctx.strokeStyle = this.#theme.onAccent;
          for (let tick = 1; tick < visibleTicks; tick += 1) {
            let x = cx + (cw * tick) / visibleTicks;
            ctx.beginPath();
            ctx.moveTo(Math.round(x) + 0.5, cy + 2);
            ctx.lineTo(Math.round(x) + 0.5, cy + ch - 2);
            ctx.stroke();
          }
          if (cw > 90) {
            let thumbCount = Math.min(visibleTicks, Math.max(2, Math.floor(cw / 34)));
            ctx.fillStyle = this.#theme.onAccent;
            ctx.globalAlpha = isSelected ? 0.22 : 0.16;
            for (let thumb = 0; thumb < thumbCount; thumb += 1) {
              let x = cx + 5 + (cw - 18) * (thumb / Math.max(1, thumbCount - 1));
              ctx.fillRect(Math.round(x), cy + 4, 10, Math.max(4, ch - 8));
            }
          }
          ctx.restore();
        }

        if (isSelected) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = selectedOutline;
          ctx.lineWidth = 1.5;
          this.#roundRect(ctx, cx, cy, cw, ch, 3);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
        ctx.globalAlpha = 1;

        if (cw > 30 && clip.label) {
          ctx.fillStyle = labelColor;
          ctx.font = `10px ${this.#theme.font}`;
          ctx.textBaseline = 'middle';
          let text = String(clip.label);
          let maxW = cw - 8;
          while (text.length > 1 && ctx.measureText(text + '...').width > maxW) {
            text = text.slice(0, -1);
          }
          if (text !== String(clip.label)) text += '...';
          ctx.fillText(text, cx + 4, cy + ch / 2);
        }

        if (isSelected) {
          ctx.fillStyle = handleColor;
          ctx.fillRect(cx, cy + 4, 2, Math.max(1, ch - 8));
          ctx.fillRect(cx + cw - 2, cy + 4, 2, Math.max(1, ch - 8));
        }
      }
    });

    if (this.#data.markers) {
      ctx.strokeStyle = `color-mix(in oklch, ${this.#theme.marker} 44%, transparent)`;
      ctx.setLineDash([4, 4]);
      for (let marker of this.#data.markers) {
        let x = Math.round(marker.frame * this.#pixelsPerFrame) + 0.5;
        if (x > contentW) continue;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, tracksH);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }

  #roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}

TimelineEditor.template = timelineEditorTemplate;
TimelineEditor.rootStyles = css;
TimelineEditor.reg('sn-timeline-editor');

export default TimelineEditor;
