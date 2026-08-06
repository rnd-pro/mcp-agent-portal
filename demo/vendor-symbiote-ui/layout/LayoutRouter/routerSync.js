/**
 * routerSync — bidirectional URL ↔ component state sync
 *
 * Maps URL query params to component init$ properties and vice versa.
 * Only syncs when the component's panel is active.
 *
 * Supports two mapping formats:
 *
 * Simple:  { componentProp: 'urlParam' }
 * Extended: { componentProp: { param: 'urlParam', default: 'all', type: 'number' } }
 *
 * @example
 * // Simple format:
 * syncWithRouter(this, 'jobs', {
 *   filterStatus: 'status',
 *   filterRegion: 'region',
 * });
 *
 * // Extended format:
 * syncWithRouter(this, 'jobs', {
 *   filterStatus: { param: 'status', default: 'all' },
 *   currentPage: { param: 'page', default: 1, type: 'number' },
 * });
 *
 * @module symbiote-ui/layout/LayoutRouter/routerSync
 */
import { parseQuery, updateParams } from './LayoutRouter.js';

/**
 * Normalize mapping entry to { param, defaultVal, type }
 * @param {string | { param: string, default?: *, type?: string }} entry
 * @returns {{ param: string, defaultVal: *, type: string }}
 */
function normalizeMapping(entry) {
  if (typeof entry === 'string') {
    return { param: entry, defaultVal: undefined, type: 'string' };
  }
  return {
    param: entry.param,
    defaultVal: entry.default,
    type: entry.type ?? 'string',
  };
}

/**
 * Cast value to the target type
 * @param {string} value
 * @param {string} type
 * @returns {*}
 */
function castValue(value, type) {
  if (type === 'number') return Number(value);
  if (type === 'boolean') return value === 'true';
  return value;
}

/**
 * Sync component state with router URL params
 *
 * @param {import('@symbiotejs/symbiote').default} component - Symbiote component
 * @param {string} panelName - Panel this component belongs to
 * @param {Object<string, string | { param: string, default?: *, type?: string }>} mapping
 */
export function syncWithRouter(component, panelName, mapping) {
  let syncing = false;


  let normalizedMap = {};
  for (const [prop, entry] of Object.entries(mapping)) {
    normalizedMap[prop] = normalizeMapping(entry);
  }

  /**
   * Read URL params into component state
   */
  function readFromURL() {
    if (syncing) return;
    syncing = true;
    let query = parseQuery(component.$['ROUTER/query']);
    for (const [prop, { param, defaultVal, type }] of Object.entries(normalizedMap)) {
      let rawValue = query[param];
      if (rawValue !== undefined) {
        let val = castValue(rawValue, type);
        if (component.$[prop] !== val) {
          component.$[prop] = val;
        }
      } else if (defaultVal !== undefined) {

        if (component.$[prop] !== defaultVal) {
          component.$[prop] = defaultVal;
        }
      }
    }
    syncing = false;
  }

  /**
   * Write component state to URL params
   * @param {string} prop - Changed property name
   */
  function writeToURL(prop) {
    if (syncing) return;
    if (component.$['ROUTER/panel'] !== panelName) return;
    syncing = true;
    let { param, defaultVal } = normalizedMap[prop];
    let value = component.$[prop];

    if (value === defaultVal) {
      updateParams({ [param]: '' });
    } else {
      updateParams({ [param]: String(value) });
    }
    syncing = false;
  }


  component.sub('ROUTER/panel', (panel) => {
    if (panel === panelName) {
      readFromURL();
    }
  });


  component.sub('ROUTER/query', () => {
    if (component.$['ROUTER/panel'] !== panelName) return;
    readFromURL();
  });


  for (const prop of Object.keys(normalizedMap)) {
    component.sub(prop, () => {
      if (component.$['ROUTER/panel'] === panelName) {
        writeToURL(prop);
      }
    });
  }


  if (component.$['ROUTER/panel'] === panelName) {
    readFromURL();
  }
}

/**
 * setupPanelRouting — high-level panel routing setup
 *
 * Centralizes all routing logic for a panel:
 * - Panel activation (onActivate callback)
 * - List/detail switching via ROUTER/subpath
 * - Tab sync via ?tab= query param
 *
 * Convention:
 *   #panel               → list view, default tab
 *   #panel?tab=groups    → list view, groups tab
 *   #panel/{id}          → detail view
 *
 * Component requirements:
 *   - ref="listWrap"     → container for list view (hidden when detail)
 *   - <detail-component> → detail view element (hidden when list)
 *   - $.activeTab        → tab state property (if tabs configured)
 *
 * @param {import('@symbiotejs/symbiote').default} component
 * @param {string} panelName - Panel section ID (e.g. 'users')
 * @param {Object} config
 * @param {string[]} [config.tabs] - Tab names, first is default
 * @param {{ component: string, loadMethod: string }} [config.detail] - Detail view config
 * @param {Function} [config.onActivate] - Called when panel becomes active (list mode)
 * @param {Object} [config.syncParams] - Additional params to sync via syncWithRouter
 *
 * @example
 * renderCallback() {
 *   setupPanelRouting(this, 'users', {
 *     tabs: ['users', 'groups'],
 *     detail: { component: 'user-detail-view', loadMethod: 'loadUser' },
 *     onActivate: () => this.#loadData(),
 *   });
 * }
 */
export function setupPanelRouting(component, panelName, config = {}) {
  let { tabs, detail, onActivate, syncParams } = config;


  if (tabs && tabs.length > 0) {
    let defaultTab = tabs[0];
    syncWithRouter(component, panelName, {
      activeTab: { param: 'tab', default: defaultTab },
      ...(syncParams || {}),
    });
  } else if (syncParams) {
    syncWithRouter(component, panelName, syncParams);
  }

  /**
   * Check and apply list/detail mode based on ROUTER/subpath
   */
  function checkDetailMode() {
    if (component.$['ROUTER/panel'] !== panelName) return;

    let subpath = component.$['ROUTER/subpath'];
    let listWrap = component.ref?.listWrap;
    let isDetail = !!(detail && subpath);


    component.toggleAttribute('data-detail', isDetail);

    if (isDetail) {

      if (listWrap) listWrap.hidden = true;

      let detailEl = component.querySelector(detail.component);
      if (detailEl) {
        detailEl.hidden = false;
        if (typeof detailEl[detail.loadMethod] === 'function') {
          detailEl[detail.loadMethod](subpath);
        }
      }
    } else {

      if (listWrap) listWrap.hidden = false;

      if (detail) {
        let detailEl = component.querySelector(detail.component);
        if (detailEl) detailEl.hidden = true;
      }

      if (onActivate) onActivate();
    }
  }


  component.sub('ROUTER/panel', (panel) => {
    if (panel === panelName) {
      checkDetailMode();
    }
  });


  if (detail) {
    component.sub('ROUTER/subpath', () => {
      if (component.$['ROUTER/panel'] === panelName) {
        checkDetailMode();
      }
    });
  }


  if (component.$['ROUTER/panel'] === panelName) {
    checkDetailMode();
  }
}
