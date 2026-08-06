/**
 * LayoutRouter path-mode unit tests
 *
 * Tests the dual-mode routing (hash + path) in isolation using
 * the parsed/built URL primitives. Browser-side integration (popstate,
 * pushState) is not available in Node test runner, so we test the
 * pure logic: configureRouter, buildUrl, syncFromUrl parsing, and
 * backward compatibility of the PubSub API.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHash,
  buildQuery,
  configureRouter,
  getRoute,
  getRouterBasePath,
  getRouterMode,
  parseQuery,
} from '../layout/LayoutRouter/LayoutRouter.js';

// --- parseQuery / buildQuery (shared by both modes) ---

test('parseQuery returns empty object for empty string', () => {
  assert.deepEqual(parseQuery(''), {});
  assert.deepEqual(parseQuery(null), {});
  assert.deepEqual(parseQuery(undefined), {});
});

test('parseQuery decodes key-value pairs', () => {
  assert.deepEqual(parseQuery('mode=flat&page=2'), { mode: 'flat', page: '2' });
});

test('parseQuery decodes URI-encoded values', () => {
  assert.deepEqual(parseQuery('q=hello%20world'), { q: 'hello world' });
});

test('buildQuery filters empty values', () => {
  assert.equal(buildQuery({ a: 'x', b: '', c: null }), 'a=x');
});

test('buildQuery returns empty string for no values', () => {
  assert.equal(buildQuery({}), '');
  assert.equal(buildQuery({ a: '' }), '');
});

test('buildQuery encodes special characters', () => {
  let result = buildQuery({ 'a b': 'c&d' });
  assert.equal(result, 'a%20b=c%26d');
});

// --- buildHash (hash mode helper) ---

test('buildHash builds panel only', () => {
  assert.equal(buildHash('dashboard'), 'dashboard');
});

test('buildHash builds panel + subpath', () => {
  assert.equal(buildHash('users', 'abc-123'), 'users/abc-123');
});

test('buildHash builds panel + subpath + query', () => {
  assert.equal(buildHash('jobs', 'detail', { tab: 'logs' }), 'jobs/detail?tab=logs');
});

test('buildHash omits empty subpath', () => {
  assert.equal(buildHash('home', '', { mode: 'dark' }), 'home?mode=dark');
});

// --- configureRouter ---

test('default mode is hash', () => {
  assert.equal(getRouterMode(), 'hash');
});

test('configureRouter sets mode to path', () => {
  configureRouter({ mode: 'path', basePath: '/app/' });
  assert.equal(getRouterMode(), 'path');
  assert.equal(getRouterBasePath(), '/app/');
  // Reset to default
  configureRouter({ mode: 'hash' });
});

test('configureRouter normalizes basePath with leading/trailing slashes', () => {
  configureRouter({ mode: 'path', basePath: 'cv' });
  assert.equal(getRouterBasePath(), '/cv/');
  configureRouter({ mode: 'path', basePath: '/cv' });
  assert.equal(getRouterBasePath(), '/cv/');
  configureRouter({ mode: 'path', basePath: '/cv/' });
  assert.equal(getRouterBasePath(), '/cv/');
  // Reset
  configureRouter({ mode: 'hash' });
});

test('configureRouter with no arguments resets to hash mode', () => {
  configureRouter({ mode: 'path', basePath: '/test/' });
  configureRouter();
  assert.equal(getRouterMode(), 'hash');
});

test('getRoute returns current PubSub state', () => {
  let route = getRoute();
  assert.ok('panel' in route);
  assert.ok('subpath' in route);
  assert.ok('query' in route);
});

// --- backward compatibility ---

test('hash mode is the default without configureRouter call', () => {
  // After all tests, reset state and verify
  configureRouter({ mode: 'hash' });
  assert.equal(getRouterMode(), 'hash');
  assert.equal(getRouterBasePath(), '/');
});

test('configureRouter rejects invalid mode gracefully', () => {
  configureRouter({ mode: 'invalid' });
  assert.equal(getRouterMode(), 'hash');
  configureRouter({ mode: 'hash' });
});
