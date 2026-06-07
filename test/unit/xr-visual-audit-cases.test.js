import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createXRSpatialScene,
  createXRVisualTestSummary,
} from 'symbiote-ui/xr';

function createAuditLayout() {
  return {
    id: 'xr-audit-root',
    component: 'panel-layout',
    layout: { direction: 'horizontal' },
    children: [
      {
        id: 'audit-nav',
        component: 'sn-navigation-panel',
        layout: { weight: 0.22 },
      },
      {
        id: 'audit-main',
        component: 'sn-graph-surface',
        layout: { weight: 0.42 },
      },
      {
        id: 'audit-chat',
        component: 'sn-chat-surface',
        layout: { weight: 0.24 },
      },
      {
        id: 'audit-status',
        component: 'sn-status-strip',
        layout: { weight: 0.12 },
      },
    ],
  };
}

function createAuditScene(caseName = 'baseline') {
  let scene = createXRSpatialScene(createAuditLayout(), {
    themeScope: 'default-provider',
    preview: { pixelsPerMeter: 160 },
    userSpace: {
      eyeHeight: 1.62,
      comfortRadius: 1.8,
    },
  });
  let panels = scene.panels.map((panel) => ({ ...panel }));

  if (caseName === 'overlap' && panels[1]) {
    panels[1] = {
      ...panels[1],
      position: [...panels[0].position],
      rotation: [...panels[0].rotation],
    };
  }
  if (caseName === 'bad-facing' && panels[0]) {
    panels[0] = {
      ...panels[0],
      rotation: [0, 56, 0],
    };
  }
  if (caseName === 'too-high' && panels[0]) {
    panels[0] = {
      ...panels[0],
      position: [panels[0].position[0], 2.45, panels[0].position[2]],
    };
  }

  return { ...scene, panels };
}

function createAuditSummary(caseName = 'baseline') {
  let scene = createAuditScene(caseName);
  let textureOptions = caseName === 'low-texture'
    ? { textureWidth: 256, textureHeight: 192, minPixelsPerMeter: 900 }
    : { preferTargetDensity: true };
  let telemetry = caseName === 'missing-controls'
    ? {
      active: true,
      panelFrameVisuals: 0,
      controllerRayVisuals: 0,
      hitReticleVisuals: 0,
    }
    : {
      active: true,
      panelFrameVisuals: scene.panels.length,
      controllerRayVisuals: 1,
      hitReticleVisuals: 1,
      interactionEvents: 1,
    };

  return createXRVisualTestSummary(scene, {
    ...textureOptions,
    telemetry,
    expectInteraction: true,
    expectedFrameVisuals: scene.panels.length,
  });
}

test('XR visual audit baseline passes all provider checks', () => {
  let summary = createAuditSummary('baseline');

  assert.equal(summary.version, 'xr-visual-test-summary-v1');
  assert.equal(summary.status, 'pass');
  assert.equal(summary.panelCount, 4);
  assert.equal(summary.failCount, 0);
  assert.equal(summary.warnCount, 0);
  assert.equal(summary.panelMap.length, 4);
  assert.ok(summary.panelMap.every((panel) => panel.worldRect && panel.contentViewport));
});

test('XR visual audit cases expose actionable issue ids', () => {
  let expected = new Map([
    ['overlap', ['panel-world-overlap']],
    ['bad-facing', ['viewer-facing']],
    ['too-high', ['pose-comfort']],
    ['low-texture', ['texture-density-readable']],
    ['missing-controls', ['frame-visuals-present', 'controller-rays-visible', 'hit-reticle-visible']],
  ]);

  for (let [caseName, issueIds] of expected) {
    let summary = createAuditSummary(caseName);
    let actualIds = summary.issues.map((issue) => issue.id);

    assert.equal(summary.status, 'warning', `${caseName} must be classified as warning`);
    for (let issueId of issueIds) {
      assert.ok(actualIds.includes(issueId), `${caseName} must include ${issueId}`);
    }
  }
});
