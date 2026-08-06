import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  MEDIA_FRAME_SOURCE_PROVIDER_METADATA,
  MEDIA_PREVIEW_STATES,
  MEDIA_STUDIO_FRAME_SOURCE_TYPES,
  MEDIA_STUDIO_PANEL_TYPES,
  MEDIA_STUDIO_PREVIEW_MODES,
  MEDIA_STUDIO_SURFACE_STYLES,
  MEDIA_STUDIO_SURFACE_CONTRACT,
  WORKSPACE_VIRTUAL_SEQUENCE_SCHEMA,
  createMediaStudioLayout,
  createMediaStudioPanelTypes,
  createMediaStudioSequenceFrameWindow,
  createMediaStudioVirtualSequence,
  ensureMediaStudioSurfaceStyles,
  getMediaFrameSourceSupport,
  getMediaStudioTopology,
  hasMediaStudioTopology,
  hydrateMediaStudioTimelinePanel,
  listMediaFrameSourceProviders,
  mediaStudioFrameIndexForTime,
  normalizeMediaFrameSource,
  normalizeMediaPreviewState,
  normalizeMediaStudioCaptionOverlayState,
  normalizeMediaStudioRenderSettings,
  normalizeMediaStudioSequencePlaybackState,
  normalizeMediaStudioTimelineData,
  normalizeMediaStudioVoiceProviderState,
  renderMediaStudioCaptionOverlayMarkup,
  renderMediaStudioCaptionLineMarkup,
  renderMediaStudioInspectorPanelMarkup,
  renderMediaStudioPreviewPanelMarkup,
  renderMediaStudioProgressPanelMarkup,
  renderMediaStudioTimelinePanelMarkup,
} from '../ui/media-studio-surface.js';
import { createCascadeTheme } from '../themes/cascade-theme.js';
import { buildCaptionPlacementTrack } from 'symbiote-engine';

function captionTrack(cues, options = {}) {
  return buildCaptionPlacementTrack(cues, {
    width: 1080,
    height: 1920,
    captionStyle: { preset: 'tiktok' },
    ...options,
  });
}

function createCaptureTarget() {
  class CanvasRenderingContext2D {}
  CanvasRenderingContext2D.prototype.drawElementImage = () => {};

  class HTMLCanvasElement {}
  class MediaStreamTrack {}
  MediaStreamTrack.prototype.cropTo = () => {};
  MediaStreamTrack.prototype.restrictTo = () => {};

  return {
    CanvasRenderingContext2D,
    HTMLCanvasElement,
    MediaStreamTrack,
    CropTarget: { fromElement() {} },
    RestrictionTarget: { fromElement() {} },
    navigator: {
      mediaDevices: {
        getDisplayMedia() {},
      },
    },
    document: {
      createElement(tagName) {
        return tagName === 'canvas' ? { layoutSubtree: null } : {};
      },
    },
  };
}

test('media studio layout uses central preview, bottom timeline, collapsed source, and expanded inspector', () => {
  let layout = createMediaStudioLayout({
    ids: {
      source: 'source',
      preview: 'preview',
      inspector: 'inspector',
      timeline: 'timeline',
    },
  });
  let topology = getMediaStudioTopology(layout);

  assert.equal(layout.direction, 'vertical');
  assert.equal(topology.previewPanelId, 'preview');
  assert.equal(topology.timelinePanelId, 'timeline');
  assert.equal(topology.sourcePanelId, 'source');
  assert.equal(topology.inspectorPanelId, 'inspector');
  assert.equal(topology.previewIsCentral, true);
  assert.equal(topology.timelineIsBottom, true);
  assert.equal(topology.sidePanesCollapsed, false);
  assert.equal(topology.sourceCollapsed, true);
  assert.equal(topology.inspectorExpanded, true);
  assert.equal(topology.sidePanesCollapsible, true);
  assert.equal(topology.behaviorMetadata, true);
  assert.equal(hasMediaStudioTopology(layout), true);
  assert.deepEqual(topology.panelTypes, [
    MEDIA_STUDIO_PANEL_TYPES.source,
    MEDIA_STUDIO_PANEL_TYPES.preview,
    MEDIA_STUDIO_PANEL_TYPES.inspector,
    MEDIA_STUDIO_PANEL_TYPES.timeline,
  ]);
});

test('media studio advertises virtual-sequence HTML-video playback as the primary contract', () => {
  let virtual = MEDIA_FRAME_SOURCE_PROVIDER_METADATA.find(
    (provider) => provider.id === MEDIA_STUDIO_FRAME_SOURCE_TYPES.virtualSequence,
  );
  assert.ok(virtual, 'a virtual-sequence provider exists');
  assert.equal(virtual.schemaVersion, WORKSPACE_VIRTUAL_SEQUENCE_SCHEMA);
  assert.ok(virtual.capabilities.includes('html-video-playback'));
  assert.ok(virtual.capabilities.includes('request-video-frame-callback'));
  assert.ok(virtual.capabilities.includes('bounded-precision-decode'));

  assert.equal(MEDIA_STUDIO_SURFACE_CONTRACT.primaryPlayback.frameSource, MEDIA_STUDIO_FRAME_SOURCE_TYPES.virtualSequence);
  assert.equal(MEDIA_STUDIO_SURFACE_CONTRACT.primaryPlayback.playback, 'html-video');
  assert.equal(MEDIA_STUDIO_SURFACE_CONTRACT.primaryPlayback.frameClock, 'request-video-frame-callback');

  // No provider may advertise a full cached image sequence as primary playback.
  for (let provider of MEDIA_FRAME_SOURCE_PROVIDER_METADATA) {
    assert.ok(!provider.sourceKinds.includes('image-sequence'), `${provider.id} must not source a full image sequence`);
    assert.ok(!provider.outputKinds.includes('scrubbable-preview'), `${provider.id} must not output a cached scrub sequence`);
    assert.ok(!provider.capabilities.includes('replay'), `${provider.id} must not claim cached-sequence replay`);
    assert.ok(!provider.capabilities.includes('offline-preview'), `${provider.id} must not claim offline sequence preview`);
  }

  let bitmap = MEDIA_FRAME_SOURCE_PROVIDER_METADATA.find(
    (provider) => provider.id === MEDIA_STUDIO_FRAME_SOURCE_TYPES.cachedSequence,
  );
  assert.notEqual(bitmap.label, 'Cached frame sequence');
  assert.ok(bitmap.capabilities.includes('bounded-bitmap-window'));
  assert.ok(bitmap.capabilities.includes('sprite-preview'));
});

test('media studio support probe reports virtual-sequence and precision decode capability honestly', () => {
  // A DOM-less Node target has no requestVideoFrameCallback surface.
  let domless = getMediaFrameSourceSupport({ globalThis: {} });
  assert.equal(domless.virtualSequence, false, 'no video-frame-callback surface means no authoritative playback');
  assert.equal(domless.precisionVideoDecode, false, 'WebCodecs is capability-reported and absent here');

  // A modern-Chrome-like target exposes HTMLVideoElement.prototype.requestVideoFrameCallback.
  function HTMLVideoElement() {}
  HTMLVideoElement.prototype.requestVideoFrameCallback = () => 1;
  HTMLVideoElement.prototype.cancelVideoFrameCallback = () => {};
  let browser = getMediaFrameSourceSupport({
    globalThis: {
      HTMLVideoElement,
      VideoDecoder: function VideoDecoder() {},
      EncodedVideoChunk: function EncodedVideoChunk() {},
    },
  });
  assert.equal(browser.virtualSequence, true);
  assert.equal(browser.precisionVideoDecode, true);
  assert.equal(browser.precisionVideoDecodeDetail.videoDecoder, true);

  // Explicit override remains available for deterministic tests.
  assert.equal(getMediaFrameSourceSupport({ globalThis: {}, virtualSequence: true }).virtualSequence, true);

  let supported = listMediaFrameSourceProviders({ globalThis: { HTMLVideoElement } })
    .find((provider) => provider.id === MEDIA_STUDIO_FRAME_SOURCE_TYPES.virtualSequence);
  assert.equal(supported.supported, true);

  delete HTMLVideoElement.prototype.cancelVideoFrameCallback;
  assert.equal(getMediaFrameSourceSupport({ globalThis: { HTMLVideoElement } }).virtualSequence, false);
  let unsupported = listMediaFrameSourceProviders({ globalThis: {} })
    .find((provider) => provider.id === MEDIA_STUDIO_FRAME_SOURCE_TYPES.virtualSequence);
  assert.equal(unsupported.supported, false);
});

