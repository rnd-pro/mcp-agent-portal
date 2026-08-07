/**
 * transform/anchor-match — Lyrics ↔ Audio alignment with word-level karaoke timing
 *
 * Aligns reference lyrics with Whisper transcription timestamps.
 * Supports fuzzy matching (edit distance) and AI correction (OpenRouter).
 * Produces word-level timing data for karaoke rendering.
 *
 * Ported from Mr-Computer/modules/ai-music-video/src/services/anchor-matcher.js
 *
 * @module symbiote-engine/packs/transform/anchor-match
 */

export default {
  type: 'transform/anchor-match',
  category: 'transform',
  icon: 'lyrics',

  driver: {
    description: 'Align lyrics with Whisper timestamps — word-level karaoke timing',
    inputs: [
      { name: 'lyrics', type: 'string' },
      { name: 'whisperWords', type: 'any' },
    ],
    outputs: [
      { name: 'phrases', type: 'any' },
      { name: 'segments', type: 'any' },
      { name: 'stats', type: 'any' },
      { name: 'error', type: 'string' },
    ],
    params: {
      operation: {
        type: 'string',
        default: 'align',
        description: 'Operation: align | align-fuzzy | parse-lyrics',
      },
      apiKey: { type: 'string', default: '', description: 'OpenRouter API key for AI correction' },
      model: {
        type: 'string',
        default: 'deepseek/deepseek-v3.2',
        description: 'AI model for correction',
      },
      maxPhraseWords: {
        type: 'int',
        default: 8,
        description: 'Max words per phrase for subtitle readability',
      },
    },
  },

  lifecycle: {
    validate: (inputs) => {
      if (!inputs.lyrics && !inputs.whisperWords) return false;
      return true;
    },

    cacheKey: (inputs, params) => {
      let lLen = (inputs.lyrics || '').length;
      let wLen = (inputs.whisperWords || []).length;
      return `anchor:${params.operation}:${lLen}:${wLen}`;
    },

    execute: async (inputs, params) => {
      try {
        let op = params.operation;

        if (op === 'parse-lyrics') {
          let segments = parseLyrics(inputs.lyrics);
          return { phrases: null, segments, stats: { sections: segments.length }, error: null };
        }

        if (
          !inputs.whisperWords ||
          !Array.isArray(inputs.whisperWords) ||
          inputs.whisperWords.length === 0
        ) {
          return {
            phrases: null,
            segments: null,
            stats: null,
            error: 'whisperWords array is required for alignment',
          };
        }

        let segments = parseLyrics(inputs.lyrics);

        if (op === 'align-fuzzy') {
          let phrases = alignWithFuzzy(segments, inputs.whisperWords);
          return {
            phrases,
            segments,
            stats: { mode: 'fuzzy', phraseCount: phrases.length, sectionCount: segments.length },
            error: null,
          };
        }


        let phrases = await alignHybrid(inputs.lyrics, inputs.whisperWords, segments, params);
        return {
          phrases,
          segments,
          stats: {
            mode: params.apiKey ? 'hybrid-ai' : 'fuzzy-corrected',
            phraseCount: phrases.length,
            sectionCount: segments.length,
            totalWords: inputs.whisperWords.length,
          },
          error: null,
        };
      } catch (err) {
        return { phrases: null, segments: null, stats: null, error: err.message };
      }
    },
  },
};


/**
 * Parse lyrics into structured segments
 * @param {string} lyricsText - Raw lyrics with [Section] markers
 * @returns {Array<{section: string, lines: string[]}>}
 */
function parseLyrics(lyricsText) {
  if (!lyricsText) return [];
  let lines = lyricsText.split('\n');
  let segments = [];
  let currentSection = null;
  let currentLines = [];

  for (const line of lines) {
    let trimmed = line.trim();
    if (!trimmed) continue;

    let sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      if (currentSection) {
        segments.push({ section: currentSection, lines: currentLines });
      }
      currentSection = sectionMatch[1];
      currentLines = [];
    } else {
      currentLines.push(trimmed);
    }
  }

  if (currentSection && currentLines.length > 0) {
    segments.push({ section: currentSection, lines: currentLines });
  }

  return segments;
}

/**
 * Extract singable text (remove [markers], keep (parenthesis) content)
 * @param {string} line
 * @returns {string}
 */
function extractSingableText(line) {
  return line
    .replace(/\[.*?\]/g, '')
    .replace(/\*\*/g, '')
    .replace(/\(([^)]+)\)/g, '$1')
    .trim();
}

