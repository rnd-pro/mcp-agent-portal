/**
 * transform/riopla-adapt — Rioplatense text adaptation for TTS
 *
 * Pure text transforms: Spanish→Cyrillic transliteration for TTS guidance,
 * Rioplatense pronunciation adaptation, number→word conversion,
 * and voice style instruct generation.
 *
 * Ported from Mr-Computer/automations/argentine-spanish-bot/src/utils/transliteration/riopla.js
 * and instruct-generator.js
 *
 * @module symbiote-engine/packs/transform/riopla-adapt
 */


/**
 * Lightweight word segmenter; uses Intl.Segmenter when available
 * @param {string} text
 * @returns {Array<{type: string, value: string}>}
 */
function segmentWords(text) {
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      let seg = new Intl.Segmenter('es', { granularity: 'word' });
      return Array.from(seg.segment(text)).map((s) => ({
        type: /\p{L}/u.test(s.segment) ? 'word' : 'sep',
        value: s.segment,
      }));
    }
  } catch {

  }
  let parts = text.split(/(\p{L}+(?:[\p{Mn}\p{Pd}]?\p{L}+)*)/u);
  return parts.filter(Boolean).map((p) => ({ type: /\p{L}/u.test(p) ? 'word' : 'sep', value: p }));
}

/**
 * Apply ordered regex rules to a single token
 * @param {string} word
 * @param {Array<{re: RegExp, to: Function|string}>} rules
 * @returns {string}
 */
function applyRules(word, rules) {
  let w = word;
  for (const { re, to } of rules) {
    w = w.replace(re, (...args) => (typeof to === 'function' ? to(...args) : to));
  }
  return w;
}

/**
 * Find which vowel (by index, 0-based) should be stressed in a Spanish word.
 * @param {string} word
 * @returns {number} Index of stressed vowel, or -1
 */
function findSpanishStressVowelIndex(word) {
  let vowels = [];
  for (let i = 0; i < word.length; i++) {
    let char = word[i];
    if (char.toLowerCase() === 'u') {
      let prev = word[i - 1]?.toLowerCase();
      let next = word[i + 1]?.toLowerCase();
      if (prev === 'q' && (next === 'e' || next === 'i')) continue;
      if (prev === 'g' && (next === 'e' || next === 'i')) continue;
    }
    if (/[aeiouüáéíóú]/i.test(char)) {
      vowels.push({ index: i, char });
    }
  }
  if (vowels.length <= 1) return -1;
  let accentedIndex = vowels.findIndex((v) => /[áéíóú]/i.test(v.char));
  if (accentedIndex >= 0) return accentedIndex;
  let cleanWord = word.replace(/[.,:;!?¡¿]+$/, '');
  let lastChar = cleanWord.slice(-1).toLowerCase();
  if (/[aeiouüns]/.test(lastChar)) return Math.max(0, vowels.length - 2);
  return vowels.length - 1;
}

/**
 * Add stress mark to the Nth vowel in Cyrillic text.
 * @param {string} cyrillic
 * @param {number} vowelIndex
 * @returns {string}
 */
function addCyrillicStressByVowelIndex(cyrillic, vowelIndex) {
  let normalized = cyrillic.normalize('NFD');
  let vowelPattern = /[аеиоуяёюыэАЕИОУЯЁЮЫЭ]/g;
  let vowels = [];
  let match;
  while ((match = vowelPattern.exec(normalized)) !== null) {
    let nextChar = normalized[match.index + 1];
    let hasStress = nextChar === '\u0301';
    vowels.push({ index: match.index, char: match[0], hasStress });
  }
  if (vowels.length === 0 || vowelIndex >= vowels.length) return cyrillic;
  let targetVowel = vowels[vowelIndex];
  if (targetVowel.hasStress) return cyrillic;
  let result =
    normalized.substring(0, targetVowel.index + 1) +
    '\u0301' +
    normalized.substring(targetVowel.index + 1);
  return result.normalize('NFC');
}

/**
 * Transliterate Spanish (Rioplatense) to Cyrillic for TTS guidance
 * @param {string} input
 * @param {Object} [opts]
 * @returns {string}
 */
