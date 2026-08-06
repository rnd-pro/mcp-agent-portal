import {
  closeUiPanel,
  openPanel,
  removeUiPanel,
} from '../layout/LayoutTree.js';

import {
  createDynamicComponentRegistry,
} from './dynamic-registry.js';

import {
  applyCascadeTheme,
  createCascadeTheme,
} from '../themes/Theme.js';

import {
  resolveThemePresets,
} from '../themes/ThemeFactory.js';

import {
  reserveLayoutFootprint,
} from './cls-reservation.js';

export {
  PRODUCT_CONTEXT_SCHEMA_ID,
  PRODUCT_CONTEXT_VERSION,
  createRuntimeSafeActionFromProductAction,
  createProductContextAgentView,
  createProductRuntimeContext,
  normalizeRuntimeEnrichment,
  normalizeRuntimeHook,
  normalizeRuntimeSafeAction,
  normalizeProductContext,
  normalizeRuntimeContext,
} from './product-context.js';

export const RUNTIME_UI_CONTRACT_VERSION = 'runtime-ui-v1';

export const RUNTIME_UI_CONTRACT = Object.freeze({
  version: RUNTIME_UI_CONTRACT_VERSION,
  ownership: 'host-owned state, persistence, routing, permissions, and transport',
  componentOwnership: 'symbiote-ui creates elements, applies presentation state, wires intent events, and tears down listeners',
  layoutActions: ['open-panel', 'close-ui-panel', 'remove-ui-panel'],
});

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRecord(value) {
  return isObject(value) ? { ...value } : {};
}

function normalizeChildren(children) {
  return Array.isArray(children)
    ? children.filter(isObject).map(normalizeRuntimeUiNode)
    : [];
}

export function normalizeRuntimeUiNode(node = {}) {
  let source = isObject(node) ? node : {};
  return {
    id: source.id || '',
    component: source.component || source.tagName || source.tag || '',
    componentRegistry: source.componentRegistry || '',
    props: normalizeRecord(source.props),
    attrs: normalizeRecord(source.attrs),
    state: normalizeRuntimeUiState(source.state),
    events: normalizeRecord(source.events),
    bindings: normalizeRecord(source.bindings),
    layout: normalizeRecord(source.layout),
    theme: isObject(source.theme) ? { ...source.theme } : undefined,
    children: normalizeChildren(source.children),
  };
}

export function normalizeRuntimeUiState(state = {}) {
  let source = isObject(state) ? state : {};
  return {
    props: normalizeRecord(source.props),
    attrs: normalizeRecord(source.attrs),
    methods: normalizeRecord(source.methods),
  };
}

function getDocument(options = {}) {
  let doc = options.document || globalThis.document;
  if (!doc?.createElement) {
    throw new Error('A DOM document with createElement() is required to create runtime UI elements.');
  }
  return doc;
}

function applyAttribute(element, name, value) {
  if (value === false || value === null || value === undefined) {
    element.removeAttribute?.(name);
    return;
  }
  element.setAttribute?.(name, value === true ? '' : String(value));
}

function methodAllowed(element, name, options = {}) {
  if (typeof options.allowMethod === 'function') {
    return Boolean(options.allowMethod(name, element));
  }
  if (Array.isArray(options.allowedMethods)) {
    return options.allowedMethods.includes(name);
  }
  return false;
}

export function applyRuntimeUiState(element, state = {}, options = {}) {
  if (!element) return element;
  let normalized = normalizeRuntimeUiState(state);
  for (let [name, value] of Object.entries(normalized.attrs)) {
    applyAttribute(element, name, value);
  }
  for (let [name, value] of Object.entries(normalized.props)) {
    element[name] = value;
  }
  for (let [name, value] of Object.entries(normalized.methods)) {
    if (typeof element[name] !== 'function') continue;
    if (!methodAllowed(element, name, options)) continue;
    let args = Array.isArray(value) ? value : [value];
    element[name](...args);
  }
  return element;
}

function applyRuntimeUiNodeState(element, node, options = {}) {
  applyRuntimeUiState(element, {
    attrs: node.attrs,
    props: node.props,
  });
  applyRuntimeUiState(element, node.state, options);
}

