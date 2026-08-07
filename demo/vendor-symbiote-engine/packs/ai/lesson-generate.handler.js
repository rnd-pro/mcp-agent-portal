/**
 * ai/lesson-generate — AI Lesson Generation
 *
 * Generates structured educational lessons from news content using AI.
 * Supports lesson creation, vocabulary generation, daily digest compilation,
 * and content style validation.
 *
 * Ported from Mr-Computer/automations/argentine-spanish-bot/src/services/learning-by-examples.js
 *
 * @module symbiote-engine/packs/ai/lesson-generate
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

function requestSignal(params, fallbackMs = 120000) {
  let timeoutSignal = AbortSignal.timeout(params.timeout || fallbackMs);
  return params.signal && AbortSignal.any
    ? AbortSignal.any([params.signal, timeoutSignal])
    : timeoutSignal;
}

/**
 * Load educational materials for context
 * @param {string} materialsDir
 * @returns {Promise<Object>}
 */
async function loadMaterials(materialsDir) {
  let materials = {};
  try {
    let entries = await readdir(materialsDir);
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      let content = await readFile(path.join(materialsDir, entry), 'utf-8');
      materials[entry.replace('.md', '')] = content;
    }
  } catch {

  }
  return materials;
}

/**
 * Build lesson generation prompt
 * @param {Object} newsItems
 * @param {Object} materials
 * @param {string} focus
 * @param {number} maxExamples
 * @returns {string}
 */
function buildLessonPrompt(newsItems, materials, focus, maxExamples) {
  let prompt = `You are an experienced Spanish teacher specializing in Rioplatense Argentine Spanish for A1 level learners.\n\n`;

  prompt += `TASK: Generate a structured lesson based on the following news items.\n\n`;


  prompt += `NEWS CONTEXT:\n`;
  for (const item of newsItems.slice(0, 5)) {
    prompt += `- ${item.title || 'Untitled'}: ${(item.description || item.content || '').slice(0, 200)}\n`;
  }


  if (focus) {
    prompt += `\nLESSON FOCUS: ${focus}\n`;
  }


  let materialKeys = Object.keys(materials);
  if (materialKeys.length > 0) {
    prompt += `\nSTYLE REFERENCE (learn from these examples):\n`;
    for (const key of materialKeys.slice(0, 3)) {
      prompt += `--- ${key} ---\n${materials[key].slice(0, 500)}\n\n`;
    }
  }

  prompt += `\nOUTPUT FORMAT: JSON object with these fields:
{
  "title_es": "Lesson title in Spanish",
  "title_ru": "Lesson title in Russian",
  "focus": "Grammar/vocabulary focus",
  "explanation_ru": "2-3 line explanation in Russian about the Spanish construction",
  "examples": [{"es": "Spanish example", "ru": "Russian translation"}],
  "note_pron_ru": "Optional pronunciation note in Russian",
  "vocabulary": [{"es": "word/phrase", "ru": "translation"}],
  "podcast_script": {
    "speaker1": "Russian-speaking host lines",
    "speaker2": "Spanish-speaking guest lines"
  }
}

RULES:
- Maximum ${maxExamples} example pairs
- Use Rioplatense dialect (vos, Argentine vocabulary)
- Keep explanations simple for A1 level
- Examples should relate to the news context
- Vocabulary: 10 items, nouns with articles (el/la)
- No English, only Spanish (es-AR) and Russian
`;

  return prompt;
}

/**
 * Build digest prompt
 * @param {Object} digestData
 * @returns {string}
 */
function buildDigestPrompt(digestData) {
  let { newsItems, categories } = digestData;

  let prompt = `Create a daily educational news digest for A1 Spanish learners.\n\n`;

  if (categories) {
    prompt += `CATEGORIES:\n`;
    for (const [cat, items] of Object.entries(categories)) {
      prompt += `- ${cat}: ${items.length} items\n`;
    }
    prompt += '\n';
  }

  prompt += `TOP NEWS:\n`;
  for (const item of (newsItems || []).slice(0, 8)) {
    prompt += `- ${item.title}: ${(item.description || '').slice(0, 150)}\n`;
  }

  prompt += `\nOUTPUT FORMAT: JSON with fields:
{
  "title_es": "Digest title",
  "title_ru": "Russian title",
  "sections": [{"category": "Category name", "summary_es": "Spanish summary", "summary_ru": "Russian summary", "vocabulary": [{"es": "word", "ru": "translation"}]}],
  "lesson": {"focus": "Grammar point", "examples": [{"es": "", "ru": ""}]}
}
`;

  return prompt;
}

/**
 * Parse flexible AI response
 * @param {string} response
 * @returns {Object}
 */
function parseResponse(response) {
  let jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {

    }
  }
  return { error: 'Failed to parse AI response', raw: response };
}

/**
 * Validate lesson segments
 * @param {Object} lesson
 * @returns {Array<string>}
 */
function validateLesson(lesson) {
  let violations = [];

  if (!lesson.title_es) violations.push('Missing title_es');
  if (!lesson.focus) violations.push('Missing focus');
  if (!Array.isArray(lesson.examples) || lesson.examples.length === 0) {
    violations.push('Missing or empty examples');
  }
  if (lesson.examples) {
    for (let i = 0; i < lesson.examples.length; i++) {
      let ex = lesson.examples[i];
      if (!ex.es || !ex.ru) violations.push(`Example ${i} missing es or ru`);
    }
  }

  return violations;
}