test('media studio projects a host virtual-sequence artifact through an injected resolver', () => {
  let hash = 'sha256-0000000000000000000000000000000000000000000000000000000000000000';
  let projection = createMediaStudioVirtualSequence(
    {
      schemaVersion: WORKSPACE_VIRTUAL_SEQUENCE_SCHEMA,
      executionTier: 'sequential-realtime',
      timebase: { num: 1, den: 30 },
      frameRate: { num: 30, den: 1 },
      duration: 60,
      masters: [
        {
          id: 'm0',
          path: 'masters/0.mp4',
          contentHash: hash,
          codec: 'h264',
          container: 'mp4',
          range: { startTick: 0, endTick: 60 },
          keyframes: [0, 30],
        },
      ],
      playbackProxy: { path: 'proxies/playback.mp4', contentHash: hash, codec: 'h264', container: 'mp4' },
      scrub: {
        mode: 'chunks',
        maxChunkDurationTicks: 30,
        chunks: [
          { id: 'c0', path: 'scrub/0.mp4', contentHash: hash, codec: 'h264', container: 'mp4', range: { startTick: 0, endTick: 30 } },
          { id: 'c1', path: 'scrub/1.mp4', contentHash: hash, codec: 'h264', container: 'mp4', range: { startTick: 30, endTick: 60 } },
        ],
      },
      index: { keyframes: [0, 30], timestamps: [0, 30] },
      layers: [
        { id: 'base', kind: 'base', invalidation: 'opaque', range: { startTick: 0, endTick: 60 }, dependsOn: [], affectedRanges: [{ startTick: 0, endTick: 60 }] },
      ],
    },
    { resolvePath: (path) => `blob:media/${path}` },
  );

  assert.equal(projection.executionTier, 'sequential-realtime');
  assert.equal(projection.playbackUrl(), 'blob:media/proxies/playback.mp4');
  assert.equal(projection.frameCount, 60);
  assert.equal(projection.scrubMode, 'chunks');
  assert.equal(projection.scrubForTick(30).url, 'blob:media/scrub/1.mp4');
  assert.throws(() => createMediaStudioVirtualSequence({}, {}), /resolvePath/);
});

test('media studio panel config and surface contract stay product neutral', () => {
  let panelTypes = createMediaStudioPanelTypes();
  let serialized = JSON.stringify({
    contract: MEDIA_STUDIO_SURFACE_CONTRACT,
    providers: MEDIA_FRAME_SOURCE_PROVIDER_METADATA,
    panelTypes,
  });

  assert.equal(panelTypes[MEDIA_STUDIO_PANEL_TYPES.preview].region, 'center');
  assert.equal(panelTypes[MEDIA_STUDIO_PANEL_TYPES.timeline].region, 'bottom');
  assert.equal(panelTypes[MEDIA_STUDIO_PANEL_TYPES.source].collapsible, true);
  assert.equal(panelTypes[MEDIA_STUDIO_PANEL_TYPES.inspector].collapsible, true);
  assert.ok(MEDIA_STUDIO_SURFACE_CONTRACT.capabilities.includes('replaceable-frame-sources'));
  assert.ok(MEDIA_STUDIO_SURFACE_CONTRACT.themeAliases.includes('--sn-media-studio-preview-bg'));
  assert.doesNotMatch(serialized, /maximo/i);
});

