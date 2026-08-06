import {
  normalizeCascadeThemeOptions,
} from './cascade-theme.js';
import { CASCADE_THEME_CONTROL_LIST, CASCADE_THEME_DEFAULTS } from './cascade-theme-controls.js';
import { GEOMETRY_PROFILE_NAMES } from '../tokens/scale.js';

const PRESET_ERROR_INSTANCES = new WeakSet();

function describeThrown(value) {
  if (typeof value === 'string') return value;
  if (value === null) return 'null was thrown';
  return `${typeof value} value was thrown`;
}

/**
 * Typed error class for theme preset store operations.
 */
export class CascadeThemePresetError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'CascadeThemePresetError';
    this.code = code;
    PRESET_ERROR_INSTANCES.add(this);
  }
}

function normalizePresetFailure(error, context, code = 'INVALID_PAYLOAD') {
  if (PRESET_ERROR_INSTANCES.has(error)) return error;
  return new CascadeThemePresetError(`${context}: ${describeThrown(error)}`, code);
}

function isPlainObject(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
  const proto = Object.getPrototypeOf(obj);
  return proto === null || proto === Object.prototype;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function snapshotDataObject(value, label) {
  let plainObject;
  try {
    plainObject = isPlainObject(value);
  } catch (error) {
    throw new CascadeThemePresetError(
      `${label} could not be inspected: ${describeThrown(error)}`,
      'INVALID_PAYLOAD',
    );
  }
  if (!plainObject) {
    throw new CascadeThemePresetError(`${label} must be a plain object`, 'INVALID_PAYLOAD');
  }

  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch (error) {
    throw new CascadeThemePresetError(
      `${label} keys could not be inspected: ${describeThrown(error)}`,
      'INVALID_PAYLOAD',
    );
  }

  const snapshot = Object.create(null);
  for (const key of keys) {
    if (typeof key !== 'string') {
      throw new CascadeThemePresetError(`${label} must not contain symbol keys`, 'INVALID_PAYLOAD');
    }

    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch (error) {
      throw new CascadeThemePresetError(
        `${label}.${key} could not be inspected: ${describeThrown(error)}`,
        'INVALID_PAYLOAD',
      );
    }

    if (!descriptor || !descriptor.enumerable || !hasOwn(descriptor, 'value')) {
      throw new CascadeThemePresetError(
        `${label}.${key} must be an enumerable data property`,
        'INVALID_PAYLOAD',
      );
    }
    snapshot[key] = descriptor.value;
  }

  return snapshot;
}

function snapshotOptions(options, allowedKeys) {
  const snapshot = snapshotDataObject(options, 'Options');
  for (const key of Object.keys(snapshot)) {
    if (!allowedKeys.includes(key)) {
      throw new CascadeThemePresetError(`Unexpected option: ${key}`, 'INVALID_PAYLOAD');
    }
  }
  return snapshot;
}

/**
 * Validates the display name rules: trimmed, max 64 code points, no control characters.
 */
function validateName(name) {
  if (typeof name !== 'string') {
    throw new CascadeThemePresetError('Theme name must be a string', 'INVALID_NAME');
  }
  if (name.length === 0) {
    throw new CascadeThemePresetError('Theme name cannot be empty', 'INVALID_NAME');
  }
  if (name.trim() !== name) {
    throw new CascadeThemePresetError('Theme name must be trimmed', 'INVALID_NAME');
  }
  const codePoints = [...name];
  if (codePoints.length > 64) {
    throw new CascadeThemePresetError('Theme name exceeds 64 code points', 'INVALID_NAME');
  }
  for (const char of name) {
    const cp = char.codePointAt(0);
    if (cp === undefined || cp < 0x20 || cp === 0x7F || (cp >= 0x80 && cp <= 0x9F)) {
      throw new CascadeThemePresetError('Theme name contains control characters', 'INVALID_NAME');
    }
  }
}

/**
 * Validates the register value rules.
 */
function validateRegister(register) {
  if (typeof register !== 'string') {
    throw new CascadeThemePresetError('Register must be a string', 'INVALID_PAYLOAD');
  }
  if (register !== '' && !GEOMETRY_PROFILE_NAMES.includes(register)) {
    throw new CascadeThemePresetError(`Invalid register value: ${register}`, 'INVALID_PAYLOAD');
  }
}

/**
 * Validation: type checks, enum checks, range checks, finite checks.
 */
function validateState(state, requireComplete = false) {
  if (!isPlainObject(state)) {
    throw new CascadeThemePresetError('State must be a plain object', 'INVALID_PAYLOAD');
  }

  const stateKeys = Object.keys(state);
  const controlNames = new Set(CASCADE_THEME_CONTROL_LIST.map((c) => c.name));

  for (const key of stateKeys) {
    if (!controlNames.has(key)) {
      throw new CascadeThemePresetError(`State contains unknown parameter: ${key}`, 'INVALID_PAYLOAD');
    }
  }

  if (requireComplete) {
    for (const control of CASCADE_THEME_CONTROL_LIST) {
      if (!hasOwn(state, control.name)) {
        throw new CascadeThemePresetError(`Missing required state parameter: ${control.name}`, 'INVALID_PAYLOAD');
      }
    }
  }

  for (const control of CASCADE_THEME_CONTROL_LIST) {
    if (!hasOwn(state, control.name)) {
      continue;
    }
    const val = state[control.name];

    if (control.type === 'enum') {
      if (typeof val !== 'string') {
        throw new CascadeThemePresetError(`Parameter ${control.name} must be a string`, 'INVALID_PAYLOAD');
      }
      if (!control.values.includes(val)) {
        throw new CascadeThemePresetError(`Parameter ${control.name} has invalid value: ${val}`, 'INVALID_PAYLOAD');
      }
    } else if (control.type === 'number') {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        throw new CascadeThemePresetError(`Parameter ${control.name} must be a finite number`, 'INVALID_PAYLOAD');
      }
      if (val < control.min || val > control.max) {
        throw new CascadeThemePresetError(
          `Parameter ${control.name} is out of bounds [${control.min}, ${control.max}]: ${val}`,
          'INVALID_PAYLOAD'
        );
      }
    } else {
      throw new CascadeThemePresetError(`Unknown parameter type for ${control.name}`, 'INVALID_PAYLOAD');
    }
  }
}

