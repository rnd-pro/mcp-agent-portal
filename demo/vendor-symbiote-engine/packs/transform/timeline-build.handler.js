/**
 * transform/timeline-build — Whisper + beats → timeline segments
 *
 * Combines word timestamps from ai/whisper with beat data from ai/beat-detect
 * to produce a continuous timeline of segments with 100% coverage.
 *
 * Core logic:
 * 1. Build phrases from whisper words (punctuation-based splitting)
 * 2. Fill gaps between phrases with beat-snapped segments
 * 3. Enforce minimum/maximum segment duration (merge/split)
 * 4. Calculate coverage statistics
 *
 * Simplified port of TimelineGenerator from
 * Mr-Computer/modules/ai-music-video/src/services/timeline-generator.js
 *
 * @module symbiote-engine/packs/transform/timeline-build
 */

export default {
  type: 'transform/timeline-build',
  category: 'transform',
  icon: 'view_timeline',

  driver: {
    description: 'Whisper words + beat data → timeline segments with 100% coverage',
    inputs: [
      { name: 'whisperData', type: 'any' },
      { name: 'beatData', type: 'any' },
    ],
    outputs: [
      { name: 'segments', type: 'any' },
      { name: 'stats', type: 'any' },
      { name: 'error', type: 'string' },
    ],
    params: {
      minSegmentDuration: {
        type: 'number',
        default: 1.8,
        description: 'Min segment duration (seconds)',
      },
      maxSegmentDuration: {
        type: 'number',
        default: 5.0,
        description: 'Max segment duration (seconds)',
      },
      shortMergeThreshold: {
        type: 'number',
        default: 1.2,
        description: 'Merge lyrics segments shorter than this',
      },
      gapType: { type: 'string', default: 'beat', description: 'Type label for gap-fill segments' },
    },
  },

  lifecycle: {
    validate: (inputs) => {
      if (!inputs.whisperData) return false;
      return true;
    },

    cacheKey: (inputs, params) => {
      let wd = inputs.whisperData;
      let bd = inputs.beatData;
      return `timeline:${wd.duration || 0}:${bd?.tempo || 0}:${params.minSegmentDuration}`;
    },

    execute: async (inputs, params) => {
      try {
        let { whisperData, beatData } = inputs;
        let words = whisperData.words || [];
        let duration = whisperData.duration || beatData?.duration || 0;
        let beats = beatData?.beats || [];

        if (words.length === 0) {
          return { segments: null, stats: null, error: 'No whisper words provided' };
        }


        let segments = buildPhrases(words);


        segments = fillGaps(segments, beats, duration, params);


        segments = removeOverlaps(segments);


        segments = mergeShort(segments, params.shortMergeThreshold || 1.2);


        segments = enforceMinDuration(segments, params.minSegmentDuration || 1.8);


        segments = capMaxDuration(segments, params.maxSegmentDuration || 5.0);


        segments.sort((a, b) => a.start - b.start);


        let stats = calculateStats(segments, duration);

        return { segments, stats, error: null };
      } catch (err) {
        return { segments: null, stats: null, error: err.message };
      }
    },
  },
};

/**
 * Build phrases from whisper words using punctuation-based splitting
 * @param {Array<{word: string, start: number, end: number}>} words
 * @returns {Array<{start: number, end: number, text: string, type: string, wordCount: number}>}
 */
function buildPhrases(words) {
  let phrases = [];
  let current = null;

  for (const w of words) {
    if (!current) {
      current = {
        start: w.start,
        end: w.end,
        words: [w.word],
        type: 'lyrics',
      };
    } else {
      current.end = w.end;
      current.words.push(w.word);
    }


    let endsWithPunct = /[.!?;]$/.test(w.word);
    let nextWord = words[words.indexOf(w) + 1];
    let hasGap = nextWord && nextWord.start - w.end > 0.8;

    if (endsWithPunct || hasGap || current.words.length >= 12) {
      phrases.push({
        start: current.start,
        end: current.end,
        text: current.words.join(' '),
        type: 'lyrics',
        wordCount: current.words.length,
      });
      current = null;
    }
  }


  if (current && current.words.length > 0) {
    phrases.push({
      start: current.start,
      end: current.end,
      text: current.words.join(' '),
      type: 'lyrics',
      wordCount: current.words.length,
    });
  }

  return phrases;
}

/**
 * Snap a time to the nearest beat
 * @param {number} time - Seconds
 * @param {number[]} beats - Beat timestamps
 * @returns {number} Snapped time
 */
function snapToBeat(time, beats) {
  if (!beats || beats.length === 0) return time;

  let closest = beats[0];
  let minDist = Math.abs(beats[0] - time);

  for (const beat of beats) {
    let dist = Math.abs(beat - time);
    if (dist < minDist) {
      minDist = dist;
      closest = beat;
    }
    if (beat > time + minDist) break;
  }


  return minDist < 0.3 ? closest : time;
}

/**
 * Fill gaps between segments with beat-snapped segments
 * @param {Array} segments
 * @param {number[]} beats
 * @param {number} duration
 * @param {Object} params
 * @returns {Array}
 */
