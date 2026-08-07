/**
 * ai/replicate-lipsync — Replicate API lip-sync via Kling model
 *
 * Alternative lipsync provider using Replicate API.
 * Model: kwaivgi/kling-lip-sync (~$0.014/second of output)
 * Simpler than direct Kling API — just video URL + audio URL → result.
 *
 * Supports:
 * - Single segment processing
 * - Batch processing with worker pool
 * - Tunnel validation (cloudflared/ngrok)
 *
 * Ported from Mr-Computer/modules/ai-music-video/src/services/replicate-lipsync.js
 *
 * @module symbiote-engine/packs/ai/replicate-lipsync
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { runCommandWithWatchdog } from './run-command-watchdog.js';

function requestSignal(timeoutMs, parentSignal) {
  let timeoutSignal = AbortSignal.timeout(timeoutMs);
  return parentSignal && AbortSignal.any
    ? AbortSignal.any([parentSignal, timeoutSignal])
    : timeoutSignal;
}

export default {
  type: 'ai/replicate-lipsync',
  category: 'ai',
  icon: 'mic',

  driver: {
    description: 'Replicate API lipsync via kwaivgi/kling-lip-sync model',
    inputs: [
      { name: 'videoUrl', type: 'string' },
      { name: 'audioPath', type: 'string' },
    ],
    outputs: [
      { name: 'result', type: 'any' },
      { name: 'error', type: 'string' },
    ],
    params: {
      operation: {
        type: 'string',
        default: 'process',
        description: 'Operation: process | batch | validate-tunnel',
      },
      replicateToken: { type: 'string', default: '', description: 'Replicate API token' },
      publicBaseUrl: { type: 'string', default: '', description: 'Public URL for file server' },
      outputDir: {
        type: 'string',
        default: '/tmp/replicate-lipsync',
        description: 'Output directory',
      },
      segmentId: { type: 'string', default: '', description: 'Segment identifier' },
      startTime: { type: 'number', default: 0, description: 'Audio start time (seconds)' },
      endTime: { type: 'number', default: 0, description: 'Audio end time (seconds)' },
      maxWaitMs: { type: 'int', default: 300000, description: 'Max poll wait time (ms)' },

      segments: { type: 'any', default: null, description: 'Segments array' },
      videoMap: { type: 'any', default: null, description: 'Map of promptId → videoUrl' },
      concurrency: { type: 'int', default: 3, description: 'Max concurrent tasks' },
    },
  },

  lifecycle: {
    validate: (inputs, params) => {
      if (params.operation === 'validate-tunnel') return !!params.publicBaseUrl;
      if (!params.replicateToken) return false;
      if (params.operation === 'process' && (!inputs.videoUrl || !inputs.audioPath)) return false;
      if (params.operation === 'batch' && (!params.segments || !inputs.audioPath)) return false;
      return true;
    },

    cacheKey: (inputs, params) => {
      return `replicate:${params.operation}:${params.segmentId || ''}`;
    },

    execute: async (inputs, params) => {
      try {
        let op = params.operation;

        if (op === 'validate-tunnel') {
          let valid = await validateTunnel(params.publicBaseUrl);
          return { result: { valid }, error: null };
        }

        if (op === 'process') {
          let result = await processSegment(inputs, params);
          return { result, error: null };
        }

        if (op === 'batch') {
          let results = await processBatch(inputs, params);
          return {
            result: { processed: results.size, results: Object.fromEntries(results) },
            error: null,
          };
        }

        return { result: null, error: `Unknown operation: ${op}` };
      } catch (err) {
        return { result: null, error: err.message };
      }
    },
  },
};


/**
 * Create prediction on Replicate
 * @param {string} videoUrl
 * @param {string} audioUrl - Public URL or data URI
 * @param {string} token
 * @param {AbortSignal} [signal]
 * @returns {Promise<Object>}
 */
async function createPrediction(videoUrl, audioUrl, token, signal) {
  let response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    },
    body: JSON.stringify({
      version: 'kwaivgi/kling-lip-sync',
      input: {
        video: videoUrl,
        audio: audioUrl,
      },
    }),
    signal: requestSignal(120000, signal),
  });

  if (!response.ok) {
    let error = await response.text();
    throw new Error(`Replicate API error ${response.status}: ${error}`);
  }

  return await response.json();
}

/**
 * Poll for prediction completion
 * @param {string} predictionId
 * @param {string} token
 * @param {number} maxWaitMs
 * @param {AbortSignal} [signal]
 * @returns {Promise<Object>}
 */
async function pollPrediction(predictionId, token, maxWaitMs = 300000, signal) {
  let startTime = Date.now();
  let pollInterval = 5000;

  while (Date.now() - startTime < maxWaitMs) {
    let response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: requestSignal(30000, signal),
    });

    if (!response.ok) {
      throw new Error(`Replicate poll error: ${response.status}`);
    }

    let prediction = await response.json();

    if (prediction.status === 'succeeded') {
      return prediction;
    }
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(
        `Replicate prediction ${prediction.status}: ${prediction.error || 'Unknown'}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Replicate prediction timed out after ${maxWaitMs / 1000}s`);
}