/**
 * Recursive deterministic canonical JSON stringifier (sorted keys).
 */
function stringifyCanonical(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(stringifyCanonical).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const properties = keys.map((key) => {
    return JSON.stringify(key) + ':' + stringifyCanonical(obj[key]);
  });
  return '{' + properties.join(',') + '}';
}

/**
 * Returns the storage instance to use based on environments and options.
 */
function getStorage(options, requiredMethods) {
  let storage;
  try {
    if (hasOwn(options, 'storage')) {
      storage = options.storage;
    } else {
      storage = typeof window === 'undefined' ? null : window.localStorage;
    }
  } catch (error) {
    throw new CascadeThemePresetError(
      `Storage is not available: ${describeThrown(error)}`,
      'STORAGE_UNAVAILABLE',
    );
  }
  if (!storage) {
    throw new CascadeThemePresetError('Storage is not available', 'STORAGE_UNAVAILABLE');
  }
  if (typeof storage !== 'object' && typeof storage !== 'function') {
    throw new CascadeThemePresetError('Storage must be an object', 'STORAGE_UNAVAILABLE');
  }

  const surface = { target: storage };
  for (const methodName of requiredMethods) {
    let method;
    try {
      method = storage[methodName];
    } catch (error) {
      throw new CascadeThemePresetError(
        `Storage method ${methodName} is not available: ${describeThrown(error)}`,
        'STORAGE_UNAVAILABLE',
      );
    }
    if (typeof method !== 'function') {
      throw new CascadeThemePresetError(
        `Storage method ${methodName} must be callable`,
        'STORAGE_UNAVAILABLE',
      );
    }
    try {
      surface[methodName] = Function.prototype.bind.call(method, storage);
    } catch (error) {
      throw new CascadeThemePresetError(
        `Storage method ${methodName} could not be captured: ${describeThrown(error)}`,
        'STORAGE_UNAVAILABLE',
      );
    }
  }

  return surface;
}

