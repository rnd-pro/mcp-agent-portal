/**
 * ai/beat-detect — Audio beat detection via librosa (SSH)
 *
 * Analyzes audio files to extract:
 * - Beat timestamps and tempo (BPM)
 * - Waveform peaks (configurable resolution)
 * - Energy contour
 * - Quiet zones (silence detection)
 * - Strong onsets (transient detection)
 *
 * Uses Python librosa library on a configured remote server via SSH.
 *
 * @module symbiote-engine/packs/ai/beat-detect
 */

import { promises as fs } from 'fs';
import path from 'path';
import { runCommandWithWatchdog } from './run-command-watchdog.js';

function requestSignal(timeoutMs, parentSignal) {
  let timeoutSignal = AbortSignal.timeout(timeoutMs);
  return parentSignal && AbortSignal.any
    ? AbortSignal.any([parentSignal, timeoutSignal])
    : timeoutSignal;
}

export default {
  type: 'ai/beat-detect',
  category: 'ai',
  icon: 'graphic_eq',

  driver: {
    description: 'Audio beat detection via librosa — beats, tempo, peaks, energy',
    inputs: [{ name: 'audioPath', type: 'string' }],
    outputs: [
      { name: 'beats', type: 'any' },
      { name: 'tempo', type: 'number' },
      { name: 'peaks', type: 'any' },
      { name: 'energy', type: 'any' },
      { name: 'quietZones', type: 'any' },
      { name: 'strongOnsets', type: 'any' },
      { name: 'duration', type: 'number' },
      { name: 'error', type: 'string' },
    ],
    params: {
      mode: { type: 'string', default: 'ssh', description: 'ssh | http' },
      peaksPerSecond: { type: 'int', default: 10, description: 'Waveform peaks resolution' },
      sampleRate: { type: 'int', default: 22050, description: 'Audio sample rate for analysis' },
      hopLength: { type: 'int', default: 512, description: 'Hop length for beat tracking' },

      remoteHost: {
        type: 'string',
        default: '',
        description: 'SSH host',
      },
      remotePath: {
        type: 'string',
        default: '',
        description: 'Remote project path',
      },
      remoteVenv: {
        type: 'string',
        default: '',
        description: 'Remote Python venv',
      },
      scriptPath: {
        type: 'string',
        default: '',
        description: 'Local path to beat-detection.py (auto-resolved)',
      },

      endpoint: {
        type: 'string',
        default: 'http://localhost:5009',
        description: 'Beat detection HTTP endpoint',
      },
      timeout: { type: 'int', default: 180000, description: 'Max wait time (ms)' },
    },
  },

  lifecycle: {
    validate: (inputs) => {
      if (!inputs.audioPath) return false;
      return true;
    },

    cacheKey: (inputs, params) =>
      `beat:${params.mode}:${inputs.audioPath}:${params.peaksPerSecond}:${params.sampleRate}`,

    execute: async (inputs, params) => {
      let { audioPath } = inputs;
      let mode = params.mode || 'ssh';

      if (mode === 'http') {
        return executeHTTP(audioPath, params);
      }
      return executeSSH(audioPath, params);
    },
  },
};

/** @type {Object} Empty result template */
const EMPTY = {
  beats: null,
  tempo: 0,
  peaks: null,
  energy: null,
  quietZones: null,
  strongOnsets: null,
  duration: 0,
  error: null,
};

/**
 * SSH mode: upload audio → run librosa beat detection → parse JSON result
 * @param {string} audioPath - Local path to audio file
 * @param {Object} params - Node params
 * @returns {Promise<Object>}
 */
