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

function createRuntimeEvent(type, detail = {}) {
  if (typeof CustomEvent !== 'undefined') return new CustomEvent(type, { detail });
  if (typeof Event !== 'undefined') {
    let event = new Event(type);
    event.detail = detail;
    return event;
  }
  return { type, detail };
}

function stopStreamTracks(stream) {
  for (let track of stream?.getTracks?.() || []) {
    track.stop?.();
  }
}

function getSpeechRecognitionConstructor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function mediaRecorderSupports(mimeType) {
  return typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function' &&
    MediaRecorder.isTypeSupported(mimeType);
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('FileReader API not supported'));
      return;
    }
    let reader = new FileReader();
    reader.onloadend = () => {
      let value = String(reader.result || '');
      resolve(value.includes(',') ? value.split(',')[1] || '' : value);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Product-neutral browser voice capture and speech recognition runtime.
 * Node-safe at module import time: no top-level DOM or navigator access.
 */
export class VoiceRuntime extends RuntimeEventTarget {
  constructor({
    chunkInterval = 250,
    mediaConstraints = { audio: true },
    preferredMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'],
  } = {}) {
    super();
    this.state = 'idle';
    this.language = '';
    this.mode = 'speech';
    this.chunkInterval = chunkInterval;
    this.mediaConstraints = mediaConstraints;
    this.preferredMimeTypes = [...preferredMimeTypes];

    this._stream = null;
    this._mediaRecorder = null;
    this._chunks = [];
    this._recognition = null;
    this._resultText = '';
    this._startTime = 0;
    this._elapsedTimer = null;
    this._resolveStop = null;
    this._resolved = false;
    this._onStateChange = null;
    this._onInterim = null;
  }

  static get isAvailable() {
    return this.hasSpeechRecognition || this.hasMediaCapture;
  }

  static get hasSpeechRecognition() {
    return Boolean(getSpeechRecognitionConstructor());
  }

  static get hasMediaCapture() {
    return typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia);
  }

  static get hasMediaRecorder() {
    return typeof MediaRecorder !== 'undefined';
  }

  get isAvailable() {
    return VoiceRuntime.isAvailable;
  }

  get hasSpeechRecognition() {
    return VoiceRuntime.hasSpeechRecognition;
  }

  get hasMediaCapture() {
    return VoiceRuntime.hasMediaCapture;
  }

  get hasMediaRecorder() {
    return VoiceRuntime.hasMediaRecorder;
  }

  get elapsed() {
    if (!this._startTime) return 0;
    return Math.floor((Date.now() - this._startTime) / 1000);
  }

  set onStateChange(fn) {
    this._onStateChange = typeof fn === 'function' ? fn : null;
  }

  set onInterim(fn) {
    this._onInterim = typeof fn === 'function' ? fn : null;
  }

  setLanguage(lang = '') {
    this.language = String(lang).trim();
    if (this._recognition) {
      this._recognition.lang = this._recognitionLanguage();
    }
  }

  _recognitionLanguage() {
    return this.language || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
  }

  async checkPermission() {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      return 'prompt';
    }
    try {
      const status = await navigator.permissions.query({ name: 'microphone' });
      return status.state; // 'granted' | 'prompt' | 'denied'
    } catch (_) {
      return 'prompt';
    }
  }

  async requestPermission() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('MediaDevices API not supported');
    }
    let stream = await navigator.mediaDevices.getUserMedia(this.mediaConstraints);
    try {
      return 'granted';
    } finally {
      stopStreamTracks(stream);
    }
  }

  _setState(nextState) {
    if (this.state === nextState) return;
    this.state = nextState;
    this._onStateChange?.(nextState);
    this.dispatchEvent(createRuntimeEvent('statechange', { state: nextState }));
  }

  async start({ language = this.language, mode = 'speech' } = {}) {
    if (this.state !== 'idle') return;
    this.language = language;
    this.mode = mode;
    this._setState('starting');
    this._resolved = false;

    try {
      if (mode === 'speech' && VoiceRuntime.hasSpeechRecognition) {
        await this._startSpeechRecognition();
      } else {
        await this._startMediaRecorder();
      }
    } catch (err) {
      this._cleanupStream();
      this._setState('idle');
      this.dispatchEvent(createRuntimeEvent('error', { error: err }));
      throw err;
    }
  }

  async startMediaRecorder() {
    return this.start({ language: this.language, mode: 'audio' });
  }

  async restartSpeechRecognition(language = '', { initialText = this._resultText.trim() } = {}) {
    this.setLanguage(language);
    if (this.state !== 'recording' || !this._recognition) return false;

    let startTime = this._startTime || Date.now();
    let recognition = this._recognition;
    recognition.onresult = null;
    recognition.onend = null;
    recognition.onerror = null;
    try { recognition.abort(); } catch (_) {}
    this._recognition = null;
    this._resolved = false;
    this._resolveStop = null;
    this._setState('starting');

    try {
      await this._startSpeechRecognition({ initialText, startTime });
      return true;
    } catch (err) {
      this._setState('idle');
      throw err;
    }
  }

  _startElapsedTimer() {
    if (this._elapsedTimer) clearInterval(this._elapsedTimer);
    this._elapsedTimer = setInterval(() => {
      this._onInterim?.(null, this.elapsed);
      this.dispatchEvent(createRuntimeEvent('elapsedchange', { elapsed: this.elapsed }));
    }, 500);
  }

  async _startSpeechRecognition({ initialText = '', startTime = 0 } = {}) {
    return new Promise((resolve, reject) => {
      const SpeechRecognition = getSpeechRecognitionConstructor();
      if (!SpeechRecognition) {
        reject(new Error('SpeechRecognition API not supported'));
        return;
      }
      const rec = new SpeechRecognition();
      rec.lang = this._recognitionLanguage();
      rec.interimResults = true;
      rec.continuous = true;

      this._resultText = initialText;
      this._recognition = rec;
      let started = false;

      rec.onstart = () => {
        if (started) return;
        started = true;
        this._startTime = startTime || Date.now();
        this._startElapsedTimer();
        this._setState('recording');
        resolve();
      };

      rec.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        this._resultText = [initialText, transcript].filter(Boolean).join(' ').trim();
        this._onInterim?.(this._resultText);
        this.dispatchEvent(createRuntimeEvent('speechresult', {
          text: this._resultText,
          isFinal: Boolean(event.results[event.results.length - 1]?.isFinal),
        }));
      };

      rec.onend = () => {
        this._finish({ text: this._resultText });
        if (!started) {
          started = true;
          reject(new Error('Speech recognition ended before starting'));
        }
      };

      rec.onerror = (event) => {
        this._finish({ text: '' });
        const err = new Error(`Speech recognition error: ${event.error}`);
        if (!started) {
          started = true;
          reject(err);
        } else {
          this.dispatchEvent(createRuntimeEvent('error', { error: err }));
        }
      };

      try {
        rec.start();
      } catch (err) {
        this._recognition = null;
        reject(err);
      }
    });
  }

  async _startMediaRecorder() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('MediaDevices API not supported');
    }
    const stream = await navigator.mediaDevices.getUserMedia(this.mediaConstraints);
    if (this.state !== 'starting') {
      stopStreamTracks(stream);
      return;
    }

    this._stream = stream;
    if (typeof MediaRecorder === 'undefined') {
      this._cleanupStream();
      throw new Error('MediaRecorder not supported');
    }
    let mimeType = this.preferredMimeTypes.find((type) => mediaRecorderSupports(type)) || '';

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this._mediaRecorder = recorder;
    this._chunks = [];

    recorder.ondataavailable = (event) => {
      if (event.data?.size > 0) {
        this._chunks.push(event.data);
        this.dispatchEvent(createRuntimeEvent('audiochunk', { chunk: event.data }));
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(this._chunks, { type: recorder.mimeType });
      this._chunks = [];
      this._mediaRecorder = null;
      this._cleanupStream();
      this.dispatchEvent(createRuntimeEvent('audioblob', { blob, mimeType: recorder.mimeType }));
      this._finish({ text: '', blob, mimeType: recorder.mimeType });
    };

    recorder.onerror = (event) => {
      this._mediaRecorder = null;
      this._cleanupStream();
      this._finish({ text: '' });
      this.dispatchEvent(createRuntimeEvent('error', { error: event.error || new Error('MediaRecorder error') }));
    };

    recorder.start(this.chunkInterval);
    this._startTime = Date.now();
    this._startElapsedTimer();
    this._setState('recording');
  }

  _cleanupStream() {
    if (this._elapsedTimer) {
      clearInterval(this._elapsedTimer);
      this._elapsedTimer = null;
    }
    this._startTime = 0;
    if (this._stream) {
      for (const track of this._stream.getTracks()) track.stop();
      this._stream = null;
    }
  }

  _finish(result) {
    if (this._resolved) return;
    this._resolved = true;
    this._recognition = null;
    this._cleanupStream();
    this._setState('idle');
    if (this._resolveStop) {
      this._resolveStop(result);
      this._resolveStop = null;
    }
  }

  async stop() {
    if (this.state !== 'recording' && this.state !== 'starting') {
      return { text: '' };
    }
    this._setState('processing');

    return new Promise((resolve) => {
      this._resolveStop = resolve;
      if (this._recognition) {
        this._recognition.stop();
      } else if (this._mediaRecorder) {
        if (this._mediaRecorder.state === 'inactive') {
          this._finish({ text: '' });
        } else {
          this._mediaRecorder.stop();
        }
      } else {
        this._finish({ text: '' });
      }
    });
  }

  cancel() {
    if (this._recognition) {
      this._recognition.onresult = null;
      this._recognition.onend = null;
      this._recognition.onerror = null;
      try { this._recognition.abort(); } catch (_) {}
      this._recognition = null;
    }
    if (this._mediaRecorder) {
      this._mediaRecorder.ondataavailable = null;
      this._mediaRecorder.onstop = null;
      this._mediaRecorder.onerror = null;
      try { this._mediaRecorder.stop(); } catch (_) {}
      this._mediaRecorder = null;
    }
    this._cleanupStream();
    this._chunks = [];
    this._resultText = '';
    this._finish({ text: '', cancelled: true });
    this._setState('idle');
  }

  destroy() {
    this.cancel();
  }
}
