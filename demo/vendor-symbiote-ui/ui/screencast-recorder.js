class SimpleEventTarget {
  constructor() {
    this._listeners = new Map();
  }

  addEventListener(type, listener) {
    if (typeof listener !== 'function') return;
    let listeners = this._listeners.get(type) || new Set();
    listeners.add(listener);
    this._listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this._listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event) {
    if (!event?.type) return true;
    for (let listener of this._listeners.get(event.type) || []) {
      listener.call(this, event);
    }
    return true;
  }
}

const RuntimeEventTarget = typeof EventTarget !== 'undefined' ? EventTarget : SimpleEventTarget;

export const DEFAULT_SCREENCAST_HOTKEY = Object.freeze({
  code: 'KeyR',
  altKey: true,
  shiftKey: true,
  ctrlKey: false,
  metaKey: false,
});

export const DEFAULT_SCREENCAST_MIME_TYPES = Object.freeze([
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]);

const DEFAULT_CAPTURE_OPTIONS = Object.freeze({
  video: {
    cursor: 'always',
  },
  audio: {
    suppressLocalAudioPlayback: false,
  },
  preferCurrentTab: true,
  surfaceSwitching: 'include',
  selfBrowserSurface: 'include',
  systemAudio: 'include',
  windowAudio: 'system',
});

function createRuntimeEvent(type, detail = {}) {
  if (typeof CustomEvent !== 'undefined') return new CustomEvent(type, { detail });
  if (typeof Event !== 'undefined') {
    let event = new Event(type);
    event.detail = detail;
    return event;
  }
  return { type, detail };
}

function emit(target, type, detail = {}) {
  target?.dispatchEvent?.(createRuntimeEvent(type, detail));
}

function getGlobalDocument() {
  return typeof document !== 'undefined' ? document : null;
}

function getGlobalNavigator() {
  return typeof navigator !== 'undefined' ? navigator : null;
}

function getGlobalMediaRecorder() {
  return typeof MediaRecorder !== 'undefined' ? MediaRecorder : null;
}

function getGlobalMediaStream() {
  return typeof MediaStream !== 'undefined' ? MediaStream : null;
}

function getGlobalUrl() {
  return typeof URL !== 'undefined' ? URL : null;
}

function clonePlain(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clonePlain);
  return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, clonePlain(val)]));
}

function normalizeHotkey(hotkey = DEFAULT_SCREENCAST_HOTKEY) {
  if (!hotkey || typeof hotkey !== 'object') return { ...DEFAULT_SCREENCAST_HOTKEY };
  return {
    code: String(hotkey.code || DEFAULT_SCREENCAST_HOTKEY.code),
    altKey: Boolean(hotkey.altKey),
    shiftKey: Boolean(hotkey.shiftKey),
    ctrlKey: Boolean(hotkey.ctrlKey),
    metaKey: Boolean(hotkey.metaKey),
  };
}

export function matchesScreencastHotkey(event, hotkey = DEFAULT_SCREENCAST_HOTKEY) {
  if (!event || event.repeat || event.isComposing) return false;
  let key = normalizeHotkey(hotkey);
  return event.code === key.code &&
    Boolean(event.altKey) === key.altKey &&
    Boolean(event.shiftKey) === key.shiftKey &&
    Boolean(event.ctrlKey) === key.ctrlKey &&
    Boolean(event.metaKey) === key.metaKey;
}

function pickMimeType(Recorder, preferredMimeTypes = DEFAULT_SCREENCAST_MIME_TYPES) {
  if (!Recorder || typeof Recorder.isTypeSupported !== 'function') return '';
  return preferredMimeTypes.find((mimeType) => Recorder.isTypeSupported(mimeType)) || '';
}

function stopStreamTracks(stream) {
  for (let track of stream?.getTracks?.() || []) {
    track.stop?.();
  }
}

function isCaptureKindRequested(captureOptions, kind) {
  let option = captureOptions?.[kind];
  return option !== false && option != null;
}

function getTrackCount(stream, method) {
  let tracks = stream?.[method]?.();
  return Array.isArray(tracks) ? tracks.length : 0;
}

function audioTrackFromInput(input) {
  if (!input) return null;
  if (input.kind === 'audio') return input;
  if (input.track?.kind === 'audio') return input.track;
  return null;
}