function fillGaps(segments, beats, duration, params) {
  if (segments.length === 0) return segments;

  let result = [];
  let gapType = params.gapType || 'beat';


  if (segments[0].start > 0.1) {
    result.push({
      start: 0,
      end: snapToBeat(segments[0].start, beats),
      text: '',
      type: gapType,
      wordCount: 0,
    });
  }

  for (let i = 0; i < segments.length; i++) {
    result.push(segments[i]);


    let next = segments[i + 1];
    if (next) {
      let gapStart = segments[i].end;
      let gapEnd = next.start;
      let gapSize = gapEnd - gapStart;

      if (gapSize > 0.2) {
        result.push({
          start: snapToBeat(gapStart, beats),
          end: snapToBeat(gapEnd, beats),
          text: '',
          type: gapType,
          wordCount: 0,
        });
      }
    }
  }


  let lastEnd = segments[segments.length - 1].end;
  if (duration > 0 && duration - lastEnd > 0.2) {
    result.push({
      start: snapToBeat(lastEnd, beats),
      end: duration,
      text: '',
      type: gapType,
      wordCount: 0,
    });
  }

  return result;
}

/**
 * Remove overlapping segments (trim shorter one)
 * @param {Array} segments
 * @returns {Array}
 */
function removeOverlaps(segments) {
  if (segments.length < 2) return segments;

  segments.sort((a, b) => a.start - b.start);

  for (let i = 1; i < segments.length; i++) {
    let prev = segments[i - 1];
    let curr = segments[i];

    if (curr.start < prev.end) {

      if (prev.type !== 'lyrics' && curr.type === 'lyrics') {
        prev.end = curr.start;
      } else if (prev.type === 'lyrics' && curr.type !== 'lyrics') {
        curr.start = prev.end;
      } else {
        let mid = (prev.end + curr.start) / 2;
        prev.end = mid;
        curr.start = mid;
      }
    }
  }


  return segments.filter((s) => s.end - s.start > 0.05);
}

/**
 * Merge short lyrics segments into neighbors
 * @param {Array} segments
 * @param {number} threshold
 * @returns {Array}
 */
function mergeShort(segments, threshold) {
  if (segments.length < 2) return segments;

  let result = [segments[0]];

  for (let i = 1; i < segments.length; i++) {
    let curr = segments[i];
    let prev = result[result.length - 1];
    let currDuration = curr.end - curr.start;


    if (curr.type === 'lyrics' && currDuration < threshold && prev.type === 'lyrics') {
      prev.end = curr.end;
      prev.text = prev.text + ' ' + curr.text;
      prev.wordCount = (prev.wordCount || 0) + (curr.wordCount || 0);
    } else {
      result.push(curr);
    }
  }

  return result;
}

/**
 * Enforce minimum duration by merging
 * @param {Array} segments
 * @param {number} minDuration
 * @returns {Array}
 */
function enforceMinDuration(segments, minDuration) {
  if (segments.length < 2) return segments;

  let result = [segments[0]];

  for (let i = 1; i < segments.length; i++) {
    let prev = result[result.length - 1];
    let prevDuration = prev.end - prev.start;

    if (prevDuration < minDuration) {

      prev.end = segments[i].end;
      if (segments[i].text) {
        prev.text = (prev.text ? prev.text + ' ' : '') + segments[i].text;
      }
      if (segments[i].type === 'lyrics') prev.type = 'lyrics';
    } else {
      result.push(segments[i]);
    }
  }

  return result;
}

/**
 * Cap segments at max duration by splitting evenly
 * @param {Array} segments
 * @param {number} maxDuration
 * @returns {Array}
 */
function capMaxDuration(segments, maxDuration) {
  let result = [];

  for (const seg of segments) {
    let duration = seg.end - seg.start;

    if (duration <= maxDuration) {
      result.push(seg);
      continue;
    }


    let parts = Math.ceil(duration / maxDuration);
    let partDuration = duration / parts;

    for (let i = 0; i < parts; i++) {
      result.push({
        ...seg,
        start: seg.start + i * partDuration,
        end: seg.start + (i + 1) * partDuration,
        text: i === 0 ? seg.text : '',
        _splitPart: i + 1,
        _splitTotal: parts,
      });
    }
  }

  return result;
}

/**
 * Calculate timeline coverage statistics
 * @param {Array} segments
 * @param {number} audioDuration
 * @returns {Object}
 */
function calculateStats(segments, audioDuration) {
  let totalSegments = segments.length;
  let lyricsSegments = segments.filter((s) => s.type === 'lyrics').length;
  let gapSegments = totalSegments - lyricsSegments;

  let coveredDuration = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  let lyricsDuration = segments
    .filter((s) => s.type === 'lyrics')
    .reduce((sum, s) => sum + (s.end - s.start), 0);

  let coverage = audioDuration > 0 ? Math.round((coveredDuration / audioDuration) * 100) : 0;

  let avgDuration =
    totalSegments > 0 ? Math.round((coveredDuration / totalSegments) * 100) / 100 : 0;

  return {
    totalSegments,
    lyricsSegments,
    gapSegments,
    coveredDuration: Math.round(coveredDuration * 100) / 100,
    audioDuration: Math.round(audioDuration * 100) / 100,
    coverage,
    lyricsDuration: Math.round(lyricsDuration * 100) / 100,
    avgDuration,
  };
}
