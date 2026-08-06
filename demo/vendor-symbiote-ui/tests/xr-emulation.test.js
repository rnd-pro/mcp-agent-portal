import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { installWebXREmulationRuntime } from '../xr/emulation.js';

function createIwerFixture() {
  let devices = [];
  class XRDevice {
    constructor(profile) {
      this.profile = profile;
      this.installCalls = [];
      devices.push(this);
    }

    installRuntime(options) {
      assert.equal(typeof options, 'object');
      assert.ok(options.globalObject?.navigator);
      this.installCalls.push(options);
    }
  }

  return {
    devices,
    module: {
      XRDevice,
      metaQuest3: { name: 'Meta Quest 3' },
    },
  };
}

test('WebXR emulation preserves native XR unless replacement is explicit', async () => {
  let fixture = createIwerFixture();
  let nativeXR = {};
  let target = { navigator: { xr: nativeXR } };
  let result = await installWebXREmulationRuntime({
    globalThis: target,
    module: fixture.module,
    profile: 'metaQuest3',
  });

  assert.equal(result.ok, true);
  assert.equal(result.runtime, 'native');
  assert.equal(result.installed, false);
  assert.equal(result.device, null);
  assert.equal(target.navigator.xr, nativeXR);
  assert.equal(fixture.devices.length, 0);
});

test('explicit IWER mode uses the exact 2.3 runtime options contract', async () => {
  let fixture = createIwerFixture();
  let target = { navigator: { xr: {} } };
  let result = await installWebXREmulationRuntime({
    globalThis: target,
    module: fixture.module,
    profile: 'metaQuest3',
    preferNative: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.runtime, 'iwer');
  assert.equal(result.installed, true);
  assert.equal(result.device, fixture.devices[0]);
  assert.equal(result.device.profile, fixture.module.metaQuest3);
  assert.deepEqual(result.device.installCalls, [{
    globalObject: target,
    forceInstall: true,
  }]);
});

test('IWER receives an explicit non-forced install when native XR is absent', async () => {
  let fixture = createIwerFixture();
  let target = { navigator: {} };
  let result = await installWebXREmulationRuntime({
    globalThis: target,
    module: fixture.module,
    polyfillLayers: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.device.installCalls, [{
    globalObject: target,
    forceInstall: false,
    polyfillLayers: true,
  }]);
});