function audioTracksFromInput(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.filter((track) => track?.kind === 'audio');
  if (Array.isArray(input.tracks)) return input.tracks.filter((track) => track?.kind === 'audio');
  let track = audioTrackFromInput(input);
  if (track) return [track];
  if (input?.stream?.getAudioTracks) return input.stream.getAudioTracks();
  if (input?.getAudioTracks) return input.getAudioTracks();
  return [];
}

async function closeAudioInput(input) {
  if (!input) return;
  if (typeof input.close === 'function') {
    await input.close();
    return;
  }
  if (typeof input.dispose === 'function') await input.dispose();
}

async function resolveExtraAudioInput(options = {}, recorder) {
  if (typeof options.audioTrackProvider === 'function') {
    return options.audioTrackProvider({ recorder, signal: options.signal, options });
  }
  if (options.audioInput) return options.audioInput;
  if (options.audioStream) return options.audioStream;
  if (options.audioTrack) return options.audioTrack;
  if (options.extraAudioTracks) return { tracks: options.extraAudioTracks };
  return null;
}

function hasExtraAudioInput(options = {}) {
  return Boolean(
    options.audioTrackProvider ||
    options.audioInput ||
    options.audioStream ||
    options.audioTrack ||
    (Array.isArray(options.extraAudioTracks) && options.extraAudioTracks.length)
  );
}

function createRecordingStream(displayStream, extraAudioTracks, StreamCtor) {
  if (!extraAudioTracks.length) return displayStream;
  if (!StreamCtor) {
    throw new Error('MediaStream constructor is not available for screencast audio muxing');
  }
  return new StreamCtor([
    ...(displayStream?.getVideoTracks?.() || []),
    ...(displayStream?.getAudioTracks?.() || []),
    ...extraAudioTracks,
  ]);
}

function getCaptureDiagnostics(stream, captureOptions) {
  let audioTrackCount = getTrackCount(stream, 'getAudioTracks');
  let videoTrackCount = getTrackCount(stream, 'getVideoTracks');
  return {
    audioRequested: isCaptureKindRequested(captureOptions, 'audio'),
    videoRequested: isCaptureKindRequested(captureOptions, 'video'),
    audioTrackCount,
    videoTrackCount,
    hasAudio: audioTrackCount > 0,
    hasVideo: videoTrackCount > 0,
  };
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/\.\d+Z$/, 'Z').replace(/[:.]/g, '-');
}

function defaultFilename() {
  return `screencast-${timestampForFile()}.webm`;
}

function createFilename(filename, prefix) {
  if (typeof filename === 'function') return String(filename() || defaultFilename());
  if (filename) return String(filename);
  return prefix ? `${String(prefix)}-${timestampForFile()}.webm` : defaultFilename();
}

function downloadBlob(blob, filename, doc, urlApi) {
  if (!doc?.createElement || !doc?.body?.appendChild || !urlApi?.createObjectURL) return false;
  let href = urlApi.createObjectURL(blob);
  let link = doc.createElement('a');
  link.href = href;
  link.download = filename;
  link.style.display = 'none';
  doc.body.appendChild(link);
  link.click?.();
  link.remove?.();
  if (typeof urlApi.revokeObjectURL === 'function') {
    setTimeout(() => urlApi.revokeObjectURL(href), 0);
  }
  return true;
}

export class ScreencastRecorder extends RuntimeEventTarget {
  constructor(options = {}) {
    super();
    this.state = 'idle';
    this.hotkey = normalizeHotkey(options.hotkey);
    this.stopHotkey = normalizeHotkey(options.stopHotkey || options.hotkey);
    this.captureOptions = clonePlain(options.captureOptions || DEFAULT_CAPTURE_OPTIONS);
    this.preferredMimeTypes = [...(options.preferredMimeTypes || DEFAULT_SCREENCAST_MIME_TYPES)];
    this.chunkInterval = Number.isFinite(Number(options.chunkInterval)) ? Number(options.chunkInterval) : 1000;
    this.download = options.download ?? true;
    this.filename = options.filename || '';
    this.filenamePrefix = options.filenamePrefix || '';
    this.document = options.document || getGlobalDocument();
    this.navigator = options.navigator || getGlobalNavigator();
    this.MediaRecorder = options.MediaRecorder || getGlobalMediaRecorder();
    this.MediaStream = options.MediaStream || getGlobalMediaStream();
    this.URL = options.URL || getGlobalUrl();
    this.eventTarget = options.eventTarget || null;
    this.audioTrackProvider = options.audioTrackProvider || null;
    this.extraAudioTracks = Array.isArray(options.extraAudioTracks) ? [...options.extraAudioTracks] : [];
    this.stopPropagation = options.stopPropagation ?? false;
    this._hotkeyTarget = null;
    this._onKeydown = (event) => this._handleKeydown(event);
    this._mediaRecorder = null;
    this._stream = null;
    this._displayStream = null;
    this._extraAudioInput = null;
    this._extraAudioTracks = [];
    this._chunks = [];
    this._mimeType = '';
    this._activeFilename = '';
    this._startedAt = 0;
    this._stopPromise = null;
    this._resolveStop = null;
    this._captureDiagnostics = getCaptureDiagnostics(null, this.captureOptions);
  }

