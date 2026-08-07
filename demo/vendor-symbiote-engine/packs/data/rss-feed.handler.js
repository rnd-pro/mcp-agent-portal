/**
 * data/rss-feed — RSS Feed Fetcher
 *
 * Fetches and parses RSS feeds with caching, retry logic, and rate limiting.
 * Supports multi-source aggregation with category rotation and topic categorization.
 *
 * Ported from Mr-Computer/automations/argentine-spanish-bot/src/services/rss-feed.js
 *
 * @module symbiote-engine/packs/data/rss-feed */

/**
 * Build an abort signal for request timeout handling.
 * @returns {AbortSignal}
 */
function requestSignal(timeout, parentSignal) {
  let timeoutSignal = AbortSignal.timeout(timeout);
  return parentSignal && AbortSignal.any
    ? AbortSignal.any([parentSignal, timeoutSignal])
    : timeoutSignal;
}

/**
 * Simple hash for dedup
 * @param {string} str
 * @returns {string}
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    let chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Extract image URL from RSS item
 * @param {Object} item
 * @returns {string|null}
 */
function extractImageUrl(item) {
  if (item.enclosure?.url) return item.enclosure.url;
  if (item['media:content']?.$.url) return item['media:content'].$.url;
  let imgMatch = (item.content || item['content:encoded'] || '').match(/<img[^>]+src=["']([^"']+)/);
  if (imgMatch) return imgMatch[1];
  return null;
}


const CATEGORIES = [
  {
    id: 'politica',
    name: 'Política',
    keywords: [
      'presidente',
      'gobierno',
      'congreso',
      'diputado',
      'senador',
      'ley',
      'decreto',
      'ministerio',
      'elecciones',
      'votación',
    ],
  },
  {
    id: 'economia',
    name: 'Economía',
    keywords: [
      'dólar',
      'peso',
      'inflación',
      'bcra',
      'mercado',
      'bolsa',
      'precio',
      'sueldo',
      'impuesto',
      'deuda',
    ],
  },
  {
    id: 'deportes',
    name: 'Deportes',
    keywords: [
      'gol',
      'partido',
      'fútbol',
      'selección',
      'liga',
      'mundial',
      'copa',
      'técnico',
      'jugador',
      'cancha',
    ],
  },
  {
    id: 'sociedad',
    name: 'Sociedad',
    keywords: [
      'vecinos',
      'barrio',
      'ciudad',
      'protesta',
      'educación',
      'salud',
      'hospital',
      'seguridad',
      'policía',
    ],
  },
  {
    id: 'tecnologia',
    name: 'Tecnología',
    keywords: [
      'app',
      'inteligencia artificial',
      'robot',
      'celular',
      'internet',
      'red social',
      'digital',
      'hacker',
    ],
  },
  {
    id: 'cultura',
    name: 'Cultura',
    keywords: [
      'cine',
      'teatro',
      'música',
      'festival',
      'museo',
      'libro',
      'artista',
      'exposición',
      'concierto',
    ],
  },
  {
    id: 'internacional',
    name: 'Internacional',
    keywords: [
      'eeuu',
      'estados unidos',
      'europa',
      'china',
      'rusia',
      'brasil',
      'guerra',
      'otan',
      'onu',
    ],
  },
  {
    id: 'clima',
    name: 'Clima',
    keywords: [
      'temperatura',
      'lluvia',
      'viento',
      'tormenta',
      'calor',
      'frío',
      'pronóstico',
      'ola de calor',
    ],
  },
];

/**
 * Categorize a topic based on title and content
 * @param {string} title
 * @param {string} content
 * @returns {{ id: string, name: string }}
 */
function categorizeTopic(title, content) {
  let combined = `${title} ${content}`.toLowerCase();
  let bestCategory = { id: 'general', name: 'General' };
  let bestScore = 0;

  for (const cat of CATEGORIES) {
    let score = 0;
    for (const kw of cat.keywords) {
      if (combined.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = { id: cat.id, name: cat.name };
    }
  }

  return bestCategory;
}

/**
 * Parse RSS XML manually (lightweight, no dependency)
 * @param {string} xml
 * @returns {Array<Object>}
 */
function parseRssXml(xml) {
  let items = [];
  let itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    let content = match[1];
    let getTag = (tag) => {
      let m = content.match(
        new RegExp(
          `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
          'i'
        )
      );
      return m ? (m[1] || m[2] || '').trim() : '';
    };

    items.push({
      title: getTag('title'),
      link: getTag('link'),
      description: getTag('description'),
      pubDate: getTag('pubDate'),
      content: getTag('content:encoded') || getTag('description'),
    });
  }

  return items;
}


export default {
  type: 'data/rss-feed',
  category: 'data',
  icon: 'rss_feed',

  driver: {
    description: 'Fetch and parse RSS feeds with caching, categorization, and multi-source support',
    inputs: [{ name: 'url', type: 'string' }],
    outputs: [
      { name: 'result', type: 'any' },
      { name: 'error', type: 'string' },
    ],
    params: {
      operation: {
        type: 'string',
        default: 'fetch',
        description: 'Operation: fetch | fetch-multi | categorize',
      },
      urls: { type: 'any', default: null, description: 'Array of URLs for fetch-multi' },
      maxItems: { type: 'int', default: 20, description: 'Maximum items to return per feed' },
      timeout: { type: 'int', default: 10000, description: 'Fetch timeout in ms' },

      items: {
        type: 'any',
        default: null,
        description: 'Array of {title, content} for categorize operation',
      },
    },
  },

  lifecycle: {
    validate: (inputs, params) => {
      let op = params.operation;
      if (op === 'categorize') return Array.isArray(params.items);
      if (op === 'fetch-multi') return Array.isArray(params.urls) && params.urls.length > 0;
      return typeof inputs.url === 'string' && inputs.url.startsWith('http');
    },

    cacheKey: (inputs, params) => {
      if (params.operation === 'categorize') return null;
      let url = params.operation === 'fetch-multi' ? params.urls.join(',') : inputs.url;
      return `rss:${params.operation}:${simpleHash(url)}`;
    },

    execute: async (inputs, params) => {
      let { operation, maxItems, timeout } = params;

      try {
        let opMap = {
          fetch: async () => {
            let response = await fetch(inputs.url, {
              signal: requestSignal(timeout, params.signal),
              headers: { 'User-Agent': 'symbiote-engine/rss-feed/1.0' },
            });
            if (!response.ok) return { error: `HTTP ${response.status}: ${response.statusText}` };

            let xml = await response.text();
            let rawItems = parseRssXml(xml);

            let items = rawItems.slice(0, maxItems).map((item) => ({
              id: simpleHash(item.title + item.link),
              title: item.title,
              link: item.link,
              description: item.description,
              pubDate: item.pubDate,
              image: extractImageUrl(item),
              category: categorizeTopic(item.title, item.description),
            }));

            return { result: { items, count: items.length, source: inputs.url } };
          },
          'fetch-multi': async () => {
            let allItems = [];
            let errors = [];

            for (const url of params.urls) {
              try {
                let response = await fetch(url, {
                  signal: requestSignal(timeout, params.signal),
                  headers: { 'User-Agent': 'symbiote-engine/rss-feed/1.0' },
                });
                if (!response.ok) {
                  errors.push({ url, error: `HTTP ${response.status}` });
                  continue;
                }

                let xml = await response.text();
                let rawItems = parseRssXml(xml);

                for (const item of rawItems.slice(0, maxItems)) {
                  allItems.push({
                    id: simpleHash(item.title + item.link),
                    title: item.title,
                    link: item.link,
                    description: item.description,
                    pubDate: item.pubDate,
                    image: extractImageUrl(item),
                    category: categorizeTopic(item.title, item.description),
                    source: url,
                  });
                }
              } catch (err) {
                errors.push({ url, error: err.message });
              }
            }


            let seen = new Set();
            let unique = allItems.filter((item) => {
              if (seen.has(item.id)) return false;
              seen.add(item.id);
              return true;
            });

            return {
              result: { items: unique, count: unique.length, sources: params.urls.length, errors },
            };
          },
          categorize: async () => {
            let categorized = params.items.map((item) => ({
              ...item,
              category: categorizeTopic(item.title || '', item.content || item.description || ''),
            }));


            let grouped = {};
            for (const item of categorized) {
              let key = item.category.id;
              if (!grouped[key]) grouped[key] = { category: item.category, items: [] };
              grouped[key].items.push(item);
            }

            return { result: { categorized, grouped, count: categorized.length } };
          },
        };

        if (opMap[operation]) {
          return await opMap[operation]();
        } else {
          return { error: `Unknown operation: ${operation}` };
        }
      } catch (err) {
        return { error: `rss-feed ${operation} failed: ${err.message}` };
      }
    },
  },
};