function readStorageValue(storage, key, context) {
  let value;
  try {
    value = storage.getItem(key);
  } catch (error) {
    if (PRESET_ERROR_INSTANCES.has(error)) throw error;
    throw new CascadeThemePresetError(
      `${context} failed: ${describeThrown(error)}`,
      'STORAGE_UNAVAILABLE',
    );
  }
  if (value !== null && typeof value !== 'string') {
    throw new CascadeThemePresetError(
      `${context} must return a string or null`,
      'STORAGE_UNAVAILABLE',
    );
  }
  return value;
}

function removeStorageValue(storage, key, context) {
  let result;
  try {
    result = storage.removeItem(key);
  } catch (error) {
    throw new CascadeThemePresetError(
      `${context} failed: ${describeThrown(error)}`,
      'CLEANUP_FAILURE',
    );
  }
  if (result !== undefined) {
    throw new CascadeThemePresetError(
      `${context} must return undefined`,
      'CLEANUP_FAILURE',
    );
  }
}

function cleanupOwnedWrite(storage, key, serialized, context) {
  let current;
  try {
    current = readStorageValue(storage, key, 'Cleanup ownership check');
  } catch (error) {
    throw new CascadeThemePresetError(
      `${context}; cleanup ownership could not be verified (${describeThrown(error)})`,
      'CLEANUP_FAILURE',
    );
  }

  if (current === null) return;
  if (current !== serialized) {
    throw new CascadeThemePresetError(
      `${context}; the preset key contains bytes not owned by this write attempt`,
      'CONFLICT',
    );
  }

  removeStorageValue(storage, key, 'Owned preset cleanup');

  let residual;
  try {
    residual = readStorageValue(storage, key, 'Cleanup verification');
  } catch (error) {
    throw new CascadeThemePresetError(
      `${context}; cleanup absence could not be verified (${describeThrown(error)})`,
      'CLEANUP_FAILURE',
    );
  }
  if (residual !== null) {
    throw new CascadeThemePresetError(
      `${context}; cleanup did not leave the preset key absent`,
      residual === serialized ? 'CLEANUP_FAILURE' : 'CONFLICT',
    );
  }
}

function readStorageKey(storage, index) {
  let key;
  try {
    key = storage.key(index);
  } catch (error) {
    throw new CascadeThemePresetError(
      `Failed to get storage key: ${describeThrown(error)}`,
      'STORAGE_UNAVAILABLE',
    );
  }
  if (key !== null && typeof key !== 'string') {
    throw new CascadeThemePresetError('Storage.key() must return a string or null', 'STORAGE_UNAVAILABLE');
  }
  return key;
}

/**
 * Single strict parser for get/list.
 */