function transliterateSpanishToCyrillic(input, opts = {}) {
  let options = {
    yConj: 'и',
    keepAccents: true,
    autoStress: true,
    normalize: 'NFC',
    ...opts,
  };
  if (!input) return '';

  let textWithNumbers = convertNumbersToSpanish(String(input));
  let text = options.normalize ? textWithNumbers.normalize(options.normalize) : textWithNumbers;

  function matchCase(src, dst) {
    if (src.toUpperCase() === src) return dst.toUpperCase();
    if (src[0] && src[0] === src[0].toUpperCase()) return dst[0].toUpperCase() + dst.slice(1);
    return dst;
  }

  function mapVowel(v) {
    let lower = v.toLowerCase();
    let table = {
      a: 'а',
      e: 'е',
      i: 'и',
      o: 'о',
      u: 'у',
      á: 'а́',
      é: 'е́',
      í: 'и́',
      ó: 'о́',
      ú: 'у́',
      ü: 'у',
    };
    let base = table[lower] || v;
    if (!options.keepAccents) return base.replace('\u0301', '');
    return matchCase(v, base);
  }

  const CONS_LOWER = {
    n: 'н',
    m: 'м',
    p: 'п',
    t: 'т',
    d: 'д',
    l: 'л',
    r: 'р',
    s: 'с',
    f: 'ф',
    g: 'г',
    k: 'к',
  };
  const LL = 'щ';

  let rules = [
    { re: /\bel\b/gi, to: (m) => matchCase(m, 'эль') },
    { re: /\bdel\b/gi, to: (m) => matchCase(m, 'дель') },
    { re: /\bal\b/gi, to: (m) => matchCase(m, 'аль') },
    { re: /\byo\b/gi, to: (m) => matchCase(m, 'що') },
    { re: /(?<![a-záéíóúüñ])e/gi, to: (m) => matchCase(m, 'э') },
    { re: /(?<![a-záéíóúüñ])é/gi, to: (m) => matchCase(m, 'э́') },
    { re: /ch/gi, to: (m) => matchCase(m, 'ч') },
    { re: /rr/gi, to: (m) => matchCase(m, 'рр') },
    { re: /ll/gi, to: (m) => matchCase(m, LL) },
    { re: /l(?=[^aeiouáéíóú\s]|$)/gi, to: (m) => matchCase(m, 'ль') },
    { re: /qu([eiéí])/gi, to: (m, v) => matchCase(m, 'к') + mapVowel(v) },
    { re: /qu([aouáóú])/gi, to: (m, v) => matchCase(m, 'к') + mapVowel(v) },
    { re: /gü([ei])/gi, to: (m, v) => matchCase(m, 'гв') + mapVowel(v) },
    { re: /gu([eiéí])/gi, to: (m, v) => matchCase(m[0], 'г') + mapVowel(v) },
    { re: /g([eiéí])/gi, to: (m, v) => matchCase(m[0], 'х') + mapVowel(v) },
    { re: /c([eiéí])/gi, to: (m, v) => matchCase(m[0], 'с') + mapVowel(v) },
    { re: /c([aouáóú])/gi, to: (m, v) => matchCase(m[0], 'к') + mapVowel(v) },
    { re: /c/gi, to: (m) => matchCase(m, 'к') },
    { re: /\b[yY]\b/g, to: () => options.yConj },
    { re: /y(?=[aeiouáéíóú])/gi, to: (m) => matchCase(m, LL) },
    { re: /j/gi, to: (m) => matchCase(m, 'х') },
    { re: /z/gi, to: (m) => matchCase(m, 'с') },
    { re: /q/gi, to: (m) => matchCase(m, 'к') },
    { re: /h/gi, to: () => '' },
    { re: /x/gi, to: (m) => matchCase(m, 'кс') },
    { re: /ñ/g, to: 'нь' },
    { re: /Ñ/g, to: 'НЬ' },
    { re: /[vb]/g, to: 'б' },
    { re: /[VB]/g, to: 'Б' },
    { re: /ay\b/gi, to: (m) => matchCase(m, 'ай') },
    { re: /ey\b/gi, to: (m) => matchCase(m, 'эй') },
    { re: /oy\b/gi, to: (m) => matchCase(m, 'ой') },
    { re: /uy\b/gi, to: (m) => matchCase(m, 'уй') },
    { re: /iy\b/gi, to: (m) => matchCase(m, 'ий') },
    { re: /[aeiouáéíóúüAEIOUÁÉÍÓÚÜ]/g, to: (m) => mapVowel(m) },
    { re: /[nmp tdlrsfgk]/g, to: (m) => CONS_LOWER[m] || m },
    {
      re: /[NMP TDLRSFGK]/g,
      to: (m) => (CONS_LOWER[m.toLowerCase()] || m.toLowerCase()).toUpperCase(),
    },
    { re: /l\b/gi, to: (m) => matchCase(m, 'ль') },
  ];

  let segments = segmentWords(text);
  let out = segments
    .map((seg) => {
      if (seg.type !== 'word') return seg.value;
      let spanishVowelIndex = options.autoStress ? findSpanishStressVowelIndex(seg.value) : -1;
      let transliterated = applyRules(seg.value, rules);
      if (spanishVowelIndex >= 0)
        return addCyrillicStressByVowelIndex(transliterated, spanishVowelIndex);
      return transliterated;
    })
    .join('');

  return out;
}

/**
 * Convert numbers 0-999 to Spanish words
 * @param {string} text
 * @returns {string}
 */