export default {
  type: 'ai/lesson-generate',
  category: 'ai',
  icon: 'school',

  driver: {
    description:
      'AI-powered lesson generation from news content with vocabulary and podcast scripts',
    inputs: [{ name: 'newsItems', type: 'any' }],
    outputs: [
      { name: 'result', type: 'any' },
      { name: 'error', type: 'string' },
    ],
    params: {
      operation: {
        type: 'string',
        default: 'lesson',
        description: 'Operation: lesson | vocabulary | daily-digest | validate-style',
      },
      apiKey: {
        type: 'string',
        default: null,
        description: 'OpenRouter API key (or OPENROUTER_API_KEY env)',
      },
      model: {
        type: 'string',
        default: 'anthropic/claude-sonnet-4',
        description: 'AI model to use',
      },
      focus: { type: 'string', default: null, description: 'Lesson focus/topic' },
      maxExamples: { type: 'int', default: 5, description: 'Maximum examples per lesson' },
      materialsDir: {
        type: 'string',
        default: null,
        description: 'Path to educational materials for style reference',
      },

      categories: { type: 'any', default: null, description: 'News items grouped by category' },

      content: { type: 'string', default: null, description: 'Content to validate' },
      contentType: { type: 'string', default: 'news', description: 'Content type for validation' },
    },
  },

  lifecycle: {
    validate: (inputs, params) => {
      if (params.operation === 'validate-style') {
        return typeof params.content === 'string';
      }
      if (!Array.isArray(inputs.newsItems) || inputs.newsItems.length === 0) return false;
      let apiKey = params.apiKey || process.env.OPENROUTER_API_KEY;
      if (!apiKey) return false;
      return true;
    },

    cacheKey: () => null,

    execute: async (inputs, params) => {
      let { newsItems } = inputs;
      let { operation, model, focus, maxExamples } = params;
      let apiKey = params.apiKey || process.env.OPENROUTER_API_KEY;

      try {
        let opMap = {
          lesson: async () => {
            let materials = params.materialsDir ? await loadMaterials(params.materialsDir) : {};

            let prompt = buildLessonPrompt(newsItems, materials, focus, maxExamples);

            let response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
              }),
              signal: requestSignal(params),
            });

            if (!response.ok) return { error: `API error: HTTP ${response.status}` };

            let data = await response.json();
            let aiResponse = data.choices?.[0]?.message?.content || '';
            let lesson = parseResponse(aiResponse);
            let violations = validateLesson(lesson, newsItems);

            return {
              result: {
                lesson,
                valid: violations.length === 0,
                violations,
                newsCount: newsItems.length,
                model,
              },
            };
          },
          vocabulary: async () => {
            let prompt = `Extract 10 key vocabulary items from these news headlines for A1 Spanish learners (Rioplatense dialect).\n\nNEWS:\n${newsItems.map((n) => `- ${n.title}`).join('\n')}\n\nOUTPUT: JSON array of {"es": "word with article", "ru": "translation"}\nRules: nouns with el/la, no brands, no cognates, prefer regional vocabulary.`;

            let response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.5,
              }),
              signal: requestSignal(params),
            });

            if (!response.ok) return { error: `API error: HTTP ${response.status}` };

            let data = await response.json();
            let aiResponse = data.choices?.[0]?.message?.content || '';
            let vocabulary = parseResponse(aiResponse);

            return { result: { vocabulary, newsCount: newsItems.length, model } };
          },
          'daily-digest': async () => {
            let prompt = buildDigestPrompt({
              newsItems,
              categories: params.categories,
            });

            let response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
              }),
              signal: requestSignal(params),
            });

            if (!response.ok) return { error: `API error: HTTP ${response.status}` };

            let data = await response.json();
            let aiResponse = data.choices?.[0]?.message?.content || '';
            let digest = parseResponse(aiResponse);

            return { result: { digest, newsCount: newsItems.length, model } };
          },
          'validate-style': async () => {
            let prompt = `Evaluate if the following ${params.contentType} content matches A1 Rioplatense Spanish learning material standards.\n\nCONTENT:\n${params.content}\n\nCheck:\n1. Vocabulary complexity (should be A1)\n2. Rioplatense dialect usage (vos, local terms)\n3. Bilingual coverage (es + ru)\n4. Educational value\n\nOUTPUT: JSON with {score: 0-100, issues: [string], suggestions: [string]}`;

            let response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
              }),
              signal: requestSignal(params),
            });

            if (!response.ok) return { error: `API error: HTTP ${response.status}` };

            let data = await response.json();
            let aiResponse = data.choices?.[0]?.message?.content || '';
            let validation = parseResponse(aiResponse);

            return { result: { validation, model } };
          },
        };

        if (opMap[operation]) {
          return await opMap[operation]();
        } else {
          return { error: `Unknown operation: ${operation}` };
        }
      } catch (err) {
        return { error: `lesson-generate ${operation} failed: ${err.message}` };
      }
    },
  },
};
