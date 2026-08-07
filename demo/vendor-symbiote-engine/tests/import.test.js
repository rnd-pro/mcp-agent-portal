import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdir, readFile } from 'node:fs/promises';

async function listSourceFiles(rootUrl) {
  let entries = await readdir(rootUrl, { withFileTypes: true });
  let files = [];
  for (let entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'tmp' || entry.name.startsWith('.git')) continue;
    let url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, rootUrl);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(url));
    } else if (entry.name.endsWith('.js')) {
      files.push(url);
    }
  }
  return files;
}

test('root engine API imports in Node', async () => {
  let engine = await import('../index.js');

  assert.equal(typeof engine.Graph, 'function');
  assert.equal(typeof engine.Executor, 'function');
  assert.equal(typeof engine.loadHandlers, 'function');
  assert.equal(typeof engine.createRenderProviderRegistry, 'function');
  assert.equal(typeof engine.createLocalBrowserScreencastProvider, 'function');
  assert.equal(typeof engine.normalizeResourceTreeItem, 'function');
  assert.equal(typeof engine.normalizeSourceDocument, 'function');
  assert.equal(typeof engine.normalizeRenderArtifact, 'function');
  assert.equal(typeof engine.createPersistenceAdapter, 'function');
  assert.equal(typeof engine.createRenderFrameCacheKey, 'function');
  assert.equal(typeof engine.createRenderRetentionCleanup, 'function');
  assert.equal(typeof engine.buildRenderCleanupProofPatch, 'function');
  assert.equal(typeof engine.didCleanupRemovePaths, 'function');
  assert.equal(typeof engine.buildFrameSequenceEncodeArgs, 'function');
  assert.equal(typeof engine.buildAudioConcatArgs, 'function');
  assert.equal(typeof engine.buildAudioOverlapMixArgs, 'function');
  assert.ok(Array.isArray(engine.RENDER_PROOF_MANIFEST_STATE_FIELDS));
  assert.equal(typeof engine.projectRenderProofManifestState, 'function');
  assert.equal(typeof engine.mapRenderEventToProgress, 'function');
  assert.equal(typeof engine.classifyRenderError, 'function');
  assert.equal(typeof engine.isTerminalRenderStatus, 'function');
  assert.equal(typeof engine.buildTerminalRenderJobPatch, 'function');
  assert.equal(typeof engine.buildRenderQueueSnapshot, 'function');
  assert.equal(typeof engine.createRenderCanceledError, 'function');
  assert.equal(typeof engine.createRenderTimeoutError, 'function');
  assert.equal(typeof engine.buildRenderAudioLayerProof, 'function');
  assert.equal(typeof engine.buildRenderAvSyncProof, 'function');
  assert.equal(typeof engine.createStageProgressTracker, 'function');
  assert.equal(typeof engine.selectRenderAcceleration, 'function');
  assert.equal(typeof engine.planSegmentConcat, 'function');
  assert.equal(typeof engine.admitRenderRequest, 'function');
  assert.equal(typeof engine.buildSegmentConcatArgs, 'function');
  assert.equal(typeof engine.buildRenderSegmentSeamProof, 'function');
  assert.equal(typeof engine.buildRenderStreamPtsProof, 'function');
  assert.equal(typeof engine.createRenderSegmentCacheKey, 'function');
  assert.equal(typeof engine.invalidateRenderSegmentRanges, 'function');
  assert.equal(typeof engine.reconcileTerminalRenderStatus, 'function');
  assert.equal(typeof engine.normalizeNativeSegment, 'function');
  assert.equal(typeof engine.normalizeNativeSegmentJob, 'function');
  assert.equal(typeof engine.normalizeSeamBoundary, 'function');
  assert.equal(typeof engine.accelerationCandidateProven, 'function');
  assert.equal(typeof engine.normalizeCapabilityRequest, 'function');
  assert.equal(typeof engine.normalizeBrowserCodecSupport, 'function');
  assert.ok(Array.isArray(engine.RENDER_EXECUTION_TIERS));
  assert.ok(Array.isArray(engine.UI_CLOCK_MODES));
  assert.equal(engine.NATIVE_SEGMENT_JOB_VERSION, 'native-segment-job/1');
  assert.equal(engine.RENDER_SEAM_INPUT_VERSION, 'render-seam-input/1');
  assert.equal(engine.CAPTION_PRESENTATION_TRACK_VERSION, 'caption-presentation-track-v3');
});

