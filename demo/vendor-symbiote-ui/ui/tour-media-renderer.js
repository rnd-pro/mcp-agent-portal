import {
  assertCaptionPlacementTrack,
  buildCaptionPlacementTrack,
} from 'symbiote-engine/render-captions';

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_FPS = 30;
const DEFAULT_TURN_MS = 2200;
const DEFAULT_MIN_TURN_MS = 1200;
const DEFAULT_WORD_MS = 230;
const DEFAULT_CAPTION_MODE = 'off';
const CAPTION_MODES = new Set(['off', 'karaoke', 'burned-in', 'on']);

export const DEFAULT_TOUR_MEDIA_MIME_TYPES = Object.freeze([
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]);

export class TourMediaRenderError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'TourMediaRenderError';
    this.code = code;
    this.detail = detail;
  }
}

function getGlobalDocument() {
  return typeof document !== 'undefined' ? document : null;
}

function getGlobalMediaRecorder() {
  return typeof MediaRecorder !== 'undefined' ? MediaRecorder : null;
}

function getGlobalMediaStream() {
  return typeof MediaStream !== 'undefined' ? MediaStream : null;
}

function getGlobalBlob() {
  return typeof Blob !== 'undefined' ? Blob : null;
}

function pickMimeType(Recorder, preferredMimeTypes = DEFAULT_TOUR_MEDIA_MIME_TYPES) {
  if (!Recorder || typeof Recorder.isTypeSupported !== 'function') return '';
  return preferredMimeTypes.find((mimeType) => Recorder.isTypeSupported(mimeType)) || '';
}

function cleanText(value, fallback = '') {
  let text = String(value ?? fallback ?? '').replace(/\s+/g, ' ').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : String(fallback || '').trim();
}

function explicitCueId(cue, index) {
  if (typeof cue?.cueId !== 'string' || !cue.cueId.trim()) {
    throw new TypeError(`tour caption frame ${index} requires a non-empty cueId`);
  }
  return cue.cueId;
}

function normalizeCaptionMode(value) {
  let mode = cleanText(value, DEFAULT_CAPTION_MODE).toLowerCase();
  return CAPTION_MODES.has(mode) ? mode : DEFAULT_CAPTION_MODE;
}

function captionsEnabled(mode) {
  return normalizeCaptionMode(mode) !== 'off';
}

function tokenizeWords(value) {
  return cleanText(value).split(/\s+/).filter(Boolean);
}

function words(value) {
  return tokenizeWords(value).length;
}

function turnDurationMs(turn, options = {}) {
  if (Number.isFinite(Number(turn?.durationMs))) return Math.max(0, Number(turn.durationMs));
  if (typeof options.turnDurationMs === 'function') {
    let duration = Number(options.turnDurationMs(turn));
    if (Number.isFinite(duration)) return Math.max(0, duration);
  }
  let min = Number.isFinite(Number(options.minTurnMs)) ? Number(options.minTurnMs) : DEFAULT_MIN_TURN_MS;
  let wordMs = Number.isFinite(Number(options.wordMs)) ? Number(options.wordMs) : DEFAULT_WORD_MS;
  let fallback = Number.isFinite(Number(options.defaultTurnMs)) ? Number(options.defaultTurnMs) : DEFAULT_TURN_MS;
  return Math.max(min, Math.max(fallback, words(turn?.text) * wordMs));
}

export function normalizeTourMediaTimeline(timeline = {}, options = {}) {
  let turns = (Array.isArray(timeline?.turns) ? timeline.turns : [])
    .map((turn, index) => ({
      index,
      ...(Object.hasOwn(turn || {}, 'cueId') ? { cueId: turn.cueId } : {}),
      persona: cleanText(turn?.persona, index % 2 ? 'ops' : 'guide') || 'guide',
      text: cleanText(turn?.text, ''),
      cue: turn?.cue && typeof turn.cue === 'object' ? { ...turn.cue } : {},
      durationMs: turnDurationMs(turn, options),
    }))
    .filter((turn) => turn.text);

  let personas = timeline?.personas && typeof timeline.personas === 'object' ? { ...timeline.personas } : {};
  let totalMs = turns.reduce((sum, turn) => sum + turn.durationMs, 0);
  return {
    title: cleanText(options.title || timeline?.title, 'UI tour'),
    personas,
    turns,
    totalMs,
  };
}