function parseAndValidateRecord(rawString, expectedId) {
  let parsed;
  try {
    parsed = JSON.parse(rawString);
  } catch (err) {
    throw new CascadeThemePresetError(
      `Corrupted JSON payload: ${describeThrown(err)}`,
      'CORRUPTION',
    );
  }

  if (!isPlainObject(parsed)) {
    throw new CascadeThemePresetError('Stored record must be a plain object', 'CORRUPTION');
  }

  const allowedKeys = new Set(['id', 'version', 'createdAt', 'state', 'register', 'name']);
  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) {
      throw new CascadeThemePresetError(`Unexpected field in stored record: ${key}`, 'CORRUPTION');
    }
  }

  const requiredFields = ['id', 'version', 'createdAt', 'state', 'register'];
  for (const field of requiredFields) {
    if (!hasOwn(parsed, field)) {
      throw new CascadeThemePresetError(`Missing required field: ${field}`, 'CORRUPTION');
    }
  }

  if (parsed.id !== expectedId) {
    throw new CascadeThemePresetError('Stored record ID does not match its storage key', 'CORRUPTION');
  }
  if (!UUID_V4_PATTERN.test(parsed.id)) {
    throw new CascadeThemePresetError('Stored record ID must be a UUID v4 string', 'CORRUPTION');
  }

  if (parsed.version !== 'v1') {
    throw new CascadeThemePresetError('Stored record version must be v1', 'CORRUPTION');
  }

  if (typeof parsed.createdAt !== 'string') {
    throw new CascadeThemePresetError('createdAt must be a string', 'CORRUPTION');
  }
  const createdAt = new Date(parsed.createdAt);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== parsed.createdAt) {
    throw new CascadeThemePresetError('Stored createdAt must be a canonical ISO timestamp', 'CORRUPTION');
  }

  try {
    validateState(parsed.state, true);
  } catch (err) {
    throw new CascadeThemePresetError(`Invalid state: ${describeThrown(err)}`, 'CORRUPTION');
  }

  try {
    validateRegister(parsed.register);
  } catch (err) {
    throw new CascadeThemePresetError(`Invalid register: ${describeThrown(err)}`, 'CORRUPTION');
  }

  if (hasOwn(parsed, 'name')) {
    try {
      validateName(parsed.name);
    } catch (err) {
      throw new CascadeThemePresetError(`Invalid name: ${describeThrown(err)}`, 'CORRUPTION');
    }
  }

  if (rawString !== stringifyCanonical(parsed)) {
    throw new CascadeThemePresetError('Stored record is not canonical JSON', 'CORRUPTION');
  }

  return parsed;
}

/**
 * Inserts a new user preset record. Generates unique UUID, checks for collisions,
 * writes to storage, and verifies with a byte-for-byte readback.
 */
