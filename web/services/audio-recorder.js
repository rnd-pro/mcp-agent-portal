/**
 * AudioRecorder — voice input service.
 *
 * Strategy 1 (priority): Web Speech API — free, local on Mac/Chrome.
 * Strategy 2 (fallback):  MediaRecorder → base64 audio for server transcription.
 */
export class AudioRecorder {
  constructor() {
    this.state = 'idle'; // idle | starting | recording | processing
    this._onStateChange = null;
    this._onInterim = null;
    this._recognition = null;
    this._mediaRecorder = null;
    this._chunks = [];
    this._stream = null;
    this._resultText = '';
    this._resolveStop = null;
    this._resolved = false;
    this._startTime = 0;
    this._elapsedTimer = null;
    this._language = '';
  }

  get isAvailable() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition || navigator.mediaDevices?.getUserMedia);
  }

  get hasSpeechRecognition() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  set onStateChange(fn) { this._onStateChange = fn; }
  set onInterim(fn) { this._onInterim = fn; }

  setLanguage(language = '') {
    this._language = String(language || '').trim();
  }

  get elapsed() {
    if (!this._startTime) return 0;
    return Math.floor((Date.now() - this._startTime) / 1000);
  }

  _setState(s) {
    this.state = s;
    this._onStateChange?.(s);
  }

  /**
   * Start recording.
   * Returns a promise that resolves once recording has actually started,
   * or rejects if mic/permission fails.
   */
  async start() {
    if (this.state !== 'idle') return;
    this._setState('starting');

    try {
      if (this.hasSpeechRecognition) {
        await this._startSpeechRecognition();
      } else {
        await this._startMediaRecorder();
      }
    } catch (err) {
      this._setState('idle');
      throw err;
    }
  }

  /** Force MediaRecorder start (fallback when Speech API fails). */
  async startMediaRecorder() {
    if (this.state !== 'idle') return;
    this._setState('starting');
    try {
      await this._startMediaRecorder();
    } catch (err) {
      this._setState('idle');
      throw err;
    }
  }

  /** Stop recording and return result. */
  async stop() {
    if (this.state !== 'recording') return { text: '' };
    this._setState('processing');
    this._resolved = false;

    if (this._recognition) {
      return new Promise((resolve) => {
        this._resolveStop = resolve;
        this._recognition.stop();
      });
    }

    if (this._mediaRecorder) {
      return new Promise((resolve) => {
        this._resolveStop = resolve;
        this._mediaRecorder.stop();
      });
    }

    this._setState('idle');
    return { text: '' };
  }

  /** Cancel without result. */
  cancel() {
    if (this._recognition) {
      this._recognition.onresult = null;
      this._recognition.onend = null;
      this._recognition.onerror = null;
      this._recognition.abort();
      this._recognition = null;
    }
    if (this._mediaRecorder) {
      this._mediaRecorder.onstop = null;
      this._mediaRecorder.onerror = null;
      try { this._mediaRecorder.stop(); } catch (_) { /* already stopped */ }
      this._mediaRecorder = null;
    }
    this._cleanupStream();
    this._chunks = [];
    this._resultText = '';
    this._resolveStop = null;
    this._resolved = false;
    this._setState('idle');
  }

  async restartSpeechRecognition(language = '', { initialText = this._resultText.trim() } = {}) {
    this.setLanguage(language);
    if (this.state !== 'recording' || !this._recognition) return false;

    let startTime = this._startTime || Date.now();
    let recognition = this._recognition;
    recognition.onresult = null;
    recognition.onend = null;
    recognition.onerror = null;
    try { recognition.abort(); } catch (_) { /* already stopped */ }
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

  // ── Resolve helper (prevents double-resolve from onerror + onend) ──

  _finish(result) {
    if (this._resolved) return;
    this._resolved = true;
    this._recognition = null;
    this._startTime = 0;
    this._setState('idle');
    this._resolveStop?.(result);
    this._resolveStop = null;
  }

  // ── Web Speech API ──

  _recognitionLanguage() {
    return this._language || navigator.language || 'en-US';
  }

  _startSpeechRecognition({ initialText = '', startTime = 0 } = {}) {
    return new Promise((resolveStart, rejectStart) => {
      let SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      let recognition = new SpeechRecognition();
      recognition.lang = this._recognitionLanguage();
      recognition.interimResults = true;
      recognition.continuous = true;

      this._resultText = initialText;
      this._recognition = recognition;
      let started = false;

      recognition.onstart = () => {
        if (started) return;
        started = true;
        this._startTime = startTime || Date.now();
        this._setState('recording');
        resolveStart();
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        this._resultText = [initialText, transcript].filter(Boolean).join(' ').trim();
        this._onInterim?.(this._resultText);
      };

      recognition.onend = () => {
        let text = this._resultText.trim();
        this._finish({ text });
        if (!started) {
          started = true;
          rejectStart(new Error('Speech recognition ended before starting'));
        }
      };

      recognition.onerror = (event) => {
        console.warn('[AudioRecorder] Speech recognition error:', event.error);
        this._finish({ text: '' });
        if (!started) {
          started = true;
          rejectStart(new Error(`Speech recognition error: ${event.error}`));
        }
      };

      try {
        recognition.start();
      } catch (err) {
        this._recognition = null;
        rejectStart(err);
      }
    });
  }

  // ── MediaRecorder fallback ──

  async _startMediaRecorder() {
    let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Guard: if cancel() was called while waiting for getUserMedia
    if (this.state !== 'starting') {
      for (let track of stream.getTracks()) track.stop();
      return;
    }

    this._stream = stream;

    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
    }

    let recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this._mediaRecorder = recorder;
    this._chunks = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this._chunks.push(event.data);
    };

    recorder.onstop = () => {
      let blob = new Blob(this._chunks, { type: recorder.mimeType });
      this._chunks = [];
      this._mediaRecorder = null;
      this._cleanupStream();

      this._blobToBase64(blob).then((audioBase64) => {
        this._finish({ text: '', audioBase64, mimeType: recorder.mimeType });
      });
    };

    recorder.onerror = () => {
      this._mediaRecorder = null;
      this._cleanupStream();
      this._finish({ text: '' });
    };

    recorder.start();
    this._startTime = Date.now();
    this._elapsedTimer = setInterval(() => {
      this._onInterim?.(null, this.elapsed);
    }, 500);
    this._setState('recording');
  }

  _cleanupStream() {
    if (this._elapsedTimer) {
      clearInterval(this._elapsedTimer);
      this._elapsedTimer = null;
    }
    this._startTime = 0;
    if (this._stream) {
      for (let track of this._stream.getTracks()) track.stop();
      this._stream = null;
    }
  }

  _blobToBase64(blob) {
    return new Promise((resolve) => {
      let reader = new FileReader();
      reader.onloadend = () => {
        let base64 = reader.result.split(',')[1] || '';
        resolve(base64);
      };
      reader.readAsDataURL(blob);
    });
  }
}