async function executeSSH(audioPath, params) {
  let host = params.remoteHost || process.env.BEAT_REMOTE_HOST || '';
  let remotePath = params.remotePath || process.env.BEAT_REMOTE_PATH || '';
  let venv = params.remoteVenv || process.env.BEAT_REMOTE_VENV || `${remotePath}/venv`;
  let sr = params.sampleRate || parseInt(process.env.BEAT_SAMPLE_RATE, 10) || 22050;
  let hop = params.hopLength || parseInt(process.env.BEAT_HOP_LENGTH, 10) || 512;
  let pps = params.peaksPerSecond || 10;
  let remoteTmpDir = '/tmp/symbiote-engine-beat';

  try {
    if (!host || !remotePath || !venv) {
      throw new Error('Beat detection SSH mode requires remoteHost, remotePath, and remoteVenv configuration');
    }

    await fs.access(audioPath);

    let filename = path.basename(audioPath);
    let remoteAudio = `${remoteTmpDir}/${filename}`;


    await runCommandWithWatchdog(`ssh ${host} "mkdir -p ${remoteTmpDir}"`, {
      inactivityMs: 10000,
      timeoutMs: 10000,
    });


    await runCommandWithWatchdog(`scp "${audioPath}" "${host}:${remoteAudio}"`, {
      inactivityMs: 60000,
      timeoutMs: 60000,
    });


    let remoteScript = `${remoteTmpDir}/beat-detection.py`;
    let localScript = params.scriptPath || path.join(process.cwd(), 'utils/beat-detection.py');

    try {
      await fs.access(localScript);
      await runCommandWithWatchdog(`scp "${localScript}" "${host}:${remoteScript}"`, {
        inactivityMs: 10000,
        timeoutMs: 10000,
      });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Failed to upload beat detection script: ${error.message}`);
      }
      remoteScript = `${remotePath}/utils/beat-detection.py`;
    }

    try {

      let pythonCmd = `${venv}/bin/python3`;
      let cmd = `"${pythonCmd}" "${remoteScript}" "${remoteAudio}" --sr ${sr} --hop ${hop} --pps ${pps}`;
      let fullCmd = `ssh ${host} '${cmd}'`;

      let output = await runCommandWithWatchdog(fullCmd, {
        maxBuffer: 50 * 1024 * 1024,
        inactivityMs: params.timeout || 180000,
        timeoutMs: params.timeout || 180000,
      });

      let result = JSON.parse(output);

      return {
        beats: result.beats,
        tempo: result.tempo,
        peaks: result.peaks,
        energy: result.energy,
        quietZones: result.quiet_zones,
        strongOnsets: result.strong_onsets,
        duration: result.duration,
        error: null,
      };
    } finally {

      await runCommandWithWatchdog(`ssh ${host} "rm -f ${remoteAudio}"`, {
        inactivityMs: 5000,
        timeoutMs: 5000,
      });
    }
  } catch (err) {
    return { ...EMPTY, error: err.message };
  }
}

/**
 * HTTP mode: POST audio to beat detection API
 * @param {string} audioPath - Local path to audio file
 * @param {Object} params - Node params
 * @returns {Promise<Object>}
 */
async function executeHTTP(audioPath, params) {
  let endpoint = params.endpoint || 'http://localhost:5009';

  try {
    let audioBuffer = await fs.readFile(audioPath);
    let blob = new Blob([audioBuffer], { type: 'audio/wav' });

    let formData = new FormData();
    formData.append('file', blob, path.basename(audioPath));
    formData.append('sample_rate', String(params.sampleRate || 22050));
    formData.append('hop_length', String(params.hopLength || 512));
    formData.append('peaks_per_second', String(params.peaksPerSecond || 10));

    let response = await fetch(`${endpoint}/analyze`, {
      method: 'POST',
      body: formData,
      signal: requestSignal(params.timeout || 180000, params.signal),
    });

    if (!response.ok) {
      return { ...EMPTY, error: `Beat API error: ${response.status}` };
    }

    let result = await response.json();

    return {
      beats: result.beats,
      tempo: result.tempo,
      peaks: result.peaks,
      energy: result.energy,
      quietZones: result.quiet_zones,
      strongOnsets: result.strong_onsets,
      duration: result.duration,
      error: null,
    };
  } catch (err) {
    return { ...EMPTY, error: err.message };
  }
}
