/**
 * Audio transcription route — POST /api/audio/transcribe.
 *
 * Sends base64 audio to a multimodal LLM for speech-to-text.
 * Provider priority:
 *   1. Current provider if it supports audio (gemini, opencode)
 *   2. Gemini API fallback (GEMINI_API_KEY)
 *   3. OpenRouter fallback (OPENROUTER_API_KEY)
 *
 * @module audio-transcribe-routes
 */
import { json, parseBody } from './http.js';

const AUDIO_CAPABLE_PROVIDERS = {
  gemini: true,
  opencode: true,
  claude: false,
  codex: false,
};

const TRANSCRIPTION_PROMPT = 'Transcribe this audio. Return ONLY the transcription text, nothing else. Do not add any commentary, labels, or formatting.';

// ── Gemini API (generativelanguage) ─────────────────────
async function transcribeViaGemini(audioBase64, mimeType, model) {
  let apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY or GOOGLE_API_KEY env var');

  let geminiModel = model || 'gemini-2.0-flash';
  let url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

  let response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: TRANSCRIPTION_PROMPT },
          { inline_data: { mime_type: mimeType, data: audioBase64 } },
        ],
      }],
      generationConfig: { temperature: 0 },
    }),
  });

  let data = await response.json();
  if (!response.ok) {
    let msg = data.error?.message || `Gemini API HTTP ${response.status}`;
    throw new Error(msg);
  }

  let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { text: text.trim(), provider: 'gemini', model: geminiModel };
}

// ── OpenRouter API ──────────────────────────────────────
async function transcribeViaOpenRouter(audioBase64, mimeType) {
  let apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY env var');

  let model = 'google/gemini-2.0-flash';

  let response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: TRANSCRIPTION_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${audioBase64}` } },
        ],
      }],
    }),
  });

  let data = await response.json();
  if (!response.ok) {
    let msg = data.error?.message || `OpenRouter HTTP ${response.status}`;
    throw new Error(msg);
  }

  let text = data.choices?.[0]?.message?.content || '';
  return { text: text.trim(), provider: 'opencode', model };
}

/**
 * @returns {Record<string, (req: any, res: any) => void>}
 */
export function createAudioTranscribeRoutes() {
  return {
    'POST /api/audio/transcribe': async (req, res) => {
      try {
        // Audio payloads can be large — allow up to 25 MB
        let body = await parseBody(req, 25 * 1024 * 1024);
        let { audio, mimeType, provider, model } = body;

        if (!audio) {
          json(res, { error: 'Missing "audio" field (base64 encoded)' }, 400);
          return;
        }

        let effectiveMime = mimeType || 'audio/webm';

        // Decide transcription backend
        let useProvider = null;
        if (provider && AUDIO_CAPABLE_PROVIDERS[provider]) {
          useProvider = provider;
        }

        // If the current provider can't handle audio, pick the best available
        if (!useProvider) {
          if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
            useProvider = 'gemini';
          } else if (process.env.OPENROUTER_API_KEY) {
            useProvider = 'opencode';
          }
        }

        let result;
        if (useProvider === 'gemini') {
          // For Gemini, map model names to API model IDs
          let geminiModel = null;
          if (provider === 'gemini' && model && model !== 'default') {
            geminiModel = model;
          }
          result = await transcribeViaGemini(audio, effectiveMime, geminiModel);
        } else if (useProvider === 'opencode') {
          result = await transcribeViaOpenRouter(audio, effectiveMime);
        } else {
          json(res, {
            error: 'No audio-capable provider available. Set GEMINI_API_KEY or OPENROUTER_API_KEY.',
          }, 503);
          return;
        }

        json(res, result);
      } catch (err) {
        console.error('[audio-transcribe] Error:', err.message);
        json(res, { error: err.message }, 500);
      }
    },
  };
}