function appendChild(parent, child) {
  if (typeof parent.append === 'function') {
    parent.append(child);
  } else {
    parent.appendChild?.(child);
  }
}

function removeElement(element) {
  if (typeof element.remove === 'function') {
    element.remove();
  } else if (element.parentNode?.removeChild) {
    element.parentNode.removeChild(element);
  }
}

function unindexRuntimeUiInstance(controller, instance) {
  if (!controller?.instances || !instance) return;
  if (instance.id) controller.instances.delete(instance.id);
  for (let child of instance.children || []) {
    unindexRuntimeUiInstance(controller, child);
  }
}

function resolveClsReservationOptions(clsOptions, layoutSize = {}, doc) {
  let resolved = typeof clsOptions === 'object' ? { ...clsOptions } : {};
  if (!resolved.width) {
    resolved.width = layoutSize.width || (layoutSize.rect?.width ? `${layoutSize.rect.width * 100}%` : '100%');
  }
  if (!resolved.height) {
    resolved.height = layoutSize.height || (layoutSize.rect?.height ? `${layoutSize.rect.height * 100}px` : '100px');
  }
  resolved.document = doc;
  return resolved;
}

function shouldReserveLayout(parentEl, clsOptions, layoutSize = {}) {
  return Boolean(parentEl && (clsOptions || layoutSize.width || layoutSize.height || layoutSize.rect));
}

function mountRuntimeUiInstance(controller, node, createOpts = {}, parentEl = null, doc = null) {
  let clsOptions = createOpts.cls || createOpts.clsReservation;
  let layoutSize = node?.layout || {};

  if (!shouldReserveLayout(parentEl, clsOptions, layoutSize)) {
    let instance = controller.create(node, createOpts);
    if (parentEl) {
      appendChild(parentEl, instance.element);
    }
    return instance;
  }

  let reservation = null;
  let instance = null;
  try {
    reservation = reserveLayoutFootprint(parentEl, resolveClsReservationOptions(clsOptions, layoutSize, doc));
    instance = controller.create(node, createOpts);
    instance.reservation = reservation;
    reservation.replace(instance.element);
    return instance;
  } catch (err) {
    if (instance) {
      instance.destroy({ remove: true });
      unindexRuntimeUiInstance(controller, instance);
    } else {
      reservation?.destroy();
    }
    throw err;
  }
}

function wireIntentEvents(element, node, options = {}) {
  let subscriptions = [];
  let onIntent = typeof options.onIntent === 'function' ? options.onIntent : null;
  for (let [eventName, action] of Object.entries(node.events || {})) {
    if (!eventName || !action || !element.addEventListener) continue;
    let handler = (event) => {
      onIntent?.({
        version: RUNTIME_UI_CONTRACT_VERSION,
        action,
        eventName,
        component: node.component,
        componentId: node.id,
        detail: event?.detail,
        event,
        target: element,
      });
    };
    element.addEventListener(eventName, handler);
    subscriptions.push(() => element.removeEventListener?.(eventName, handler));
  }
  return () => {
    for (let unsubscribe of subscriptions.splice(0)) unsubscribe();
  };
}

export function createRuntimeUiInstance(node, options = {}) {
  let normalized = normalizeRuntimeUiNode(node);
  if (!normalized.component) {
    throw new Error('Runtime UI node requires a component tag name.');
  }

  let doc = getDocument(options);
  let element = doc.createElement(normalized.component);
  if (normalized.id) {
    element.dataset
      ? (element.dataset.runtimeUiId = normalized.id)
      : element.setAttribute?.('data-runtime-ui-id', normalized.id);
  }
  applyRuntimeUiNodeState(element, normalized, options);

  let childInstances = normalized.children.map((child) => {
    let instance = createRuntimeUiInstance(child, options);
    appendChild(element, instance.element);
    return instance;
  });
  let unsubscribe = wireIntentEvents(element, normalized, options);

  let instance = {
    id: normalized.id,
    component: normalized.component,
    element,
    node: normalized,
    children: childInstances,
    update(nextState = {}, updateOptions = {}) {
      applyRuntimeUiState(element, nextState, {
        ...options,
        ...updateOptions,
      });
      return element;
    },
    destroy({ remove = true } = {}) {
      unsubscribe();
      for (let child of childInstances.splice(0)) child.destroy({ remove });
      if (remove) {
        if (instance.reservation) {
          instance.reservation.destroy();
        } else {
          removeElement(element);
        }
      }
    },
  };
  return instance;

}