/**
 * Normalize word for comparison
 * @param {string} word
 * @returns {string}
 */
function normalizeWord(word) {
  return word
    .toLowerCase()
    .replace(/[.,!?¿¡'"()]/g, '')
    .replace(/[áà]/g, 'a')
    .replace(/[éè]/g, 'e')
    .replace(/[íì]/g, 'i')
    .replace(/[óò]/g, 'o')
    .replace(/[úù]/g, 'u')
    .replace(/ñ/g, 'n');
}

/**
 * Levenshtein edit distance
 * @param {string} s1
 * @param {string} s2
 * @returns {number}
 */
function editDistance(s1, s2) {
  let m = s1.length;
  let n = s2.length;
  let dp = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}


/**
 * Infer section from timestamp
 * @param {number} timestamp
 * @param {Array} segments
 * @returns {string}
 */
function inferSection(timestamp, segments) {
  if (!segments || segments.length === 0) return 'Unknown';

  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].startTime !== undefined && timestamp >= segments[i].startTime) {
      return segments[i].section;
    }
  }

  let estimatedSectionDuration = 15;
  let sectionIndex = Math.floor(timestamp / estimatedSectionDuration);
  if (sectionIndex >= 0 && sectionIndex < segments.length) {
    return segments[sectionIndex].section;
  }

  return segments[segments.length - 1].section;
}

/**
 * Calculate section timing from word positions
 * @param {Array} segments
 * @param {Array} correctedWords
 * @returns {Array}
 */
function calculateSectionTiming(segments, correctedWords) {
  if (!segments || segments.length === 0) return segments;

  let wordIndex = 0;
  return segments.map((seg) => {
    let startTime = null;

    for (const line of seg.lines) {
      let singable = extractSingableText(line);
      if (!singable) continue;

      let firstWord = normalizeWord(singable.split(/\s+/)[0]);

      for (let i = wordIndex; i < correctedWords.length && i < wordIndex + 50; i++) {
        let cw = correctedWords[i];
        if (
          normalizeWord(cw.word) === firstWord ||
          editDistance(normalizeWord(cw.word), firstWord) <= 1
        ) {
          startTime = cw.start;
          wordIndex = i;
          break;
        }
      }

      if (startTime !== null) break;
    }

    return { ...seg, startTime };
  });
}

/**
 * Hybrid align: vocabulary correction + phrase building
 * @param {string} referenceLyrics
 * @param {Array} whisperWords
 * @param {Array} segments
 * @param {Object} params
 * @returns {Promise<Array>}
 */
