/**
 * transform/lipsync-select — AI-based segment selection + face detection validation
 *
 * Analyzes segments to determine which need lip-sync animation:
 * - AI analysis: evaluates lyrics sections for lipsync importance
 * - Face validation: checks face coverage in source video metadata
 * - Mouth positions: extracts mouth coordinates for speech bubbles
 *
 * Ported from Mr-Computer/modules/ai-music-video/src/services/lipsync-selector.js
 *
 * @module symbiote-engine/packs/transform/lipsync-select
 */

export default {
  type: 'transform/lipsync-select',
  category: 'transform',
  icon: 'face_retouching_natural',

  driver: {
    description: 'AI-based lipsync segment selection + face detection validation',
    inputs: [
      { name: 'segments', type: 'any' },
      { name: 'lyrics', type: 'string' },
    ],
    outputs: [
      { name: 'result', type: 'any' },
      { name: 'stats', type: 'any' },
      { name: 'error', type: 'string' },
    ],
    params: {
      operation: {
        type: 'string',
        default: 'select',
        description: 'Operation: select | analyze | apply | mouth-positions',
      },
      apiKey: { type: 'string', default: '', description: 'OpenRouter API key' },
      model: { type: 'string', default: 'deepseek/deepseek-v3.2', description: 'AI model' },
      apiBaseUrl: {
        type: 'string',
        default: 'https://openrouter.ai/api/v1',
        description: 'API base URL',
      },
      minFaceCoverage: {
        type: 'number',
        default: 8,
        description: 'Minimum face coverage % for lipsync',
      },
      selectedSegments: {
        type: 'any',
        default: null,
        description: 'For apply: selected segments array',
      },
      mouthPositions: { type: 'any', default: null, description: 'For apply: mouth positions map' },
    },
  },

  lifecycle: {
    validate: (inputs) => {
      if (!inputs.segments || !Array.isArray(inputs.segments)) return false;
      return true;
    },

    cacheKey: (inputs, params) => {
      return `lipsync-sel:${params.operation}:${inputs.segments.length}`;
    },

    execute: async (inputs, params) => {
      try {
        let op = params.operation;
        let segments = inputs.segments;

        if (op === 'analyze') {
          if (!params.apiKey) {
            return { result: null, stats: null, error: 'apiKey is required for AI analysis' };
          }
          let analyzed = await analyzeWithAI(segments, inputs.lyrics, params);
          let lipsyncCount = analyzed.filter((s) => s.isLipSync).length;
          return {
            result: analyzed,
            stats: { total: segments.length, lipsyncMarked: lipsyncCount },
            error: null,
          };
        }

        if (op === 'select') {
          let { selectedSegments, stats } = selectLipsyncSegments(segments, params);
          return { result: selectedSegments, stats, error: null };
        }

        if (op === 'apply') {
          let selected = params.selectedSegments || [];
          let mouthPos = params.mouthPositions || {};
          let applied = applySelection(segments, selected, mouthPos);
          return {
            result: applied,
            stats: { total: applied.length, lipsync: applied.filter((s) => s.isLipSync).length },
            error: null,
          };
        }

        return { result: null, stats: null, error: `Unknown operation: ${op}` };
      } catch (err) {
        return { result: null, stats: null, error: err.message };
      }
    },
  },
};


/**
 * Select lipsync segments based on face detection metadata
 * Takes ONLY segments already marked isLipSync=true, removes those failing face detection
 * @param {Array} segments
 * @param {Object} params
 * @returns {{selectedSegments: Array, stats: Object}}
 */
function selectLipsyncSegments(segments, params) {
  let minFaceCoverage = params.minFaceCoverage;

  let stats = {
    total: segments.length,
    markedForLipsync: 0,
    filteredByFace: 0,
    selected: 0,
  };

  let lipsyncMarked = segments.filter((seg) => seg.isLipSync === true);
  stats.markedForLipsync = lipsyncMarked.length;

  if (lipsyncMarked.length === 0) {
    return { selectedSegments: [], stats };
  }

  let selected = [];

  for (const seg of lipsyncMarked) {
    let hasFace = false;
    let faceCoverage = 0;


    let faceTracking = seg.faceTracking || seg.sourceMetadata?.faceTracking;

    if (faceTracking) {
      if (faceTracking.maxCoverage) {
        faceCoverage = faceTracking.maxCoverage;
        hasFace = faceCoverage >= minFaceCoverage;
      } else if (faceTracking.positions?.length > 0) {
        let maxCov = 0;
        for (const frame of faceTracking.positions) {
          if (frame.faces?.length > 0) {
            for (const face of frame.faces) {
              if (face.bboxRel) {
                let coverage = (face.bboxRel.width || 0) * 100;
                if (coverage > maxCov) maxCov = coverage;
              }
            }
          }
        }
        faceCoverage = Math.round(maxCov);
        hasFace = faceCoverage >= minFaceCoverage;
      }
    } else {

      hasFace = true;
    }

    if (hasFace) {
      selected.push({
        ...seg,
        faceStats: { maxCoverage: faceCoverage, avgCoverage: faceCoverage },
      });
    } else {
      stats.filteredByFace++;
    }
  }

  stats.selected = selected.length;
  return { selectedSegments: selected, stats };
}