test('media studio theme aliases are cascade-authored and consumed by styles', () => {
  let theme = createCascadeTheme({ recipe: 'media-studio', mode: 'dark' });

  for (let alias of MEDIA_STUDIO_SURFACE_CONTRACT.themeAliases) {
    let value = theme.tokens[alias];
    assert.equal(typeof value, 'string', `${alias} must be authored by cascade-theme`);
    assert.ok(value.length > 0, `${alias} must resolve to a non-empty token value`);
    assert.match(
      value,
      /var\(--sn-sys-|color-mix\(in oklab, var\(--sn-sys-|px|var\(--sn-node-radius\)|var\(--sn-frame-gap\)/,
      `${alias} must derive from system cascade tokens or bounded geometry tokens`,
    );
    assert.match(MEDIA_STUDIO_SURFACE_STYLES, new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.equal(theme.tokens['--sn-media-studio-progress-color'], 'var(--sn-sys-accent)');
  assert.match(theme.tokens['--sn-media-studio-preview-bg'], /var\(--sn-sys-surface\)/);
  assert.match(theme.tokens['--sn-media-studio-pane-bg'], /var\(--sn-sys-surface-panel\)/);
});

test('frame source provider metadata reports browser capability fallbacks', () => {
  let unsupported = listMediaFrameSourceProviders({ globalThis: {} });
  let unsupportedRegion = unsupported.find((provider) => provider.id === MEDIA_STUDIO_FRAME_SOURCE_TYPES.regionCapture);
  let unsupportedHtmlCanvas = unsupported.find((provider) => provider.id === MEDIA_STUDIO_FRAME_SOURCE_TYPES.htmlInCanvas);
  assert.equal(unsupportedRegion.supported, false);
  assert.equal(unsupportedRegion.fallback.reason, 'region-capture-unavailable');
  assert.equal(unsupportedHtmlCanvas.supported, false);
  assert.equal(unsupportedHtmlCanvas.fallback.reason, 'html-in-canvas-unavailable');

  let supported = listMediaFrameSourceProviders({
    globalThis: createCaptureTarget(),
    externalBrowserFrameSource: true,
    cachedSequence: true,
  });
  let byId = new Map(supported.map((provider) => [provider.id, provider]));
  assert.equal(byId.get(MEDIA_STUDIO_FRAME_SOURCE_TYPES.externalBrowser).supported, true);
  assert.equal(byId.get(MEDIA_STUDIO_FRAME_SOURCE_TYPES.elementCapture).supported, true);
  assert.equal(byId.get(MEDIA_STUDIO_FRAME_SOURCE_TYPES.regionCapture).supported, true);
  assert.equal(byId.get(MEDIA_STUDIO_FRAME_SOURCE_TYPES.htmlInCanvas).supported, true);
  assert.equal(byId.get(MEDIA_STUDIO_FRAME_SOURCE_TYPES.cachedSequence).supported, true);

  let support = getMediaFrameSourceSupport({
    globalThis: createCaptureTarget(),
    cachedSequence: true,
  });
  assert.equal(support.displayMedia, true);
  assert.equal(support.elementCapture, true);
  assert.equal(support.regionCapture, true);
  assert.equal(support.htmlInCanvas, true);
  assert.equal(support.cachedSequence, true);
});

test('preview state normalization covers empty, loading, unsupported, and cached frames', () => {
  assert.deepEqual(normalizeMediaPreviewState({}).fallback, {
    state: MEDIA_PREVIEW_STATES.empty,
    reason: 'missing-source',
  });

  let unsupportedSource = normalizeMediaFrameSource({
    provider: MEDIA_STUDIO_FRAME_SOURCE_TYPES.elementCapture,
    target: '#preview',
  }, { globalThis: {} });
  assert.equal(unsupportedSource.status, 'unavailable');
  assert.equal(unsupportedSource.fallback.reason, 'element-capture-unavailable');

  let unsupportedPreview = normalizeMediaPreviewState({
    frameSource: {
      provider: MEDIA_STUDIO_FRAME_SOURCE_TYPES.elementCapture,
      target: '#preview',
    },
  }, { globalThis: {} });
  assert.equal(unsupportedPreview.state, MEDIA_PREVIEW_STATES.unsupported);
  assert.equal(unsupportedPreview.reason, 'element-capture-unavailable');

  let loading = normalizeMediaPreviewState({
    status: 'rendering',
    progress: 32,
    frameSource: {
      provider: MEDIA_STUDIO_FRAME_SOURCE_TYPES.externalBrowser,
      source: '/workspace/surface',
    },
  }, {
    externalBrowserFrameSource: true,
  });
  assert.equal(loading.state, MEDIA_PREVIEW_STATES.loading);
  assert.equal(loading.progress, 0.32);

  let cached = normalizeMediaPreviewState({
    frames: [{ url: 'frame-0001.webp' }],
    frameSource: {
      provider: MEDIA_STUDIO_FRAME_SOURCE_TYPES.cachedSequence,
      cacheKey: 'sequence-a',
    },
  }, {
    cachedSequence: true,
  });
  assert.equal(cached.state, MEDIA_PREVIEW_STATES.ready);
  assert.equal(cached.mode, MEDIA_STUDIO_FRAME_SOURCE_TYPES.cachedSequence);
  assert.equal(cached.progress, 1);

  let finalOutput = normalizeMediaPreviewState({
    outputUrl: './render.mp4',
    frameSource: {
      provider: MEDIA_STUDIO_FRAME_SOURCE_TYPES.cachedSequence,
      output: { url: './render.mp4' },
    },
  }, {
    cachedSequence: true,
  });
  assert.equal(finalOutput.state, MEDIA_PREVIEW_STATES.ready);
  assert.equal(finalOutput.frameSource.outputUrl, './render.mp4');
});

test('media studio helpers are exported from the browser UI entrypoint', async () => {
  let ui = await import('../ui/index.js');

  assert.equal(typeof ui.createMediaStudioLayout, 'function');
  assert.equal(typeof ui.createMediaStudioPanelTypes, 'function');
  assert.equal(typeof ui.ensureMediaStudioSurfaceStyles, 'function');
  assert.equal(typeof ui.createMediaStudioSequenceFrameWindow, 'function');
  assert.equal(typeof ui.createMediaStudioVirtualSequence, 'function');
  assert.equal(typeof ui.createVideoFrameClock, 'function');
  assert.equal(typeof ui.createVirtualSequenceProjection, 'function');
  assert.equal(typeof ui.createPrecisionVideoDecoder, 'function');
  assert.equal(typeof ui.getPrecisionVideoDecodeSupport, 'function');
  assert.equal(ui.WORKSPACE_VIRTUAL_SEQUENCE_SCHEMA, 'workspace-virtual-sequence-v1');
  assert.equal(typeof ui.mediaStudioFrameIndexForTime, 'function');
  assert.equal(typeof ui.listMediaFrameSourceProviders, 'function');
  assert.equal(typeof ui.normalizeMediaPreviewState, 'function');
  assert.equal(typeof ui.normalizeMediaStudioRenderSettings, 'function');
  assert.equal(typeof ui.normalizeMediaStudioSequencePlaybackState, 'function');
  assert.equal(typeof ui.normalizeMediaStudioCaptionOverlayState, 'function');
  assert.equal(typeof ui.normalizeMediaStudioVoiceProviderState, 'function');
  assert.equal(typeof ui.renderMediaStudioCaptionOverlayMarkup, 'function');
  assert.equal(typeof ui.renderMediaStudioCaptionLineMarkup, 'function');
  assert.equal(typeof ui.renderMediaStudioPreviewPanelMarkup, 'function');
  assert.equal(typeof ui.renderMediaStudioInspectorPanelMarkup, 'function');
  assert.equal(ui.MEDIA_STUDIO_FRAME_SOURCE_TYPES.htmlInCanvas, MEDIA_STUDIO_FRAME_SOURCE_TYPES.htmlInCanvas);
});

test('media studio visual layer renders reusable preview, timeline, and progress markup', () => {
  let preview = renderMediaStudioPreviewPanelMarkup({
    sourceTitle: 'Current UI',
    surfaceRoute: '/workspace/media-studio',
    support: { externalBrowserFrameSource: true },
    frameSource: {
      provider: MEDIA_STUDIO_FRAME_SOURCE_TYPES.externalBrowser,
      cacheKey: 'maximo-current-ui',
      progress: 42,
    },
    preview: {
      status: 'rendering',
      frames: [{ url: './cache/frame-0001.png' }],
      currentTimeSec: 1.2,
      captionTrack: captionTrack([
        {
          cueId: 'welcome',
          startSec: 0.8,
          endSec: 2.1,
          speaker: 'guide',
          text: 'Welcome to the workspace.',
          wordTimings: [
            { text: 'Welcome', startSec: 0.8, endSec: 1.1 },
            { text: 'to', startSec: 1.1, endSec: 1.5 },
            { text: 'workspace.', startSec: 1.5, endSec: 2.1 },
          ],
        },
      ]),
    },
    renderSettings: { captionsEnabled: true, captionsMode: 'karaoke', captionStyle: { preset: 'tiktok' } },
    renderState: {
      status: 'preparing',
      stage: 'audio.turn.rendering',
      completedFiles: 2,
      expectedFiles: 5,
      failures: [
        { stage: 'capture', message: 'browser disconnected', recoverable: true },
      ],
    },
  });
  let timeline = renderMediaStudioTimelinePanelMarkup({
    clips: [{ lane: 'video', label: 'Current UI frames', startPercent: 0, sizePercent: 80 }],
  });
  let progress = renderMediaStudioProgressPanelMarkup({
    status: 'capturing',
    progress: 0.42,
    progressChannel: 'RT_WORKSPACE_EXECUTION_NODE_PROGRESS',
    state: {
      frameCount: 12,
      cacheKey: 'maximo-current-ui',
      failures: [
        { stage: 'capture', message: 'browser disconnected', recoverable: true },
      ],
    },
  });
  let inspector = renderMediaStudioInspectorPanelMarkup({
    status: 'capturing',
    progress: 0.42,
    source: MEDIA_STUDIO_FRAME_SOURCE_TYPES.externalBrowser,
    renderSettings: {
      autoRender: true,
      captionsEnabled: true,
      orientation: 'vertical',
      width: 1080,
      height: 1920,
      fps: 30,
      providerId: 'symbiote-model-service',
      voiceRefs: { guide: 'qwen3:speaker:vivian' },
    },
    audioProviders: [
      { id: 'browser', label: 'Browser audio' },
      { id: 'symbiote-model-service', label: 'Symbiote model service' },
    ],
    voiceProvider: {
      id: 'symbiote-model-service',
      label: 'Local model service',
      capabilities: ['voice.create'],
      voices: [
        { id: 'qwen3:speaker:vivian', label: 'Vivian' },
        { id: 'qwen3:speaker:eric', label: 'Eric' },
      ],
      speakerLayers: [
        {
          persona: 'guide',
          clips: [{ id: 'turn-1', turnId: 'turn-1', text: 'Welcome to the workspace.' }],
        },
      ],
    },
    state: { frameCount: 12, output: 'workspace-tour.mp4' },
  });

  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /\.sn-media-studio-preview-stage/);
  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /\.sn-media-studio-prep-progress/);
  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /\.sn-media-studio-inspector-section/);
  assert.doesNotMatch(MEDIA_STUDIO_SURFACE_STYLES, /\.sn-media-studio-timeline-toolbar/);
  assert.doesNotMatch(MEDIA_STUDIO_SURFACE_STYLES, /\.sn-media-studio-track-row/);
  assert.match(preview, /data-render-proof="frame-source-cache"/);
  assert.match(preview, /data-frame-source-provider="external-browser"/);
  assert.match(preview, /data-preview-state="loading"/);
  assert.match(preview, /data-preview-mode="sequence"/);
  assert.match(preview, /data-frame-progress="42%"/);
  assert.match(preview, /data-media-prep-progress/);
  assert.match(preview, /data-prep-stage="audio\.turn\.rendering"/);
  assert.match(preview, /2\/5 files · 40%/);
  assert.match(preview, /src="\.\/cache\/frame-0001\.png"/);
  assert.match(preview, /data-media-preview-sequence/);
  assert.match(preview, /data-render-proof="cached-frame-sequence"/);
  assert.doesNotMatch(preview, /waiting-for-frames/);
  assert.doesNotMatch(preview, /clone|iframe|live-dom/i);
  assert.doesNotMatch(preview, /sn-media-studio-preview-footer/);
  assert.match(preview, /data-media-caption-overlay/);
  assert.match(preview, /data-caption-track="caption-presentation-track-v2"/);
  assert.match(preview, /data-caption-style="tiktok"/);
  assert.match(preview, /data-caption-cue-id="welcome"/);
  assert.match(preview, /sn-media-studio-caption-word/);
  assert.match(preview, /data-caption-word-state="active">to<\/span>/);
  assert.match(preview, /Welcome[\s\S]*workspace\./);
  assert.match(preview, /data-media-failures/);
  assert.match(preview, /data-media-action="retry-render-stage"/);
  assert.doesNotMatch(preview, /sn-media-studio-transport/);
  assert.match(timeline, /sn-timeline-editor/);
  assert.match(timeline, /data-media-studio-timeline-editor/);
  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /\.sn-media-studio-timeline-editor/);
  assert.doesNotMatch(timeline, /sn-media-studio-track-row/);
  assert.doesNotMatch(timeline, /sn-media-studio-timeline-toolbar/);
  assert.match(inspector, /sn-media-studio-inspector-panel/);
  assert.match(inspector, /data-media-render-settings/);
  assert.match(inspector, /data-auto-render="true"/);
  assert.match(inspector, /data-orientation="vertical"/);
  assert.match(inspector, /data-media-setting="autoRender" checked/);
  assert.match(inspector, /data-media-setting="captionsEnabled" checked/);
  assert.match(inspector, /data-media-setting="captionProfile"/);
  assert.match(inspector, /<option value="tiktok" selected>TikTok<\/option>/);
  assert.match(inspector, /data-media-setting="captionPlacement"/);
  assert.match(inspector, /<option value="bottom" selected>Bottom<\/option>/);
  assert.doesNotMatch(inspector, /classic|high-contrast|focus-aware|captionHighContrast/i);
  assert.match(inspector, /<option value="vertical" selected>Vertical 9:16<\/option>/);
  assert.match(inspector, /data-media-setting="width" value="1080"/);
  assert.match(inspector, /data-media-setting="height" value="1920"/);
  assert.match(inspector, /<select class="sn-media-studio-setting-control" data-media-setting="providerId">/);
  assert.match(inspector, /<option value="symbiote-model-service" selected>Symbiote model service<\/option>/);
  assert.match(inspector, /data-media-action="render-final"/);
  assert.match(inspector, /data-media-voice-provider/);
  assert.match(inspector, /data-provider-id="symbiote-model-service"/);
  assert.match(inspector, /data-media-voice-persona="guide"/);
  assert.match(inspector, /data-media-voice-ref/);
  assert.match(inspector, /<option value="qwen3:speaker:vivian" selected>Vivian<\/option>/);
  assert.match(inspector, /data-media-action="rerender-voice"/);
  assert.match(inspector, /data-media-turn-id="turn-1"/);
  assert.match(inspector, /data-media-action="create-voice"/);
  assert.match(inspector, /workspace-tour\.mp4/);
  assert.match(progress, /data-progress-channel="RT_WORKSPACE_EXECUTION_NODE_PROGRESS"/);
  assert.match(progress, /maximo-current-ui/);
  assert.match(progress, /data-media-failures/);
  assert.match(progress, /data-media-failure-stage="capture"/);
  assert.match(progress, /browser disconnected/);
  assert.match(progress, /data-media-action="retry-render-stage"/);
  assert.match(progress, /data-media-retry-stage="capture"/);
});

test('media studio preview defaults to encoded video when both a video and a frame exist', () => {
  let preview = renderMediaStudioPreviewPanelMarkup({
    sourceTitle: 'Current UI',
    support: { cachedSequence: true },
    frameSource: {
      provider: MEDIA_STUDIO_FRAME_SOURCE_TYPES.cachedSequence,
      outputUrl: './render.mp4',
    },
    preview: {
      status: 'complete',
      currentFrame: './cache/frame-0001.png',
      videoUrl: './render.mp4',
    },
  });

  assert.match(preview, /data-preview-mode="output"/);
  assert.match(preview, /data-media-preview-video/);
  assert.match(preview, /src="\.\/render\.mp4"/);
  assert.match(preview, /poster="\.\/cache\/frame-0001\.png"/, 'the frame becomes the video poster');
  assert.doesNotMatch(preview, /<img class="sn-media-studio-frame"/);
});

test('media studio preview uses an image only on an explicit sequence request', () => {
  let preview = renderMediaStudioPreviewPanelMarkup({
    sourceTitle: 'Current UI',
    preview: {
      status: 'complete',
      previewMode: 'sequence',
      currentFrame: './cache/frame-0001.png',
      videoUrl: './render.mp4',
    },
  });

  assert.match(preview, /data-preview-mode="sequence"/);
  assert.match(preview, /data-media-preview-sequence/);
  assert.match(preview, /data-render-proof="cached-frame-sequence"/);
  assert.match(preview, /src="\.\/cache\/frame-0001\.png"/);
  assert.doesNotMatch(preview, /data-media-preview-video/);
});

test('media studio preview falls back to an image when no video url exists', () => {
  let preview = renderMediaStudioPreviewPanelMarkup({
    sourceTitle: 'Current UI',
    preview: { status: 'complete', currentFrame: './cache/frame-0001.png' },
  });

  assert.match(preview, /data-preview-mode="sequence"/);
  assert.match(preview, /data-media-preview-sequence/);
  assert.doesNotMatch(preview, /data-media-preview-video/);
});

test('media studio preview emits a playback-proxy video for a virtual-sequence source', () => {
  let preview = renderMediaStudioPreviewPanelMarkup({
    sourceTitle: 'Current UI',
    frameSource: {
      provider: MEDIA_STUDIO_FRAME_SOURCE_TYPES.virtualSequence,
      playbackUrl: './proxies/playback.mp4',
    },
    preview: {
      status: 'ready',
      currentFrame: './sprites/thumb-0.webp',
    },
  });

  assert.match(preview, /data-preview-mode="output"/);
  assert.match(preview, /data-media-preview-video/);
  assert.match(preview, /data-video-source="playback-proxy"/);
  assert.match(preview, /data-render-proof="virtual-sequence-playback-proxy"/);
  assert.match(preview, /src="\.\/proxies\/playback\.mp4"/);
  assert.match(preview, /data-frame-source-provider="virtual-sequence"/);
  assert.match(preview, /data-preview-state="ready"/);
  assert.doesNotMatch(preview, /data-render-proof="final-output-video"/);
});

test('media studio preview keeps an explicit playback request on the proxy', () => {
  let preview = renderMediaStudioPreviewPanelMarkup({
    support: { virtualSequence: true },
    frameSource: {
      provider: MEDIA_STUDIO_FRAME_SOURCE_TYPES.virtualSequence,
      playbackUrl: './proxies/playback.mp4',
      outputUrl: './final.mp4',
    },
    preview: { status: 'ready', previewMode: 'playback' },
  });

  assert.match(preview, /src="\.\/proxies\/playback\.mp4"/);
  assert.match(preview, /data-video-source="playback-proxy"/);
  assert.doesNotMatch(preview, /src="\.\/final\.mp4"/);
});

test('media studio preview renders completed final output as a video surface when selected', () => {
  let preview = renderMediaStudioPreviewPanelMarkup({
    sourceTitle: 'Current UI',
    support: { cachedSequence: true },
    frameSource: {
      provider: MEDIA_STUDIO_FRAME_SOURCE_TYPES.cachedSequence,
      outputUrl: './render.mp4',
    },
    preview: {
      status: 'complete',
      previewMode: MEDIA_STUDIO_PREVIEW_MODES.output,
      currentFrame: './cache/frame-0001.png',
      videoUrl: './render.mp4',
    },
  });

  assert.match(preview, /data-preview-mode="output"/);
  assert.match(preview, /<video class="sn-media-studio-frame sn-media-studio-video"/);
  assert.match(preview, /data-media-preview-video/);
  assert.match(preview, /data-render-proof="final-output-video"/);
  assert.match(preview, /src="\.\/render\.mp4"/);
  assert.match(preview, /poster="\.\/cache\/frame-0001\.png"/);
  assert.doesNotMatch(preview, /<img class="sn-media-studio-frame"/);
});

test('media studio caption overlay normalizes active TikTok-style cues', () => {
  let placementTrack = captionTrack([
    { cueId: 'early', startSec: 0, endSec: 1, text: 'Too early' },
    {
      cueId: 'active',
      id: 'legacy-active',
      startSec: 1,
      endSec: 2,
      speaker: 'ops',
      text: 'Active caption',
      wordTimings: [
        { text: 'Active', startSec: 1, endSec: 1.3 },
        { text: 'caption', startSec: 1.3, endSec: 2 },
      ],
    },
    {
      cueId: 'simultaneous',
      startSec: 1.2,
      endSec: 1.8,
      text: 'Second active cue',
    },
  ]);
  let overlay = normalizeMediaStudioCaptionOverlayState({
    currentTimeSec: 1.4,
    renderSettings: {
      captionsEnabled: true,
      captionsMode: 'karaoke',
      captionStyle: { preset: 'tiktok' },
    },
    captionTrack: placementTrack,
  });

  assert.equal(overlay.enabled, true);
  assert.equal(overlay.profile.preset, 'tiktok');
  assert.equal(overlay.activeCues[0].text, 'Active caption');
  assert.equal(overlay.activeCues[0].speaker, 'ops');
  assert.deepEqual(
    overlay.activeCues[0].wordEntries.map((word) => word.state),
    ['past', 'active'],
  );
  assert.deepEqual(
    overlay.activeCues.map((cue) => cue.cueId),
    ['active', 'simultaneous'],
  );
  assert.notEqual(overlay.activeCues[0].placement.zone, overlay.activeCues[1].placement.zone);
  assert.match(
    renderMediaStudioCaptionLineMarkup(
      overlay.activeCues[0],
      { currentTimeSec: overlay.currentTimeSec },
    ),
    /data-caption-word-state="active">caption<\/span>/,
  );
  let markup = renderMediaStudioCaptionOverlayMarkup({
    currentTimeSec: 1.4,
    renderSettings: { captionsEnabled: true, captionsMode: 'karaoke' },
    captionTrack: placementTrack,
  });
  assert.match(markup, /data-caption-track="caption-presentation-track-v2"/);
  assert.match(markup, /data-caption-cue-id="active"/);
  assert.match(markup, /data-caption-cue-id="simultaneous"/);
  assert.match(markup, /Active[\s\S]*Second[\s\S]*active[\s\S]*cue/);
  assert.equal((markup.match(/class="sn-media-studio-caption-line"/g) || []).length, 2);

  let disabled = normalizeMediaStudioCaptionOverlayState({
    currentTimeSec: 1.4,
    renderSettings: { captionsEnabled: false, captionsMode: 'off' },
    captionTrack: placementTrack,
  });
  assert.equal(disabled.enabled, false);
  assert.throws(() => normalizeMediaStudioCaptionOverlayState({
    currentTimeSec: 1.4,
    captionTrack: { cues: [{ text: 'legacy' }] },
  }), /caption-presentation-track-v2/);
});

test('media studio render settings normalize auto-render, captions, and vertical geometry', () => {
  let defaults = normalizeMediaStudioRenderSettings({});
  assert.equal(defaults.autoRender, true);
  assert.equal(defaults.captionsEnabled, true);
  assert.equal(defaults.orientation, 'horizontal');
  assert.equal(defaults.width, 1920);
  assert.equal(defaults.height, 1080);

  let vertical = normalizeMediaStudioRenderSettings({
    renderSettings: {
      vertical: true,
      width: 1080,
      height: 1920,
      fps: 12,
      captionsMode: 'off',
      autoRender: false,
      audioProviderId: 'local-voice-provider',
      captionStyle: {
        preset: 'tiktok',
        fontSize: 72,
        maxLines: 3,
        preferredZones: ['top', 'bottom', 'middle'],
      },
    },
  });
  assert.equal(vertical.autoRender, false);
  assert.equal(vertical.captionsEnabled, false);
  assert.equal(vertical.orientation, 'vertical');
  assert.equal(vertical.aspectRatio, '9:16');
  assert.equal(vertical.width, 1080);
  assert.equal(vertical.height, 1920);
  assert.equal(vertical.fps, 12);
  assert.equal(vertical.providerId, 'local-voice-provider');
  assert.equal(vertical.captionProfile, 'tiktok');
  assert.equal(vertical.captionPlacement, 'top');
  assert.deepEqual(vertical.captionStyle, {
    preset: 'tiktok',
    fontSize: 72,
    maxLines: 3,
    preferredZones: ['top', 'bottom', 'middle'],
  });
  assert.deepEqual(
    normalizeMediaStudioRenderSettings({ renderSettings: vertical }).captionStyle,
    vertical.captionStyle,
  );

  for (let renderSettings of [
    { captionProfile: 'classic' },
    { captionProfile: 'high-contrast' },
    { captionPlacement: 'focus-aware' },
    { captionHighContrast: true },
  ]) {
    assert.throws(
      () => normalizeMediaStudioRenderSettings({ renderSettings }),
      /canonical caption|Supported caption/i,
    );
  }
});

test('media studio voice provider state normalizes personas, voices, and capabilities', () => {
  let provider = normalizeMediaStudioVoiceProviderState({
    renderSettings: {
      providerId: 'local-model-service',
      voiceRefs: { ops: 'voice-eric' },
    },
    voiceProvider: {
      voices: [{ voiceRef: 'voice-eric', name: 'Eric' }],
      speakerLayers: [{ persona: 'guide', voiceRef: 'voice-vivian', clips: [{ id: 'clip-1' }] }],
      capabilities: ['voice.clone'],
    },
    turns: [{ persona: 'ops' }],
  });

  assert.equal(provider.providerId, 'local-model-service');
  assert.equal(provider.canCreateVoice, true);
  assert.equal(provider.voiceRefs.ops, 'voice-eric');
  assert.equal(provider.voiceRefs.guide, 'voice-vivian');
  assert.deepEqual(provider.personas.map((persona) => persona.id).sort(), ['guide', 'ops']);
  assert.equal(provider.voices[0].id, 'voice-eric');
  assert.equal(provider.speakerLayers[0].clips[0].id, 'clip-1');
});

test('media studio voice provider state lets hosts disable voice creation explicitly', () => {
  let provider = normalizeMediaStudioVoiceProviderState({
    renderSettings: { providerId: 'browser' },
    voiceProvider: {
      id: 'browser',
      label: 'Browser audio',
      canCreateVoice: false,
      capabilities: ['voice.create'],
      speakerLayers: [{ persona: 'guide' }],
    },
  });
  let inspector = renderMediaStudioInspectorPanelMarkup({
    renderSettings: { providerId: 'browser' },
    voiceProvider: {
      id: 'browser',
      label: 'Browser audio',
      canCreateVoice: false,
      capabilities: ['voice.create'],
      speakerLayers: [{ persona: 'guide' }],
    },
    turns: [{ persona: 'guide' }],
  });

  assert.equal(provider.providerId, 'browser');
  assert.equal(provider.canCreateVoice, false);
  assert.match(inspector, /data-media-action="create-voice" disabled/);
});

test('media studio voice controls expose unavailable provider voices as disabled', () => {
  let inspector = renderMediaStudioInspectorPanelMarkup({
    renderSettings: {
      providerId: 'local-model-service',
      voiceRefs: { guide: '' },
    },
    voiceProvider: {
      id: 'local-model-service',
      label: 'Local model service',
      status: 'ready',
      voices: [],
    },
    turns: [{ persona: 'guide' }],
  });

  assert.match(inspector, /data-provider-voices="0"/);
  assert.match(inspector, /data-media-voice-ref[^>]* disabled/);
  assert.match(inspector, /<option value="" selected disabled>No provider voices<\/option>/);
});

test('media studio timeline visual geometry is driven by the timeline editor theme contract', async () => {
  let [editorSource, editorStyles, editorTemplate] = await Promise.all([
    readFile(new URL('../timeline/TimelineEditor/TimelineEditor.js', import.meta.url), 'utf8'),
    readFile(new URL('../timeline/TimelineEditor/TimelineEditor.css.js', import.meta.url), 'utf8'),
    readFile(new URL('../timeline/TimelineEditor/TimelineEditor.tpl.js', import.meta.url), 'utf8'),
  ]);

  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /--te-track-height: var\(--sn-media-studio-control-height, 28px\)/);
  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /--te-ruler-height: var\(--sn-media-studio-control-height, 28px\)/);
  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /--te-transport-height: var\(--sn-media-studio-control-height, 28px\)/);
  assert.match(editorSource, /cssPixelValue\(computed, '--te-track-height', 36\)/);
  assert.match(editorSource, /cssPixelValue\(computed, '--te-ruler-height', 28\)/);
  assert.doesNotMatch(editorSource, /Math\.floor\(y \/ 36\)/);
  assert.doesNotMatch(editorSource, /let trackH = 36/);
  assert.doesNotMatch(editorSource, /TRACK_ICONS/);
  assert.doesNotMatch(editorSource, /LAYER_COLORS/);
  assert.doesNotMatch(editorSource, /theme\.timeline/);
  assert.match(editorSource, /toggleAttribute\('playing', true\)/);
  assert.match(editorSource, /#focusPlayhead\(\)/);
  assert.match(editorSource, /#syncHeaderScroll\(\)/);
  assert.match(editorSource, /#manualScrollUntil/);
  assert.match(editorSource, /selectedClipId: data\.selectedClipId == null \? '' : String\(data\.selectedClipId\)/);
  assert.match(editorSource, /requestedSelectedClipId/);
  assert.match(editorSource, /#readTheme\(\)/);
  assert.match(editorSource, /normalizeClip/);
  assert.match(editorSource, /function isSequenceClip/);
  assert.match(editorSource, /clip\.kind === 'frame-sequence'/);
  assert.match(editorSource, /visibleTicks/);
  assert.match(editorStyles, /--te-transport-height: 28px/);
  assert.match(editorStyles, /\.te-transport \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
  assert.match(editorStyles, /\.te-transport-playback \{[\s\S]*?justify-content: center/);
  assert.match(editorStyles, /\.te-body \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: var\(--te-header-width\) minmax\(0, 1fr\)/);
  assert.match(editorStyles, /\.te-headers-list/);
  assert.match(editorStyles, /\.te-headers-scroll \{[\s\S]*?overflow: hidden/);
  assert.match(editorStyles, /\.te-timeline-viewport \{[\s\S]*?overflow: auto/);
  assert.match(editorStyles, /\.te-ruler-canvas \{[\s\S]*?position: sticky/);
  assert.match(editorStyles, /\.te-tracks-canvas \{[\s\S]*?position: absolute/);
  assert.match(editorStyles, /color: transparent/);
  assert.doesNotMatch(editorStyles, /themedScrollFadeInlineStyles/);
  assert.doesNotMatch(editorStyles, /\.te-canvas-area/);
  assert.match(editorStyles, /\.te-playhead::before/);
  assert.match(editorTemplate, /material-symbols-outlined/);
  assert.match(editorTemplate, /te-transport-playback/);
  assert.match(editorTemplate, /te-timeline-viewport/);
  assert.match(editorTemplate, /te-timeline-content/);
  assert.match(editorTemplate, /te-ruler-canvas/);
  assert.match(editorTemplate, /te-tracks-canvas/);
  assert.equal([...editorTemplate.matchAll(/class="te-playhead"/g)].length, 1);
  assert.doesNotMatch(editorTemplate, /te-playhead-ruler/);
  assert.doesNotMatch(editorTemplate, /te-playhead-tracks/);
  assert.doesNotMatch(editorTemplate, /[\u23ee\u25b6\u23f9\u23ed\u229e]/);
  assert.match(editorTemplate, /textContent: 'playIcon'/);
  assert.match(editorSource, /playIcon: 'play_arrow'/);
  assert.match(editorSource, /this\.\$\.playIcon = 'pause'/);
  let mediaStudioSource = await readFile(new URL('../ui/media-studio-surface.js', import.meta.url), 'utf8');
  assert.match(mediaStudioSource, /import\('\.\.\/timeline\/TimelineEditor\/TimelineEditor\.js'\)/);
  assert.match(mediaStudioSource, /ready\.then\(\(\) => load\(\)\)/);
  assert.match(mediaStudioSource, /setTimeout\?\.\(load, 0\)/);
  assert.doesNotMatch(mediaStudioSource, /defined && load\(\)/);
  assert.match(mediaStudioSource, /selectedClipId/);
  assert.match(editorSource, /material-symbols-outlined[\s\S]*?volume_off/);
  assert.doesNotMatch(editorSource, />M<\/button>/);
  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /layout-node:has\(\.sn-media-studio-panel\) \.panel-content/);
  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /layout-node:has\(\.sn-media-studio-panel\) \.panel-content,[\s\S]*?layout-node:has\(\.sn-media-studio-timeline-panel\) \.panel-content \{[\s\S]*?--sn-scroll-area-padding: 0px;[\s\S]*?--sn-scroll-shadow-size: 0px;[\s\S]*?--sn-scroll-fade-mask: none;[\s\S]*?padding: 0;[\s\S]*?border: 0;[\s\S]*?box-shadow: none;[\s\S]*?overflow: hidden;/);
  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /layout-node:has\(\.sn-media-studio-panel\) \.panel-content > sn-scroll-area,[\s\S]*?layout-node:has\(\.sn-media-studio-timeline-panel\) \.panel-content > sn-scroll-area \{[\s\S]*?--sn-scroll-area-padding: 0px;[\s\S]*?--sn-scroll-shadow-size: 0px;[\s\S]*?padding: 0;[\s\S]*?margin: 0;[\s\S]*?border: 0;[\s\S]*?box-shadow: none;[\s\S]*?overflow: hidden;/);
  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /\.sn-media-studio-timeline-panel \{[\s\S]*?border: 0/);
  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /\.sn-media-studio-timeline-panel \{[\s\S]*?outline: 0;[\s\S]*?box-shadow: none/);
  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /\.sn-media-studio-timeline-editor \{[\s\S]*?border: 0;[\s\S]*?outline: 0;[\s\S]*?box-shadow: none/);
  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /\.sn-media-studio-panel \{[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\)/);
  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /\.sn-media-studio-preview-stage \{[\s\S]*?grid-row: 2/);
  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /\.sn-media-studio-preview-stage \{[\s\S]*?border: 0/);
  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /\.sn-media-studio-frame \{[\s\S]*?position: absolute/);
  assert.match(MEDIA_STUDIO_SURFACE_STYLES, /\.sn-media-studio-frame \{[\s\S]*?object-fit: contain/);
  let frameStyle = MEDIA_STUDIO_SURFACE_STYLES.match(/\.sn-media-studio-frame \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(frameStyle, /box-shadow: none/);
  assert.doesNotMatch(frameStyle, /box-shadow: 0 0 0 1px/);
});

test('media studio timeline uses the library timeline editor data contract', () => {
  let empty = normalizeMediaStudioTimelineData({ durationFrames: 300 });
  assert.equal(empty.duration, 300);
  assert.equal(empty.tracks.length, 0);

  let pending = normalizeMediaStudioTimelineData({});
  assert.equal(pending.duration, 1);
  assert.equal(pending.tracks.length, 0);

  let data = normalizeMediaStudioTimelineData({
    durationFrames: 300,
    clips: [
      { lane: 'video', label: 'Current UI frames', startPercent: 0, sizePercent: 50 },
      { lane: 'voice', label: 'Narration', startPercent: 10, sizePercent: 40 },
    ],
  });
  assert.equal(data.duration, 300);
  assert.equal(data.tracks.length, 2);
  assert.equal(data.tracks[0].type, 'video');
  assert.equal(data.tracks[1].type, 'audio');

  let multiLane = normalizeMediaStudioTimelineData({
    durationFrames: 300,
    clips: [
      { lane: 'video', label: 'FrameSource cache', startPercent: 0, sizePercent: 90 },
      { lane: 'voice:guide', label: 'Guide voice', startPercent: 10, sizePercent: 50 },
      { lane: 'voice:ops', label: 'Ops voice', startPercent: 20, sizePercent: 50 },
      { lane: 'captions', label: 'Whisper captions', startPercent: 30, sizePercent: 50 },
      { lane: 'actions', label: 'Workspace actions', startPercent: 40, sizePercent: 50 },
    ],
  });
  assert.equal(multiLane.tracks.length, 5);
  assert.deepEqual(multiLane.tracks.map((track) => track.type), ['video', 'audio', 'audio', 'text', 'effect']);

  let sequence = normalizeMediaStudioTimelineData({
    durationFrames: 120,
    clips: [{
      lane: 'video',
      id: 'video:sequence',
      label: 'WebP sequence · 120f',
      startFrame: 0,
      endFrame: 120,
      kind: 'frame-sequence',
      frameCount: 120,
      sampleCount: 4,
      sequenceFormat: 'WebP',
      samples: [{ index: 0 }, { index: 40 }, { index: 80 }, { index: 119 }],
    }],
  });
  assert.equal(sequence.tracks[0].clips[0].kind, 'frame-sequence');
  assert.equal(sequence.tracks[0].clips[0].id, 'video:sequence');
  assert.equal(sequence.tracks[0].clips[0].frameCount, 120);
  assert.equal(sequence.tracks[0].clips[0].sampleCount, 4);
  assert.equal(sequence.tracks[0].clips[0].sequenceFormat, 'WebP');
  assert.equal(sequence.tracks[0].clips[0].samples.length, 4);

  let frameAndAudioTimed = normalizeMediaStudioTimelineData({
    fps: 30,
    durationMs: 12000,
    focusTimeMs: 2500,
    selectedClipId: 'voice:1:guide',
    clips: [
      { lane: 'video', label: 'Captured frames', startFrame: 0, endFrame: 240 },
      { lane: 'voice:guide', id: 'voice:1:guide', label: 'Narration', startMs: 1000, durationMs: 2500 },
      { lane: 'captions', label: 'Caption', startMs: 1500, endMs: 3200 },
    ],
  });
  assert.equal(frameAndAudioTimed.duration, 360);
  assert.equal(frameAndAudioTimed.tracks[0].clips[0].end, 240);
  assert.equal(frameAndAudioTimed.tracks[1].clips[0].start, 30);
  assert.equal(frameAndAudioTimed.tracks[1].clips[0].end, 105);
  assert.equal(frameAndAudioTimed.tracks[2].clips[0].start, 45);
  assert.equal(frameAndAudioTimed.tracks[2].clips[0].end, 96);
  assert.equal(frameAndAudioTimed.focusFrame, 75);
  assert.equal(frameAndAudioTimed.selectedClipId, 'voice:1:guide');

  let loaded = null;
  let frame = null;
  let focusedFrame = null;
  let playheadDetail = null;
  let transportDetail = null;
  let listeners = new Map();
  let editor = {
    loadTimeline(value) { loaded = value; },
    setFrame(value) { frame = value; },
    focusFrame(value) { focusedFrame = value; },
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
  };
  let root = {
    matches(selector) { return selector === '[data-media-studio-timeline-editor]'; },
    querySelector() { return null; },
    loadTimeline: editor.loadTimeline,
    setFrame: editor.setFrame,
    focusFrame: editor.focusFrame,
    addEventListener: editor.addEventListener,
    removeEventListener: editor.removeEventListener,
  };
  let hydrated = hydrateMediaStudioTimelinePanel(root, {
    durationFrames: 300,
    currentFrame: 42,
    focusFrame: 120,
    selectedClipId: 'video-main',
    clips: [{ lane: 'video', id: 'video-main', label: 'Current UI frames', startPercent: 0, sizePercent: 50 }],
    onPlayheadChange(detail) { playheadDetail = detail; },
    onTransportChange(detail) { transportDetail = detail; },
  });
  assert.equal(loaded.duration, 300);
  assert.equal(loaded.focusFrame, 120);
  assert.equal(loaded.selectedClipId, 'video-main');
  assert.equal(hydrated.tracks.length, 1);
  assert.equal(frame, 42);
  assert.equal(focusedFrame, 120);
  listeners.get('playhead-change')({ detail: { frame: 43, time: 1.4 } });
  listeners.get('transport-change')({ detail: { action: 'play' } });
  assert.deepEqual(playheadDetail, { frame: 43, time: 1.4 });
  assert.deepEqual(transportDetail, { action: 'play' });
});

test('media studio sequence playback helpers map time and bound cached frames', () => {
  assert.equal(mediaStudioFrameIndexForTime(0, { fps: 30, frameCount: 90 }), 0);
  assert.equal(mediaStudioFrameIndexForTime(0.5, { fps: 30, frameCount: 90 }), 15);
  assert.equal(mediaStudioFrameIndexForTime(0.06, { fps: 10, frameCount: 10 }), 1);
  assert.equal(mediaStudioFrameIndexForTime(0.06, { fps: 10, frameCount: 10, rounding: 'floor' }), 0);
  assert.equal(mediaStudioFrameIndexForTime(5, { fps: 30, frameCount: 90 }), 89);

  let frames = Array.from({ length: 12 }, (_, index) => ({
    index,
    url: `./frames/frame-${String(index).padStart(5, '0')}.webp`,
  }));
  let state = normalizeMediaStudioSequencePlaybackState({
    frames,
    fps: 2,
    frameCount: 12,
    currentTimeSec: 3,
    preloadBehindSec: 1,
    preloadAheadSec: 2,
    maxCachedFrames: 5,
  });
  assert.equal(state.currentFrame, 6);
  assert.equal(state.durationSec, 6);
  assert.equal(state.maxCachedFrames, 5);

  let loaded = [];
  let window = createMediaStudioSequenceFrameWindow({
    frames,
    fps: 2,
    preloadBehindSec: 1,
    preloadAheadSec: 2,
    maxCachedFrames: 5,
    loadFrame(frame) {
      loaded.push(frame.index);
      return frame.url;
    },
  });
  let first = window.update(5);
  assert.equal(first.cachedFrames, 5);
  assert.deepEqual(first.requestedFrames, [3, 4, 5, 6, 7]);
  assert.equal(window.has(5), true);

  let second = window.update(10);
  assert.equal(second.cachedFrames, 4);
  assert.deepEqual(second.requestedFrames, [8, 9, 10, 11]);
  assert.equal(window.has(3), false);
  assert.equal(window.has(10), true);
  assert.ok(loaded.includes(10));
  window.dispose();
  assert.equal(window.size, 0);
});

test('media studio sequence frame window tolerates missing, slow, and failed frames', async () => {
  let sparseWindow = createMediaStudioSequenceFrameWindow({
    frames: [
      { index: 0, url: './frames/frame-00000.webp' },
      { index: 3, url: './frames/frame-00003.webp' },
      { index: 9, url: './frames/frame-00009.webp' },
    ],
    fps: 1,
    frameCount: 10,
    preloadBehindSec: 0,
    preloadAheadSec: 0,
    maxCachedFrames: 1,
    loadFrame(frame) {
      return frame.url;
    },
  });
  let sparse = sparseWindow.update(4);
  assert.deepEqual(sparse.requestedFrames, [3]);
  assert.equal(sparseWindow.has(3), true);
  sparseWindow.dispose();

  let resolveSlow;
  let loaded = [];
  let window = createMediaStudioSequenceFrameWindow({
    frames: Array.from({ length: 8 }, (_, index) => ({
      index,
      url: `./frames/frame-${String(index).padStart(5, '0')}.webp`,
    })),
    fps: 1,
    frameCount: 8,
    preloadBehindSec: 1,
    preloadAheadSec: 1,
    maxCachedFrames: 3,
    loadFrame(frame) {
      loaded.push(frame.index);
      if (frame.index === 2) {
        return new Promise((resolve) => { resolveSlow = resolve; });
      }
      if (frame.index === 5) {
        return Promise.reject(new Error('frame missing'));
      }
      return frame.url;
    },
  });

  let first = window.update(2);
  assert.equal(first.cachedFrames, 3);
  assert.deepEqual(first.requestedFrames, [1, 2, 3]);
  assert.equal(window.get(2).status, 'loading');
  resolveSlow('./frames/frame-00002.webp');
  assert.equal(await window.get(2).value, './frames/frame-00002.webp');
  assert.equal(window.get(2).status, 'ready');

  let second = window.update(5);
  assert.equal(second.cachedFrames, 3);
  assert.deepEqual(second.requestedFrames, [4, 5, 6]);
  assert.deepEqual(second.evictedFrames, [1, 2, 3]);
  assert.equal(window.get(1), null);
  assert.equal(window.get(5).status, 'loading');
  assert.equal(await window.get(5).value, null);
  assert.equal(window.get(5).status, 'error');
  assert.ok(loaded.includes(6));
  window.dispose();
  assert.equal(window.size, 0);
});

test('media studio sequence frame window cancels evicted in-flight loads', async () => {
  let pending = new Map();
  let cancelled = [];
  let disposed = [];
  let frames = Array.from({ length: 4 }, (_, index) => ({
    index,
    url: `./frames/frame-${String(index).padStart(5, '0')}.webp`,
  }));
  let window = createMediaStudioSequenceFrameWindow({
    frames,
    fps: 1,
    frameCount: 4,
    preloadBehindSec: 0,
    preloadAheadSec: 0,
    maxCachedFrames: 1,
    loadFrame(frame) {
      let resolve;
      let promise = new Promise((done) => { resolve = done; });
      pending.set(frame.index, resolve);
      return {
        promise,
        cancel() { cancelled.push(frame.index); },
      };
    },
    disposeFrame(value) { disposed.push(value); },
  });

  window.update(0);
  let evictedLoad = window.get(0).value;
  window.update(3);
  assert.deepEqual(cancelled, [0]);
  assert.equal(window.get(0), null);

  pending.get(0)('decoded-frame-0');
  assert.equal(await evictedLoad, null);
  assert.deepEqual(disposed, ['decoded-frame-0']);

  let currentLoad = window.get(3).value;
  pending.get(3)('decoded-frame-3');
  assert.equal(await currentLoad, 'decoded-frame-3');
  assert.equal(window.get(3).status, 'ready');
  window.dispose();
  assert.deepEqual(cancelled, [0, 3]);
  assert.deepEqual(disposed, ['decoded-frame-0', 'decoded-frame-3']);
});

test('media studio sequence normalization resolves proxy dimensions and byte limits', () => {
  let state = normalizeMediaStudioSequencePlaybackState({
    frames: [
      { index: 0, url: './full-0.png', proxy: { url: './proxy-0.webp', width: 160, height: 90 } },
      { index: 1, url: './proxy-1.webp' },
    ],
    manifest: { proxy: { width: 320, height: 180 } },
    maxDecodedBytes: 12_345_678,
  });

  assert.equal(state.maxDecodedBytes, 12_345_678);
  assert.equal(state.frames[0].url, './proxy-0.webp');
  assert.equal(state.frames[0].decodedWidth, 160);
  assert.equal(state.frames[0].decodedHeight, 90);
  assert.equal(state.frames[0].decodedBytes, 160 * 90 * 4);
  assert.equal(state.frames[1].decodedWidth, 320);
  assert.equal(state.frames[1].decodedHeight, 180);
  assert.equal(state.frames[1].decodedBytes, 320 * 180 * 4);
});

test('media studio sequence frame window enforces decoded-byte reservations and diagnostics', async () => {
  let frames = Array.from({ length: 3 }, (_, index) => ({
    index,
    url: `./frame-${index}.webp`,
    width: 10,
    height: 10,
  }));
  let window = createMediaStudioSequenceFrameWindow({
    frames,
    fps: 1,
    frameCount: 3,
    preloadBehindSec: 1,
    preloadAheadSec: 1,
    maxCachedFrames: 3,
    maxDecodedBytes: 800,
    loadFrame(frame) {
      return { id: frame.index, width: 10, height: 10 };
    },
  });

  let update = window.update(1);
  assert.equal(update.cachedFrames, 2);
  assert.equal(update.cachedDecodedBytes, 0);
  assert.equal(update.reservedDecodedBytes, 800);
  assert.equal(update.maxCachedFrames, 3);
  assert.equal(update.maxDecodedBytes, 800);
  await Promise.all(update.requestedFrames.map((frame) => window.get(frame)?.value));
  assert.equal(window.diagnostics.cachedDecodedBytes, 800);
  assert.equal(window.diagnostics.reservedDecodedBytes, 0);
  assert.equal(window.diagnostics.totalDecodedBytes, 800);
  assert.equal(typeof window.diagnostics.evictions, 'number');
  window.dispose();
  assert.equal(window.diagnostics.cachedDecodedBytes, 0);
});

test('media studio sequence frame window evicts the least recently used active frame', () => {
  let frames = Array.from({ length: 4 }, (_, index) => ({
    index,
    url: `./frame-${index}.webp`,
    width: 10,
    height: 10,
  }));
  let window = createMediaStudioSequenceFrameWindow({
    frames,
    fps: 1,
    frameCount: 4,
    preloadBehindSec: 3,
    preloadAheadSec: 3,
    maxCachedFrames: 2,
    maxDecodedBytes: 800,
    loadFrame(frame) { return frame.url; },
  });

  window.update(1);
  assert.deepEqual([0, 1].map((frame) => window.has(frame)), [true, true]);
  window.get(0);
  let update = window.update(2);
  assert.equal(window.has(0), true);
  assert.equal(window.has(1), false);
  assert.equal(window.has(2), true);
  assert.deepEqual(update.evictedFrames, [1]);
  window.dispose();
});

test('media studio sequence frame window cancels reserved loads and releases late decoded resources', async () => {
  let resolveLoad;
  let cancelled = 0;
  let closed = 0;
  let window = createMediaStudioSequenceFrameWindow({
    frames: [{ index: 0, url: './frame-0.webp', width: 20, height: 10 }],
    maxCachedFrames: 1,
    maxDecodedBytes: 800,
    loadFrame() {
      return {
        promise: new Promise((resolve) => { resolveLoad = resolve; }),
        cancel() { cancelled += 1; },
      };
    },
    disposeFrame(resource) { resource.close(); },
  });

  window.update(0);
  let pending = window.get(0).value;
  assert.equal(window.diagnostics.reservedDecodedBytes, 800);
  window.dispose();
  assert.equal(cancelled, 1);
  assert.equal(window.diagnostics.reservedDecodedBytes, 0);
  resolveLoad({ close() { closed += 1; } });
  assert.equal(await pending, null);
  assert.equal(closed, 1);
  assert.equal(window.diagnostics.cachedDecodedBytes, 0);
});

test('media studio default frame loader prefers abortable bitmap decoding and closes resources', async () => {
  let originalFetch = globalThis.fetch;
  let originalCreateImageBitmap = globalThis.createImageBitmap;
  let originalAbortController = globalThis.AbortController;
  let aborted = false;
  let closeCount = 0;
  class AbortControllerStub {
    constructor() {
      this.signal = {};
    }
    abort() {
      aborted = true;
    }
  }
  globalThis.AbortController = AbortControllerStub;
  globalThis.fetch = async (_url, options) => {
    assert.equal(typeof options.signal, 'object');
    return { ok: true, blob: async () => ({ type: 'image/webp' }) };
  };
  globalThis.createImageBitmap = async () => ({
    width: 10,
    height: 10,
    close() { closeCount += 1; },
  });
  try {
    let window = createMediaStudioSequenceFrameWindow({
      frames: [{ index: 0, url: './frame-0.webp', width: 10, height: 10 }],
      maxCachedFrames: 1,
      maxDecodedBytes: 400,
    });
    window.update(0);
    let resource = await window.get(0).value;
    assert.equal(resource.width, 10);
    window.dispose();
    assert.equal(aborted, true);
    assert.equal(closeCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.createImageBitmap = originalCreateImageBitmap;
    globalThis.AbortController = originalAbortController;
  }
});

test('media studio styles install once into a browser document', () => {
  let appended = [];
  let existing = null;
  let doc = {
    head: {
      querySelector(selector) {
        assert.equal(selector, 'style[data-symbiote-ui="media-studio-surface"]');
        return existing;
      },
      appendChild(node) {
        appended.push(node);
        existing = node;
        return node;
      },
    },
    createElement(tagName) {
      return {
        tagName,
        attrs: {},
        setAttribute(name, value) {
          this.attrs[name] = value;
        },
        textContent: '',
      };
    },
  };

  let first = ensureMediaStudioSurfaceStyles(doc);
  let second = ensureMediaStudioSurfaceStyles(doc);

  assert.equal(first, second);
  assert.equal(appended.length, 1);
  assert.equal(first.attrs['data-symbiote-ui'], 'media-studio-surface');
  assert.match(first.textContent, /sn-media-studio-progress-shell/);
});