function insertCascadeThemeUserPresetInternal(presetRecord, options = {}) {
  const presetSnapshot = snapshotDataObject(presetRecord, 'Preset record');
  const optionSnapshot = snapshotOptions(options, ['storage', 'uuidFactory', 'clock']);

  if (
    hasOwn(presetSnapshot, 'id')
    || hasOwn(presetSnapshot, 'version')
    || hasOwn(presetSnapshot, 'createdAt')
  ) {
    throw new CascadeThemePresetError('Input must not accept caller-owned id, version, or createdAt', 'INVALID_PAYLOAD');
  }

  for (const key of Object.keys(presetSnapshot)) {
    if (key !== 'state' && key !== 'register' && key !== 'name') {
      throw new CascadeThemePresetError(`Unexpected key in presetRecord: ${key}`, 'INVALID_PAYLOAD');
    }
  }

  if (!hasOwn(presetSnapshot, 'state') || presetSnapshot.state === undefined) {
    throw new CascadeThemePresetError('State is required', 'INVALID_PAYLOAD');
  }

  const state = snapshotDataObject(presetSnapshot.state, 'Preset state');
  const hasRegister = hasOwn(presetSnapshot, 'register');
  const hasName = hasOwn(presetSnapshot, 'name');

  try {
    validateState(state, false);
    if (hasRegister) validateRegister(presetSnapshot.register);
    if (hasName) validateName(presetSnapshot.name);
  } catch (err) {
    if (PRESET_ERROR_INSTANCES.has(err)) throw err;
    throw normalizePresetFailure(err, 'Preset validation failed');
  }

  const fullState = { ...CASCADE_THEME_DEFAULTS, ...state };
  const normalizedState = normalizeCascadeThemeOptions(fullState);
  const storage = getStorage(optionSnapshot, ['getItem', 'setItem', 'removeItem']);

  const hasUuidFactory = hasOwn(optionSnapshot, 'uuidFactory');
  if (hasUuidFactory && typeof optionSnapshot.uuidFactory !== 'function') {
    throw new CascadeThemePresetError('uuidFactory must be callable', 'INVALID_PAYLOAD');
  }

  const hasClock = hasOwn(optionSnapshot, 'clock');
  const clock = hasClock ? optionSnapshot.clock : { now: () => new Date() };
  const clockSnapshot = snapshotDataObject(clock, 'Clock');
  if (typeof clockSnapshot.now !== 'function') {
    throw new CascadeThemePresetError('Clock.now must be callable', 'INVALID_PAYLOAD');
  }

  let timestamp;
  try {
    timestamp = clockSnapshot.now.call(clock);
  } catch (error) {
    throw new CascadeThemePresetError(
      `Clock failed to produce a timestamp: ${describeThrown(error)}`,
      'INVALID_PAYLOAD',
    );
  }

  if (typeof timestamp !== 'object' || timestamp === null) {
    throw new CascadeThemePresetError('Clock.now must return a Date', 'INVALID_PAYLOAD');
  }

  let timestampValue;
  let createdAt;
  try {
    timestampValue = Date.prototype.getTime.call(timestamp);
    createdAt = Date.prototype.toISOString.call(timestamp);
  } catch (error) {
    throw new CascadeThemePresetError(
      `Clock.now must return a valid Date: ${describeThrown(error)}`,
      'INVALID_PAYLOAD',
    );
  }
  if (!Number.isFinite(timestampValue)) {
    throw new CascadeThemePresetError('Clock produced a non-canonical ISO timestamp', 'INVALID_PAYLOAD');
  }

  const uuidFactory = hasUuidFactory
    ? optionSnapshot.uuidFactory
    : () => {
      let randomUUID;
      try {
        randomUUID = globalThis.crypto?.randomUUID;
      } catch (error) {
        throw new CascadeThemePresetError(
          `crypto.randomUUID is not available: ${describeThrown(error)}`,
          'STORAGE_UNAVAILABLE',
        );
      }
      if (typeof randomUUID !== 'function') {
        throw new CascadeThemePresetError('crypto.randomUUID is not available', 'STORAGE_UNAVAILABLE');
      }
      try {
        return Reflect.apply(randomUUID, globalThis.crypto, []);
      } catch (error) {
        throw new CascadeThemePresetError(
          `UUID generation failed: ${describeThrown(error)}`,
          'STORAGE_UNAVAILABLE',
        );
      }
    };

  for (let retries = 0; retries < 10; retries++) {
    let uuid;
    try {
      uuid = uuidFactory();
    } catch (error) {
      if (PRESET_ERROR_INSTANCES.has(error)) throw error;
      throw new CascadeThemePresetError(
        `UUID generation failed: ${describeThrown(error)}`,
        'STORAGE_UNAVAILABLE',
      );
    }

    if (typeof uuid !== 'string' || !UUID_V4_PATTERN.test(uuid)) {
      throw new CascadeThemePresetError('UUID factory must return a UUID v4 string', 'STORAGE_UNAVAILABLE');
    }

    const key = `symbiote-ui:presets:v1:${uuid}`;
    const record = {
      id: uuid,
      version: 'v1',
      createdAt,
      state: normalizedState,
      register: hasRegister ? presetSnapshot.register : '',
    };
    if (hasName) record.name = presetSnapshot.name;
    const serialized = stringifyCanonical(record);

    const existing = readStorageValue(storage, key, 'Storage collision check');
    if (existing !== null) continue;

    let writeFailed = false;
    let writeFailure;
    let writeResult;
    try {
      writeResult = storage.setItem(key, serialized);
    } catch (error) {
      writeFailed = true;
      writeFailure = error;
    }

    if (writeFailed || writeResult !== undefined) {
      cleanupOwnedWrite(
        storage,
        key,
        serialized,
        writeFailed
          ? 'Storage write failed and may have persisted data'
          : 'Storage.setItem returned a non-undefined result',
      );
      throw new CascadeThemePresetError(
        writeFailed
          ? `Failed to write to storage: ${describeThrown(writeFailure)}`
          : 'Storage.setItem must return undefined',
        'STORAGE_UNAVAILABLE',
      );
    }

    let readback;
    try {
      readback = readStorageValue(storage, key, 'Storage readback');
    } catch (error) {
      cleanupOwnedWrite(storage, key, serialized, 'Storage readback failed after the write');
      throw new CascadeThemePresetError(
        `Storage readback failed: ${describeThrown(error)}`,
        'STORAGE_UNAVAILABLE',
      );
    }

    if (readback !== serialized) {
      cleanupOwnedWrite(storage, key, serialized, 'Storage readback did not match the new record');
      throw new CascadeThemePresetError(
        'Storage readback failed: byte-for-byte integrity check failed',
        'READBACK_FAILURE',
      );
    }

    return record;
  }

  throw new CascadeThemePresetError(
    'Failed to generate a unique ID due to multiple collisions',
    'COLLISION',
  );
}

