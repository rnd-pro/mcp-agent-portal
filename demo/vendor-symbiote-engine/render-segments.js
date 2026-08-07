import { normalizeNativeSegment, segmentCompatibilityKey } from './contracts/render-segment.js';

const COMPAT_GROUPS = Object.freeze([
  { reason: 'geometry-mismatch', fields: ['width', 'height', 'frameRate'] },
  { reason: 'timebase-mismatch', fields: ['timeBase'] },
  { reason: 'color-mismatch', fields: ['pixelFormat', 'colorSpace', 'colorPrimaries', 'colorTransfer', 'colorRange', 'chromaLocation'] },
  { reason: 'codec-mismatch', fields: ['container', 'videoCodec', 'audioCodec'] },
  { reason: 'extradata-mismatch', fields: ['videoExtradataHash', 'audioExtradataHash'] },
  { reason: 'stream-layout-mismatch', fields: ['streamLayoutHash'] },
  { reason: 'audio-layout-mismatch', fields: ['audioSampleRate', 'audioChannels', 'audioChannelLayout', 'audioTimeBase'] },
]);

const CONTINUITY_FATAL_REASONS = Object.freeze(new Set([
  'frame-range-gap',
  'frame-range-overlap',
  'pts-gap',
  'pts-overlap',
]));

function stableKey(value) {
  return JSON.stringify(Object.keys(value).sort().map((key) => [key, value[key]]));
}

function compatReasons(prevKey, nextKey) {
  let reasons = [];
  for (let group of COMPAT_GROUPS) {
    if (group.fields.some((field) => prevKey[field] !== nextKey[field])) reasons.push(group.reason);
  }
  return reasons;
}

function buildConcatGroups(segments, compatibleBoundaries) {
  let groups = [[segments[0].id]];
  for (let index = 1; index < segments.length; index += 1) {
    if (compatibleBoundaries[index - 1]) {
      groups[groups.length - 1].push(segments[index].id);
    } else {
      groups.push([segments[index].id]);
    }
  }
  return groups;
}

function sameTimeBase(prev, next) {
  return prev.timeBase.num === next.timeBase.num && prev.timeBase.den === next.timeBase.den;
}

export function planSegmentConcat({ segments, allowReencode = false } = {}) {
  if (typeof allowReencode !== 'boolean') {
    throw new TypeError('planSegmentConcat: allowReencode must be a boolean');
  }
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new TypeError('planSegmentConcat: segments must be a non-empty array');
  }

  let normalized = segments.map((segment, index) =>
    normalizeNativeSegment(segment, { path: `segments[${index}]` }));

  let seenIds = new Set();
  for (let segment of normalized) {
    if (seenIds.has(segment.id)) {
      throw new TypeError(`planSegmentConcat: duplicate segment id "${segment.id}"`);
    }
    seenIds.add(segment.id);
  }

  let compatKeys = normalized.map((segment) => segmentCompatibilityKey(segment));
  let compatKeyStrings = compatKeys.map(stableKey);
  let incompatibilities = [];
  let compatibleBoundaries = [];

  for (let index = 0; index < normalized.length - 1; index += 1) {
    let prev = normalized[index];
    let next = normalized[index + 1];
    let boundary = { index: index + 1, from: prev.id, to: next.id };
    let boundaryReasons = [];

    if (compatKeyStrings[index] !== compatKeyStrings[index + 1]) {
      for (let reason of compatReasons(compatKeys[index], compatKeys[index + 1])) {
        boundaryReasons.push(reason);
      }
    }

    let expectedStart = prev.frameRange.end + 1;
    if (next.frameRange.start > expectedStart) {
      boundaryReasons.push('frame-range-gap');
    } else if (next.frameRange.start < expectedStart) {
      boundaryReasons.push('frame-range-overlap');
    }

    if (sameTimeBase(prev, next)) {
      let expectedPts = prev.lastPts + prev.frameDurationTicks;
      if (next.firstPts < expectedPts) {
        boundaryReasons.push('pts-overlap');
      } else if (next.firstPts > expectedPts) {
        boundaryReasons.push('pts-gap');
      }
    }

    compatibleBoundaries.push(boundaryReasons.length === 0);
    for (let reason of boundaryReasons) {
      incompatibilities.push({ ...boundary, reason, fatal: CONTINUITY_FATAL_REASONS.has(reason) });
    }
  }

  let groups = buildConcatGroups(normalized, compatibleBoundaries);
  let hasFatal = incompatibilities.some((entry) => entry.fatal);

  if (!incompatibilities.length) {
    return { ok: true, mode: 'stream-copy', groups, incompatibilities };
  }
  if (!hasFatal && allowReencode) {
    return { ok: true, mode: 're-encode', groups, incompatibilities };
  }
  return { ok: false, mode: 'stream-copy', groups, incompatibilities };
}