function convertNumbersToSpanish(text) {
  let ones = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  let teens = [
    'diez',
    'once',
    'doce',
    'trece',
    'catorce',
    'quince',
    'dieciséis',
    'diecisiete',
    'dieciocho',
    'diecinueve',
  ];
  let tens = [
    '',
    '',
    'veinte',
    'treinta',
    'cuarenta',
    'cincuenta',
    'sesenta',
    'setenta',
    'ochenta',
    'noventa',
  ];
  let hundreds = [
    '',
    'ciento',
    'doscientos',
    'trescientos',
    'cuatrocientos',
    'quinientos',
    'seiscientos',
    'setecientos',
    'ochocientos',
    'novecientos',
  ];

  function numberToSpanish(n) {
    if (n === 0) return 'cero';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n === 20) return 'veinte';
    if (n < 30) return 'veinti' + ones[n - 20];
    if (n < 100) {
      let ten = Math.floor(n / 10);
      let one = n % 10;
      return tens[ten] + (one ? ' y ' + ones[one] : '');
    }
    if (n === 100) return 'cien';
    if (n < 1000) {
      let hundred = Math.floor(n / 100);
      let rest = n % 100;
      return hundreds[hundred] + (rest ? ' ' + numberToSpanish(rest) : '');
    }
    return String(n);
  }

  return text.replace(/\b\d+\b/g, (match) => {
    let num = parseInt(match, 10);
    if (isNaN(num) || num > 999) return match;
    return numberToSpanish(num);
  });
}

/**
 * Adapt Spanish text for Rioplatense pronunciation
 * @param {string} text
 * @returns {string}
 */
function adaptSpanishToRioplatense(text) {
  if (!text) return '';
  return text
    .replace(/ll/gi, 'sh')
    .replace(/\by\b/gi, 'i')
    .replace(/y(?=[aeiouáéíóú])/gi, 'sh')
    .replace(/([^cs]|^)h/gi, '$1');
}


const INSTRUCT_TEMPLATES = {
  ru: {
    neutral: ['', 'Говори спокойно и уверенно', 'Четко и разборчиво', 'В нейтральном тоне'],
    friendly: [
      'В дружелюбном тоне',
      'Тепло и приветливо',
      'С улыбкой в голосе',
      'Доброжелательно и открыто',
    ],
    enthusiastic: [
      'С энтузиазмом',
      'Увлеченно и живо',
      'С воодушевлением',
      'Энергично и позитивно',
    ],
    teaching: [
      'Как опытный преподаватель',
      'Терпеливо и понятно',
      'Объясняя как ученику',
      'Четко и методично',
    ],
    encouraging: [
      'Одобрительно и поддерживающе',
      'С теплотой и заботой',
      'Мотивирующим тоном',
      'Вдохновляюще',
    ],
  },
  es: {
    neutral: ['', 'Habla con calma y claridad', 'De manera natural', 'Con tono neutro'],
    friendly: ['Con tono amigable', 'De manera cálida y acogedora', 'Con simpatía', 'Amablemente'],
    enthusiastic: ['Con entusiasmo', 'De manera animada', 'Con energía positiva', 'Alegremente'],
    teaching: [
      'Como un profesor paciente',
      'Explicando claramente',
      'De forma didáctica',
      'Con paciencia',
    ],
    encouraging: [
      'De manera alentadora',
      'Con apoyo y calidez',
      'Motivando al estudiante',
      'Con palabras de ánimo',
    ],
  },
  en: {
    neutral: ['', 'Speak calmly and clearly', 'In a natural tone', 'Neutrally'],
    friendly: ['In a friendly tone', 'Warm and welcoming', 'With a smile in your voice', 'Kindly'],
    enthusiastic: [
      'With enthusiasm',
      'Energetically and lively',
      'With excitement',
      'Positively and upbeat',
    ],
    teaching: [
      'Like a patient teacher',
      'Explaining clearly',
      'In a didactic manner',
      'With patience',
    ],
    encouraging: ['Encouragingly', 'With warmth and support', 'Motivatingly', 'Inspiringly'],
  },
};

const CONTEXT_PATTERNS = {
  question: /[?¿]/,
  exclamation: /[!¡]/,
  greeting: /^(привет|hola|hello|hey|buenos|добрый|доброе)/i,
  farewell: /\b(пока|adiós|chau|bye|hasta|до свидания)\b/i,
  encouragement: /\b(молодец|отлично|bien|great|excellent|genial|excelente)\b/i,
  correction: /\b(внимание|ошибка|error|cuidado|attention|mistake)\b/i,
};

/**
 * Detect context from text content
 * @param {string} text
 * @returns {string}
 */