/**
 * Download result video
 * @param {string} videoUrl
 * @param {string} outputPath
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>}
 */
async function downloadResult(videoUrl, outputPath, signal) {
  let response = await fetch(videoUrl, {
    signal: requestSignal(120000, signal),
  });
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }

  let buffer = await response.arrayBuffer();
  await writeFile(outputPath, Buffer.from(buffer));
  return outputPath;
}


/**
 * Convert file to data URI
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function fileToDataUri(filePath) {
  let buffer = await readFile(path.resolve(filePath));
  let ext = path.extname(filePath).toLowerCase();
  let mimeTypes = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
  };
  let mime = mimeTypes[ext] || 'application/octet-stream';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/**
 * Extract audio clip using FFmpeg
 * @param {string} audioPath
 * @param {number} startTime
 * @param {number} endTime
 * @param {string} outputPath
 * @returns {string}
 */
async function extractAudioClip(audioPath, startTime, endTime, outputPath) {
  if (existsSync(outputPath)) return outputPath;

  let duration = endTime - startTime;
  let cmd =
    `ffmpeg -y -i "${path.resolve(audioPath)}" -ss ${startTime.toFixed(3)} -t ${duration.toFixed(3)} ` +
    `-c:a libmp3lame -q:a 2 "${outputPath}" 2>/dev/null`;

  await runCommandWithWatchdog(cmd, {
    inactivityMs: 120000,
    timeoutMs: 120000,
  });
  return outputPath;
}

/**
 * Get public URL for local file
 * @param {string} filePath
 * @param {string} publicBaseUrl
 * @returns {string}
 */
function getPublicUrl(filePath, publicBaseUrl) {
  let absPath = path.resolve(filePath);
  return `${publicBaseUrl}/${encodeURIComponent(absPath)}`;
}

/**
 * Validate tunnel accessibility
 * @param {string} publicBaseUrl
 * @returns {Promise<boolean>}
 */
async function validateTunnel(publicBaseUrl) {
  try {
    let controller = new AbortController();
    let timeout = setTimeout(() => controller.abort(), 10000);
    let response = await fetch(publicBaseUrl, { signal: controller.signal });
    clearTimeout(timeout);
    return response.status < 500;
  } catch {
    return false;
  }
}


/**
 * Process single segment
 * @param {Object} inputs
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function processSegment(inputs, params) {
  let { segmentId, startTime, endTime, outputDir, replicateToken, publicBaseUrl } = params;

  let lipsyncDir = path.join(outputDir, 'lipsync-videos');
  let clipsDir = path.join(outputDir, 'audio-clips');
  await mkdir(lipsyncDir, { recursive: true });
  await mkdir(clipsDir, { recursive: true });

  let outputPath = path.join(lipsyncDir, `${segmentId}.mp4`);
  if (existsSync(outputPath)) {
    return { videoPath: outputPath, cached: true };
  }


  let clipPath = path.join(clipsDir, `${segmentId}.mp3`);
  await extractAudioClip(inputs.audioPath, startTime, endTime, clipPath);


  let audioUrl;
  if (publicBaseUrl) {
    audioUrl = getPublicUrl(clipPath, publicBaseUrl);
  } else {
    audioUrl = await fileToDataUri(clipPath);
  }


  let prediction = await createPrediction(inputs.videoUrl, audioUrl, replicateToken, params.signal);


  let result = prediction;
  if (prediction.status !== 'succeeded') {
    result = await pollPrediction(prediction.id, replicateToken, params.maxWaitMs, params.signal);
  }


  let resultUrl = result.output;
  if (!resultUrl) {
    throw new Error('No output URL in prediction result');
  }

  await downloadResult(resultUrl, outputPath, params.signal);
  return { videoPath: outputPath, predictionId: prediction.id, cached: false };
}

/**
 * Process batch with worker pool
 * @param {Object} inputs
 * @param {Object} params
 * @returns {Promise<Map>}
 */
async function processBatch(inputs, params) {
  let segments = params.segments;
  let videoMap = params.videoMap || {};
  let concurrency = params.concurrency;
  let results = new Map();
  let failures = [];
  let queue = [...segments];

  let workers = Array(Math.min(concurrency, queue.length))
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        let segment = queue.shift();
        if (!segment) break;

        let videoUrl = videoMap[segment.promptId];
        if (!videoUrl) {
          failures.push(`${segment.promptId}: missing videoUrl`);
          continue;
        }

        try {
          let segParams = {
            ...params,
            segmentId: segment.promptId,
            startTime: segment.start,
            endTime: segment.end,
          };

          let result = await processSegment({ videoUrl, audioPath: inputs.audioPath }, segParams);
          results.set(segment.promptId, result.videoPath);
        } catch (error) {
          failures.push(`${segment.promptId}: ${error.message}`);
        }
      }
    });

  await Promise.all(workers);

  if (failures.length > 0) {
    throw new Error(`Replicate batch failed for ${failures.length} segment(s): ${failures.join('; ')}`);
  }

  return results;
}