export function insertCascadeThemeUserPreset(presetRecord, options = {}) {
  try {
    return insertCascadeThemeUserPresetInternal(presetRecord, options);
  } catch (error) {
    throw normalizePresetFailure(error, 'Preset insertion failed');
  }
}

/**
 * Retrieves a single user preset by ID.
 */
function getCascadeThemeUserPresetInternal(id, options = {}) {
  if (typeof id !== 'string' || !UUID_V4_PATTERN.test(id)) {
    throw new CascadeThemePresetError('Invalid ID', 'INVALID_PAYLOAD');
  }

  const optionSnapshot = snapshotOptions(options, ['storage']);
  const storage = getStorage(optionSnapshot, ['getItem']);
  const key = `symbiote-ui:presets:v1:${id}`;
  let value;

  try {
    value = readStorageValue(storage, key, 'Storage read');
  } catch (err) {
    if (PRESET_ERROR_INSTANCES.has(err)) throw err;
    throw new CascadeThemePresetError(
      `Storage read failed: ${describeThrown(err)}`,
      'STORAGE_UNAVAILABLE',
    );
  }

  if (value === null) {
    return null;
  }

  return parseAndValidateRecord(value, id);
}

export function getCascadeThemeUserPreset(id, options = {}) {
  try {
    return getCascadeThemeUserPresetInternal(id, options);
  } catch (error) {
    throw normalizePresetFailure(error, 'Preset retrieval failed');
  }
}

/**
 * Retrieves all user presets from the store.
 */
function listCascadeThemeUserPresetsInternal(options = {}) {
  const optionSnapshot = snapshotOptions(options, ['storage']);
  const storage = getStorage(optionSnapshot, ['getItem', 'key']);
  let len;
  try {
    len = storage.target.length;
  } catch (err) {
    throw new CascadeThemePresetError(
      `Failed to read storage length: ${describeThrown(err)}`,
      'STORAGE_UNAVAILABLE',
    );
  }

  if (!Number.isInteger(len) || len < 0) {
    throw new CascadeThemePresetError('Storage length must be a non-negative integer', 'STORAGE_UNAVAILABLE');
  }

  const presets = [];
  for (let i = 0; i < len; i++) {
    const key = readStorageKey(storage, i);

    if (key && key.startsWith('symbiote-ui:presets:v1:')) {
      const id = key.substring('symbiote-ui:presets:v1:'.length);
      const value = readStorageValue(storage, key, `Storage read for key ${key}`);

      if (value === null) {
        throw new CascadeThemePresetError(`Storage key ${key} exists but value is null`, 'CORRUPTION');
      }
      const parsed = parseAndValidateRecord(value, id);
      presets.push(parsed);
    }
  }

  return presets;
}

export function listCascadeThemeUserPresets(options = {}) {
  try {
    return listCascadeThemeUserPresetsInternal(options);
  } catch (error) {
    throw normalizePresetFailure(error, 'Preset listing failed');
  }
}