function detectContext(text) {
  if (CONTEXT_PATTERNS.encouragement.test(text)) return 'encouraging';
  if (CONTEXT_PATTERNS.greeting.test(text)) return 'friendly';
  if (CONTEXT_PATTERNS.correction.test(text)) return 'teaching';
  if (CONTEXT_PATTERNS.exclamation.test(text)) return 'enthusiastic';
  if (CONTEXT_PATTERNS.question.test(text)) return 'friendly';
  return 'neutral';
}

/**
 * @param {Array} arr
 * @returns {*}
 */
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a voice instruct prompt for TTS
 * @param {Object} options
 * @param {string} options.text
 * @param {string} options.lang
 * @param {string} [options.context]
 * @param {boolean} [options.randomize]
 * @returns {string}
 */
function generateVoiceInstruct({ text, lang, context = null, randomize = true }) {
  let langTemplates = INSTRUCT_TEMPLATES[lang] || INSTRUCT_TEMPLATES.ru;
  let effectiveContext = context || detectContext(text);
  let templates = langTemplates[effectiveContext] || langTemplates.neutral;
  return randomize ? randomChoice(templates) : templates[0];
}

/**
 * Generate varied instructs for a batch of segments
 * @param {Array<{text: string, lang: string}>} segments
 * @returns {Array<string>}
 */
function generateBatchInstructs(segments) {
  let recentlyUsed = new Set();
  let results = [];
  for (const seg of segments) {
    let instruct = '';
    let attempts = 0;
    while (attempts < 3) {
      instruct = generateVoiceInstruct({ text: seg.text, lang: seg.lang });
      if (!recentlyUsed.has(instruct) || instruct === '') break;
      attempts++;
    }
    results.push(instruct);
    if (instruct) {
      recentlyUsed.add(instruct);
      if (recentlyUsed.size > 3) {
        let first = recentlyUsed.values().next().value;
        recentlyUsed.delete(first);
      }
    }
  }
  return results;
}


export default {
  type: 'transform/riopla-adapt',
  category: 'transform',
  icon: 'translate',

  driver: {
    description:
      'Rioplatense text adaptation: transliteration, pronunciation, number conversion, voice instructs',
    inputs: [{ name: 'text', type: 'string' }],
    outputs: [
      { name: 'result', type: 'any' },
      { name: 'error', type: 'string' },
    ],
    params: {
      operation: {
        type: 'string',
        default: 'transliterate',
        description:
          'Operation: transliterate | adapt-rioplatense | numbers-to-spanish | voice-instruct | batch-instructs',
      },

      keepAccents: {
        type: 'boolean',
        default: true,
        description: 'Preserve acute accents in Cyrillic output',
      },
      autoStress: {
        type: 'boolean',
        default: true,
        description: 'Auto-add stress marks based on Spanish rules',
      },

      lang: {
        type: 'string',
        default: 'es',
        description: 'Language code for voice instruct (ru/es/en)',
      },
      context: {
        type: 'string',
        default: null,
        description:
          'Voice instruct context hint (neutral/friendly/enthusiastic/teaching/encouraging)',
      },

      segments: {
        type: 'any',
        default: null,
        description: 'Array of {text, lang} for batch instruct generation',
      },
    },
  },

  lifecycle: {
    validate: (inputs, params) => {
      let op = params.operation;
      if (op === 'batch-instructs') {
        return Array.isArray(params.segments) && params.segments.length > 0;
      }
      return typeof inputs.text === 'string' && inputs.text.length > 0;
    },

    cacheKey: (inputs, params) => {
      if (params.operation === 'batch-instructs') return null;
      if (params.operation === 'voice-instruct') return null;
      return `riopla:${params.operation}:${inputs.text?.slice(0, 100)}`;
    },

    execute: async (inputs, params) => {
      let { text } = inputs;
      let { operation } = params;

      try {
        let opMap = {
          transliterate: () => {
            let result = transliterateSpanishToCyrillic(text, {
              keepAccents: params.keepAccents,
              autoStress: params.autoStress,
            });
            return { result: { original: text, cyrillic: result } };
          },
          'adapt-rioplatense': () => {
            let result = adaptSpanishToRioplatense(text);
            return { result: { original: text, adapted: result } };
          },
          'numbers-to-spanish': () => {
            let result = convertNumbersToSpanish(text);
            return { result: { original: text, converted: result } };
          },
          'voice-instruct': () => {
            let instruct = generateVoiceInstruct({
              text,
              lang: params.lang,
              context: params.context,
            });
            return { result: { text, instruct, lang: params.lang } };
          },
          'batch-instructs': () => {
            let instructs = generateBatchInstructs(params.segments);
            return { result: { segments: params.segments, instructs } };
          },
        };

        if (opMap[operation]) {
          return opMap[operation]();
        } else {
          return { error: `Unknown operation: ${operation}` };
        }
      } catch (err) {
        return { error: `riopla-adapt ${operation} failed: ${err.message}` };
      }
    },
  },
};
