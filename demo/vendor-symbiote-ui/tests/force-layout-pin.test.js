import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import { ForceLayout } from '../canvas/ForceLayout.js';

async function withMainThreadFallback(fn) {
  let NativeWorker = globalThis.Worker;
  let nativeRaf = globalThis.requestAnimationFrame;
  let nativeCancelRaf = globalThis.cancelAnimationFrame;
  let nativeWarn = console.warn;
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  console.warn = () => {};
  try {
    delete globalThis.Worker;
    return await fn();
  } finally {
    console.warn = nativeWarn;
    if (NativeWorker) {
      globalThis.Worker = NativeWorker;
    } else {
      delete globalThis.Worker;
    }
    if (nativeRaf) {
      globalThis.requestAnimationFrame = nativeRaf;
    } else {
      delete globalThis.requestAnimationFrame;
    }
    if (nativeCancelRaf) {
      globalThis.cancelAnimationFrame = nativeCancelRaf;
    } else {
      delete globalThis.cancelAnimationFrame;
    }
  }
}

function readPinRoundTrip(positionOrigin) {
  return new Promise((resolve, reject) => {
    let force = new ForceLayout('/missing-force-worker.js');
    let firstPosition = null;
    let tickCount = 0;
    let timer = setTimeout(() => {
      force.stop();
      reject(new Error(`pin round-trip did not settle for ${positionOrigin}`));
    }, 400);

    force.onTick = (positions) => {
      tickCount++;
      if (!firstPosition) {
        firstPosition = positions.box;
        force.pin('box', firstPosition.x, firstPosition.y);
        return;
      }
      if (tickCount < 3) return;
      clearTimeout(timer);
      force.stop();
      resolve({ firstPosition, pinnedPosition: positions.box });
    };

    force.start({
      nodes: [{ id: 'box', x: 50, y: 60, w: 80, h: 40 }],
      edges: [],
      options: {
        mode: 'continuous',
        positionOrigin,
        alphaDecay: 0.5,
        brownian: 0,
        chargeStrength: 0,
        centerStrength: 0,
        centerPull: 0,
        collideStrength: 0,
        pinReheat: 0.05,
        pinCap: 0.1,
      },
    });
  });
}

function unpackPackedPositions(ids, packed) {
  let values = new Float32Array(packed);
  let positions = {};
  for (let index = 0; index < ids.length; index++) {
    positions[ids[index]] = {
      x: Math.round(values[index * 2]),
      y: Math.round(values[index * 2 + 1]),
    };
  }
  return positions;
}

async function waitForMessage(messages, predicate, label) {
  let startedAt = Date.now();
  while (Date.now() - startedAt < 500) {
    let message = messages.find(predicate);
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`worker message not received: ${label}`);
}

async function readWorkerPinRoundTrip(positionOrigin) {
  let source = await readFile(new URL('../canvas/ForceWorker.js', import.meta.url), 'utf8');
  let messages = [];
  let workerScope = {
    postMessage(message) {
      messages.push(message);
    },
  };
  let context = vm.createContext({
    self: workerScope,
    setTimeout,
    clearTimeout,
    console,
  });
  vm.runInContext(source, context, { filename: 'ForceWorker.js' });

  workerScope.onmessage({
    data: {
      type: 'init',
      nodes: [{ id: 'box', x: 50, y: 60, w: 80, h: 40 }],
      edges: [],
      groups: {},
      options: {
        mode: 'continuous',
        positionOrigin,
        initialAlpha: 0.001,
        contAlphaFloor: 0.001,
        contAlphaTarget: 0.001,
        alphaDecay: 1,
        brownian: 0,
        chargeStrength: 0,
        centerStrength: 0,
        centerPull: 0,
        collideStrength: 0,
        pinReheat: 0.001,
        pinCap: 0.001,
      },
    },
  });

  let idsMessage = await waitForMessage(messages, (message) => message.type === 'nodeIds', 'nodeIds');
  let firstTick = await waitForMessage(messages, (message) => message.type === 'tick', 'initial tick');
  let firstPosition = unpackPackedPositions(idsMessage.ids, firstTick.packed).box;
  let messageCountBeforePin = messages.length;

  workerScope.onmessage({ data: { type: 'pin', id: 'box', x: firstPosition.x, y: firstPosition.y } });
  let pinnedTick = await waitForMessage(
    messages,
    (message, index) => index >= messageCountBeforePin && message.type === 'tick',
    'pinned tick',
  );
  let pinnedPosition = unpackPackedPositions(idsMessage.ids, pinnedTick.packed).box;
  workerScope.onmessage({ data: { type: 'stop' } });

  return { firstPosition, pinnedPosition };
}

test('force layout pin round-trips displayed coordinates for center and top-left origins', async () => {
  await withMainThreadFallback(async () => {
    let center = await readPinRoundTrip('center');
    assert.deepEqual(center.firstPosition, { x: 50, y: 60 });
    assert.deepEqual(center.pinnedPosition, center.firstPosition);

    let topLeft = await readPinRoundTrip('top-left');
    assert.deepEqual(topLeft.firstPosition, { x: 10, y: 40 });
    assert.deepEqual(topLeft.pinnedPosition, topLeft.firstPosition);
  });
});

test('force worker pin round-trips displayed coordinates for center and top-left origins', async () => {
  let center = await readWorkerPinRoundTrip('center');
  assert.deepEqual(center.firstPosition, { x: 50, y: 60 });
  assert.deepEqual(center.pinnedPosition, center.firstPosition);

  let topLeft = await readWorkerPinRoundTrip('top-left');
  assert.deepEqual(topLeft.firstPosition, { x: 10, y: 40 });
  assert.deepEqual(topLeft.pinnedPosition, topLeft.firstPosition);
});