  static isSupported(options = {}) {
    let nav = options.navigator || getGlobalNavigator();
    let Recorder = options.MediaRecorder || getGlobalMediaRecorder();
    return Boolean(nav?.mediaDevices?.getDisplayMedia && Recorder);
  }

  get isSupported() {
    return ScreencastRecorder.isSupported({
      navigator: this.navigator,
      MediaRecorder: this.MediaRecorder,
    });
  }

  get isRecording() {
    return this.state === 'recording' || this.state === 'starting' || this.state === 'stopping';
  }

  bindHotkeys(target = this.document) {
    this.unbindHotkeys();
    if (!target?.addEventListener) return this;
    target.addEventListener('keydown', this._onKeydown, { capture: true });
    this._hotkeyTarget = target;
    return this;
  }

  unbindHotkeys() {
    if (!this._hotkeyTarget?.removeEventListener) return this;
    this._hotkeyTarget.removeEventListener('keydown', this._onKeydown, { capture: true });
    this._hotkeyTarget = null;
    return this;
  }

  async toggle(reason = 'hotkey') {
    if (this.state === 'idle') return this.start({ reason });
    if (this.state === 'recording') return this.stop(reason);
    return this._stopPromise || undefined;
  }

  async start({
    reason = 'api',
    filename = '',
    audioTrackProvider = this.audioTrackProvider,
    extraAudioTracks = this.extraAudioTracks,
    audioInput = null,
    audioStream = null,
    audioTrack = null,
    signal = null,
  } = {}) {
    if (this.state !== 'idle') return this._stopPromise || undefined;
    if (!this.navigator?.mediaDevices?.getDisplayMedia) {
      throw this._emitError(new Error('Screen Capture API not supported'), { reason });
    }
    if (!this.MediaRecorder) {
      throw this._emitError(new Error('MediaRecorder API not supported'), { reason });
    }

    this._setState('starting', { reason });
    this._chunks = [];
    this._mimeType = pickMimeType(this.MediaRecorder, this.preferredMimeTypes);
    this._activeFilename = filename ? String(filename) : '';
    this._startedAt = Date.now();
    this._captureDiagnostics = getCaptureDiagnostics(null, this.captureOptions);

    try {
      this._displayStream = await this.navigator.mediaDevices.getDisplayMedia(this.captureOptions);
      let audioOptions = {
        audioTrackProvider,
        extraAudioTracks,
        audioInput,
        audioStream,
        audioTrack,
        signal,
      };
      this._extraAudioInput = hasExtraAudioInput(audioOptions) ? await resolveExtraAudioInput(audioOptions, this) : null;
      this._extraAudioTracks = audioTracksFromInput(this._extraAudioInput);
      this._stream = createRecordingStream(this._displayStream, this._extraAudioTracks, this.MediaStream);
      this._captureDiagnostics = getCaptureDiagnostics(this._stream, this.captureOptions);
      let options = this._mimeType ? { mimeType: this._mimeType } : undefined;
      this._mediaRecorder = new this.MediaRecorder(this._stream, options);
      this._installRecorderHandlers();
      this._installTrackHandlers();
      if (this.chunkInterval > 0) {
        this._mediaRecorder.start(this.chunkInterval);
      } else {
        this._mediaRecorder.start();
      }
      this._setState('recording', { reason });
      this._emit('sn-screencast-start', this._detail({ reason }));
      return this;
    } catch (error) {
      stopStreamTracks(this._stream);
      if (this._displayStream && this._displayStream !== this._stream) stopStreamTracks(this._displayStream);
      await closeAudioInput(this._extraAudioInput).catch(() => {});
      this._stream = null;
      this._displayStream = null;
      this._extraAudioInput = null;
      this._extraAudioTracks = [];
      this._mediaRecorder = null;
      this._activeFilename = '';
      this._setState('idle', { reason, error });
      throw this._emitError(error, { reason });
    }
  }