test('graph can be constructed without browser runtime', async () => {
  let { Graph } = await import('../Graph.js');
  let graph = new Graph();

  assert.ok(graph);
});

test('contracts entrypoint imports in Node', async () => {
  let contracts = await import('../contracts/index.js');

  assert.equal(typeof contracts.buildResourceTreeFromEntries, 'function');
  assert.equal(typeof contracts.createSourceDocument, 'function');
  assert.equal(typeof contracts.createMemoryPersistenceAdapter, 'function');
});

test('render cache subpath imports in Node', async () => {
  let renderCache = await import('symbiote-engine/render-cache');

  assert.equal(typeof renderCache.createRenderFrameCacheKey, 'function');
  assert.equal(typeof renderCache.createMemoryFrameCacheStore, 'function');
  assert.equal(typeof renderCache.createRenderRetentionCleanup, 'function');
  assert.equal(typeof renderCache.buildRenderCleanupProofPatch, 'function');
  assert.equal(typeof renderCache.didCleanupRemovePaths, 'function');
});

test('render progress subpath imports in Node', async () => {
  let renderProgress = await import('symbiote-engine/render-progress');

  assert.equal(typeof renderProgress.createStageProgressTracker, 'function');
});

test('render finalize subpath imports in Node', async () => {
  let renderFinalize = await import('symbiote-engine/render-finalize');

  assert.equal(typeof renderFinalize.buildFrameSequenceEncodeArgs, 'function');
  assert.equal(typeof renderFinalize.buildAudioConcatArgs, 'function');
  assert.equal(typeof renderFinalize.buildAudioOverlapMixArgs, 'function');
  assert.equal(typeof renderFinalize.buildAudioMuxArgs, 'function');
  assert.equal(typeof renderFinalize.buildRenderProofManifestProjection, 'function');
  assert.equal(typeof renderFinalize.projectRenderProofManifestState, 'function');
});

test('render lifecycle subpath imports in Node', async () => {
  let renderLifecycle = await import('symbiote-engine/render-lifecycle');

  assert.equal(typeof renderLifecycle.mapRenderEventToProgress, 'function');
  assert.equal(typeof renderLifecycle.classifyRenderError, 'function');
  assert.equal(typeof renderLifecycle.isRenderTimeout, 'function');
  assert.equal(typeof renderLifecycle.isTerminalRenderStatus, 'function');
  assert.equal(typeof renderLifecycle.buildTerminalRenderJobPatch, 'function');
  assert.equal(typeof renderLifecycle.buildRenderQueueSnapshot, 'function');
  assert.equal(typeof renderLifecycle.createRenderCanceledError, 'function');
  assert.equal(typeof renderLifecycle.createRenderTimeoutError, 'function');
});

test('render selection, segments, and admission subpaths import in Node', async () => {
  let selection = await import('symbiote-engine/render-selection');
  assert.equal(typeof selection.selectRenderAcceleration, 'function');
  assert.equal(selection.RENDER_SELECTION_VERSION, 'render-capability/1');

  let segments = await import('symbiote-engine/render-segments');
  assert.equal(typeof segments.planSegmentConcat, 'function');

  let admission = await import('symbiote-engine/render-admission');
  assert.equal(typeof admission.admitRenderRequest, 'function');
  assert.equal(admission.RENDER_ADMISSION_VERSION, 'render-admission-v1');
});

