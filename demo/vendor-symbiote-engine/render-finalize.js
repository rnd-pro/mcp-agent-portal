import { cleanString, finiteNonNegativeNumber, finitePositiveNumber, isObject } from './render-utils.js';
import { resolveCaptionProfile } from './render-captions.js';

function compact(value) {
  if (Array.isArray(value)) {
    let items = value.map(compact).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (!isObject(value)) {
    if (value === undefined || value === null || value === '') return undefined;
    return value;
  }
  let entries = Object.entries(value)
    .filter(([key]) => !['url', 'href', 'path', 'publicUrl', 'navigableUrl', 'route'].includes(key))
    .map(([key, item]) => [key, compact(item)])
    .filter(([, item]) => item !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function codecValue(value, fallback) {
  return cleanString(value, fallback) || fallback;
}

function optionalNonNegativeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  return finiteNonNegativeNumber(value, null);
}

function escapeFfmpegFilterValue(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/'/g, "\\'");
}

function rawPath(value) {
  return String(value ?? '');
}

export function buildCaptionOverlayFilter(options = {}) {
  let captionsPath = rawPath(options.captionsPath || options.path);
  if (!captionsPath) return '';
  if (/\.ass$/i.test(captionsPath)) return `subtitles=${escapeFfmpegFilterValue(captionsPath)}`;
  let style = resolveCaptionProfile(
    isObject(options.captionStyle) ? options.captionStyle : { preset: options.preset },
    options.width,
    options.height
  );
  let forceStyle = [
    `Fontname=${style.fontName}`,
    `Fontsize=${style.fontSize}`,
    `PrimaryColour=${style.primaryColorAss}`,
    `OutlineColour=${style.outlineColorAss}`,
    `BackColour=${style.backColorAss}`,
    'BorderStyle=3',
    'Outline=1',
    'Shadow=1',
    'Alignment=2',
    `MarginV=${style.margins.bottom}`,
    'Bold=1',
  ].join(',');
  return `subtitles=${escapeFfmpegFilterValue(captionsPath)}:force_style='${escapeFfmpegFilterValue(forceStyle)}'`;
}

export const RENDER_PROOF_MANIFEST_STATE_FIELDS = Object.freeze([
  'cacheKey',
  'frameCacheKey',
  'renderSeed',
  'renderSeedProjection',
  'renderQueue',
  'usesTrackDemoFrames',
  'frameSequenceCleaned',
  'visualFrame',
  'audio',
  'transcript',
  'clipTranscripts',
  'captions',
  'output',
  'avSync',
  'cleanup',
  'cleanupError',
  'progressTimeline',
  'stageDurations',
]);

export function projectRenderProofManifestState(manifest = {}, fields = RENDER_PROOF_MANIFEST_STATE_FIELDS) {
  let source = isObject(manifest) ? manifest : {};
  let keys = Array.isArray(fields) && fields.length ? fields : RENDER_PROOF_MANIFEST_STATE_FIELDS;
  return Object.fromEntries(keys.map((key) => [key, source[key]]));
}

export function buildFrameSequenceEncodeArgs(options = {}) {
  let {
    fps = 1,
    frameInput = '',
    outputPath = '',
    audioPath = '',
    width = 0,
    height = 0,
    startNumber = null,
    videoCodec = 'libx264',
    preset = 'fast',
    crf = '18',
    pixelFormat = 'yuv420p',
    scaleFilter = '',
    captionsPath = '',
    captionsBurnPath = '',
    captionStyle = {},
    audioCodec = 'aac',
    audioBitrate = '192k',
  } = options || {};
  let safeFrameInput = cleanString(frameInput, '');
  let safeOutputPath = cleanString(outputPath, '');
  if (!safeFrameInput) throw new Error('frame sequence encode requires frameInput');
  if (!safeOutputPath) throw new Error('frame sequence encode requires outputPath');

  let args = [
    '-y',
    '-framerate', String(Math.max(1, Number(fps) || 1)),
  ];
  let safeStartNumber = optionalNonNegativeNumber(startNumber);
  if (safeStartNumber !== null) args.push('-start_number', String(Math.round(safeStartNumber)));
  args.push('-i', safeFrameInput);

  let safeAudioPath = cleanString(audioPath, '');
  if (safeAudioPath) args.push('-i', safeAudioPath);
  args.push(
    '-c:v', codecValue(videoCodec, 'libx264'),
    '-preset', codecValue(preset, 'fast'),
    '-crf', String(crf ?? '18'),
    '-pix_fmt', codecValue(pixelFormat, 'yuv420p'),
  );
  let resolvedScaleFilter = cleanString(scaleFilter, '');
  let safeWidth = finitePositiveNumber(width, 0);
  let safeHeight = finitePositiveNumber(height, 0);
  if (!resolvedScaleFilter && safeWidth > 0 && safeHeight > 0) {
    resolvedScaleFilter = `scale=${Math.round(safeWidth)}:${Math.round(safeHeight)}`;
  }
  let filters = [
    resolvedScaleFilter,
    buildCaptionOverlayFilter({ captionsPath: captionsBurnPath || captionsPath, captionStyle, width: safeWidth, height: safeHeight }),
  ].filter(Boolean);
  if (filters.length) args.push('-vf', filters.join(','));
  args.push('-fps_mode', 'cfr', '-r', String(Math.max(1, Number(fps) || 1)));
  if (safeAudioPath) {
    args.push('-c:a', codecValue(audioCodec, 'aac'), '-b:a', codecValue(audioBitrate, '192k'));
  }
  args.push(safeOutputPath);
  return args;
}

export function buildAudioConcatListLine(filePath) {
  return `file '${String(filePath).replace(/'/g, "'\\''")}'`;
}

export function buildAudioConcatArgs(options = {}) {
  let {
    concatListPath = '',
    outputPath = '',
    audioCodec = 'pcm_s16le',
  } = options || {};
  let safeConcatListPath = rawPath(concatListPath);
  let safeOutputPath = rawPath(outputPath);
  if (!safeConcatListPath) throw new Error('audio concat requires concatListPath');
  if (!safeOutputPath) throw new Error('audio concat requires outputPath');
  return [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', safeConcatListPath,
    '-c:a', codecValue(audioCodec, 'pcm_s16le'),
    safeOutputPath,
  ];
}

export function buildSegmentConcatListLine(filePath) {
  return buildAudioConcatListLine(filePath);
}

export function buildSegmentConcatArgs(options = {}) {
  let {
    concatListPath = '',
    outputPath = '',
    mode = 'stream-copy',
    videoCodec = 'libx264',
    audioCodec = 'aac',
    crf = '18',
    preset = 'fast',
  } = options || {};
  let safeConcatListPath = rawPath(concatListPath);
  let safeOutputPath = rawPath(outputPath);
  if (!safeConcatListPath) throw new Error('segment concat requires concatListPath');
  if (!safeOutputPath) throw new Error('segment concat requires outputPath');
  let safeMode = cleanString(mode, 'stream-copy') || 'stream-copy';
  if (safeMode !== 'stream-copy' && safeMode !== 're-encode') {
    throw new Error('segment concat mode must be stream-copy or re-encode');
  }
  let args = ['-y', '-f', 'concat', '-safe', '0', '-i', safeConcatListPath];
  if (safeMode === 'stream-copy') {
    args.push('-c', 'copy');
  } else {
    args.push(
      '-c:v', codecValue(videoCodec, 'libx264'),
      '-crf', String(crf ?? '18'),
      '-preset', codecValue(preset, 'fast'),
    );
    let safeAudioCodec = cleanString(audioCodec, '');
    if (safeAudioCodec) args.push('-c:a', safeAudioCodec);
  }
  args.push(safeOutputPath);
  return args;
}

export function buildAudioOverlapMixArgs(options = {}) {
  let {
    clips = [],
    outputPath = '',
    audioCodec = 'pcm_s16le',
  } = options || {};
  let safeClips = Array.isArray(clips) ? clips : [];
  if (!safeClips.length) return null;
  let safeOutputPath = rawPath(outputPath);
  if (!safeOutputPath) throw new Error('audio overlap mix requires outputPath');
  for (let clip of safeClips) {
    if (!rawPath(clip?.path)) throw new Error('audio overlap mix clip requires path');
  }
  let durationMs = Math.max(1, ...safeClips.map((clip) => clip.endMs));
  let durationSec = Math.max(0.001, durationMs / 1000);
  let filters = safeClips.map((clip, index) => {
    let delay = Math.max(0, Math.round(clip.startMs));
    return `[${index}:a]adelay=${delay}|${delay},apad,atrim=0:${durationSec.toFixed(3)}[a${index}]`;
  });
  filters.push(`${safeClips.map((_, index) => `[a${index}]`).join('')}amix=inputs=${safeClips.length}:duration=longest:normalize=0,atrim=0:${durationSec.toFixed(3)}[mix]`);
  let filterComplex = filters.join(';');
  return {
    args: [
      '-y',
      ...safeClips.flatMap((clip) => ['-i', rawPath(clip.path)]),
      '-filter_complex', filterComplex,
      '-map', '[mix]',
      '-c:a', codecValue(audioCodec, 'pcm_s16le'),
      safeOutputPath,
    ],
    durationMs,
    durationSec,
    filterComplex,
  };
}

export function buildAudioMuxArgs(options = {}) {
  let {
    videoPath = '',
    audioSources = [],
    filterComplex = '',
    audioMapLabel = '[aout]',
    outputPath = '',
    audioBitrate = '192k',
  } = options || {};
  let safeAudioSources = Array.isArray(audioSources) ? audioSources : [];
  if (!safeAudioSources.length) return null;
  let safeVideoPath = cleanString(videoPath, '');
  let safeOutputPath = cleanString(outputPath, '');
  let safeFilterComplex = cleanString(filterComplex, '');
  let safeAudioMapLabel = cleanString(audioMapLabel, '[aout]') || '[aout]';
  if (!safeVideoPath) throw new Error('audio mux requires videoPath');
  if (!safeOutputPath) throw new Error('audio mux requires outputPath');
  if (!safeFilterComplex) throw new Error('audio mux requires filterComplex');

  let args = ['-y', '-i', safeVideoPath];
  for (let source of safeAudioSources) {
    let src = cleanString(source?.src, '');
    if (!src) throw new Error('audio mux source requires src');
    args.push('-i', src);
  }
  args.push(
    '-filter_complex', safeFilterComplex,
    '-map', '0:v:0',
    '-map', safeAudioMapLabel,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', codecValue(audioBitrate, '192k'),
    '-shortest',
    safeOutputPath,
  );
  return args;
}

export function parseFfprobeJson(stdout = '') {
  try {
    let parsed = JSON.parse(String(stdout || '{}'));
    return isObject(parsed) ? parsed : {};
  } catch (error) {
    let failure = new Error(`ffprobe output is not valid JSON: ${error?.message || String(error)}`);
    failure.code = 'E_FFPROBE_JSON';
    throw failure;
  }
}

export function buildRenderProofManifestProjection(input = {}) {
  let projection = compact({
    version: 1,
    cacheKey: input.cacheKey,
    frameCacheKey: input.frameCacheKey,
    renderSeedProjection: input.renderSeedProjection,
    providerId: input.providerId,
    renderQueue: input.renderQueue,
    usesTrackDemoFrames: input.usesTrackDemoFrames === true ? true : input.usesTrackDemoFrames === false ? false : undefined,
    frameCount: input.frameCount,
    frameSequenceCleaned: input.frameSequenceCleaned === true,
    frames: input.frames,
    visualFrame: input.visualFrame,
    audio: input.audio,
    transcript: input.transcript,
    clipTranscripts: input.clipTranscripts,
    captions: input.captions,
    output: input.output,
    ffprobe: input.ffprobe,
    avSync: input.avSync,
    cleanup: input.cleanup,
    cleanupError: input.cleanupError,
    progressTimeline: input.progressTimeline,
    stageDurations: input.stageDurations,
  });
  return projection || {};
}