export function createRuntimeUiController(options = {}) {
  let instances = new Map();
  let dynamicRegistry = options.dynamicRegistry || createDynamicComponentRegistry(options);
  let _ws = null;
  let _wsUrl = null;
  let _disconnectedByUser = false;
  let _reconnectTimer = null;
  let _commandHandler = null;
  let _listenerTarget = null;

  let onIntent = (intent) => {
    let OPEN = globalThis.WebSocket?.OPEN !== undefined ? globalThis.WebSocket.OPEN : 1;
    if (_ws && _ws.readyState === OPEN) {
      try {
        let { version, action, eventName, component, componentId, detail } = intent;
        _ws.send(JSON.stringify({
          method: 'intent',
          params: { version, action, eventName, component, componentId, detail },
        }));
      } catch (err) {
        console.error('[runtimeController] failed to send intent:', err);
      }
    }
    if (typeof options.onIntent === 'function') {
      options.onIntent(intent);
    }
  };

  let indexInstance = (instance) => {
    if (instance.id) instances.set(instance.id, instance);
    for (let child of instance.children || []) indexInstance(child);
  };
  let collectInstanceTree = (instance, list = []) => {
    if (!instance) return list;
    list.push(instance);
    for (let child of instance.children || []) collectInstanceTree(child, list);
    return list;
  };
  let deleteInstanceTree = (tree) => {
    for (let instance of tree) {
      if (instance.id) instances.delete(instance.id);
    }
  };
  let destroyInstanceTree = (instance, destroyOptions) => {
    let tree = collectInstanceTree(instance);
    instance.destroy(destroyOptions);
    deleteInstanceTree(tree);
  };

  const controller = {
    instances,
    dynamicRegistry,
    create(node, createOptions = {}) {
      let instance = createRuntimeUiInstance(node, {
        ...options,
        ...createOptions,
        onIntent,
      });
      indexInstance(instance);
      return instance;
    },
    update(id, state = {}, updateOptions = {}) {
      let instance = instances.get(id);
      if (!instance) return null;
      instance.update(state, updateOptions);
      return instance;
    },
    destroy(id, destroyOptions = {}) {
      let instance = instances.get(id);
      if (!instance) return false;
      destroyInstanceTree(instance, destroyOptions);
      return true;
    },
    clear(destroyOptions = {}) {
      for (let id of [...instances.keys()]) this.destroy(id, destroyOptions);
    },
    connect(wsUrl, connectOptions = {}) {
      if (wsUrl) _wsUrl = wsUrl;
      _disconnectedByUser = false;

      let NativeWebSocket = connectOptions.WebSocket || globalThis.WebSocket;
      if (!NativeWebSocket) {
        return;
      }

      if (_ws) {
        _ws.close();
      }

      let url = _wsUrl;
      _ws = new NativeWebSocket(url);

      _ws.onopen = () => {
        if (_reconnectTimer) {
          clearTimeout(_reconnectTimer);
          _reconnectTimer = null;
        }
      };

      _ws.onmessage = ({ data }) => {
        try {
          let msg = JSON.parse(data);
          let method = msg.method;
          let params = msg.params || {};
          if (method === 'create') {
            let node = params.node;
            let createOpts = params.options || {};
            let parentId = params.parentId;
            let targetSelector = params.targetSelector || params.target;

            let doc = connectOptions.document || options.document || (typeof globalThis.document !== 'undefined' ? globalThis.document : null);
            let parentEl = null;
            if (parentId) {
              let parentInst = instances.get(parentId);
              if (parentInst && parentInst.element) {
                parentEl = parentInst.element;
              }
            } else if (targetSelector && doc) {
              parentEl = typeof targetSelector === 'string'
                ? doc.querySelector(targetSelector)
                : targetSelector;
            } else if (doc && doc.body) {
              parentEl = doc.body;
            }

            mountRuntimeUiInstance(controller, node, createOpts, parentEl, doc);
          } else if (method === 'update') {
            controller.update(params.id, params.state, params.options);
          } else if (method === 'destroy') {
            controller.destroy(params.id, params.options);
          } else if (method === 'clear') {
            controller.clear(params.options);
          } else if (method === 'layout') {
            let layoutTarget = connectOptions.root || options.root || null;
            applyRuntimeLayoutAction(layoutTarget, params.action, params.options);
          } else if (method === 'reload' || method === 'discover-update') {
            let root = connectOptions.root || options.root || (typeof globalThis.document !== 'undefined' ? globalThis.document : null);
            if (root && typeof root.dispatchEvent === 'function') {
              let doc = connectOptions.document || options.document || (typeof globalThis.document !== 'undefined' ? globalThis.document : null);
              let NativeCustomEvent = globalThis.CustomEvent;
              if (typeof NativeCustomEvent !== 'function' && doc && typeof doc.createEvent === 'function') {
                let event = doc.createEvent('CustomEvent');
                event.initCustomEvent('runtime-reload', true, true, params);
                root.dispatchEvent(event);
              } else if (typeof NativeCustomEvent === 'function') {
                let event = new NativeCustomEvent('runtime-reload', {
                  bubbles: true,
                  composed: true,
                  detail: params,
                });
                root.dispatchEvent(event);
              }
            }

            if (typeof connectOptions.onReload === 'function') {
              connectOptions.onReload(params);
            } else if (typeof options.onReload === 'function') {
              options.onReload(params);
            }
          }
        } catch (err) {
          console.error('[runtimeController] parse message error:', err);
        }
      };

      _ws.onclose = () => {
        _ws = null;
        if (!_disconnectedByUser && connectOptions.reconnectMs !== 0) {
          let delay = connectOptions.reconnectMs || 2000;
          _reconnectTimer = setTimeout(() => controller.connect(_wsUrl, connectOptions), delay);
        }
      };

      _ws.onerror = () => {};

      if (!_commandHandler) {
        let root = connectOptions.root || options.root || (typeof globalThis.document !== 'undefined' ? globalThis.document : null);
        if (root && root.addEventListener) {
          _listenerTarget = root;
          _commandHandler = (event) => {
            let { command, args } = event.detail || {};
            let OPEN = NativeWebSocket.OPEN !== undefined ? NativeWebSocket.OPEN : 1;
            if (_ws && _ws.readyState === OPEN) {
              try {
                _ws.send(JSON.stringify({
                  method: 'command',
                  params: { command, args },
                }));
              } catch (err) {
                console.error('[runtimeController] failed to send command:', err);
              }
            }
          };
          _listenerTarget.addEventListener('webmcp-command', _commandHandler);
        }
      }
    },
    disconnect() {
      _disconnectedByUser = true;
      if (_reconnectTimer) {
        clearTimeout(_reconnectTimer);
        _reconnectTimer = null;
      }
      if (_ws) {
        _ws.close();
        _ws = null;
      }
      if (_listenerTarget && _listenerTarget.removeEventListener && _commandHandler) {
        _listenerTarget.removeEventListener('webmcp-command', _commandHandler);
        _commandHandler = null;
        _listenerTarget = null;
      }
    }
  };

  return controller;
}

