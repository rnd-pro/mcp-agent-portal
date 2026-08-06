import { createCascadeTheme, normalizeCascadeGeometryRegister } from './cascade-theme.js';
import { geometryRegisterScaleTokens } from '../tokens/scale.js';

const activeSnapshots = new WeakMap();
const activeOperations = new WeakMap();
const PREVIEW_ATTRIBUTES = Object.freeze([
  'data-cascade-theme-variant',
  'data-cascade-tab-shape',
]);
const GEOMETRY_TOKENS = Object.freeze(Object.keys(geometryRegisterScaleTokens('product')));

export class CascadeThemePreviewError extends Error {
  constructor(message, code, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'CascadeThemePreviewError';
    this.code = code;
  }
}

function assertWeakTarget(element) {
  const type = typeof element;
  if ((type !== 'object' && type !== 'function') || element === null) {
    throw new CascadeThemePreviewError('A style-capable preview target is required', 'INVALID_TARGET');
  }
}

function assertTarget(element) {
  try {
    const style = element.style;
    if (!style
      || typeof style.getPropertyValue !== 'function'
      || typeof style.getPropertyPriority !== 'function'
      || typeof style.setProperty !== 'function'
      || typeof style.removeProperty !== 'function'
      || typeof element.getAttribute !== 'function'
      || typeof element.setAttribute !== 'function'
      || typeof element.removeAttribute !== 'function') {
      throw new CascadeThemePreviewError('A style-capable preview target is required', 'INVALID_TARGET');
    }
    return style;
  } catch (error) {
    if (error instanceof CascadeThemePreviewError) throw error;
    throw new CascadeThemePreviewError(
      'A style-capable preview target is required',
      'INVALID_TARGET',
      error
    );
  }
}

function acquireOperation(element, action) {
  assertWeakTarget(element);
  if (activeOperations.has(element)) {
    throw new CascadeThemePreviewError(
      'The preview target is already being mutated',
      'PREVIEW_BUSY'
    );
  }
  const owner = Object.freeze({ action });
  activeOperations.set(element, owner);
  return owner;
}

function releaseOperation(element, owner) {
  if (activeOperations.get(element) === owner) activeOperations.delete(element);
}

function outcome(state, value) {
  return Object.freeze({ state, outcome: value });
}

function restoreSnapshot(element, style, snapshot) {
  let firstError = null;

  for (const [attr, value] of snapshot.attributes) {
    try {
      if (value === null) element.removeAttribute(attr);
      else element.setAttribute(attr, value);
    } catch (error) {
      firstError ||= error;
    }
  }

  for (const [token, property] of snapshot.properties) {
    try {
      if (property.value === '') style.removeProperty(token);
      else style.setProperty(token, property.value, property.priority);
    } catch (error) {
      firstError ||= error;
    }
  }

  if (firstError) {
    throw new CascadeThemePreviewError(
      'The original theme could not be restored completely',
      'RESTORE_FAILED',
      firstError
    );
  }
  snapshot.state = 'settled';
}

/**
 * Returns the current internal snapshot for diagnostics.
 *
 * @param {HTMLElement} element
 * @returns {Object|undefined}
 */
export function getSnapshot(element) {
  const snapshot = activeSnapshots.get(element);
  if (!snapshot) return undefined;
  return Object.freeze({
    state: snapshot.state,
    properties: new Map(Array.from(snapshot.properties, ([token, property]) => [
      token,
      Object.freeze({
        value: property.value,
        priority: property.priority,
      }),
    ])),
    attributes: new Map(snapshot.attributes),
  });
}

/**
 * @param {HTMLElement} element
 * @returns {'previewing'|'finalizing'|'settled'|null}
 */
export function getPreviewState(element) {
  return activeSnapshots.get(element)?.state || null;
}

/**
 * Starts a storage-free, failure-atomic theme preview.
 * A previewing transaction is restored before replacement. A finalizing
 * transaction cannot be replaced.
 *
 * @param {HTMLElement} element
 * @param {Object} state
 * @param {string} register
 * @returns {{state: 'previewing', outcome: string}}
 */