export function createTourMediaRenderPlan(timeline = {}, options = {}) {
  let normalized = normalizeTourMediaTimeline(timeline, options);
  let elapsedMs = 0;
  let frames = normalized.turns.map((turn) => {
    let frame = {
      ...turn,
      startMs: elapsedMs,
      endMs: elapsedMs + turn.durationMs,
    };
    elapsedMs += turn.durationMs;
    return frame;
  });
  return {
    ...normalized,
    frames,
  };
}

function normalizeWordTiming(timing, frame) {
  if (!timing || Number(timing.index) !== Number(frame.index)) return null;
  let text = cleanText(timing.word || timing.text, '');
  if (!text) return null;
  let startMs = timing.startMs === undefined ? Number(timing.startSec) * 1000 : Number(timing.startMs);
  let endMs = timing.endMs === undefined ? Number(timing.endSec) * 1000 : Number(timing.endMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs
    || startMs < frame.startMs || endMs > frame.endMs + 1) {
    throw new TypeError(`caption word timing for frame ${frame.index} is outside its authored cue`);
  }
  return {
    text,
    wordIndex: Number.isFinite(Number(timing.wordIndex)) ? Number(timing.wordIndex) : undefined,
    startSec: startMs / 1000,
    endSec: endMs / 1000,
  };
}

function captionStyleOptions(options, width, height) {
  let fallbackPreset = height > width ? 'tiktok' : height === width ? 'square' : 'youtube';
  let source = options.captionStyle ?? {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('captionStyle must be a canonical caption profile object');
  }
  return {
    ...source,
    preset: cleanText(source.preset, fallbackPreset).toLowerCase(),
  };
}

export function createTourCaptionTrack(timelineOrPlan = {}, options = {}) {
  let plan = Array.isArray(timelineOrPlan?.frames)
    ? timelineOrPlan
    : createTourMediaRenderPlan(timelineOrPlan, options);
  let wordTimings = Array.isArray(options.wordTimings) ? options.wordTimings : [];
  let mode = normalizeCaptionMode(options.captionsMode || options.mode);
  let width = Number(options.width) || DEFAULT_WIDTH;
  let height = Number(options.height) || DEFAULT_HEIGHT;
  let cues = (captionsEnabled(mode) ? plan.frames : []).map((frame) => {
    let timedWords = wordTimings
      .map((timing) => normalizeWordTiming(timing, frame))
      .filter(Boolean)
      .sort((a, b) => a.startSec - b.startSec || (a.wordIndex ?? 0) - (b.wordIndex ?? 0));
    return {
      cueId: explicitCueId(frame, frame.index),
      index: frame.index,
      speaker: cleanText(frame.persona, 'guide'),
      text: cleanText(frame.text, ''),
      startSec: frame.startMs / 1000,
      endSec: frame.endMs / 1000,
      wordTimings: timedWords,
    };
  });
  let placementTrack = buildCaptionPlacementTrack(cues, {
    width,
    height,
    captionStyle: captionStyleOptions(options, width, height),
    safeInsets: options.safeInsets,
    avoidRegions: options.avoidRegions,
  });
  return {
    ...placementTrack,
    mode,
    title: cleanText(plan.title, 'UI tour'),
    wordTimingCount: placementTrack.cues.reduce((sum, cue) => sum + cue.wordTimings.length, 0),
  };
}

function createCanvas(options = {}) {
  if (options.canvas) return options.canvas;
  let doc = options.document || getGlobalDocument();
  if (!doc?.createElement) return null;
  return doc.createElement('canvas');
}

function getVideoTracks(stream) {
  return stream?.getVideoTracks?.() || [];
}

function getAudioTracks(stream) {
  return stream?.getAudioTracks?.() || [];
}

function getTracks(stream) {
  return stream?.getTracks?.() || [];
}

function trackFromAudioInput(input) {
  if (!input) return null;
  if (input.kind === 'audio') return input;
  if (input.track?.kind === 'audio') return input.track;
  return null;
}

async function resolveAudioInput(options = {}, plan) {
  if (typeof options.audioProvider === 'function') {
    return options.audioProvider({ timeline: plan, signal: options.signal, options });
  }
  return options.audioStream || options.audioTrack || null;
}

