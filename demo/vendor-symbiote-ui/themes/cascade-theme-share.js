import {
  normalizeCascadeThemeOptions,
} from './cascade-theme.js';
import { CASCADE_THEME_CONTROL_LIST, CASCADE_THEME_DEFAULTS } from './cascade-theme-controls.js';
import { GEOMETRY_PROFILE_NAMES } from '../tokens/scale.js';

const SHARE_ERROR_INSTANCES = new WeakSet();

function describeThrown(value) {
  if (typeof value === 'string') return value;
  if (value === null) return 'null was thrown';
  return `${typeof value} value was thrown`;
}

/**
 * Typed error class for theme codec operations.
 */
export class CascadeThemeShareError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'CascadeThemeShareError';
    this.code = code;
    SHARE_ERROR_INSTANCES.add(this);
  }
}

function normalizeShareFailure(error, context, code = 'INVALID_PAYLOAD') {
  if (SHARE_ERROR_INSTANCES.has(error)) return error;
  return new CascadeThemeShareError(`${context}: ${describeThrown(error)}`, code);
}

function isPlainObject(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
  const proto = Object.getPrototypeOf(obj);
  return proto === null || proto === Object.prototype;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function snapshotDataObject(value, label) {
  let plainObject;
  try {
    plainObject = isPlainObject(value);
  } catch (error) {
    throw new CascadeThemeShareError(
      `${label} could not be inspected: ${describeThrown(error)}`,
      'INVALID_PAYLOAD',
    );
  }
  if (!plainObject) {
    throw new CascadeThemeShareError(`${label} must be a plain object`, 'INVALID_PAYLOAD');
  }

  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch (error) {
    throw new CascadeThemeShareError(
      `${label} keys could not be inspected: ${describeThrown(error)}`,
      'INVALID_PAYLOAD',
    );
  }

  const snapshot = Object.create(null);
  for (const key of keys) {
    if (typeof key !== 'string') {
      throw new CascadeThemeShareError(`${label} must not contain symbol keys`, 'INVALID_PAYLOAD');
    }

    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch (error) {
      throw new CascadeThemeShareError(
        `${label}.${key} could not be inspected: ${describeThrown(error)}`,
        'INVALID_PAYLOAD',
      );
    }

    if (!descriptor || !descriptor.enumerable || !hasOwn(descriptor, 'value')) {
      throw new CascadeThemeShareError(
        `${label}.${key} must be an enumerable data property`,
        'INVALID_PAYLOAD',
      );
    }
    snapshot[key] = descriptor.value;
  }

  return snapshot;
}

/**
 * Validates the display name rules: trimmed, max 64 code points, no control characters.
 */
function validateName(name) {
  if (typeof name !== 'string') {
    throw new CascadeThemeShareError('Theme name must be a string', 'INVALID_NAME');
  }
  if (name.length === 0) {
    throw new CascadeThemeShareError('Theme name cannot be empty', 'INVALID_NAME');
  }
  if (name.trim() !== name) {
    throw new CascadeThemeShareError('Theme name must be trimmed', 'INVALID_NAME');
  }
  // Check Unicode code point count
  const codePoints = [...name];
  if (codePoints.length > 64) {
    throw new CascadeThemeShareError('Theme name exceeds 64 code points', 'INVALID_NAME');
  }
  // Reject C0/C1 control characters (0x00-0x1F, 0x7F, 0x80-0x9F)
  for (const char of name) {
    const cp = char.codePointAt(0);
    if (cp === undefined || cp < 0x20 || cp === 0x7F || (cp >= 0x80 && cp <= 0x9F)) {
      throw new CascadeThemeShareError('Theme name contains control characters', 'INVALID_NAME');
    }
  }
}

/**
 * Validates the register value rules.
 */
function validateRegister(register) {
  if (typeof register !== 'string') {
    throw new CascadeThemeShareError('Register must be a string', 'INVALID_PAYLOAD');
  }
  if (register !== '' && !GEOMETRY_PROFILE_NAMES.includes(register)) {
    throw new CascadeThemeShareError(`Invalid register value: ${register}`, 'INVALID_PAYLOAD');
  }
}

/**
 * Validation: type checks, enum checks, range checks, finite checks.
 */
function validateState(state, requireComplete = false) {
  if (!isPlainObject(state)) {
    throw new CascadeThemeShareError('State must be a plain object', 'INVALID_PAYLOAD');
  }

  const stateKeys = Object.keys(state);
  const controlNames = new Set(CASCADE_THEME_CONTROL_LIST.map((c) => c.name));

  for (const key of stateKeys) {
    if (!controlNames.has(key)) {
      throw new CascadeThemeShareError(`State contains unknown parameter: ${key}`, 'INVALID_PAYLOAD');
    }
  }

  if (requireComplete) {
    for (const control of CASCADE_THEME_CONTROL_LIST) {
      if (!hasOwn(state, control.name)) {
        throw new CascadeThemeShareError(`Missing required state parameter: ${control.name}`, 'INVALID_PAYLOAD');
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
        throw new CascadeThemeShareError(`Parameter ${control.name} must be a string`, 'INVALID_PAYLOAD');
      }
      if (!control.values.includes(val)) {
        throw new CascadeThemeShareError(`Parameter ${control.name} has invalid value: ${val}`, 'INVALID_PAYLOAD');
      }
    } else if (control.type === 'number') {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        throw new CascadeThemeShareError(`Parameter ${control.name} must be a finite number`, 'INVALID_PAYLOAD');
      }
      if (val < control.min || val > control.max) {
        throw new CascadeThemeShareError(
          `Parameter ${control.name} is out of bounds [${control.min}, ${control.max}]: ${val}`,
          'INVALID_PAYLOAD'
        );
      }
    } else {
      throw new CascadeThemeShareError(`Unknown parameter type for ${control.name}`, 'INVALID_PAYLOAD');
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
 * Encodes Uint8Array to unpadded base64url.
 */
function base64urlEncodeBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = globalThis.btoa(binary);
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decodes unpadded base64url string to Uint8Array.
 */
function base64urlDecodeToBytes(base64urlStr) {
  let base64 = base64urlStr
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const pad = base64.length % 4;
  if (pad === 2) {
    base64 += '==';
  } else if (pad === 3) {
    base64 += '=';
  } else if (pad === 1) {
    throw new Error('Invalid base64url length');
  }

  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encodes Cascade theme state, register, and name into a URL-safe token.
 */
function encodeCascadeThemeShareInternal(input) {
  const inputSnapshot = snapshotDataObject(input, 'Input');

  for (const key of Object.keys(inputSnapshot)) {
    if (key !== 'state' && key !== 'register' && key !== 'name') {
      throw new CascadeThemeShareError(`Unexpected key in input: ${key}`, 'INVALID_PAYLOAD');
    }
  }

  if (!hasOwn(inputSnapshot, 'state') || inputSnapshot.state === undefined) {
    throw new CascadeThemeShareError('State is required', 'INVALID_PAYLOAD');
  }

  const state = snapshotDataObject(inputSnapshot.state, 'State');
  const hasRegister = hasOwn(inputSnapshot, 'register');
  const hasName = hasOwn(inputSnapshot, 'name');
  const register = inputSnapshot.register;
  const name = inputSnapshot.name;

  validateState(state, false);
  if (hasRegister) validateRegister(register);
  if (hasName) validateName(name);

  const fullState = { ...CASCADE_THEME_DEFAULTS, ...state };
  const normalizedState = normalizeCascadeThemeOptions(fullState);

  const payload = {
    state: normalizedState,
  };
  if (hasRegister) {
    payload.register = register;
  }
  if (hasName) {
    payload.name = name;
  }

  const jsonStr = stringifyCanonical(payload);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(jsonStr);

  if (bytes.byteLength > 768) {
    throw new CascadeThemeShareError('Decoded UTF-8 payload exceeds 768 bytes', 'OVERSIZED');
  }

  const encoded = base64urlEncodeBytes(bytes);
  const token = `v1.${encoded}`;

  if (token.length > 1024) {
    throw new CascadeThemeShareError('Encoded token exceeds 1024 characters', 'OVERSIZED');
  }

  return token;
}

export function encodeCascadeThemeShare(input) {
  try {
    return encodeCascadeThemeShareInternal(input);
  } catch (error) {
    throw normalizeShareFailure(error, 'Theme share encoding failed');
  }
}

/**
 * Decodes a URL-safe token into Cascade theme options, name and optional register.
 */
function decodeCascadeThemeShareInternal(token) {
  if (typeof token !== 'string') {
    throw new CascadeThemeShareError('Token must be a string', 'INVALID_PAYLOAD');
  }
  if (!/^[\x20-\x7E]*$/.test(token)) {
    throw new CascadeThemeShareError('Token contains non-ASCII characters', 'INVALID_ENCODING');
  }
  if (token.length > 1024) {
    throw new CascadeThemeShareError('Token exceeds 1024 characters', 'OVERSIZED');
  }
  if (!token.startsWith('v1.')) {
    throw new CascadeThemeShareError('Invalid token version prefix', 'UNSUPPORTED_VERSION');
  }

  const base64urlPart = token.slice(3);
  if (base64urlPart.length === 0) {
    throw new CascadeThemeShareError('Empty payload', 'INVALID_ENCODING');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(base64urlPart)) {
    throw new CascadeThemeShareError('Token contains invalid base64url characters or padding', 'INVALID_ENCODING');
  }

  let bytes;
  try {
    bytes = base64urlDecodeToBytes(base64urlPart);
  } catch (error) {
    throw new CascadeThemeShareError(
      `Malformed base64url content: ${describeThrown(error)}`,
      'INVALID_ENCODING',
    );
  }

  // Detect non-canonical base64url tail bits by re-encoding
  const reEncoded = base64urlEncodeBytes(bytes);
  if (reEncoded !== base64urlPart) {
    throw new CascadeThemeShareError('Non-canonical base64url tail bits', 'INVALID_ENCODING');
  }

  if (bytes.byteLength > 768) {
    throw new CascadeThemeShareError('Decoded payload exceeds 768 bytes', 'OVERSIZED');
  }

  let decodedStr;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decodedStr = decoder.decode(bytes);
  } catch (error) {
    throw new CascadeThemeShareError(
      `Fatal UTF-8 decoding error: ${describeThrown(error)}`,
      'INVALID_ENCODING',
    );
  }

  let payload;
  try {
    payload = JSON.parse(decodedStr);
  } catch (error) {
    throw new CascadeThemeShareError(
      `Malformed JSON payload: ${describeThrown(error)}`,
      'INVALID_ENCODING',
    );
  }

  if (stringifyCanonical(payload) !== decodedStr) {
    throw new CascadeThemeShareError('JSON payload is not canonical', 'INVALID_ENCODING');
  }

  const payloadSnapshot = snapshotDataObject(payload, 'Decoded payload');

  for (const key of Object.keys(payloadSnapshot)) {
    if (key !== 'state' && key !== 'register' && key !== 'name') {
      throw new CascadeThemeShareError(`Unexpected key in payload: ${key}`, 'INVALID_PAYLOAD');
    }
  }

  if (!hasOwn(payloadSnapshot, 'state') || payloadSnapshot.state === undefined) {
    throw new CascadeThemeShareError('Payload is missing state', 'INVALID_PAYLOAD');
  }

  const state = snapshotDataObject(payloadSnapshot.state, 'Decoded state');
  validateState(state, true);
  const hasRegister = hasOwn(payloadSnapshot, 'register');
  const hasName = hasOwn(payloadSnapshot, 'name');
  if (hasRegister) validateRegister(payloadSnapshot.register);
  if (hasName) validateName(payloadSnapshot.name);

  const normalizedState = normalizeCascadeThemeOptions(state);

  const result = {
    state: normalizedState,
    register: hasRegister ? payloadSnapshot.register : '',
  };

  if (hasName) {
    result.name = payloadSnapshot.name;
  }

  return result;
}

export function decodeCascadeThemeShare(token) {
  try {
    return decodeCascadeThemeShareInternal(token);
  } catch (error) {
    throw normalizeShareFailure(error, 'Theme share decoding failed', 'INVALID_ENCODING');
  }
}
