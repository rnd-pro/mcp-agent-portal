import {
  alignAuthoredCaptionWords,
  assertCaptionPlacementTrack,
  buildCaptionPlacementTrack,
  captionCuesFromTimedWords,
} from 'symbiote-engine/render-captions';

const STYLE_ID = 'symbiote-live-captions-style';

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  let style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.sn-live-captions-visual{
  position:absolute;
  z-index:2147483645;
  box-sizing:border-box;
  display:none;
  overflow:hidden;
  pointer-events:none;
  text-align:center;
  letter-spacing:0;
}
.sn-live-captions-line{display:block;white-space:nowrap;}
.sn-live-captions-word-active{color:var(--sn-live-caption-highlight);}
.sn-live-captions-word-past{color:var(--sn-live-caption-primary);}
.sn-live-captions-word-future{color:var(--sn-live-caption-primary);opacity:.82;}
.sn-live-captions-sr-only{
  position:absolute;
  width:1px;
  height:1px;
  padding:0;
  margin:-1px;
  overflow:hidden;
  clip:rect(0,0,0,0);
  white-space:nowrap;
  border:0;
}
`;
  (doc.head || doc.documentElement).appendChild(style);
}

function finiteTime(value, fallback = null) {
  let number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function wordTiming(word = {}) {
  let startSec = finiteTime(word.startSec ?? word.start, null);
  let endSec = finiteTime(word.endSec ?? word.end, null);
  if (startSec === null && word.startMs !== undefined) startSec = finiteTime(Number(word.startMs) / 1000, null);
  if (endSec === null && word.endMs !== undefined) endSec = finiteTime(Number(word.endMs) / 1000, null);
  return {
    text: String(word.text ?? word.word ?? '').trim(),
    startSec,
    endSec,
  };
}

function explicitCueId(turn, index) {
  if (typeof turn?.cueId !== 'string' || !turn.cueId.trim()) {
    throw new TypeError(`live caption turn ${index} requires a non-empty cueId`);
  }
  return turn.cueId;
}

function authoredCue(turn = {}, index = 0) {
  let cueId = explicitCueId(turn, index);
  let startSec = finiteTime(turn.startSec ?? turn.start, null);
  let endSec = finiteTime(turn.endSec ?? turn.end, null);
  if (startSec === null && turn.startMs !== undefined) startSec = finiteTime(Number(turn.startMs) / 1000, null);
  if (endSec === null && turn.endMs !== undefined) endSec = finiteTime(Number(turn.endMs) / 1000, null);
  if (startSec === null || endSec === null) {
    throw new TypeError(`live caption turn ${index} requires explicit start and end timing`);
  }
  let timings = Array.isArray(turn.wordTimings)
    ? turn.wordTimings.map(wordTiming)
    : [];
  return {
    cueId,
    index,
    speaker: turn.speaker || turn.persona || '',
    text: turn.text || '',
    startSec,
    endSec,
    wordTimings: timings,
  };
}

function authoredCaptionChunks(cue) {
  if (!cue.wordTimings.length) return [cue];
  let alignment = alignAuthoredCaptionWords(cue.text, cue.wordTimings);
  if (!alignment.words.length) return [cue];
  let chunks = captionCuesFromTimedWords(alignment.words.map((word) => ({
    ...word,
    speaker: cue.speaker,
    cueIndex: cue.index,
    cueId: cue.cueId,
    timingSource: 'live-authored-timing',
  })));
  return chunks.map((chunk, chunkIndex) => ({
    cueId: chunkIndex ? `${cue.cueId}:${chunkIndex + 1}` : cue.cueId,
    index: cue.index,
    speaker: cue.speaker,
    text: chunk.words.join(' '),
    startSec: chunk.startSec,
    endSec: chunk.endSec,
    wordTimings: chunk.wordTimings,
  }));
}

export function createLiveCaptionTrack(turns = [], options = {}) {
  if (!Array.isArray(turns)) throw new TypeError('live caption turns must be an array');
  let style = options.captionStyle || options.style || options.profile || { preset: 'live' };
  if (typeof style === 'string') style = { preset: style };
  let cues = turns.flatMap((turn, index) => authoredCaptionChunks(authoredCue(turn, index)));
  return buildCaptionPlacementTrack(cues, {
    ...options,
    captionStyle: style,
  });
}

function cueAt(track, timeSec) {
  return track.cues.find((cue) => timeSec >= cue.startSec && timeSec < cue.endSec) || null;
}

function normalizedWord(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function viewportSize(container, profile, provider) {
  let supplied = typeof provider === 'function' ? provider() : provider;
  let rect = supplied || container?.getBoundingClientRect?.() || {};
  let width = Number(rect.width ?? container?.clientWidth);
  let height = Number(rect.height ?? container?.clientHeight);
  return {
    width: Number.isFinite(width) && width > 0 ? width : profile.width,
    height: Number.isFinite(height) && height > 0 ? height : profile.height,
  };
}

function clockTimeSeconds(clock) {
  if (Number.isFinite(Number(clock?.currentTimeSec))) return Number(clock.currentTimeSec);
  if (Number.isFinite(Number(clock?.currentTimeMs))) return Number(clock.currentTimeMs) / 1000;
  if (typeof clock?.getCurrentTime === 'function') return Number(clock.getCurrentTime()) || 0;
  return 0;
}

function layoutMetric(value) {
  let number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function inspectLiveCaptionOverflow(visualElement) {
  let lines = [...(visualElement?.querySelectorAll?.('.sn-live-captions-line') || [])]
    .map((line) => {
      let clientWidth = layoutMetric(line.clientWidth);
      let scrollWidth = layoutMetric(line.scrollWidth);
      return {
        text: String(line.textContent || ''),
        clientWidth,
        scrollWidth,
        overflow: scrollWidth > clientWidth + 1,
      };
    });
  let clientHeight = layoutMetric(visualElement?.clientHeight);
  let scrollHeight = layoutMetric(visualElement?.scrollHeight);
  let widthOverflow = lines.some((line) => line.overflow);
  let heightOverflow = scrollHeight > clientHeight + 1;
  return {
    overflow: widthOverflow || heightOverflow,
    widthOverflow,
    heightOverflow,
    clientHeight,
    scrollHeight,
    lines,
  };
}

export class LiveCaptionController {
  constructor(options = {}) {
    this.clock = options.clock || null;
    this.enabled = options.enabled !== false;
    this.visualEnabled = options.visualEnabled !== false;
    let cueLookaheadSec = Number(options.cueLookaheadSec ?? 0);
    if (!Number.isFinite(cueLookaheadSec) || cueLookaheadSec < 0) {
      throw new TypeError('cueLookaheadSec must be a finite non-negative number');
    }
    this.cueLookaheadSec = cueLookaheadSec;
    this.onCueChange = typeof options.onCueChange === 'function' ? options.onCueChange : null;
    this.viewportProvider = options.getViewportRect || options.viewport || null;
    this.document = options.document || options.container?.ownerDocument || globalThis.document || null;
    this.container = options.container || null;
    this.ownsContainer = false;
    this.restoreContainerPosition = null;
    this.visualElement = null;
    this.ariaLiveElement = null;
    this.currentCueId = null;
    this._cleanupClock = null;

    let track = options.track || null;
    if (!track && options.turns) track = createLiveCaptionTrack(options.turns, options);
    this.track = track ? assertCaptionPlacementTrack(track) : null;

    if (this.document?.createElement) {
      ensureStyle(this.document);
      this.setupDOM();
    }
    this.bindClock();
  }

  setupDOM() {
    if (!this.container) {
      this.container = this.document.createElement('div');
      this.container.className = 'sn-live-captions-container';
      Object.assign(this.container.style, {
        position: 'fixed',
        inset: '0',
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: '2147483645',
      });
      this.document.body.appendChild(this.container);
      this.ownsContainer = true;
    } else {
      let position = this.container.style?.position || '';
      if (!position || position === 'static') {
        this.restoreContainerPosition = position;
        this.container.style.position = 'relative';
      }
    }

    this.visualElement = this.document.createElement('div');
    this.visualElement.className = 'sn-live-captions-visual';
    this.visualElement.setAttribute('aria-hidden', 'true');
    this.container.appendChild(this.visualElement);

    this.ariaLiveElement = this.document.createElement('div');
    this.ariaLiveElement.className = 'sn-live-captions-sr-only';
    this.ariaLiveElement.setAttribute('role', 'status');
    this.ariaLiveElement.setAttribute('aria-live', 'polite');
    this.ariaLiveElement.setAttribute('aria-atomic', 'true');
    this.container.appendChild(this.ariaLiveElement);
  }

  bindClock() {
    if (!this.clock) return;
    let handleTick = () => this.update(clockTimeSeconds(this.clock));
    if (typeof this.clock.addEventListener === 'function') {
      this.clock.addEventListener('timeupdate', handleTick);
      this._cleanupClock = () => this.clock.removeEventListener('timeupdate', handleTick);
    } else if (typeof this.clock.on === 'function') {
      this.clock.on('timeupdate', handleTick);
      this._cleanupClock = () => this.clock.off?.('timeupdate', handleTick);
    } else if (typeof this.clock.subscribe === 'function') {
      this._cleanupClock = this.clock.subscribe(handleTick);
    }
  }

  applyPlacement(cue) {
    let { profile } = this.track;
    let viewport = viewportSize(this.container, profile, this.viewportProvider);
    let scale = Math.min(viewport.width / profile.width, viewport.height / profile.height);
    let offsetX = (viewport.width - profile.width * scale) / 2;
    let offsetY = (viewport.height - profile.height * scale) / 2;
    let rect = cue.measuredRect;
    let style = this.visualElement.style;
    style.left = `${offsetX + rect.x * scale}px`;
    style.top = `${offsetY + rect.y * scale}px`;
    style.width = `${rect.width * scale}px`;
    style.height = `${rect.height * scale}px`;
    style.fontFamily = profile.fontName;
    style.fontSize = `${cue.fontSize * scale}px`;
    style.lineHeight = `${cue.lineHeight * scale}px`;
    style.fontWeight = String(profile.fontWeight);
    style.color = profile.primaryColor;
    style.backgroundColor = profile.backColor;
    style.setProperty('--sn-live-caption-primary', profile.primaryColor);
    style.setProperty('--sn-live-caption-highlight', profile.highlightColor);
    let outline = Math.max(1, scale);
    style.textShadow = `${outline}px 0 ${profile.outlineColor}, -${outline}px 0 ${profile.outlineColor}, 0 ${outline}px ${profile.outlineColor}, 0 -${outline}px ${profile.outlineColor}`;
  }

  renderVisual(cue, timeSec) {
    if (!this.visualElement) return;
    this.applyPlacement(cue);
    while (this.visualElement.firstChild) this.visualElement.removeChild(this.visualElement.firstChild);

    let timings = cue.wordTimings || [];
    let timingIndex = 0;
    for (let lineText of cue.wrappedLines) {
      let line = this.document.createElement('span');
      line.className = 'sn-live-captions-line';
      let tokens = String(lineText).split(/\s+/).filter(Boolean);
      tokens.forEach((token, tokenIndex) => {
        if (tokenIndex) line.appendChild(this.document.createTextNode(' '));
        let span = this.document.createElement('span');
        span.textContent = token;
        let timing = timings[timingIndex];
        if (timing && normalizedWord(timing.text) === normalizedWord(token)) {
          timingIndex += 1;
          if (timeSec >= timing.endSec) span.className = 'sn-live-captions-word-past';
          else if (timeSec >= timing.startSec) span.className = 'sn-live-captions-word-active';
          else span.className = 'sn-live-captions-word-future';
        }
        line.appendChild(span);
      });
      this.visualElement.appendChild(line);
    }
  }

  update(timeSec) {
    let time = Number(timeSec);
    let cue = this.enabled && this.track && Number.isFinite(time)
      ? cueAt(this.track, time + this.cueLookaheadSec)
      : null;
    if (!cue) {
      if (this.visualElement) this.visualElement.style.display = 'none';
      this.currentCueId = null;
      return null;
    }

    if (this.visualElement) this.visualElement.style.display = this.visualEnabled ? 'block' : 'none';
    let cueChanged = cue.cueId !== this.currentCueId;
    if (cueChanged) {
      this.currentCueId = cue.cueId;
      if (this.ariaLiveElement) {
        this.ariaLiveElement.textContent = cue.speaker
          ? `${cue.speaker}: ${cue.text}`
          : cue.text;
      }
    }
    this.renderVisual(cue, time);
    if (cueChanged) {
      this.onCueChange?.(cue, {
        timeSec: time,
        visualElement: this.visualElement,
        ariaLiveElement: this.ariaLiveElement,
        overflowEvidence: inspectLiveCaptionOverflow(this.visualElement),
      });
    }
    return cue;
  }

  toggle(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.update(Number.NaN);
  }

  setTrack(track) {
    this.track = assertCaptionPlacementTrack(track);
    this.currentCueId = null;
    return this.track;
  }

  dispose() {
    this._cleanupClock?.();
    this._cleanupClock = null;
    this.visualElement?.remove();
    this.ariaLiveElement?.remove();
    if (this.ownsContainer) this.container?.remove();
    else if (this.restoreContainerPosition !== null && this.container?.style) {
      this.container.style.position = this.restoreContainerPosition;
    }
    this.visualElement = null;
    this.ariaLiveElement = null;
  }
}