function audioTracksFromInput(input) {
  let track = trackFromAudioInput(input);
  if (track) return [track];
  if (input?.stream?.getAudioTracks) return getAudioTracks(input.stream);
  if (input?.getAudioTracks) return getAudioTracks(input);
  return [];
}

async function closeAudioInput(input) {
  if (!input) return;
  if (typeof input.close === 'function') {
    await input.close();
    return;
  }
  if (typeof input.dispose === 'function') {
    await input.dispose();
  }
}

function createCombinedStream(videoStream, audioTracks, StreamCtor) {
  let videoTracks = getVideoTracks(videoStream);
  if (!audioTracks.length) return videoStream;
  if (!StreamCtor) {
    throw new TourMediaRenderError('missing-media-stream', 'MediaStream constructor is not available.');
  }
  return new StreamCtor([...videoTracks, ...audioTracks]);
}

function abortReason(signal) {
  if (signal?.reason) return signal.reason;
  if (typeof DOMException === 'function') return new DOMException('Aborted', 'AbortError');
  let error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortReason(signal);
}

function wait(ms, signal) {
  if (!ms) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    let onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    let timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

function defaultFrameClockNow() {
  if (typeof globalThis.performance?.now === 'function') return globalThis.performance.now();
  return Date.now();
}

function resolveFrameClock(options = {}) {
  let source = options.frameClock;
  if (source !== undefined && (!source || typeof source !== 'object')) {
    throw new TourMediaRenderError('invalid-frame-clock', 'frameClock must provide now() and wait().');
  }
  let now = source?.now;
  let waitFor = source?.wait;
  if (source && (typeof now !== 'function' || typeof waitFor !== 'function')) {
    throw new TourMediaRenderError('invalid-frame-clock', 'frameClock must provide now() and wait().');
  }
  return {
    now: source ? now.bind(source) : defaultFrameClockNow,
    wait: source ? waitFor.bind(source) : wait,
  };
}

function frameClockNow(clock) {
  let value = Number(clock.now());
  if (!Number.isFinite(value)) {
    throw new TourMediaRenderError('invalid-frame-clock', 'frameClock.now() must return a finite number.');
  }
  return value;
}

async function waitUntilFrameTime(clock, targetMs, signal) {
  while (true) {
    throwIfAborted(signal);
    let before = frameClockNow(clock);
    let remaining = targetMs - before;
    if (remaining <= 0) return;
    await clock.wait(remaining, signal);
    throwIfAborted(signal);
    if (frameClockNow(clock) <= before) {
      throw new TourMediaRenderError(
        'frame-clock-stalled',
        'frameClock.wait() completed without advancing toward the scheduled frame.',
      );
    }
  }
}

function createFrameSchedule(plan, fps) {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new TourMediaRenderError('invalid-frame-rate', 'fps must be a positive finite number.');
  }
  if (!Number.isFinite(plan.totalMs) || plan.totalMs <= 0) {
    throw new TourMediaRenderError(
      'invalid-timeline-duration',
      'Tour timeline duration must be positive before video rendering.',
    );
  }
  let intervalMs = 1000 / fps;
  let frameCount = Math.ceil(plan.totalMs / intervalMs);
  let timelineIndex = 0;
  return Array.from({ length: frameCount }, (_, index) => {
    let scheduledMs = index * intervalMs;
    while (timelineIndex < plan.frames.length - 1
      && scheduledMs >= plan.frames[timelineIndex].endMs) {
      timelineIndex += 1;
    }
    return {
      index,
      frame: plan.frames[timelineIndex],
      scheduledMs,
      deadlineMs: (index + 1) * intervalMs,
    };
  });
}

