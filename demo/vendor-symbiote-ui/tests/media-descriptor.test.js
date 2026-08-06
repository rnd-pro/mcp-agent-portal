import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  normalizeMediaDescriptor,
  isMediaDescriptor,
  MEDIA_DESCRIPTOR_SCHEMA_ID,
} from '../graph/media-descriptor.js';
import { normalizeGraphNode } from '../graph/model.js';
import { GRAPH_SCHEMAS } from '../manifest/graph-schema.js';

test('media-descriptor and model import without any DOM globals', () => {
  assert.equal(typeof document, 'undefined');
  assert.equal(typeof window, 'undefined');
  assert.equal(typeof normalizeMediaDescriptor, 'function');
  assert.equal(typeof isMediaDescriptor, 'function');
  assert.equal(
    MEDIA_DESCRIPTOR_SCHEMA_ID,
    'https://rnd-pro.github.io/symbiote-ui/schemas/media-descriptor-v1.json'
  );
});

test('normalizeMediaDescriptor normalizes a well-formed descriptor', () => {
  let result = normalizeMediaDescriptor({
    kind: '  video  ',
    poster: '  poster.png ',
    alt: 'A clip',
    fit: 'fit',
    activation: { provider: '  youtube ', videoId: 'abc', src: 'x.mp4' },
    targetIds: [' a ', 'a', 'b', '', '  '],
  });
  assert.deepEqual(result, {
    kind: 'video',
    poster: 'poster.png',
    alt: 'A clip',
    fit: 'contain',
    activation: { provider: 'youtube', videoId: 'abc', src: 'x.mp4' },
    targetIds: ['a', 'b'],
  });
  assert.deepEqual(Object.keys(result), ['kind', 'poster', 'alt', 'fit', 'activation', 'targetIds']);
  assert.deepEqual(Object.keys(result.activation), ['provider', 'videoId', 'src']);
});

test('normalizeMediaDescriptor maps crop fit synonym to cover', () => {
  let result = normalizeMediaDescriptor({
    kind: 'image',
    fit: ' CROP ',
    activation: { provider: 'static' },
  });
  assert.equal(result.fit, 'cover');
});

test('normalizeMediaDescriptor accepts canonical fit values as-is', () => {
  assert.equal(
    normalizeMediaDescriptor({ kind: 'image', fit: 'contain', activation: { provider: 'static' } }).fit,
    'contain'
  );
  assert.equal(
    normalizeMediaDescriptor({ kind: 'image', fit: 'cover', activation: { provider: 'static' } }).fit,
    'cover'
  );
});

test('normalizeMediaDescriptor omits unknown or absent fit', () => {
  let unknown = normalizeMediaDescriptor({ kind: 'image', fit: 'stretch', activation: { provider: 'static' } });
  assert.equal('fit' in unknown, false);
  let absent = normalizeMediaDescriptor({ kind: 'image', activation: { provider: 'static' } });
  assert.equal('fit' in absent, false);
});

test('normalizeMediaDescriptor defaults poster, alt and targetIds', () => {
  let result = normalizeMediaDescriptor({ kind: 'image', activation: { provider: 'static' } });
  assert.equal(result.poster, '');
  assert.equal(result.alt, '');
  assert.deepEqual(result.targetIds, []);
});

test('normalizeMediaDescriptor coerces non-array targetIds to []', () => {
  let result = normalizeMediaDescriptor({ kind: 'image', activation: { provider: 'static' }, targetIds: 'nope' });
  assert.deepEqual(result.targetIds, []);
});

test('normalizeMediaDescriptor throws when kind is missing or empty', () => {
  assert.throws(() => normalizeMediaDescriptor({ activation: { provider: 'static' } }), /media\.kind is required/);
  assert.throws(() => normalizeMediaDescriptor({ kind: '   ', activation: { provider: 'static' } }), /media\.kind is required/);
});

test('normalizeMediaDescriptor throws when activation.provider is missing or empty', () => {
  assert.throws(() => normalizeMediaDescriptor({ kind: 'image' }), /media\.activation\.provider is required/);
  assert.throws(() => normalizeMediaDescriptor({ kind: 'image', activation: {} }), /media\.activation\.provider is required/);
  assert.throws(() => normalizeMediaDescriptor({ kind: 'image', activation: { provider: '  ' } }), /media\.activation\.provider is required/);
});