test('render capability and segment contracts import through the contracts entrypoint', async () => {
  let contracts = await import('../contracts/index.js');

  assert.equal(typeof contracts.normalizeExecutionTier, 'function');
  assert.equal(typeof contracts.normalizeCapabilityRequest, 'function');
  assert.equal(typeof contracts.normalizeAccelerationSelection, 'function');
  assert.equal(typeof contracts.normalizeNativeSegment, 'function');
  assert.equal(typeof contracts.normalizeNativeSegmentJob, 'function');
  assert.equal(typeof contracts.normalizeSeamBoundary, 'function');
  assert.equal(typeof contracts.accelerationCandidateProven, 'function');
  assert.equal(typeof contracts.segmentCompatibilityKey, 'function');
  assert.equal(typeof contracts.normalizeSeamPolicy, 'function');
  assert.equal(typeof contracts.normalizeBrowserCodecSupport, 'function');
  assert.deepEqual(contracts.RENDER_EXECUTION_TIERS, [
    'sequential-realtime',
    'replayable-segment',
    'checkpointed-deterministic',
  ]);
});

test('engine sources do not import symbiote-workspace', async () => {
  let files = await listSourceFiles(new URL('../', import.meta.url));

  for (let file of files) {
    let source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /from ['"]symbiote-workspace(?:\/|['"])/, file.pathname);
    assert.doesNotMatch(source, /import\(['"]symbiote-workspace(?:\/|['"])/, file.pathname);
  }
});

test('contract modules stay Node-safe and browser-safe', async () => {
  let contractsUrl = new URL('../contracts/', import.meta.url);
  let files = await listSourceFiles(contractsUrl);

  for (let file of files) {
    let source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /from ['"]node:/, `${file.pathname} must not import node:* builtins`);
    assert.doesNotMatch(source, /\bimport\(['"]node:/, `${file.pathname} must not dynamic-import node:* builtins`);
    // Unambiguous browser globals only; `document` is a legitimate local
    // identifier in source-document.js, so it is intentionally excluded here.
    assert.doesNotMatch(
      source,
      /\b(?:window|navigator|VideoEncoder|VideoDecoder|VideoFrame)\b/,
      `${file.pathname} must not reference browser globals`,
    );
  }
});

test('render proof subpath imports in Node', async () => {
  let renderProof = await import('symbiote-engine/render-proof');

  assert.equal(typeof renderProof.buildRenderAudioLayerProof, 'function');
  assert.equal(typeof renderProof.buildRenderAvSyncProof, 'function');
});

test('browser engine API excludes Node-only runtime modules', async () => {
  let engine = await import('../browser.js');

  assert.equal(typeof engine.Graph, 'function');
  assert.equal(typeof engine.Executor, 'function');
  assert.equal(typeof engine.registerNodeType, 'function');
  assert.equal(typeof engine.serialize, 'function');
  assert.equal(typeof engine.deserialize, 'function');
  assert.equal(typeof engine.FocusController, 'function');
  assert.equal(typeof engine.createSourceDocument, 'function');
  assert.equal(engine.loadHandlers, undefined);
  assert.equal(engine.createServer, undefined);
  assert.equal(engine.createLocalBrowserScreencastProvider, undefined);
  assert.equal(engine.createRenderRetentionCleanup, undefined);
  assert.equal(typeof engine.createRenderProviderRegistry, 'function');
  assert.equal(typeof engine.normalizeNativeSegment, 'function');
  assert.equal(typeof engine.normalizeNativeSegmentJob, 'function');
  assert.equal(typeof engine.normalizeSeamBoundary, 'function');
  assert.equal(typeof engine.accelerationCandidateProven, 'function');
  assert.equal(typeof engine.normalizeCapabilityRequest, 'function');
  assert.equal(typeof engine.normalizeBrowserCodecSupport, 'function');
  assert.ok(Array.isArray(engine.RENDER_EXECUTION_TIERS));
  assert.ok(Array.isArray(engine.UI_CLOCK_MODES));
  assert.equal(engine.selectRenderAcceleration, undefined);
  assert.equal(engine.planSegmentConcat, undefined);
  assert.equal(engine.admitRenderRequest, undefined);
});

test('video pack stays on the browser-safe registry path', async () => {
  let source = await readFile(new URL('../packs/video-pack.js', import.meta.url), 'utf8');

  assert.match(source, /from ['"]\.\.\/Registry\.js['"]/);
  assert.doesNotMatch(source, /from ['"]\.\.\/index\.js['"]/);
});

test('resource tree contract builds normalized nested file trees', async () => {
  let { buildResourceTreeFromEntries } = await import('../contracts/index.js');
  let tree = buildResourceTreeFromEntries([
    { path: 'src/index.js', icon: 'javascript', badges: ['1f'] },
    { path: 'src/components/Button.js', badges: ['1c'] },
    { path: 'README.md', muted: true },
  ]);

  assert.equal(tree[0].id, 'src');
  assert.equal(tree[0].kind, 'directory');
  assert.equal(tree[0].children[0].id, 'src/components');
  assert.equal(tree[0].children[1].id, 'src/index.js');
  assert.deepEqual(tree[0].children[1].badges, ['1f']);
  assert.equal(tree[1].id, 'README.md');
  assert.equal(tree[1].muted, true);
});

test('source document and persistence contracts normalize host data', async () => {
  let {
    createMemoryPersistenceAdapter,
    createSourceDocument,
    normalizeSourceDocument,
  } = await import('../contracts/index.js');

  let document = createSourceDocument(
    { code: 'export const ok = true;', raw: 'export const ok = true;' },
    {
      path: 'src/index.js',
      language: 'js',
      readable: true,
      diagnostics: [{ message: 'ok', severity: 'info' }],
      saveAction: {
        id: 'save-source',
        label: 'Save',
        intent: 'source:save',
        payload: { path: 'src/index.js' },
      },
      syntaxTheme: {
        id: 'agent-dark',
        tokens: {
          keyword: 'var(--sn-syntax-keyword)',
          string: 'var(--sn-syntax-string)',
        },
      },
    }
  );
  assert.equal(document.path, 'src/index.js');
  assert.equal(document.language, 'js');
  assert.equal(document.content, 'export const ok = true;');
  assert.equal(document.readable, true);
  assert.equal(document.diagnostics[0].message, 'ok');
  assert.deepEqual(document.saveAction, {
    id: 'save-source',
    label: 'Save',
    intent: 'source:save',
    payload: { path: 'src/index.js' },
  });
  assert.deepEqual(document.syntaxTokens, {
    keyword: 'var(--sn-syntax-keyword)',
    string: 'var(--sn-syntax-string)',
  });
  assert.deepEqual(document.syntaxTheme, {
    id: 'agent-dark',
    tokens: {
      keyword: 'var(--sn-syntax-keyword)',
      string: 'var(--sn-syntax-string)',
    },
  });

  let contentOnly = createSourceDocument(
    { code: 'const local = true;' },
    { path: 'src/local.js', language: 'js' }
  );
  assert.equal(contentOnly.content, 'const local = true;');
  assert.equal(contentOnly.raw, 'const local = true;');

  let saveString = normalizeSourceDocument({
    path: 'README.md',
    content: '# Readme',
    saveAction: 'save-doc',
    syntaxTokens: {
      comment: 'var(--sn-syntax-comment)',
      empty: '',
    },
  });
  assert.deepEqual(saveString.saveAction, { id: 'save-doc', label: 'save-doc' });
  assert.deepEqual(saveString.syntaxTheme, {
    tokens: {
      comment: 'var(--sn-syntax-comment)',
    },
  });

  assert.throws(() => normalizeSourceDocument({ content: 'missing path' }), /path is required/);

  let adapter = createMemoryPersistenceAdapter({ a: 1 });
  assert.equal(await adapter.get('a'), 1);
  await adapter.set('b', 2);
  assert.deepEqual(await adapter.list(''), ['a', 'b']);
  assert.equal(await adapter.delete('a'), true);
});