function assertFrameDeadline(clock, startedAtMs, slot, phase) {
  let currentMs = frameClockNow(clock);
  let deadlineAtMs = startedAtMs + slot.deadlineMs;
  if (currentMs < deadlineAtMs) return;
  throw new TourMediaRenderError(
    'frame-deadline-missed',
    `Tour frame ${slot.index} missed its ${slot.deadlineMs}ms capture deadline.`,
    {
      frameIndex: slot.index,
      timelineFrameIndex: slot.frame.index,
      scheduledMs: slot.scheduledMs,
      deadlineMs: slot.deadlineMs,
      lateByMs: currentMs - deadlineAtMs,
      phase,
    },
  );
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 5) {
  let tokens = cleanText(text).split(/\s+/).filter(Boolean);
  let line = '';
  let lines = [];
  for (let token of tokens) {
    let next = line ? `${line} ${token}` : token;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = token;
      if (lines.length >= maxLines - 1) break;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((ln, index) => ctx.fillText(ln, x, y + index * lineHeight));
}

function activeCaptionCues(track, frame, nowMs) {
  if (!track?.cues?.length) return [];
  let currentSec = (Number.isFinite(Number(nowMs)) ? Number(nowMs) : frame.startMs) / 1000;
  return track.cues.filter((cue) => currentSec >= cue.startSec && currentSec < cue.endSec);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath?.();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill?.();
    return;
  }
  if (!ctx.beginPath || !ctx.moveTo || !ctx.quadraticCurveTo) {
    ctx.fillRect?.(x, y, width, height);
    return;
  }
  let r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath?.();
  ctx.fill?.();
}