/**
 * Apply lipsync selection to segments — sets isLipSync + useBubble flags
 * @param {Array} segments
 * @param {Array} selectedSegments
 * @param {Object} mouthPositions - {promptId: {mouthPosition: {x,y}}}
 * @returns {Array}
 */
function applySelection(segments, selectedSegments, mouthPositions = {}) {
  let selectedIds = new Set(selectedSegments.map((s) => s.promptId || s.id));

  return segments.map((seg) => {
    let id = seg.promptId || seg.id;
    let isLipSync = selectedIds.has(id);
    let mouthData = mouthPositions[id];

    return {
      ...seg,
      isLipSync,
      wasOriginallyLipSync: seg.isLipSync,
      useBubble: !isLipSync && !!mouthData,
      mouthPosition: mouthData?.mouthPosition || null,
    };
  });
}

/**
 * Analyze segments with AI to determine lipsync importance
 * @param {Array} segments
 * @param {string} lyrics
 * @param {Object} params
 * @returns {Promise<Array>}
 */
async function analyzeWithAI(segments, lyrics, params) {
  let segmentSummary = segments.map((seg, idx) => ({
    idx,
    id: seg.id || seg.promptId,
    text: seg.text || '',
    section: seg.section || 'Unknown',
    start: seg.start?.toFixed(1) || '?',
    end: seg.end?.toFixed(1) || '?',
  }));

  let prompt = buildAnalysisPrompt(lyrics, segmentSummary);
  let response = await callAI(prompt, params);
  return parseAIResponse(response, segments);
}

/**
 * Build AI prompt for lipsync analysis
 * @param {string} lyrics
 * @param {Array} segmentSummary
 * @returns {string}
 */
function buildAnalysisPrompt(lyrics, segmentSummary) {
  let segmentsList = segmentSummary
    .map(
      (s) =>
        `[${s.idx}] ${s.id} | ${s.section} | ${s.start}-${s.end}s | "${s.text.substring(0, 60)}${s.text.length > 60 ? '...' : ''}"`
    )
    .join('\n');

  return `You are a music video director analyzing which segments need LIPSYNC (mouth animation synced to vocals).

## Original Song Lyrics:
\`\`\`
${lyrics}
\`\`\`

## Segments to analyze:
\`\`\`
${segmentsList}
\`\`\`

## Your Task:
Analyze each segment and decide if it needs LIPSYNC based on:

1. **LIPSYNC = TRUE** for:
   - Main vocal verses (actual singing with words)
   - Choruses with clear articulated words
   - Bridges with lyrics
   - Any segment where mouth movement matches specific words

2. **LIPSYNC = FALSE** for:
   - Sound effects (Oo-ee-ee-ah, WUB WUB, etc.)
   - Vocalizations without clear words
   - Instrumental sections
   - Stage directions in parentheses like (Deep Voice), (Spin!)
   - Short exclamations like "¡Miau!", "Meow!"
   - Repetitive hooks that are more sound than lyrics

## Output Format (JSON):
{
  "analysis": [
    {"idx": 0, "lipsync": true, "reason": "Main verse with clear lyrics"},
    {"idx": 1, "lipsync": false, "reason": "Vocalization, not words"},
    ...
  ]
}

Return ONLY valid JSON. Include ALL ${segmentSummary.length} segments.`;
}

/**
 * Call OpenRouter AI API
 * @param {string} prompt
 * @param {Object} params
 * @returns {Promise<string>}
 */
async function callAI(prompt, params) {
  let controller = new AbortController();
  let timeoutId = setTimeout(() => controller.abort(), 60000);
  let abortFromParent = () => controller.abort(params.signal.reason || new Error('AI request aborted'));

  if (params.signal) {
    if (params.signal.aborted) abortFromParent();
    else params.signal.addEventListener('abort', abortFromParent, { once: true });
  }

  try {
    let response = await fetch(`${params.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
        'HTTP-Referer': 'https://symbiote-video.local',
        'X-Title': 'Symbiote Video - Lipsync Selector',
      },
      body: JSON.stringify({
        model: params.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 8192,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let error = await response.text();
      throw new Error(`API error ${response.status}: ${error}`);
    }

    let data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  } finally {
    params.signal?.removeEventListener('abort', abortFromParent);
  }
}

/**
 * Parse AI response and apply to segments
 * @param {string} response
 * @param {Array} segments
 * @returns {Array}
 */
function parseAIResponse(response, segments) {
  let jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in AI response');
  }

  let parsed = JSON.parse(jsonMatch[0]);
  let analysis = parsed.analysis || [];

  let lipsyncMap = new Map();
  for (const item of analysis) {
    lipsyncMap.set(item.idx, {
      isLipSync: item.lipsync === true,
      lipsyncReason: item.reason || '',
    });
  }

  return segments.map((seg, idx) => {
    let aiDecision = lipsyncMap.get(idx);
    return {
      ...seg,
      isLipSync: aiDecision?.isLipSync ?? false,
      lipsyncReason: aiDecision?.lipsyncReason || 'Not analyzed',
    };
  });
}
