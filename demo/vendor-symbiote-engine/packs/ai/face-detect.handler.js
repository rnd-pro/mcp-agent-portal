/**
 * ai/face-detect — Face detection via HTTP API (InsightFace SCRFD GPU)
 *
 * Client for a configured remote face detection service.
 * Supports SSH tunnel for local access.
 *
 * Operations:
 * - analyze:    Video face detection (suitable for lipsync?)
 * - track:      Dense face tracking with mouth + bbox
 * - track-gpu:  GPU InsightFace tracking with landmarks, age, gender
 * - mouth:      Mouth position detection (for speech bubble placement)
 * - frames-gpu: Face tracking on WebP frame sequences
 *
 * @module symbiote-engine/packs/ai/face-detect
 */

import path from 'path';
import os from 'os';
import { runCommandWithWatchdog } from './run-command-watchdog.js';

function requestSignal(timeoutMs, parentSignal) {
  let timeoutSignal = AbortSignal.timeout(timeoutMs);
  return parentSignal && AbortSignal.any
    ? AbortSignal.any([parentSignal, timeoutSignal])
    : timeoutSignal;
}

export default {
  type: 'ai/face-detect',
  category: 'ai',
  icon: 'face',

  driver: {
    description: 'Face detection via HTTP API — tracking, mouth position, landmarks',
    inputs: [{ name: 'mediaPath', type: 'string' }],
    outputs: [
      { name: 'result', type: 'any' },
      { name: 'detected', type: 'boolean' },
      { name: 'error', type: 'string' },
    ],
    params: {
      operation: {
        type: 'string',
        default: 'analyze',
        description: 'analyze | track | track-gpu | mouth | frames-gpu',
      },
      endpoint: {
        type: 'string',
        default: 'http://localhost:5050',
        description: 'Face detection service URL',
      },
      minCoverage: {
        type: 'number',
        default: 5,
        description: 'Minimum face coverage % (analyze mode)',
      },
      step: { type: 'int', default: 3, description: 'Frame sampling interval (track modes)' },
      fps: { type: 'int', default: 30, description: 'FPS for frames-gpu mode' },
      remoteHost: {
        type: 'string',
        default: '',
        description: 'SSH host for SCP uploads',
      },
      useRemotePath: {
        type: 'boolean',
        default: false,
        description: 'Send file path instead of uploading (when on same server)',
      },
      timeout: { type: 'int', default: 120000, description: 'Max wait time (ms)' },
    },
  },

  lifecycle: {
    validate: (inputs) => {
      if (!inputs.mediaPath) return false;
      return true;
    },

    cacheKey: (inputs, params) => `face:${params.operation}:${params.step}:${inputs.mediaPath}`,

    execute: async (inputs, params) => {
      let { mediaPath } = inputs;
      let op = params.operation || 'analyze';

      let ops = { analyze, track, 'track-gpu': trackGpu, mouth, 'frames-gpu': framesGpu };
      let handler = ops[op];
      if (!handler) {
        return { result: null, detected: false, error: `Unknown operation: ${op}` };
      }

      return handler(mediaPath, params);
    },
  },
};

/**
 * Check if the current host should use local media paths.
 * @returns {boolean}
 */
function isOnServer() {
  try {
    let marker = process.env.FACE_LOCAL_HOST_MARKER;
    return Boolean(marker && os.hostname().includes(marker));
  } catch {
    return false;
  }
}

function resolveRemoteHost(params) {
  return params.remoteHost || process.env.FACE_REMOTE_HOST || '';
}

function requireRemoteHost(host) {
  if (!host) {
    throw new Error('Face detection remote upload requires remoteHost or FACE_REMOTE_HOST');
  }
}

/**
 * Upload file to remote server via SCP if needed
 * @param {string} localPath - Local file path
 * @param {string} host - SSH host
 * @param {{useRemotePath?: boolean}} params
 * @returns {{remotePath: string, cleanup: boolean}}
 */
async function prepareRemotePath(localPath, host, params) {
  if (params.useRemotePath || isOnServer()) {
    return { remotePath: path.resolve(localPath), cleanup: false };
  }

  requireRemoteHost(host);
  let filename = `face_${Date.now()}_${path.basename(localPath)}`;
  let remotePath = `/tmp/${filename}`;

  await runCommandWithWatchdog(`scp -q "${path.resolve(localPath)}" "${host}:${remotePath}"`, {
    inactivityMs: 60000,
    timeoutMs: 60000,
  });

  return { remotePath, cleanup: true };
}

/**
 * Clean up remote file
 * @param {string} remotePath
 * @param {string} host
 */
async function cleanupRemote(remotePath, host) {
  try {
    await runCommandWithWatchdog(`ssh ${host} "rm -f ${remotePath}"`, {
      inactivityMs: 10000,
      timeoutMs: 10000,
    });
  } catch {

  }
}

/**
 * analyze — Video face detection suitability
 * @returns {Promise<object>}
 */
