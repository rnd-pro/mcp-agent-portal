/**
 * data/news-accumulate — News Accumulator
 *
 * Collects and stores raw news items with deduplication, filtering,
 * period management, and category statistics. Supports horoscope
 * and international news filtering for Argentina-focused content.
 *
 * Ported from Mr-Computer/automations/argentine-spanish-bot/src/services/news-accumulator.js
 *
 * @module symbiote-engine/packs/data/news-accumulate
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';


const NON_LOCAL_PATTERNS = ['en eeuu', 'desde estados unidos'];
const HOROSCOPE_PATTERNS = [
  'horóscopo',
  'horoscopo',
  'astrolog',
  'signo del zodiaco',
  'signo del zodíaco',
];

/**
 * Simple hash for news dedup
 * @param {string} str
 * @returns {string}
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    let chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generate unique ID for a news item
 * @param {Object} item
 * @returns {string}
 */
function generateId(item) {
  let source = item.link || item.url || '';
  let title = item.title || '';
  return hashString(`${title}:${source}`);
}

/**
 * Standardize a news item
 * @param {Object} item
 * @returns {Object}
 */
function standardizeItem(item) {
  return {
    id: item.id || generateId(item),
    title: item.title || '',
    description: item.description || item.content || '',
    link: item.link || item.url || '',
    category: item.category || { id: 'general', name: 'General' },
    source: item.source || '',
    image: item.image || null,
    pubDate: item.pubDate || new Date().toISOString(),
    addedAt: new Date().toISOString(),
    processed: false,
  };
}

/**
 * Filter out international news
 * @param {Array} items
 * @returns {Array}
 */
function filterArgentinaOnly(items) {
  return items.filter((item) => {
    let text = `${item.title} ${item.description}`.toLowerCase();
    return !NON_LOCAL_PATTERNS.some((p) => text.includes(p));
  });
}

/**
 * Filter out horoscope content
 * @param {Array} items
 * @returns {Array}
 */
function filterOutHoroscopes(items) {
  return items.filter((item) => {
    let text = `${item.title} ${item.description}`.toLowerCase();
    return !HOROSCOPE_PATTERNS.some((p) => text.includes(p));
  });
}

/**
 * Load stored data from file
 * @param {string} storePath
 * @returns {Promise<Object>}
 */
async function loadStore(storePath) {
  try {
    let data = await readFile(storePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      news: [],
      periodStart: new Date().toISOString(),
      categoryCounts: {},
      processedIds: [],
    };
  }
}

/**
 * Save data to file
 * @param {string} storePath
 * @param {Object} data
 */
async function saveStore(storePath, data) {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(data, null, 2));
}


export default {
  type: 'data/news-accumulate',
  category: 'data',
  icon: 'newspaper',

  driver: {
    description: 'Collect and store news with dedup, filtering, periods, and category stats',
    inputs: [{ name: 'storePath', type: 'string' }],
    outputs: [
      { name: 'result', type: 'any' },
      { name: 'error', type: 'string' },
    ],
    params: {
      operation: {
        type: 'string',
        default: 'get',
        description: 'Operation: add | get | mark-processed | new-period | stats',
      },

      newsItem: { type: 'any', default: null, description: 'News item to add' },
      newsItems: { type: 'any', default: null, description: 'Array of news items to add (batch)' },

      categories: { type: 'any', default: null, description: 'Filter by categories array' },
      since: { type: 'string', default: null, description: 'Get news since ISO date' },
      filterLocal: {
        type: 'boolean',
        default: false,
        description: 'Filter out non-local (international) news',
      },
      filterHoroscopes: {
        type: 'boolean',
        default: true,
        description: 'Filter out horoscope content',
      },
      maxItems: { type: 'int', default: 100, description: 'Maximum items to return' },

      newsIds: { type: 'any', default: null, description: 'Array of news IDs to mark processed' },
    },
  },

  lifecycle: {
    validate: (inputs) => {
      return typeof inputs.storePath === 'string' && inputs.storePath.length > 0;
    },

    cacheKey: () => null,

    execute: async (inputs, params) => {
      let { storePath } = inputs;
      let { operation } = params;

      try {
        let store = await loadStore(storePath);

        let opMap = {
          add: async () => {
            let itemsToAdd = params.newsItems
              ? params.newsItems
              : params.newsItem
                ? [params.newsItem]
                : [];

            if (itemsToAdd.length === 0) return { error: 'No items to add' };

            let existingIds = new Set(store.news.map((n) => n.id));
            let added = 0;

            for (const raw of itemsToAdd) {
              let item = standardizeItem(raw);
              if (existingIds.has(item.id)) continue;

              store.news.push(item);
              existingIds.add(item.id);
              added++;


              let catId = typeof item.category === 'object' ? item.category.id : item.category;
              store.categoryCounts[catId] = (store.categoryCounts[catId] || 0) + 1;
            }

            await saveStore(storePath, store);
            return {
              result: {
                added,
                total: store.news.length,
                duplicatesSkipped: itemsToAdd.length - added,
              },
            };
          },
          get: () => {
            let items = store.news.filter((n) => !n.processed);


            if (params.since) {
              let sinceDate = new Date(params.since);
              items = items.filter((n) => new Date(n.addedAt) >= sinceDate);
            }


            if (Array.isArray(params.categories) && params.categories.length > 0) {
              items = items.filter((n) => {
                let catId = typeof n.category === 'object' ? n.category.id : n.category;
                return params.categories.includes(catId);
              });
            }


            if (params.filterLocal) items = filterArgentinaOnly(items);
            if (params.filterHoroscopes) items = filterOutHoroscopes(items);

            items = items.slice(0, params.maxItems);

            return { result: { items, count: items.length } };
          },
          'mark-processed': async () => {
            if (!Array.isArray(params.newsIds)) return { error: 'newsIds array is required' };

            let idsSet = new Set(params.newsIds);
            let marked = 0;

            for (const item of store.news) {
              if (idsSet.has(item.id) && !item.processed) {
                item.processed = true;
                item.processedAt = new Date().toISOString();
                marked++;
              }
            }

            store.processedIds.push(...params.newsIds);
            await saveStore(storePath, store);
            return { result: { marked, total: params.newsIds.length } };
          },
          'new-period': async () => {
            let archived = {
              periodStart: store.periodStart,
              periodEnd: new Date().toISOString(),
              itemCount: store.news.length,
              categoryCounts: { ...store.categoryCounts },
            };

            store.news = [];
            store.periodStart = new Date().toISOString();
            store.categoryCounts = {};
            store.processedIds = [];

            await saveStore(storePath, store);
            return { result: { archived, message: 'New period started' } };
          },
          stats: () => {
            let total = store.news.length;
            let processed = store.news.filter((n) => n.processed).length;
            let unprocessed = total - processed;

            return {
              result: {
                total,
                processed,
                unprocessed,
                periodStart: store.periodStart,
                categoryCounts: store.categoryCounts,
              },
            };
          },
        };

        if (opMap[operation]) {
          return await opMap[operation]();
        } else {
          return { error: `Unknown operation: ${operation}` };
        }
      } catch (err) {
        return { error: `news-accumulate ${operation} failed: ${err.message}` };
      }
    },
  },
};