function normalizedCaptionWord(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function drawCaptionLines(ctx, cue, nowSec, rect, profile, scale) {
  let timings = cue.wordTimings || [];
  let timingIndex = 0;
  let lineHeight = profile.lineHeight * scale;
  ctx.font = `700 ${profile.fontSize * scale}px ${profile.fontName}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.strokeStyle = profile.outlineColor;
  ctx.lineWidth = Math.max(1, scale);

  cue.wrappedLines.forEach((lineText, lineIndex) => {
    let tokens = String(lineText).split(/\s+/).filter(Boolean);
    let lineWidth = ctx.measureText(lineText).width;
    let cursorX = rect.x + Math.max(0, (rect.width - lineWidth) / 2);
    let y = rect.y + lineIndex * lineHeight;
    tokens.forEach((token, tokenIndex) => {
      if (tokenIndex) cursorX += ctx.measureText(' ').width;
      let timing = timings[timingIndex];
      let matchesTiming = timing
        && normalizedCaptionWord(timing.text) === normalizedCaptionWord(token);
      if (matchesTiming) timingIndex += 1;
      let active = matchesTiming && nowSec >= timing.startSec && nowSec < timing.endSec;
      ctx.fillStyle = active ? profile.highlightColor : profile.primaryColor;
      ctx.strokeText?.(token, cursorX, y);
      ctx.fillText(token, cursorX, y);
      cursorX += ctx.measureText(token).width;
    });
  });
}

function drawTourCaptions(ctx, frame, plan, options = {}) {
  let mode = normalizeCaptionMode(options.captionsMode);
  if (!captionsEnabled(mode)) return;
  let width = Number(options.width) || DEFAULT_WIDTH;
  let height = Number(options.height) || DEFAULT_HEIGHT;
  let track = options.captionTrack || createTourCaptionTrack(plan, {
    ...options,
    captionsMode: mode,
    width,
    height,
  });
  assertCaptionPlacementTrack(track);
  let nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : frame.startMs;
  let cues = activeCaptionCues(track, frame, nowMs);
  if (!cues.length) return;

  let { profile } = track;
  let scale = Math.min(width / profile.width, height / profile.height);
  let offsetX = (width - profile.width * scale) / 2;
  let offsetY = (height - profile.height * scale) / 2;
  for (let cue of cues) {
    let rect = {
      x: offsetX + cue.measuredRect.x * scale,
      y: offsetY + cue.measuredRect.y * scale,
      width: cue.measuredRect.width * scale,
      height: cue.measuredRect.height * scale,
    };
    ctx.fillStyle = profile.backColor;
    drawRoundedRect(ctx, rect.x, rect.y, rect.width, rect.height, profile.lineHeight * scale * 0.2);
    drawCaptionLines(ctx, cue, nowMs / 1000, rect, profile, scale);
  }
}

function tourMediaPalette(options = {}) {
  return {
    bg: '#151719',
    panel: '#23282d',
    text: '#f4f7fb',
    muted: '#9aa6b2',
    accent: '#6db5ff',
    captionBg: 'rgba(0, 0, 0, 0.55)',
    ...options.palette,
  };
}

export function drawTourCaptionOverlay(ctx, frame, plan, options = {}) {
  drawTourCaptions(ctx, frame, plan, options);
}

export function drawTourMediaFrame(ctx, frame, plan, options = {}) {
  let width = Number(options.width) || DEFAULT_WIDTH;
  let height = Number(options.height) || DEFAULT_HEIGHT;
  let palette = tourMediaPalette(options);

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = palette.panel;
  ctx.fillRect(Math.round(width * 0.07), Math.round(height * 0.14), Math.round(width * 0.86), Math.round(height * 0.72));
  ctx.fillStyle = palette.accent;
  ctx.font = '700 30px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  ctx.fillText(cleanText(plan.title, 'UI tour'), Math.round(width * 0.11), Math.round(height * 0.23));
  ctx.fillStyle = palette.muted;
  ctx.font = '700 18px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  ctx.fillText(cleanText(frame.persona, 'guide').toUpperCase(), Math.round(width * 0.11), Math.round(height * 0.36));
  ctx.fillStyle = palette.text;
  ctx.font = '500 40px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  drawWrappedText(ctx, frame.text, Math.round(width * 0.11), Math.round(height * 0.46), Math.round(width * 0.78), 52, 4);
  ctx.fillStyle = palette.muted;
  ctx.font = '500 18px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  ctx.fillText(`${frame.index + 1} / ${plan.turns.length}`, Math.round(width * 0.11), Math.round(height * 0.79));
  drawTourCaptionOverlay(ctx, frame, plan, options);
}

function resolveFrameRenderer(options = {}) {
  for (let key of ['frameRenderer', 'renderFrame', 'drawFrame']) {
    if (typeof options[key] === 'function') return options[key];
  }
  return null;
}

async function renderVideoFrame(ctx, canvas, frame, plan, renderOptions, renderer, sourceOptions) {
  if (!renderer) {
    drawTourMediaFrame(ctx, frame, plan, renderOptions);
    return 'default';
  }
  let detail = {
    canvas,
    ctx,
    frame,
    plan,
    width: renderOptions.width,
    height: renderOptions.height,
    nowMs: renderOptions.nowMs,
    elapsedMs: Math.max(0, Number(renderOptions.nowMs) - Number(frame.startMs || 0)),
    captionsMode: renderOptions.captionsMode,
    captionTrack: renderOptions.captionTrack,
    options: sourceOptions,
    drawDefaultFrame(overrides = {}) {
      drawTourMediaFrame(ctx, frame, plan, { ...renderOptions, ...overrides });
    },
    drawCaptionOverlay(overrides = {}) {
      drawTourCaptionOverlay(ctx, frame, plan, { ...renderOptions, ...overrides });
    },
  };
  try {
    await renderer(detail);
  } catch (cause) {
    throw new TourMediaRenderError('frame-render-failed', 'Tour frame renderer failed.', {
      frameIndex: frame.index,
      nowMs: renderOptions.nowMs,
      cause,
    });
  }
  if (sourceOptions.captionOverlay !== false) {
    drawTourCaptionOverlay(ctx, frame, plan, renderOptions);
  }
  return 'custom';
}

export function getTourMediaSupport(options = {}) {
  let canvas = createCanvas(options);
  let Recorder = options.MediaRecorder || getGlobalMediaRecorder();
  let StreamCtor = options.MediaStream || getGlobalMediaStream();
  let BlobCtor = options.Blob || getGlobalBlob();
  return {
    canvas: Boolean(canvas?.getContext && canvas?.captureStream),
    mediaRecorder: Boolean(Recorder),
    mediaStream: Boolean(StreamCtor),
    blob: Boolean(BlobCtor),
    supported: Boolean(canvas?.getContext && canvas?.captureStream && Recorder && StreamCtor && BlobCtor),
  };
}

function validateCaptionTrack(value) {
  try {
    return assertCaptionPlacementTrack(value);
  } catch (cause) {
    throw new TourMediaRenderError(
      'invalid-caption-track',
      `options.captionTrack must use caption-presentation-track-v2: ${cause.message}`,
      { cause },
    );
  }
}

function captionWordTimingCount(track) {
  return track.cues.reduce((sum, cue) => (
    sum + (Array.isArray(cue.wordTimings) ? cue.wordTimings.length : 0)
  ), 0);
}

export async function renderTourVideo(timeline = {}, options = {}) {
  let includeAudio = options.includeAudio !== false;
  let plan = createTourMediaRenderPlan(timeline, options);
  if (!plan.turns.length) {
    throw new TourMediaRenderError('empty-timeline', 'Tour timeline has no narratable turns.');
  }

  let canvas = createCanvas(options);
  let ctx = canvas?.getContext?.('2d');
  if (!canvas?.captureStream || !ctx) {
    throw new TourMediaRenderError('unsupported-canvas-capture', 'Canvas captureStream is not available.');
  }

  let Recorder = options.MediaRecorder || getGlobalMediaRecorder();
  if (!Recorder) throw new TourMediaRenderError('missing-media-recorder', 'MediaRecorder is not available.');
  let StreamCtor = options.MediaStream || getGlobalMediaStream();
  let BlobCtor = options.Blob || getGlobalBlob();
  if (!BlobCtor) throw new TourMediaRenderError('missing-blob', 'Blob is not available.');

  let width = Number(options.width) || DEFAULT_WIDTH;
  let height = Number(options.height) || DEFAULT_HEIGHT;
  let fps = options.fps === undefined ? DEFAULT_FPS : Number(options.fps);
  let frameSchedule = createFrameSchedule(plan, fps);
  let frameClock = resolveFrameClock(options);
  let captionsMode = normalizeCaptionMode(options.captionsMode);
  let suppliedCaptionTrack = options.captionTrack === undefined
    ? null
    : validateCaptionTrack(options.captionTrack);
  canvas.width = width;
  canvas.height = height;

  let audioInput = null;
  let audioTracks = [];
  let wordTimings = [];
  let captionTrack = suppliedCaptionTrack;
  let frameRenderer = resolveFrameRenderer(options);
  let renderedFrameCount = 0;
  let requestedFrameCount = 0;
  let videoStream = null;
  let stream = null;
  let recorder = null;
  let recorderStarted = false;
  let recorderStopRequested = false;
  let recorderCompletion = null;
  let chunks = [];
  let primaryError = null;

  try {
    throwIfAborted(options.signal);
    audioInput = await resolveAudioInput(options, plan);
    throwIfAborted(options.signal);
    audioTracks = audioTracksFromInput(audioInput);
    if (includeAudio && !audioTracks.length) {
      throw new TourMediaRenderError(
        'missing-audio-source',
        'Tour video rendering with audio requires an audio stream or audio provider.',
        {
          includeAudio,
          audioTrackCount: 0,
        },
      );
    }
    wordTimings = Array.isArray(audioInput?.wordTimings)
      ? audioInput.wordTimings
      : Array.isArray(audioInput?.plan?.wordTimings)
        ? audioInput.plan.wordTimings
        : [];
    if (!captionTrack) {
      captionTrack = createTourCaptionTrack(plan, {
        ...options,
        captionsMode,
        wordTimings,
        width,
        height,
      });
    }

    try {
      videoStream = canvas.captureStream(0);
    } catch (cause) {
      throw new TourMediaRenderError(
        'manual-frame-capture-unavailable',
        'Canvas captureStream(0) failed; manual frame capture is required.',
        { cause },
      );
    }
    let videoTracks = getVideoTracks(videoStream);
    let captureTrack = videoTracks.length === 1 ? videoTracks[0] : null;
    if (!captureTrack || typeof captureTrack.requestFrame !== 'function') {
      throw new TourMediaRenderError(
        'manual-frame-capture-unavailable',
        'Canvas capture must expose one video track with requestFrame().',
        { videoTrackCount: videoTracks.length },
      );
    }

    stream = createCombinedStream(videoStream, includeAudio ? audioTracks : [], StreamCtor);
    let mimeType = pickMimeType(Recorder, options.preferredMimeTypes) || '';
    recorder = new Recorder(stream, mimeType ? { mimeType } : undefined);
    recorderCompletion = new Promise((resolve, reject) => {
      recorder.addEventListener?.('dataavailable', (event) => {
        if (event?.data?.size > 0) chunks.push(event.data);
      });
      recorder.addEventListener?.('stop', resolve, { once: true });
      recorder.addEventListener?.('error', (event) => {
        reject(event?.error || new Error('Tour video rendering failed'));
      }, { once: true });
    }).then(
      () => null,
      (error) => error,
    );

    recorderStarted = true;
    recorder.start(options.chunkInterval ?? 1000);
    let startedAtMs = frameClockNow(frameClock);
    for (let slot of frameSchedule) {
      await waitUntilFrameTime(frameClock, startedAtMs + slot.scheduledMs, options.signal);
      assertFrameDeadline(frameClock, startedAtMs, slot, 'before-render');
      await renderVideoFrame(
        ctx,
        canvas,
        slot.frame,
        plan,
        {
          ...options,
          width,
          height,
          captionsMode,
          captionTrack,
          nowMs: slot.scheduledMs,
        },
        frameRenderer,
        options,
      );
      renderedFrameCount += 1;
      throwIfAborted(options.signal);
      assertFrameDeadline(frameClock, startedAtMs, slot, 'after-render');
      try {
        captureTrack.requestFrame();
      } catch (cause) {
        throw new TourMediaRenderError(
          'manual-frame-capture-failed',
          `Canvas video track requestFrame() failed for frame ${slot.index}.`,
          { frameIndex: slot.index, cause },
        );
      }
      requestedFrameCount += 1;
    }
    let recordingEndMs = startedAtMs + frameSchedule.at(-1).deadlineMs;
    await waitUntilFrameTime(frameClock, recordingEndMs, options.signal);
    throwIfAborted(options.signal);
    recorder.stop();
    recorderStopRequested = true;
    let recorderError = await recorderCompletion;
    if (recorderError) throw recorderError;

    let type = recorder.mimeType || mimeType || 'video/webm';
    let blob = new BlobCtor(chunks, { type });
    return {
      blob,
      type,
      mimeType: type,
      plan,
      filename: options.filename || 'tour-video.webm',
      audio: {
        requested: includeAudio,
        trackCount: audioTracks.length,
        hasAudio: audioTracks.length > 0,
        wordTimingCount: wordTimings.length,
      },
      captions: {
        mode: captionsMode,
        burnedIn: captionsEnabled(captionsMode),
        track: captionTrack,
        wordTimingCount: captionWordTimingCount(captionTrack),
      },
      video: {
        trackCount: getVideoTracks(stream).length || getVideoTracks(videoStream).length,
        width,
        height,
        fps,
        frameRenderer: frameRenderer ? 'custom' : 'default',
        renderedFrameCount,
        requestedFrameCount,
      },
    };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    let cleanupError = null;
    if (recorderStarted && !recorderStopRequested && recorder?.state !== 'inactive') {
      try {
        recorder.stop();
        recorderStopRequested = true;
      } catch (error) {
        cleanupError = error;
      }
    }
    let tracks = new Set([
      ...getTracks(stream),
      ...getTracks(videoStream),
      ...audioTracks,
    ]);
    for (let track of tracks) {
      try {
        track?.stop?.();
      } catch (error) {
        cleanupError ||= error;
      }
    }
    try {
      await closeAudioInput(audioInput);
    } catch (error) {
      cleanupError ||= error;
    }
    if (cleanupError && !primaryError) {
      throw new TourMediaRenderError(
        'media-cleanup-failed',
        'Tour video rendering finished, but media resource cleanup failed.',
        { cause: cleanupError },
      );
    }
  }
}

export function downloadTourVideoBlob(result, options = {}) {
  let doc = options.document || getGlobalDocument();
  let urlApi = options.URL || (typeof URL !== 'undefined' ? URL : null);
  let blob = result?.blob;
  if (!doc?.createElement || !doc?.body?.appendChild || !urlApi?.createObjectURL || !blob) return false;
  let href = urlApi.createObjectURL(blob);
  let link = doc.createElement('a');
  link.href = href;
  link.download = result.filename || options.filename || 'tour-video.webm';
  link.style.display = 'none';
  doc.body.appendChild(link);
  link.click?.();
  link.remove?.();
  if (typeof urlApi.revokeObjectURL === 'function') {
    setTimeout(() => urlApi.revokeObjectURL(href), 0);
  }
  return true;
}