  async stop(reason = 'api') {
    if (this.state === 'idle') return this._stopPromise || undefined;
    if (this.state === 'stopping') return this._stopPromise || undefined;

    this._setState('stopping', { reason });
    this._stopPromise = new Promise((resolve) => {
      this._resolveStop = resolve;
    });

    if (this._mediaRecorder?.state === 'recording') {
      this._mediaRecorder.stop();
    } else {
      this._finishStop(reason);
    }
    return this._stopPromise;
  }

  dispose() {
    this.unbindHotkeys();
    if (this.state !== 'idle') {
      this.stop('dispose').catch(() => {});
    }
  }

  _handleKeydown(event) {
    if (!matchesScreencastHotkey(event, this.state === 'recording' ? this.stopHotkey : this.hotkey)) return;
    event.preventDefault?.();
    if (this.stopPropagation) event.stopPropagation?.();
    this.toggle('hotkey').catch(() => {});
  }

  _installRecorderHandlers() {
    let recorder = this._mediaRecorder;
    recorder.addEventListener?.('dataavailable', (event) => {
      if (event?.data?.size > 0) this._chunks.push(event.data);
    });
    recorder.addEventListener?.('stop', () => this._finishStop('recorder-stop'));
    recorder.addEventListener?.('error', (event) => {
      this._emitError(event?.error || new Error('Screencast recording failed'), { reason: 'recorder-error' });
    });
  }

  _installTrackHandlers() {
    for (let track of this._stream?.getVideoTracks?.() || []) {
      track.addEventListener?.('ended', () => {
        if (this.state === 'recording') this.stop('track-ended').catch(() => {});
      }, { once: true });
    }
  }

  async _finishStop(reason) {
    let recorder = this._mediaRecorder;
    let type = recorder?.mimeType || this._mimeType || 'video/webm';
    let blob = new Blob(this._chunks, { type });
    let filename = this._activeFilename || createFilename(this.filename, this.filenamePrefix);
    let capture = {
      ...(this._captureDiagnostics || getCaptureDiagnostics(this._stream, this.captureOptions)),
      extraAudioTrackCount: this._extraAudioTracks.length,
    };

    stopStreamTracks(this._stream);
    if (this._displayStream && this._displayStream !== this._stream) stopStreamTracks(this._displayStream);
    await closeAudioInput(this._extraAudioInput).catch(() => {});
    this._stream = null;
    this._displayStream = null;
    this._extraAudioInput = null;
    this._extraAudioTracks = [];
    this._mediaRecorder = null;
    this._chunks = [];
    this._activeFilename = '';
    this._setState('idle', { reason });
    let detail = this._detail({ reason, blob, filename, type, capture });
    this._emit('sn-screencast-ready', detail);
    if (this.download && blob.size > 0) {
      detail.downloaded = downloadBlob(blob, filename, this.document, this.URL);
    }
    this._emit('sn-screencast-stop', detail);
    this._resolveStop?.(detail);
    this._resolveStop = null;
    this._stopPromise = null;
  }

  _detail(extra = {}) {
    let capture = extra.capture || this._captureDiagnostics || getCaptureDiagnostics(this._stream, this.captureOptions);
    if (capture && capture.extraAudioTrackCount == null) {
      capture = { ...capture, extraAudioTrackCount: this._extraAudioTracks.length };
    }
    return {
      state: this.state,
      startedAt: this._startedAt,
      elapsedMs: this._startedAt ? Date.now() - this._startedAt : 0,
      mimeType: this._mimeType,
      hotkey: { ...this.hotkey },
      ...extra,
      capture,
    };
  }

  _setState(state, detail = {}) {
    if (this.state === state) return;
    this.state = state;
    this._emit('sn-screencast-state-change', this._detail(detail));
  }

  _emit(type, detail = {}) {
    let eventDetail = { ...detail, recorder: this };
    emit(this, type, eventDetail);
    emit(this.eventTarget, type, eventDetail);
  }

  _emitError(error, detail = {}) {
    let normalized = error instanceof Error ? error : new Error(String(error || 'Screencast recording failed'));
    this._emit('sn-screencast-error', { ...detail, error: normalized });
    return normalized;
  }
}

export function createScreencastRecorder(options = {}) {
  return new ScreencastRecorder(options);
}

export function installScreencastHotkeys(options = {}) {
  let recorder = createScreencastRecorder(options);
  recorder.bindHotkeys(options.hotkeyTarget || options.target || recorder.document);
  return recorder;
}