export function applyRuntimeLayoutAction(target, action = {}, options = {}) {
  let normalized = isObject(action) ? action : {};
  let type = normalized.type || normalized.action;
  let panelType = normalized.panelType || normalized.component || normalized.panel;
  if (!type || !panelType) {
    return { handled: false, reason: 'missing-action-or-panel-type' };
  }

  if (target && typeof target.openPanel === 'function') {
    if (type === 'open-panel') {
      return {
        handled: true,
        mode: 'element',
        panelId: target.openPanel(panelType, normalized.options || {}),
      };
    }
    if (type === 'close-ui-panel') {
      return { handled: true, mode: 'element', closed: target.closeUiPanel(panelType) };
    }
    if (type === 'remove-ui-panel') {
      return { handled: true, mode: 'element', removed: target.removeUiPanel(panelType) };
    }
  }

  let root = target || options.root || null;
  if (type === 'open-panel') {
    return { handled: true, mode: 'tree', ...openPanel(root, panelType, normalized.options || {}) };
  }
  if (type === 'close-ui-panel') {
    return { handled: true, mode: 'tree', ...closeUiPanel(root, panelType, normalized.options || {}) };
  }
  if (type === 'remove-ui-panel') {
    return { handled: true, mode: 'tree', ...removeUiPanel(root, panelType, normalized.options || {}) };
  }

  return { handled: false, reason: 'unsupported-action' };
}