async function analyze(mediaPath, params) {
  let endpoint = params.endpoint || 'http://localhost:5050';
  let host = resolveRemoteHost(params);

  try {
    if (params.useRemotePath || isOnServer()) {
      let response = await fetch(`${endpoint}/analyze?min_coverage=${params.minCoverage || 5}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_path: path.resolve(mediaPath) }),
        signal: requestSignal(params.timeout || 120000, params.signal),
      });
      let result = await response.json();
      return { result, detected: result.suitable || false, error: null };
    }


    let { remotePath, cleanup } = await prepareRemotePath(mediaPath, host, params);
    try {
      let response = await fetch(`${endpoint}/analyze?min_coverage=${params.minCoverage || 5}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_path: remotePath }),
        signal: requestSignal(params.timeout || 120000, params.signal),
      });
      let result = await response.json();
      return { result, detected: result.suitable || false, error: null };
    } finally {
      if (cleanup) await cleanupRemote(remotePath, host);
    }
  } catch (err) {
    return { result: null, detected: false, error: err.message };
  }
}

/**
 * track — Dense face tracking with mouth + bbox
 * @returns {Promise<object>}
 */
async function track(mediaPath, params) {
  let endpoint = params.endpoint || 'http://localhost:5050';
  let host = resolveRemoteHost(params);

  try {
    let { remotePath, cleanup } = await prepareRemotePath(mediaPath, host, params);
    try {
      let response = await fetch(`${endpoint}/track-face`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_path: remotePath, step: params.step || 3 }),
        signal: requestSignal(params.timeout || 120000, params.signal),
      });
      let result = await response.json();
      result.detected = (result.detectedFrames || 0) > 0;
      return { result, detected: result.detected, error: null };
    } finally {
      if (cleanup) await cleanupRemote(remotePath, host);
    }
  } catch (err) {
    return { result: null, detected: false, error: err.message };
  }
}

/**
 * track-gpu — InsightFace GPU tracking with landmarks, bbox, age, gender
 * @returns {Promise<object>}
 */
async function trackGpu(mediaPath, params) {
  let endpoint = params.endpoint || 'http://localhost:5050';
  let host = resolveRemoteHost(params);

  try {
    let { remotePath, cleanup } = await prepareRemotePath(mediaPath, host, params);
    try {
      let response = await fetch(`${endpoint}/track-face-gpu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_path: remotePath, step: params.step || 1 }),
        signal: requestSignal(params.timeout || 120000, params.signal),
      });
      let result = await response.json();
      result.detected = (result.detectedFrames || 0) > 0;
      return { result, detected: result.detected, error: null };
    } finally {
      if (cleanup) await cleanupRemote(remotePath, host);
    }
  } catch (err) {
    return { result: null, detected: false, error: err.message };
  }
}

/**
 * mouth — Mouth position detection (for speech bubble placement)
 * @returns {Promise<object>}
 */
async function mouth(mediaPath, params) {
  let endpoint = params.endpoint || 'http://localhost:5050';
  let host = resolveRemoteHost(params);

  try {
    let { remotePath, cleanup } = await prepareRemotePath(mediaPath, host, params);
    try {
      let response = await fetch(`${endpoint}/analyze-mouth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_path: remotePath }),
        signal: requestSignal(params.timeout || 120000, params.signal),
      });
      let result = await response.json();
      return { result, detected: result.detected || false, error: null };
    } finally {
      if (cleanup) await cleanupRemote(remotePath, host);
    }
  } catch (err) {
    return { result: null, detected: false, error: err.message };
  }
}

/**
 * frames-gpu — GPU face tracking on WebP frame sequences
 * @returns {Promise<object>}
 */
async function framesGpu(mediaPath, params) {
  let endpoint = params.endpoint || 'http://localhost:5050';
  let host = resolveRemoteHost(params);

  try {
    let remotePath = path.resolve(mediaPath);
    let cleanup = false;


    if (!params.useRemotePath && !isOnServer()) {
      requireRemoteHost(host);
      let dirName = `face_frames_${Date.now()}`;
      remotePath = `/tmp/${dirName}`;

      await runCommandWithWatchdog(`rsync -az --quiet "${path.resolve(mediaPath)}/" "${host}:${remotePath}/"`, {
        inactivityMs: 120000,
        timeoutMs: 120000,
      });
      cleanup = true;
    }

    try {
      let response = await fetch(`${endpoint}/track-face-frames-gpu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frames_dir: remotePath,
          fps: params.fps || 30,
          step: params.step || 1,
        }),
        signal: requestSignal(params.timeout || 120000, params.signal),
      });
      let result = await response.json();
      result.detected = (result.detectedFrames || 0) > 0;
      return { result, detected: result.detected, error: null };
    } finally {
      if (cleanup) {
        try {
          await runCommandWithWatchdog(`ssh ${host} "rm -rf ${remotePath}"`, {
            inactivityMs: 10000,
            timeoutMs: 10000,
          });
        } catch {

        }
      }
    }
  } catch (err) {
    return { result: null, detected: false, error: err.message };
  }
}