test('normalizeMediaDescriptor throws on non-object input', () => {
  assert.throws(() => normalizeMediaDescriptor(null), /media descriptor must be an object/);
  assert.throws(() => normalizeMediaDescriptor([]), /media descriptor must be an object/);
  assert.throws(() => normalizeMediaDescriptor('video'), /media descriptor must be an object/);
});

test('isMediaDescriptor returns true for valid descriptors and never throws', () => {
  assert.equal(isMediaDescriptor({ kind: 'video', activation: { provider: 'youtube' } }), true);
});

test('isMediaDescriptor returns false for invalid values without throwing', () => {
  assert.equal(isMediaDescriptor(null), false);
  assert.equal(isMediaDescriptor([]), false);
  assert.equal(isMediaDescriptor('video'), false);
  assert.equal(isMediaDescriptor({ activation: { provider: 'youtube' } }), false);
  assert.equal(isMediaDescriptor({ kind: '  ', activation: { provider: 'youtube' } }), false);
  assert.equal(isMediaDescriptor({ kind: 'video' }), false);
  assert.equal(isMediaDescriptor({ kind: 'video', activation: {} }), false);
  assert.equal(isMediaDescriptor({ kind: 'video', activation: { provider: '' } }), false);
});

test('normalizeGraphNode normalizes params.media when present', () => {
  let node = normalizeGraphNode({
    id: 'n1',
    kind: 'media',
    params: {
      title: 'keep me',
      media: { kind: ' video ', fit: 'crop', activation: { provider: 'youtube', videoId: 'x' } },
    },
  });
  assert.equal(node.params.title, 'keep me');
  assert.deepEqual(node.params.media, {
    kind: 'video',
    poster: '',
    alt: '',
    fit: 'cover',
    activation: { provider: 'youtube', videoId: 'x' },
    targetIds: [],
  });
});

test('normalizeGraphNode leaves nodes without media untouched', () => {
  let node = normalizeGraphNode({ id: 'n2', kind: 'action', params: { foo: 'bar' } });
  assert.deepEqual(node.params, { foo: 'bar' });
  assert.equal('media' in node.params, false);
});

test('normalizeGraphNode ignores null media', () => {
  let node = normalizeGraphNode({ id: 'n3', kind: 'action', params: { media: null } });
  assert.equal(node.params.media, null);
});

test('media-descriptor-v1 schema exposes the normalized contract', async () => {
  let schema = JSON.parse(await readFile(new URL('../schemas/media-descriptor-v1.json', import.meta.url), 'utf8'));
  assert.equal(schema.$id, MEDIA_DESCRIPTOR_SCHEMA_ID);
  assert.deepEqual(schema.required, ['kind', 'activation']);
  assert.equal(schema.properties.kind.minLength, 1);
  assert.deepEqual(schema.properties.fit.enum, ['contain', 'cover']);
  assert.deepEqual(schema.properties.activation.required, ['provider']);
});

test('graph-model-v1 schema references a self-contained media $def on node params', async () => {
  let schema = JSON.parse(await readFile(new URL('../schemas/graph-model-v1.json', import.meta.url), 'utf8'));
  assert.ok(schema.$defs.media);
  assert.deepEqual(schema.$defs.media.required, ['kind', 'activation']);
  assert.equal(schema.$defs.node.properties.params.additionalProperties, true);
  assert.equal(schema.$defs.node.properties.params.properties.media.$ref, '#/$defs/media');
});

test('graph-v1 schema references a self-contained media $def on node params', async () => {
  let schema = JSON.parse(await readFile(new URL('../schemas/graph-v1.json', import.meta.url), 'utf8'));
  assert.ok(schema.$defs.media);
  assert.equal(schema.$defs.node.properties.params.additionalProperties, true);
  assert.equal(schema.$defs.node.properties.params.properties.media.$ref, '#/$defs/media');
});

test('manifest GRAPH_SCHEMAS mirror the media $def for discover output', () => {
  assert.ok(GRAPH_SCHEMAS['graph-model-v1'].$defs.media);
  assert.equal(
    GRAPH_SCHEMAS['graph-model-v1'].$defs.node.properties.params.properties.media.$ref,
    '#/$defs/media'
  );
  assert.ok(GRAPH_SCHEMAS.v1.$defs.media);
  assert.equal(
    GRAPH_SCHEMAS.v1.$defs.node.properties.params.properties.media.$ref,
    '#/$defs/media'
  );
});
