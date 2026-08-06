import { getWebXRSupport } from './webxr.js';

export const WEBXR_EMULATION_RUNTIME = Object.freeze({
  name: 'iwer',
  packageName: 'iwer',
  status: 'optional-dev-runtime',
  defaultProfile: 'metaQuest3',
  capabilities: [
    'webxr-runtime-emulation',
    'quest-profile-emulation',
    'controller-input-emulation',
    'hand-input-emulation',
    'action-capture-playback',
  ],
});

function getXR(target) {
  return target?.navigator?.xr || null;
}

function hasNativeWebXR(target) {
  return Boolean(getXR(target));
}

function getModule(options = {}) {
  return options.module || options.iwer || null;
}

function getXRDevice(module) {
  return module?.XRDevice || null;
}

function resolveProfile(module, profile = WEBXR_EMULATION_RUNTIME.defaultProfile) {
  if (profile && typeof profile === 'object') return profile;
  if (typeof profile === 'string' && module?.[profile]) return module[profile];
  return module?.[WEBXR_EMULATION_RUNTIME.defaultProfile] || null;
}

function createInstallTarget(target) {
  if (target?.navigator) return target;
  if (target && typeof target === 'object') {
    target.navigator = {};
    return target;
  }
  return { navigator: {} };
}

async function loadRuntimeModule(options = {}) {
  let module = getModule(options);
  if (module) return module;
  if (typeof options.loadModule === 'function') return options.loadModule();
  return null;
}

export function getWebXREmulationSupport(target = globalThis, options = {}) {
  let module = getModule(options);
  let XRDevice = getXRDevice(module);
  let canLoad = typeof options.loadModule === 'function';

  return {
    ...WEBXR_EMULATION_RUNTIME,
    nativeWebXRAvailable: hasNativeWebXR(target),
    moduleAvailable: Boolean(module),
    canInstall: Boolean(XRDevice || canLoad),
    profile: typeof options.profile === 'string'
      ? options.profile
      : WEBXR_EMULATION_RUNTIME.defaultProfile,
  };
}

export async function installWebXREmulationRuntime(options = {}) {
  let target = createInstallTarget(options.globalThis || globalThis);
  let forceInstall = options.forceInstall === true || options.preferNative === false;
  if (hasNativeWebXR(target) && !forceInstall) {
    return {
      ok: true,
      runtime: 'native',
      installed: false,
      reason: 'native-webxr-available',
      device: null,
      support: await getWebXRSupport(target),
    };
  }

  let module = await loadRuntimeModule(options);
  let XRDevice = getXRDevice(module);
  if (typeof XRDevice !== 'function') {
    return {
      ok: false,
      runtime: WEBXR_EMULATION_RUNTIME.name,
      installed: false,
      reason: 'missing-iwer-module',
      device: null,
      support: await getWebXRSupport(target),
    };
  }

  let profile = resolveProfile(module, options.profile);
  if (!profile) {
    return {
      ok: false,
      runtime: WEBXR_EMULATION_RUNTIME.name,
      installed: false,
      reason: 'missing-iwer-profile',
      device: null,
      support: await getWebXRSupport(target),
    };
  }

  let device = null;
  try {
    device = options.device || new XRDevice(profile);
  } catch (error) {
    return {
      ok: false,
      runtime: WEBXR_EMULATION_RUNTIME.name,
      installed: false,
      reason: error?.name || 'device-create-failed',
      message: error?.message || '',
      device: null,
      support: await getWebXRSupport(target),
    };
  }
  if (typeof options.configureDevice === 'function') {
    options.configureDevice(device, { profile, target });
  }
  if (typeof device.installRuntime !== 'function') {
    return {
      ok: false,
      runtime: WEBXR_EMULATION_RUNTIME.name,
      installed: false,
      reason: 'missing-install-runtime',
      device,
      support: await getWebXRSupport(target),
    };
  }

  try {
    let runtimeOptions = {
      globalObject: target,
      forceInstall,
    };
    if (options.polyfillLayers !== undefined) {
      runtimeOptions.polyfillLayers = options.polyfillLayers === true;
    }
    device.installRuntime(runtimeOptions);
  } catch (error) {
    return {
      ok: false,
      runtime: WEBXR_EMULATION_RUNTIME.name,
      installed: false,
      reason: error?.name || 'install-runtime-failed',
      message: error?.message || '',
      device,
      support: await getWebXRSupport(target),
    };
  }

  return {
    ok: true,
    runtime: WEBXR_EMULATION_RUNTIME.name,
    installed: true,
    profileName: typeof options.profile === 'string'
      ? options.profile
      : WEBXR_EMULATION_RUNTIME.defaultProfile,
    device,
    support: await getWebXRSupport(target),
  };
}

export function createWebXREmulationAdapter(options = {}) {
  let target = options.globalThis || globalThis;
  let state = {
    target,
    device: null,
    result: null,
  };

  return {
    ...WEBXR_EMULATION_RUNTIME,
    getSupport() {
      return getWebXREmulationSupport(state.target, options);
    },
    async install(installOptions = {}) {
      let result = await installWebXREmulationRuntime({
        ...options,
        ...installOptions,
        globalThis: state.target,
      });
      state.result = result;
      state.device = result.device;
      return result;
    },
    getDevice() {
      return state.device;
    },
    getState() {
      return {
        target: state.target,
        installed: Boolean(state.result?.installed),
        runtime: state.result?.runtime || WEBXR_EMULATION_RUNTIME.name,
        reason: state.result?.reason || null,
      };
    },
  };
}