export function start(element, state, register = '') {
  const owner = acquireOperation(element, 'start');
  try {
    const style = assertTarget(element);
    const current = activeSnapshots.get(element);
    if (current?.state === 'finalizing') {
      throw new CascadeThemePreviewError(
        'A finalizing theme preview cannot be replaced',
        'PREVIEW_FINALIZING'
      );
    }
    if (current?.state === 'previewing') {
      restoreSnapshot(element, style, current);
    } else if (current && current.state !== 'settled') {
      throw new CascadeThemePreviewError(
        `Cannot replace a ${current.state} preview transaction`,
        'INVALID_TRANSITION'
      );
    }
    if (current) activeSnapshots.delete(element);

    let theme;
    let normalizedRegister;
    let registerTokens;
    try {
      theme = createCascadeTheme(state);
      normalizedRegister = normalizeCascadeGeometryRegister(register);
      registerTokens = normalizedRegister ? geometryRegisterScaleTokens(normalizedRegister) : {};
    } catch (error) {
      throw new CascadeThemePreviewError('The preview theme is invalid', 'INVALID_THEME', error);
    }

    const propertyNames = new Set([...Object.keys(theme.tokens), ...GEOMETRY_TOKENS]);
    const snapshot = {
      state: 'previewing',
      properties: new Map(),
      attributes: new Map(),
    };
    activeSnapshots.set(element, snapshot);

    try {
      for (const token of propertyNames) {
        snapshot.properties.set(token, {
          value: style.getPropertyValue(token),
          priority: style.getPropertyPriority(token),
        });
      }
      for (const attr of PREVIEW_ATTRIBUTES) {
        snapshot.attributes.set(attr, element.getAttribute(attr));
      }
    } catch (error) {
      activeSnapshots.delete(element);
      throw new CascadeThemePreviewError(
        'The original theme could not be inspected',
        'START_FAILED',
        error
      );
    }

    try {
      for (const [token, value] of Object.entries(theme.tokens)) {
        style.setProperty(token, value);
      }
      for (const token of GEOMETRY_TOKENS) {
        if (Object.hasOwn(registerTokens, token)) {
          style.setProperty(token, registerTokens[token]);
        } else {
          style.removeProperty(token);
        }
      }
      element.setAttribute('data-cascade-theme-variant', theme.state.themeVariant);
      element.setAttribute('data-cascade-tab-shape', theme.state.tabShape);
      snapshot.state = 'previewing';
    } catch (error) {
      try {
        restoreSnapshot(element, style, snapshot);
      } catch (restoreError) {
        snapshot.state = 'previewing';
        throw new CascadeThemePreviewError(
          'The preview failed and the original theme could not be restored completely',
          'START_AND_RESTORE_FAILED',
          new AggregateError([error, restoreError])
        );
      }
      throw new CascadeThemePreviewError('The preview could not be applied', 'START_FAILED', error);
    }

    return outcome('previewing', 'started');
  } finally {
    releaseOperation(element, owner);
  }
}

/**
 * Moves a previewing transaction to its exclusive finalization phase.
 *
 * @param {HTMLElement} element
 * @returns {{state: 'finalizing', outcome: string}}
 */
export function finalize(element) {
  const owner = acquireOperation(element, 'finalize');
  try {
    assertTarget(element);
    const snapshot = activeSnapshots.get(element);
    if (!snapshot) {
      throw new CascadeThemePreviewError('No active preview transaction', 'NO_PREVIEW');
    }
    if (snapshot.state !== 'previewing') {
      throw new CascadeThemePreviewError(
        `Cannot finalize a ${snapshot.state} preview transaction`,
        'INVALID_TRANSITION'
      );
    }
    snapshot.state = 'finalizing';
    return outcome('finalizing', 'finalized');
  } finally {
    releaseOperation(element, owner);
  }
}

/**
 * Restores a previewing or finalizing transaction.
 *
 * @param {HTMLElement} element
 * @returns {{state: 'settled'|null, outcome: string}}
 */
export function rollback(element) {
  const owner = acquireOperation(element, 'rollback');
  try {
    const style = assertTarget(element);
    const snapshot = activeSnapshots.get(element);
    if (!snapshot) return outcome(null, 'no-transaction');
    if (snapshot.state === 'settled') return outcome('settled', 'already-settled');
    if (snapshot.state !== 'previewing' && snapshot.state !== 'finalizing') {
      throw new CascadeThemePreviewError('Unknown preview transaction state', 'INVALID_TRANSITION');
    }
    restoreSnapshot(element, style, snapshot);
    return outcome('settled', 'rolled-back');
  } finally {
    releaseOperation(element, owner);
  }
}

/**
 * Commits a finalizing transaction. Commit is intentionally the last
 * irreversible operation in the import flow.
 *
 * @param {HTMLElement} element
 * @returns {{state: 'settled', outcome: string}}
 */
export function commit(element) {
  const owner = acquireOperation(element, 'commit');
  try {
    assertTarget(element);
    const snapshot = activeSnapshots.get(element);
    if (!snapshot) {
      throw new CascadeThemePreviewError('No active preview transaction', 'NO_PREVIEW');
    }
    if (snapshot.state !== 'finalizing') {
      throw new CascadeThemePreviewError(
        `Cannot commit a ${snapshot.state} preview transaction`,
        'INVALID_TRANSITION'
      );
    }
    snapshot.state = 'settled';
    return outcome('settled', 'committed');
  } finally {
    releaseOperation(element, owner);
  }
}
