import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

import { createXRHitMap, createXRPlacementReceipt } from '../xr/pointer.js';
import { createXRPortablePanelStore } from '../xr/portable-panel-state.js';
import { SpatialStabilityTracker } from '../xr/spatial-stability.js';
import {
  createHitMapDescriptor,
  createPlacementPhase,
  createSpatialObservation,
  createSpatialTarget,
} from './xr-spatial-fixtures.js';

let directory = dirname(fileURLToPath(import.meta.url));

async function createValidators() {
  let names = [
    'xr-spatial-target-v1.json',
    'xr-spatial-observation-v1.json',
    'xr-spatial-audit-v1.json',
    'xr-content-hit-map-v1.json',
    'xr-spatial-placement-receipt-v1.json',
  ];
  let schemas = await Promise.all(names.map(async (name) => (
    JSON.parse(await readFile(resolve(directory, '..', 'schemas', name), 'utf8'))
  )));
  let ajv = new Ajv2020({ allErrors: true, strict: true });
  for (let schema of schemas) ajv.addSchema(schema);
  return {
    ajv,
    schemas,
    validateTarget: ajv.getSchema(schemas[0].$id),
    validateObservation: ajv.getSchema(schemas[1].$id),
    validateAudit: ajv.getSchema(schemas[2].$id),
    validateHitMap: ajv.getSchema(schemas[3].$id),
    validatePlacementReceipt: ajv.getSchema(schemas[4].$id),
  };
}

test('spatial evidence schemas accept canonical target, capture, audit, and hit map', async () => {
  let validators = await createValidators();
  let target = createSpatialTarget();
  let observation = createSpatialObservation({ sequence: 1, time: 100 });
  let tracker = new SpatialStabilityTracker(target);
  for (let index = 0; index < 30; index += 1) {
    let current = createSpatialObservation({ sequence: index + 1, time: 100 + index * 26 });
    tracker.addFrame(current, { now: current.frame.captureTime });
  }
  let audit = tracker.getAudit();
  let hitMap = createXRHitMap(createHitMapDescriptor());
  let placementReceipt = createXRPlacementReceipt(
    createPlacementPhase('selectstart'),
    createPlacementPhase('selectend'),
  );

  assert.equal(validators.validateTarget(target), true, validators.ajv.errorsText(validators.validateTarget.errors));
  assert.equal(validators.validateObservation(observation), true, validators.ajv.errorsText(validators.validateObservation.errors));
  assert.equal(validators.validateAudit(audit), true, validators.ajv.errorsText(validators.validateAudit.errors));
  assert.equal(validators.validateHitMap(hitMap), true, validators.ajv.errorsText(validators.validateHitMap.errors));
  assert.equal(
    validators.validatePlacementReceipt(placementReceipt),
    true,
    validators.ajv.errorsText(validators.validatePlacementReceipt.errors),
  );
  assert.deepEqual(validators.schemas.map((schema) => schema.$id), [
    'https://rnd-pro.github.io/symbiote-ui/schemas/xr-spatial-target-v1.json',
    'https://rnd-pro.github.io/symbiote-ui/schemas/xr-spatial-observation-v1.json',
    'https://rnd-pro.github.io/symbiote-ui/schemas/xr-spatial-audit-v1.json',
    'https://rnd-pro.github.io/symbiote-ui/schemas/xr-content-hit-map-v1.json',
    'https://rnd-pro.github.io/symbiote-ui/schemas/xr-spatial-placement-receipt-v1.json',
  ]);
});