async function alignHybrid(referenceLyrics, whisperWords, segments, params) {

  let lyricsVocabulary = new Map();
  for (const seg of segments) {
    for (const line of seg.lines) {
      let singable = extractSingableText(line);
      if (!singable) continue;
      let words = singable.match(/[\w\u00C0-\u024F]+[.,!?']*|[.,!?]+/gi) || [];
      words.forEach((w) => {
        if (w.trim()) {
          let norm = normalizeWord(w);
          if (!lyricsVocabulary.has(norm) || /[.,!?']$/.test(w)) {
            lyricsVocabulary.set(norm, {
              original: w,
              hasPunctuation: /[.,!?']$/.test(w),
            });
          }
        }
      });
    }
  }


  let correctedWords = whisperWords.map((w) => {
    let whisperNorm = normalizeWord(w.word);


    if (lyricsVocabulary.has(whisperNorm)) {
      let match = lyricsVocabulary.get(whisperNorm);
      return {
        word: match.original,
        start: w.start,
        end: w.end,
        original: w.word,
        isConfident: true,
        endsPhrase: match.hasPunctuation,
      };
    }


    let bestMatch = null;
    let bestDistance = Infinity;

    for (const [norm, lyric] of lyricsVocabulary) {
      let dist = editDistance(whisperNorm, norm);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestMatch = lyric;
      }
      if (dist === 0) break;
    }

    let isConfident = bestDistance <= 1 || (bestDistance === 2 && whisperNorm.length > 5);

    let correctedWord = isConfident && bestMatch ? bestMatch.original : w.word;

    return {
      word: correctedWord,
      start: w.start,
      end: w.end,
      original: w.word,
      isConfident,
      endsPhrase: bestMatch?.hasPunctuation || false,
    };
  });


  let segmentsWithTiming = calculateSectionTiming(segments, correctedWords);


  return buildPhrasesFromCorrectedWords(correctedWords, segmentsWithTiming, params.maxPhraseWords);
}

/**
 * Build phrases from corrected words with punctuation-based splitting
 * @param {Array} correctedWords
 * @param {Array} segments
 * @param {number} maxWords
 * @returns {Array}
 */
function buildPhrasesFromCorrectedWords(correctedWords, segments, maxWords = 8) {
  let alignments = [];
  let currentPhrase = [];
  let phraseStart = null;
  let lastEnd = 0;

  for (let i = 0; i < correctedWords.length; i++) {
    let w = correctedWords[i];

    if (phraseStart === null) {
      phraseStart = w.start;
    }
    currentPhrase.push(w.word);
    lastEnd = w.end;

    let shouldEndPhrase = w.endsPhrase || currentPhrase.length >= maxWords;

    if (shouldEndPhrase) {
      alignments.push({
        line: currentPhrase.join(' '),
        start: phraseStart,
        end: w.end,
        section: inferSection(phraseStart, segments),
        confidence: 0.9,
        words: correctedWords.slice(i - currentPhrase.length + 1, i + 1).map((cw) => ({
          word: cw.word,
          start: cw.start,
          end: cw.end,
        })),
      });
      currentPhrase = [];
      phraseStart = null;
    }
  }


  if (currentPhrase.length > 0 && phraseStart !== null) {
    let startIdx = correctedWords.length - currentPhrase.length;
    alignments.push({
      line: currentPhrase.join(' '),
      start: phraseStart,
      end: lastEnd,
      section: 'Outro',
      confidence: 0.9,
      words: correctedWords.slice(startIdx).map((cw) => ({
        word: cw.word,
        start: cw.start,
        end: cw.end,
      })),
    });
  }

  return alignments;
}

/**
 * Fuzzy alignment without AI — line-level matching
 * @param {Array} segments - Parsed lyrics segments
 * @param {Array} whisperWords - [{word, start, end}]
 * @returns {Array}
 */
function alignWithFuzzy(segments, whisperWords) {
  let results = [];
  let whisperIndex = 0;

  for (const seg of segments) {
    for (const line of seg.lines) {
      let singable = extractSingableText(line);
      if (!singable) continue;

      let isExclamation = line.trim().startsWith('(');
      let words = singable.split(/\s+/).filter((w) => w.length > 0);
      if (words.length === 0) continue;

      let firstWord = normalizeWord(words[0]);

      let bestMatch = null;
      let bestScore = Infinity;

      for (let i = whisperIndex; i < whisperWords.length; i++) {
        let whisperWord = normalizeWord(whisperWords[i].word);

        let isExactMatch = firstWord === whisperWord;
        let isPartialMatch = firstWord.startsWith(whisperWord) || whisperWord.startsWith(firstWord);

        if (isExactMatch) {
          bestMatch = { index: i, word: whisperWords[i] };
          bestScore = 0;
          break;
        }

        if (isPartialMatch && firstWord.length >= 2) {
          if (!bestMatch || i < bestMatch.index) {
            bestMatch = { index: i, word: whisperWords[i] };
            bestScore = 1;
          }
          continue;
        }

        let distance = editDistance(firstWord, whisperWord);
        let threshold = Math.max(1, Math.floor(firstWord.length / 3));
        if (distance <= threshold && distance < bestScore) {
          bestScore = distance;
          bestMatch = { index: i, word: whisperWords[i] };
        }

        if (i - whisperIndex > 50 && bestMatch) break;
      }

      if (bestMatch) {
        let startTime = bestMatch.word.start;
        let endIndex = bestMatch.index + Math.min(words.length - 1, 5);
        if (endIndex >= whisperWords.length) endIndex = whisperWords.length - 1;
        let endTime = whisperWords[endIndex].end;

        results.push({
          line: singable,
          start: startTime,
          end: endTime,
          section: seg.section,
          confidence: bestScore === 0 ? 0.95 : bestScore === 1 ? 0.85 : 0.7,
          isExclamation,
        });

        whisperIndex = bestMatch.index + 1;
      } else {
        let lastResult = results[results.length - 1];
        if (lastResult) {
          results.push({
            line: singable,
            start: lastResult.end + 0.5,
            end: lastResult.end + 2.0,
            section: seg.section,
            confidence: 0.3,
            isExclamation,
          });
        }
      }
    }
  }

  return results;
}
