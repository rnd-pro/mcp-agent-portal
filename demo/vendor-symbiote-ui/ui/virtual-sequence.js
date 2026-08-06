/**
 * Host-neutral projection of a producer-validated `workspace-virtual-sequence-v1`
 * artifact. Resolves portable paths through an injected resolver; owns no producer import.
 *
 * @module symbiote-ui/ui/virtual-sequence
 */

export const WORKSPACE_VIRTUAL_SEQUENCE_SCHEMA = 'workspace-virtual-sequence-v1';

// Composite order for layers active at a tick, mirroring the producer contract.
const LAYER_KIND_ORDER = ['base', 'overlay', 'caption', 'audio'];

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, path) {
  if (!isObject(value)) throw new TypeError(`${path} must be an object`);
  return value;
}

function requireString(value, path) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${path} must be a non-empty string`);
  return value;
}

function requirePositiveInteger(value, path) {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${path} must be a positive integer`);
  return value;
}

function requireNonNegativeInteger(value, path) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${path} must be a non-negative integer`);
  return value;
}

function requireRational(value, path) {
  requireObject(value, path);
  return {
    num: requirePositiveInteger(value.num, `${path}.num`),
    den: requirePositiveInteger(value.den, `${path}.den`),
  };
}

function requireRange(value, path) {
  requireObject(value, path);
  let startTick = requireNonNegativeInteger(value.startTick, `${path}.startTick`);
  let endTick = requirePositiveInteger(value.endTick, `${path}.endTick`);
  if (startTick >= endTick) throw new TypeError(`${path}.startTick must be less than ${path}.endTick`);
  return { startTick, endTick };
}

function requireTickList(value, path) {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value.map((tick, index) => requireNonNegativeInteger(tick, `${path}[${index}]`));
}

function requireTile(value, path) {
  requireObject(value, path);
  return {
    width: requirePositiveInteger(value.width, `${path}.width`),
    height: requirePositiveInteger(value.height, `${path}.height`),
    columns: requirePositiveInteger(value.columns, `${path}.columns`),
    rows: requirePositiveInteger(value.rows, `${path}.rows`),
  };
}

function containsTick(range, tick) {
  return range.startTick <= tick && tick < range.endTick;
}

function cloneRange(range) {
  return { startTick: range.startTick, endTick: range.endTick };
}

// Clone layer projection output so callers cannot mutate internal state.
function cloneLayer(layer) {
  return {
    id: layer.id,
    kind: layer.kind,
    invalidation: layer.invalidation,
    range: cloneRange(layer.range),
    dependsOn: layer.dependsOn.slice(),
    affectedRanges: layer.affectedRanges.map(cloneRange),
    outputHash: layer.outputHash,
  };
}

function greatestAtOrBelow(ticks, tick) {
  let result = null;
  for (let value of ticks) {
    if (value <= tick && (result === null || value > result)) result = value;
  }
  return result;
}

function normalizeMaster(value, index) {
  let path = `masters[${index}]`;
  requireObject(value, path);
  return {
    id: requireString(value.id, `${path}.id`),
    path: requireString(value.path, `${path}.path`),
    contentHash: value.contentHash,
    codec: value.codec,
    container: value.container,
    range: requireRange(value.range, `${path}.range`),
    keyframes: requireTickList(value.keyframes, `${path}.keyframes`),
  };
}

function normalizeSegment(value, path) {
  requireObject(value, path);
  return {
    path: requireString(value.path, `${path}.path`),
    contentHash: value.contentHash,
    codec: value.codec,
    container: value.container,
  };
}

function normalizeScrub(value) {
  if (value === undefined) return null;
  requireObject(value, 'scrub');
  let mode = requireString(value.mode, 'scrub.mode');
  if (mode === 'proxy') {
    return { mode, ...normalizeSegment(value, 'scrub') };
  }
  if (mode === 'chunks') {
    if (!Array.isArray(value.chunks) || value.chunks.length === 0) {
      throw new TypeError('scrub.chunks must be a non-empty array');
    }
    let chunks = value.chunks.map((chunk, index) => {
      let path = `scrub.chunks[${index}]`;
      requireObject(chunk, path);
      return {
        id: requireString(chunk.id, `${path}.id`),
        path: requireString(chunk.path, `${path}.path`),
        contentHash: chunk.contentHash,
        codec: chunk.codec,
        container: chunk.container,
        range: requireRange(chunk.range, `${path}.range`),
      };
    });
    return {
      mode,
      maxChunkDurationTicks: value.maxChunkDurationTicks,
      chunks,
    };
  }
  throw new TypeError('scrub.mode must be proxy or chunks');
}

function normalizeSprite(value, index) {
  let path = `sprites[${index}]`;
  requireObject(value, path);
  return {
    id: requireString(value.id, `${path}.id`),
    path: requireString(value.path, `${path}.path`),
    contentHash: value.contentHash,
    codec: value.codec,
    cues: requireTickList(value.cues, `${path}.cues`),
    tile: requireTile(value.tile, `${path}.tile`),
  };
}

function normalizeAudio(value, index) {
  let path = `audio[${index}]`;
  requireObject(value, path);
  let waveform = value.waveform === undefined
    ? null
    : { path: requireString(value.waveform.path, `${path}.waveform.path`), contentHash: value.waveform.contentHash };
  return {
    id: requireString(value.id, `${path}.id`),
    path: requireString(value.path, `${path}.path`),
    contentHash: value.contentHash,
    range: requireRange(value.range, `${path}.range`),
    waveform,
  };
}

function normalizeLayer(value, index) {
  let path = `layers[${index}]`;
  requireObject(value, path);
  return {
    id: requireString(value.id, `${path}.id`),
    kind: requireString(value.kind, `${path}.kind`),
    invalidation: value.invalidation,
    range: requireRange(value.range, `${path}.range`),
    dependsOn: Array.isArray(value.dependsOn) ? value.dependsOn.slice() : [],
    affectedRanges: Array.isArray(value.affectedRanges)
      ? value.affectedRanges.map((entry, entryIndex) => requireRange(entry, `${path}.affectedRanges[${entryIndex}]`))
      : [],
    outputHash: value.outputHash,
  };
}

/**
 * @typedef {(path: string) => string} ArtifactPathResolver
 */

/**
 * @param {object} sequence A producer-validated `workspace-virtual-sequence-v1` artifact.
 * @param {{ resolvePath: ArtifactPathResolver }} options
 * @returns {object}
 */
export function createVirtualSequenceProjection(sequence, options = {}) {
  let resolvePath = options.resolvePath;
  if (typeof resolvePath !== 'function') {
    throw new TypeError('createVirtualSequenceProjection requires an options.resolvePath function.');
  }
  requireObject(sequence, 'sequence');
  if (sequence.schemaVersion !== WORKSPACE_VIRTUAL_SEQUENCE_SCHEMA) {
    throw new TypeError(`sequence.schemaVersion must equal ${WORKSPACE_VIRTUAL_SEQUENCE_SCHEMA}`);
  }

  let timebase = requireRational(sequence.timebase, 'sequence.timebase');
  let frameRate = requireRational(sequence.frameRate, 'sequence.frameRate');
  let duration = requirePositiveInteger(sequence.duration, 'sequence.duration');

  let ratioNumerator = frameRate.den * timebase.den;
  let ratioDenominator = frameRate.num * timebase.num;
  if (ratioNumerator % ratioDenominator !== 0) {
    throw new TypeError('incompatible frameRate/timebase (ticksPerFrame is not an integer)');
  }
  let ticksPerFrame = ratioNumerator / ratioDenominator;
  if (duration % ticksPerFrame !== 0) throw new TypeError('sequence.duration must be a whole number of frames');
  let frameCount = duration / ticksPerFrame;

  if (!Array.isArray(sequence.masters) || sequence.masters.length === 0) {
    throw new TypeError('sequence.masters must be a non-empty array');
  }
  let masters = sequence.masters.map((master, index) => normalizeMaster(master, index));
  let index = requireObject(sequence.index, 'sequence.index');
  let keyframeTicks = requireTickList(index.keyframes, 'sequence.index.keyframes');
  let timestampTicks = requireTickList(index.timestamps, 'sequence.index.timestamps');
  let playbackProxy = sequence.playbackProxy === undefined
    ? null
    : normalizeSegment(sequence.playbackProxy, 'playbackProxy');
  let scrub = normalizeScrub(sequence.scrub);
  let sprites = sequence.sprites === undefined
    ? []
    : (Array.isArray(sequence.sprites)
      ? sequence.sprites.map((sprite, spriteIndex) => normalizeSprite(sprite, spriteIndex))
      : (() => { throw new TypeError('sequence.sprites must be an array'); })());
  let audio = sequence.audio === undefined
    ? []
    : (Array.isArray(sequence.audio)
      ? sequence.audio.map((entry, audioIndex) => normalizeAudio(entry, audioIndex))
      : (() => { throw new TypeError('sequence.audio must be an array'); })());
  if (!Array.isArray(sequence.layers) || sequence.layers.length === 0) {
    throw new TypeError('sequence.layers must be a non-empty array');
  }
  let layers = sequence.layers.map((layer, layerIndex) => normalizeLayer(layer, layerIndex));

  let clampTick = (tick) => Math.max(0, Math.min(duration - 1, Math.round(Number(tick) || 0)));
  let clampFrame = (frame) => Math.max(0, Math.min(frameCount - 1, Math.round(Number(frame) || 0)));
  let tickToTime = (tick) => (Number(tick) || 0) * timebase.num / timebase.den;
  let rawTimeToTick = (seconds) => Math.round((Number(seconds) || 0) * timebase.den / timebase.num);
  let tickToFrame = (tick) => Math.floor(clampTick(tick) / ticksPerFrame);

  return {
    schemaVersion: WORKSPACE_VIRTUAL_SEQUENCE_SCHEMA,
    executionTier: typeof sequence.executionTier === 'string' ? sequence.executionTier : '',
    timebase: { ...timebase },
    frameRate: { ...frameRate },
    ticksPerFrame,
    frameCount,
    get durationTicks() {
      return duration;
    },
    get durationSeconds() {
      return tickToTime(duration);
    },
    clampTick,
    tickToTime,
    timeToTick(seconds) {
      return clampTick(rawTimeToTick(seconds));
    },
    tickToFrame,
    frameToTick(frame) {
      return clampFrame(frame) * ticksPerFrame;
    },
    timeToFrame(seconds) {
      return tickToFrame(rawTimeToTick(seconds));
    },
    frameToTime(frame) {
      return tickToTime(clampFrame(frame) * ticksPerFrame);
    },
    get playbackProxy() {
      return playbackProxy;
    },
    playbackUrl() {
      return playbackProxy ? resolvePath(playbackProxy.path) : null;
    },
    get scrubMode() {
      return scrub ? scrub.mode : null;
    },
    scrubProxyUrl() {
      return scrub && scrub.mode === 'proxy' ? resolvePath(scrub.path) : null;
    },
    scrubForTick(tick) {
      if (!scrub) return null;
      if (scrub.mode === 'proxy') {
        return { mode: 'proxy', descriptor: scrub, url: resolvePath(scrub.path) };
      }
      let clamped = clampTick(tick);
      let chunk = scrub.chunks.find((entry) => containsTick(entry.range, clamped)) || null;
      return chunk ? { mode: 'chunks', chunk, url: resolvePath(chunk.path) } : null;
    },
    masterForTick(tick) {
      let clamped = clampTick(tick);
      let master = masters.find((entry) => containsTick(entry.range, clamped)) || null;
      return master ? { master, url: resolvePath(master.path) } : null;
    },
    nearestKeyframeTick(tick) {
      return greatestAtOrBelow(keyframeTicks, clampTick(tick));
    },
    nearestTimestampTick(tick) {
      return greatestAtOrBelow(timestampTicks, clampTick(tick));
    },
    spriteTileForTick(tick) {
      let clamped = clampTick(tick);
      let best = null;
      for (let sprite of sprites) {
        sprite.cues.forEach((cue, cueIndex) => {
          if (cue <= clamped && (best === null || cue > best.cue)) best = { sprite, cue, cueIndex };
        });
      }
      if (!best) return null;
      let { sprite, cue, cueIndex } = best;
      let column = cueIndex % sprite.tile.columns;
      let row = Math.floor(cueIndex / sprite.tile.columns);
      return {
        url: resolvePath(sprite.path),
        id: sprite.id,
        cue,
        cueIndex,
        column,
        row,
        x: column * sprite.tile.width,
        y: row * sprite.tile.height,
        width: sprite.tile.width,
        height: sprite.tile.height,
        columns: sprite.tile.columns,
        rows: sprite.tile.rows,
      };
    },
    activeAudioForTick(tick) {
      let clamped = clampTick(tick);
      return audio
        .filter((entry) => containsTick(entry.range, clamped))
        .map((entry) => ({
          audio: entry,
          url: resolvePath(entry.path),
          waveformUrl: entry.waveform ? resolvePath(entry.waveform.path) : null,
        }));
    },
    layersForTick(tick) {
      let clamped = clampTick(tick);
      let order = new Map(LAYER_KIND_ORDER.map((kind, position) => [kind, position]));
      let rank = (kind) => (order.has(kind) ? order.get(kind) : LAYER_KIND_ORDER.length);
      return layers
        .filter((layer) => containsTick(layer.range, clamped))
        .sort((left, right) => {
          let byKind = rank(left.kind) - rank(right.kind);
          if (byKind !== 0) return byKind;
          return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
        })
        .map(cloneLayer);
    },
    affectedLayerIdsForTick(tick) {
      let clamped = clampTick(tick);
      return layers
        .filter((layer) => layer.affectedRanges.some((range) => containsTick(range, clamped)))
        .map((layer) => layer.id);
    },
    affectedLayerIdsForRange(startTick, endTick) {
      let clampEndpoint = (value) => Math.max(0, Math.min(duration, Math.round(Number(value) || 0)));
      let start = clampEndpoint(startTick);
      let end = clampEndpoint(endTick);
      let lo = Math.min(start, end);
      let hi = Math.max(start, end);
      return layers
        .filter((layer) => layer.affectedRanges.some((range) => range.startTick < hi && range.endTick > lo))
        .map((layer) => layer.id);
    },
  };
}