test('spatial evidence schemas reject ambiguous or extensible evidence', async () => {
  let {
    validateTarget,
    validateObservation,
    validateAudit,
    validateHitMap,
    validatePlacementReceipt,
  } = await createValidators();

  let stereoOptional = createSpatialTarget();
  stereoOptional.requiredEvidenceProfile.stereoRequired = false;
  assert.equal(validateTarget(stereoOptional), false);

  let stringConstraint = createSpatialTarget();
  stringConstraint.constraints[0].expectedCoordinate = '-2';
  assert.equal(validateTarget(stringConstraint), false);

  let extraTargetField = createSpatialTarget();
  extraTargetField.hostProduct = 'product-owned';
  assert.equal(validateTarget(extraTargetField), false);

  let missingEye = createSpatialObservation();
  missingEye.views.pop();
  assert.equal(validateObservation(missingEye), false);

  let invalidGrab = createSpatialObservation();
  invalidGrab.activeGrab = { active: false, sourceId: 'controller-right', objectId: null };
  assert.equal(validateObservation(invalidGrab), false);

  let nestedHitMap = createHitMapDescriptor();
  nestedHitMap.targets[0].targets = [];
  assert.equal(validateHitMap(nestedHitMap), false);

  let placementWithRoot = structuredClone(createXRPlacementReceipt(
    createPlacementPhase('selectstart'),
    createPlacementPhase('selectend'),
  ));
  placementWithRoot.rootCommitId = 'not-allowed-before-placement';
  assert.equal(validatePlacementReceipt(placementWithRoot), false);

  let tracker = new SpatialStabilityTracker(createSpatialTarget());
  let observation = createSpatialObservation();
  tracker.addFrame(observation, { now: observation.frame.captureTime });
  let audit = structuredClone(tracker.getAudit());
  delete audit.projections.axonometric;
  assert.equal(validateAudit(audit), false);

  let nonReferenceAxonometric = structuredClone(tracker.getAudit());
  nonReferenceAxonometric.projections.axonometric.metric = true;
  assert.equal(validateAudit(nonReferenceAxonometric), false);
});

test('portable panel schemas admit close/restore actions and optional hidden flag', async () => {
  let [receiptSchema, stateSchema] = await Promise.all([
    JSON.parse(await readFile(resolve(directory, '..', 'schemas', 'xr-portable-panel-receipt-v1.json'), 'utf8')),
    JSON.parse(await readFile(resolve(directory, '..', 'schemas', 'xr-portable-panel-state-v1.json'), 'utf8')),
  ]);

  for (let schema of [receiptSchema, stateSchema]) {
    assert.equal(schema.$defs.panel.properties.hidden.type, 'boolean');
    assert.equal(schema.$defs.panel.required.includes('hidden'), false);
  }
  for (let action of ['close', 'restore']) {
    assert.ok(receiptSchema.properties.action.enum.includes(action));
  }

  let ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addSchema(receiptSchema);
  ajv.addSchema(stateSchema);
  let validateReceipt = ajv.getSchema(receiptSchema.$id);
  let validatePanelState = ajv.getSchema(stateSchema.$id);

  let store = createXRPortablePanelStore([{
    id: 'panel-a',
    canonical: { position: [0, 1.5, -1], quaternion: [0, 0, 0, 1], size: [0.8, 0.6] },
    current: { position: [0, 1.5, -1], quaternion: [0, 0, 0, 1], size: [0.8, 0.6] },
    portable: true,
    pinned: false,
    focused: false,
    revision: 0,
    sourceMetadata: {},
  }]);
  let context = {
    sessionId: 'schema-session',
    startFrameId: 'frame-1',
    endFrameId: 'frame-2',
    inputSourceId: 'controller-left',
    inputKind: 'controller',
    handedness: 'left',
    profiles: ['generic-trigger'],
    timestamp: 100,
  };

  let closeReceipt = store.setVisibility('panel-a', true, context);
  assert.equal(validateReceipt(closeReceipt), true, ajv.errorsText(validateReceipt.errors));
  let hiddenSnapshot = store.getSnapshot();
  assert.equal(validatePanelState(hiddenSnapshot), true, ajv.errorsText(validatePanelState.errors));
  let restoreReceipt = store.setVisibility('panel-a', false, context);
  assert.equal(validateReceipt(restoreReceipt), true, ajv.errorsText(validateReceipt.errors));

  // Old shape without the optional field still validates; wrong types and
  // unknown actions do not.
  let legacyReceipt = store.focus('panel-a', context);
  assert.equal(validateReceipt(legacyReceipt), true, ajv.errorsText(validateReceipt.errors));
  let badHidden = structuredClone(closeReceipt);
  badHidden.after.hidden = 'yes';
  assert.equal(validateReceipt(badHidden), false);
  let badAction = structuredClone(closeReceipt);
  badAction.action = 'shred';
  assert.equal(validateReceipt(badAction), false);
});
