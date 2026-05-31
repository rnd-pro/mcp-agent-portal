/**
 * AudioRecorder — voice input service.
 *
 * Strategy 1 (priority): Web Speech API — free, local on Mac/Chrome.
 * Strategy 2 (fallback):  MediaRecorder → base64 audio for server transcription.
 */
export class AudioRecorder {
  constructor() {
    this.state = 'idle'; // idle | recording | processing
    this._onStateChange = null;
    this._recognition = null;
    this._mediaRecorder = null;
    this._chunks = [];
    this._stream = null;
    this._resultText = '';
    this._resolveStop = null;
  }

  get isAvailable() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition || navigator.mediaDevices?.getUserMedia);
  }

  get hasSpeechRecognition() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  set onStateChange(fn) { this._onStateChange = fn; }

  _setState(s) {
    this.state = s;
    this._onStateChange?.(s);
  }

  /**
   * Start recording.
   * Returns a promise that resolves with { text, audioBase64?, mimeType? }
   */
  async start() {
    if (this.state !== 'idle') return;

    if (this.hasSpeechRecognition) {
      return this._startSpeechRecognition();
    }
    return this._startMediaRecorder();
  }

  /** Stop recording and return result. */
  async stop() {
    if (this.state !== 'recording') return { text: '' };
    this._setState('processing');

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
    this._setState('idle');
  }

  // ── Web Speech API ──

  _startSpeechRecognition() {
    let SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = new SpeechRecognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    this._resultText = '';
    this._recognition = recognition;

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      this._resultText = transcript;
    };

    recognition.onend = () => {
      let text = this._resultText.trim();
      this._recognition = null;
      this._setState('idle');
      this._resolveStop?.({ text });
      this._resolveStop = null;
    };

    recognition.onerror = (event) => {
      console.warn('[AudioRecorder] Speech recognition error:', event.error);
      this._recognition = null;
      this._setState('idle');
      this._resolveStop?.({ text: '' });
      this._resolveStop = null;
    };

    recognition.start();
    this._setState('recording');
  }

  // ── MediaRecorder fallback ──

  async _startMediaRecorder() {
    let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        this._setState('idle');
        this._resolveStop?.({ text: '', audioBase64, mimeType: recorder.mimeType });
        this._resolveStop = null;
      });
    };

    recorder.onerror = () => {
      this._mediaRecorder = null;
      this._cleanupStream();
      this._setState('idle');
      this._resolveStop?.({ text: '' });
      this._resolveStop = null;
    };

    recorder.start();
    this._setState('recording');
  }

  _cleanupStream() {
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
