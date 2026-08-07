/**
 * data/personas — Character persona registry for TTS pipelines
 *
 * Manages character presets with voice settings, personality descriptions,
 * and audio reference samples. Used as a data source node that feeds
 * ai/tts with correct speaker/voice parameters.
 *
 * Persona structure (from Mr-Computer/argentine-spanish-bot):
 *   id, name, personality, voiceInstruct, speaker (Qwen3 ID),
 *   refAudio (per-language samples), pan (stereo position)
 *
 * Operations:
 *   get     — get persona by ID
 *   list    — list all personas (optionally filtered)
 *   random  — pick N random personas
 *
 * @module symbiote-engine/packs/data/personas
 */

/** @typedef {Object} Persona
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} personality - Character description for AI prompts
 * @property {string} voiceInstruct - Emotion/style instruction for TTS
 * @property {string} speaker - Qwen3-TTS speaker ID (ryan, vivian, etc.)
 * @property {Object<string, string>} [refAudio] - Per-language voice reference paths
 * @property {number} [pan] - Stereo position (-1.0 left to 1.0 right)
 * @property {string} [gender] - male | female
 * @property {string} [type] - normal | meme | dj
 */

/**
 * Built-in persona presets (from radio-dj-config.js)
 * @type {Persona[]}
 */
const BUILT_IN_PRESETS = [
  {
    id: 'dj_matias',
    name: 'Matías',
    personality: 'Energetic morning host, asks probing questions, uses "che" frequently',
    voiceInstruct: 'Enthusiastic and dynamic, curious tone',
    speaker: 'ryan',
    pan: -0.2,
    gender: 'male',
    type: 'dj',
  },
  {
    id: 'dj_lucia',
    name: 'Lucía',
    personality: 'Analytical co-host, provides context and facts, thoughtful responses',
    voiceInstruct: 'Clear articulate tone, warm and engaging',
    speaker: 'vivian',
    pan: 0.2,
    gender: 'female',
    type: 'dj',
  },
  {
    id: 'dj_carlos',
    name: 'Carlos',
    personality: 'Veteran journalist, offers historical perspective, calm authority',
    voiceInstruct: 'Deep calm authoritative voice, measured pace',
    speaker: 'ryan',
    pan: -0.1,
    gender: 'male',
    type: 'dj',
  },
  {
    id: 'dj_sofia',
    name: 'Sofía',
    personality:
      'Young reporter, brings fresh perspectives, occasionally interrupts with excitement',
    voiceInstruct: 'Youthful energetic voice, sometimes excited',
    speaker: 'vivian',
    pan: 0.1,
    gender: 'female',
    type: 'dj',
  },
];

export default {
  type: 'data/personas',
  category: 'data',
  icon: 'groups',

  driver: {
    description: 'Character persona registry — voice presets with personality for TTS',
    inputs: [{ name: 'personaId', type: 'string' }],
    outputs: [
      { name: 'persona', type: 'any' },
      { name: 'personas', type: 'any' },
      { name: 'error', type: 'string' },
    ],
    params: {
      operation: { type: 'string', default: 'get', description: 'get | list | random' },
      count: { type: 'int', default: 2, description: 'Number of personas for random operation' },
      filterGender: { type: 'string', default: '', description: 'Filter by gender: male | female' },
      filterType: {
        type: 'string',
        default: '',
        description: 'Filter by type: dj | normal | meme',
      },
      customPresets: {
        type: 'any',
        default: null,
        description: 'Custom persona array (overrides built-in)',
      },
    },
  },

  lifecycle: {
    validate: (inputs, params) => {
      let op = params?.operation || 'get';
      if (op === 'get' && !inputs.personaId) return false;
      return true;
    },

    cacheKey: (inputs, params) => {
      let op = params.operation || 'get';
      if (op === 'get') return `personas:get:${inputs.personaId}`;
      if (op === 'random') return null;
      return `personas:list:${params.filterGender}:${params.filterType}`;
    },

    execute: async (inputs, params) => {
      let presets = params.customPresets || BUILT_IN_PRESETS;
      let op = params.operation || 'get';

      if (op === 'get') {
        let persona = presets.find((p) => p.id === inputs.personaId);
        if (!persona) {
          return { persona: null, personas: null, error: `Persona not found: ${inputs.personaId}` };
        }
        return { persona, personas: null, error: null };
      }

      if (op === 'list') {
        let filtered = [...presets];
        if (params.filterGender) {
          filtered = filtered.filter((p) => p.gender === params.filterGender);
        }
        if (params.filterType) {
          filtered = filtered.filter((p) => p.type === params.filterType);
        }
        return { persona: null, personas: filtered, error: null };
      }

      if (op === 'random') {
        let pool = [...presets];
        if (params.filterGender) {
          pool = pool.filter((p) => p.gender === params.filterGender);
        }
        if (params.filterType) {
          pool = pool.filter((p) => p.type === params.filterType);
        }

        for (let i = pool.length - 1; i > 0; i--) {
          let j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        let selected = pool.slice(0, Math.min(params.count || 2, pool.length));
        return { persona: selected[0] || null, personas: selected, error: null };
      }

      return { persona: null, personas: null, error: `Unknown operation: ${op}` };
    },
  },
};