export {
  createDynamicComponentRegistry,
  validateComponentCode,
} from './dynamic-registry.js';

const AGENT_INTENT_OPERATION_TYPES = new Set([
  'register-driver',
  'register-component',
  'layout',
  'ui',
  'theme',
  'state',
]);

const IRREVERSIBLE_AGENT_INTENT_OPERATIONS = new Set([
  'register-component',
  'register-driver',
]);

const IRREVERSIBLE_UI_ACTIONS = new Set(['destroy']);
const IRREVERSIBLE_LAYOUT_ACTIONS = new Set(['remove-ui-panel']);

function listAllows(list, value) {
  return !Array.isArray(list) || list.includes(value);
}

function requireListAllows(list, value, label) {
  if (!value || !Array.isArray(list)) return;
  if (!list.includes(value)) {
    throw new Error(`Agent intent policy denied ${label}: "${value}".`);
  }
}

function getAgentIntentPolicy(options = {}) {
  return options.intentPolicy || options.policy || {};
}

function isIrreversibleOperation(op = {}) {
  let type = op.type;
  let params = op.params || {};
  if (IRREVERSIBLE_AGENT_INTENT_OPERATIONS.has(type)) return true;
  if (type === 'ui') {
    let action = params.action || 'create';
    return IRREVERSIBLE_UI_ACTIONS.has(action);
  }
  if (type === 'layout') {
    let action = params.action || params;
    let actionType = action.type || action.action;
    return IRREVERSIBLE_LAYOUT_ACTIONS.has(actionType);
  }
  return false;
}

function assertIrreversibleAllowed(op, intent, options = {}) {
  if (!isIrreversibleOperation(op)) return;
  let policy = getAgentIntentPolicy(options);
  let allowed = options.allowIrreversible === true || policy.allowIrreversible === true;
  if (!allowed) {
    throw new Error(`Agent intent operation "${op.type}" is irreversible and requires host allowIrreversible policy.`);
  }
  if (Array.isArray(intent.operations) && intent.operations.length > 1) {
    throw new Error(`Irreversible agent intent operation "${op.type}" must run in a dedicated intent.`);
  }
}

function assertAgentIntentPolicy(type, params = {}, options = {}) {
  let policy = getAgentIntentPolicy(options);
  if (Array.isArray(policy.denyOperations) && policy.denyOperations.includes(type)) {
    throw new Error(`Agent intent policy denied operation "${type}".`);
  }
  if (Array.isArray(policy.allowOperations) && !policy.allowOperations.includes(type)) {
    throw new Error(`Agent intent policy denied operation "${type}".`);
  }
  if (typeof policy.allowOperation === 'function' && !policy.allowOperation(type, params)) {
    throw new Error(`Agent intent policy denied operation "${type}".`);
  }

  if (type === 'register-component') {
    requireListAllows(policy.allowedComponents, params.tagName, 'component');
  } else if (type === 'layout') {
    let action = params.action || params;
    let panelType = action.panelType || action.component || action.panel;
    requireListAllows(policy.allowedLayoutPanelTypes, panelType, 'layout panel type');
  } else if (type === 'ui') {
    let action = params.action || 'create';
    if (!['create', 'destroy'].includes(action)) {
      throw new Error(`Unsupported agent UI action: "${action}".`);
    }
    if (action === 'create') {
      requireListAllows(policy.allowedComponents, params.node?.component || params.node?.tagName || params.node?.tag, 'component');
      if (typeof params.targetSelector === 'string' || typeof params.target === 'string') {
        requireListAllows(policy.allowedTargetSelectors, params.targetSelector || params.target, 'target selector');
      }
    }
  } else if (type === 'theme') {
    let target = params.targetSelector || params.target;
    if (typeof target === 'string') {
      requireListAllows(policy.allowedThemeTargets || policy.allowedTargetSelectors, target, 'theme target');
    }
  } else if (type === 'state') {
    requireListAllows(policy.allowedStateIds, params.id, 'state id');
    let state = normalizeRuntimeUiState(params.state);
    for (let methodName of Object.keys(state.methods)) {
      if (!listAllows(policy.allowedMethods, methodName)) {
        throw new Error(`Agent intent policy denied method update: "${methodName}".`);
      }
    }
    for (let propName of Object.keys(state.props)) {
      if (!listAllows(policy.allowedStateProps, propName)) {
        throw new Error(`Agent intent policy denied prop update: "${propName}".`);
      }
    }
    for (let attrName of Object.keys(state.attrs)) {
      if (!listAllows(policy.allowedStateAttrs, attrName)) {
        throw new Error(`Agent intent policy denied attribute update: "${attrName}".`);
      }
    }
  }
}

function assertAgentIntentOperation(op = {}, intent = {}, options = {}) {
  let type = op.type;
  if (!AGENT_INTENT_OPERATION_TYPES.has(type)) {
    throw new Error(`Unsupported agent intent operation: "${type}".`);
  }
  if (!isObject(op.params)) {
    throw new Error(`Agent intent operation "${type}" requires params.`);
  }
  assertIrreversibleAllowed(op, intent, options);
  assertAgentIntentPolicy(type, op.params, options);
}

export async function executeAgentIntent(controller, intent = {}, options = {}) {
  if (intent.version !== 'agent-intent-v1') {
    throw new Error(`Unsupported agent intent version: "${intent.version}". Expected "agent-intent-v1".`);
  }

  let executed = [];
  let doc = options.document || (typeof globalThis.document !== 'undefined' ? globalThis.document : null);
  let dryRun = options.dryRun === true || options.validateOnly === true || intent.dryRun === true || intent.validateOnly === true;
  let policy = getAgentIntentPolicy(options);
  let updateOptions = {
    allowedMethods: policy.allowedMethods || options.allowedMethods,
    allowMethod: policy.allowMethod || options.allowMethod,
  };

  if (!Array.isArray(intent.operations) || intent.operations.length === 0) {
    throw new Error('Agent intent requires at least one operation.');
  }

  for (let op of intent.operations) {
    assertAgentIntentOperation(op, intent, options);
  }

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      executedCount: 0,
      validatedCount: intent.operations.length,
    };
  }

  try {
    for (let op of intent.operations || []) {
      let type = op.type;
      let params = op.params || {};

      if (type === 'register-component') {
        if (!controller.dynamicRegistry) {
          throw new Error('Controller dynamicRegistry is not initialized.');
        }
        await controller.dynamicRegistry.register(params.tagName, params.codeOrClass || params.code, {
          ...(params.options || {}),
          blockedKeywords: [
            ...((params.options && Array.isArray(params.options.blockedKeywords)) ? params.options.blockedKeywords : []),
            ...((policy && Array.isArray(policy.blockedKeywords)) ? policy.blockedKeywords : []),
          ],
          validate: params.options?.validate || policy.validateComponentCode,
        });
        executed.push({ type: 'register-component', tagName: params.tagName, irreversible: true });

      } else if (type === 'register-driver') {
        if (typeof options.onRegisterDriver === 'function') {
          await options.onRegisterDriver(params);
        }
        executed.push({ type: 'register-driver', params, irreversible: true });

      } else if (type === 'layout') {
        let root = options.root || controller.root || null;
        let action = params.action || params;
        let res = applyRuntimeLayoutAction(root, action, params.options);
        if (!res || res.handled === false) {
          throw new Error(`Agent intent layout action was not handled: "${action.type || action.action || 'unknown'}".`);
        }

        let rollbackAction = null;
        let actionType = action.type || action.action;
        let panelType = action.panelType || action.component || action.panel;
        if (actionType === 'open-panel' && panelType) {
          rollbackAction = { type: 'remove-ui-panel', panelType };
        }

        executed.push({ type: 'layout', action, rollbackAction });

      } else if (type === 'ui') {
        let action = params.action || 'create';
        if (action === 'create') {
          let node = params.node;
          let createOpts = params.options || {};
          let parentId = params.parentId;
          let targetSelector = params.targetSelector || params.target;

          let parentEl = null;
          if (parentId) {
            let parentInst = controller.instances.get(parentId);
            if (parentInst && parentInst.element) {
              parentEl = parentInst.element;
            }
          } else if (targetSelector && doc) {
            parentEl = typeof targetSelector === 'string'
              ? doc.querySelector(targetSelector)
              : targetSelector;
          } else if (doc && doc.body) {
            parentEl = doc.body;
          }

          let instance = mountRuntimeUiInstance(controller, node, createOpts, parentEl, doc);

          executed.push({ type: 'ui-create', id: params.node.id || instance.id });
        } else if (action === 'destroy') {
          let id = params.id;
          controller.destroy(id, params.options);
          executed.push({ type: 'ui-destroy', id });
        }

      } else if (type === 'theme') {
        let targetSelector = params.targetSelector || params.target;
        let targetEl = doc;
        if (targetSelector && doc) {
          targetEl = typeof targetSelector === 'string'
            ? doc.querySelector(targetSelector)
            : targetSelector;
        }

        if (!targetEl) {
          throw new Error(`Theme target element not found for selector: "${targetSelector}".`);
        }

        let themeOptions = params.options || {};
        if (params.presets) {
          themeOptions = {
            ...themeOptions,
            ...resolveThemePresets(params.presets),
          };
        }

        let keysToSave = Object.keys(createCascadeTheme(themeOptions));
        let originalStyles = {};
        if (targetEl.style) {
          for (let key of keysToSave) {
            originalStyles[key] = targetEl.style.getPropertyValue(key);
          }
        }

        applyCascadeTheme(targetEl, themeOptions);
        executed.push({ type: 'theme', targetEl, originalStyles });

      } else if (type === 'state') {
        let id = params.id;
        let originalState = null;
        let inst = controller.instances.get(id);
        if (inst && inst.node) {
          originalState = {
            props: {},
            attrs: {},
          };
          if (params.state?.props) {
            for (let key of Object.keys(params.state.props)) {
              originalState.props[key] = inst.element[key];
            }
          }
          if (params.state?.attrs) {
            for (let key of Object.keys(params.state.attrs)) {
              originalState.attrs[key] = inst.element.getAttribute(key);
            }
          }
        }

        let updateResult = controller.update(id, params.state, updateOptions);
        if (!updateResult) {
          throw new Error(`Agent intent state target not found: "${id}".`);
        }
        executed.push({ type: 'state', id, originalState });
      } else {
        throw new Error(`Unsupported agent intent operation: "${type}".`);
      }
    }
  } catch (err) {
    for (let i = executed.length - 1; i >= 0; i--) {
      let op = executed[i];
      try {
        if (op.irreversible) {
          continue;
        }
        if (op.type === 'ui-create') {
          controller.destroy(op.id);
        } else if (op.type === 'layout' && op.rollbackAction) {
          let root = options.root || controller.root || null;
          applyRuntimeLayoutAction(root, op.rollbackAction);
        } else if (op.type === 'theme' && op.targetEl.style) {
          for (let [key, val] of Object.entries(op.originalStyles)) {
            if (val === '') {
              op.targetEl.style.removeProperty(key);
            } else {
              op.targetEl.style.setProperty(key, val);
            }
          }
        } else if (op.type === 'state' && op.originalState) {
          controller.update(op.id, op.originalState, updateOptions);
        }
      } catch (rollbackErr) {
        console.error('[executeAgentIntent] rollback failed for operation:', op, rollbackErr);
      }
    }
    throw err;
  }

  return { success: true, executedCount: executed.length };
}

export { reserveLayoutFootprint } from './cls-reservation.js';
