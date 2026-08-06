import {
  WEBXR_FEATURES,
  WEBXR_MODES,
  createWebXRLayer,
  createWebXRRenderLoop,
  endWebXRSession,
  listWebXRInputSources,
  requestWebXRReferenceSpace,
  requestWebXRSession,
  syncWebXRCanvas,
} from './webxr.js';
import { applyXRThemeToPanel, createXRThemeSnapshot } from './theme-bridge.js';

function initialState(options = {}) {
  return {
    status: 'idle',
    mode: null,
    scene: options.scene || null,
    session: null,
    referenceSpace: null,
    layer: null,
    inputSources: [],
    frameCount: 0,
    lastFrameTime: null,
    reason: null,
    themeSnapshot: options.themeSnapshot || null,
    renderMode: 'dom-fallback',
  };
}

export function createXRSceneDiagnostics(state = {}, options = {}) {
  let scene = state.scene || null;
  let panels = Array.isArray(scene?.panels) ? scene.panels : [];
  let layer = state.layer || null;
  let canvas = options.canvas || null;
  let gl = options.gl || null;
  return {
    version: 'xr-scene-diagnostics-v1',
    status: state.status || 'unknown',
    mode: state.mode || null,
    renderMode: state.renderMode || 'unknown',
    reason: state.reason || null,
    frameCount: Number(state.frameCount || 0),
    lastFrameTime: state.lastFrameTime || null,
    inputSources: Array.isArray(state.inputSources) ? state.inputSources.length : 0,
    scene: scene
      ? {
        version: scene.version || null,
        coordinateSystem: scene.coordinateSystem || null,
        themeScope: scene.themeScope || null,
        panelCount: panels.length,
        panels: panels.map((panel) => ({
          id: panel.id || null,
          component: panel.component || panel.panelType || null,
          anchor: panel.anchor || null,
          size: Array.isArray(panel.size) ? [...panel.size] : null,
          position: Array.isArray(panel.position) ? [...panel.position] : null,
          rotation: Array.isArray(panel.rotation) ? [...panel.rotation] : null,
          contentViewport: panel.contentViewport
            ? {
              width: panel.contentViewport.width,
              height: panel.contentViewport.height,
              scale: panel.contentViewport.scale,
              source: panel.contentViewport.source,
            }
            : null,
        })),
      }
      : null,
    layer: layer
      ? {
        type: layer.constructor?.name || 'XRWebGLLayer',
        framebufferWidth: Number(layer.framebufferWidth || 0),
        framebufferHeight: Number(layer.framebufferHeight || 0),
        hasFramebuffer: Boolean(layer.framebuffer),
      }
      : null,
    canvas: canvas
      ? {
        width: Number(canvas.width || 0),
        height: Number(canvas.height || 0),
        clientWidth: Number(canvas.clientWidth || 0),
        clientHeight: Number(canvas.clientHeight || 0),
      }
      : null,
    gl: gl
      ? {
        hasContext: true,
        drawingBufferWidth: Number(gl.drawingBufferWidth || 0),
        drawingBufferHeight: Number(gl.drawingBufferHeight || 0),
      }
      : { hasContext: false },
  };
}

export function createXRSceneController(options = {}) {
  let target = options.globalThis || globalThis;
  let referenceSpaceType = options.referenceSpaceType || WEBXR_FEATURES.localFloor;
  let renderLoop = null;
  let onFrame = options.onFrame || null;
  let state = initialState(options);

  function snapshotState() {
    return {
      ...state,
      inputSources: [...state.inputSources],
      scene: state.scene,
      session: state.session,
      referenceSpace: state.referenceSpace,
      layer: state.layer,
      themeSnapshot: state.themeSnapshot,
    };
  }

  function setScene(scene, sceneOptions = {}) {
    let themeSnapshot = sceneOptions.themeSnapshot || state.themeSnapshot || createXRThemeSnapshot(sceneOptions.themeRoot, {
      themeScope: scene?.themeScope,
    });
    state = {
      ...state,
      scene: scene
        ? {
          ...scene,
          panels: scene.panels.map((panel) => applyXRThemeToPanel(panel, themeSnapshot)),
          themeScope: scene.themeScope || themeSnapshot.themeScope,
        }
        : null,
      themeSnapshot,
    };
    return snapshotState();
  }

  async function start(mode = WEBXR_MODES.immersiveVr, sessionOptions = {}) {
    if (state.status === 'running') {
      return { ok: true, state: snapshotState() };
    }

    let sessionResult = await requestWebXRSession(target, mode, sessionOptions);
    if (!sessionResult.ok) {
      state = {
        ...state,
        status: 'fallback',
        mode,
        reason: sessionResult.reason || 'unsupported',
        renderMode: 'dom-fallback',
      };
      return { ok: false, reason: state.reason, state: snapshotState() };
    }

    let layerResult = { ok: true, layer: null, reason: null };
    if (sessionOptions.gl || sessionOptions.canvas) {
      let gl = sessionOptions.gl || sessionOptions.canvas?.getContext?.('webgl', {
        xrCompatible: true,
        alpha: true,
        antialias: true,
      });
      if (gl?.makeXRCompatible) await gl.makeXRCompatible();
      layerResult = createWebXRLayer(target, sessionResult.session, gl, sessionOptions.layerOptions || {});
      if (layerResult.ok) {
        await sessionResult.session.updateRenderState?.({ baseLayer: layerResult.layer });
        syncWebXRCanvas(sessionOptions.canvas, gl, sessionResult.session);
      } else if (sessionOptions.requireLayer !== false) {
        await endWebXRSession(sessionResult.session);
        state = {
          ...state,
          status: 'fallback',
          mode,
          reason: layerResult.reason || 'layer-failed',
          renderMode: 'dom-fallback',
        };
        return { ok: false, reason: state.reason, state: snapshotState() };
      }
    }

    let referenceResult = await requestWebXRReferenceSpace(
      sessionResult.session,
      sessionOptions.referenceSpaceType || referenceSpaceType,
    );
    if (!referenceResult.ok) {
      await endWebXRSession(sessionResult.session);
      state = {
        ...state,
        status: 'fallback',
        mode,
        reason: referenceResult.reason || 'reference-space-failed',
        renderMode: 'dom-fallback',
      };
      return { ok: false, reason: state.reason, state: snapshotState() };
    }

    state = {
      ...state,
      status: 'running',
      mode,
      session: sessionResult.session,
      referenceSpace: referenceResult.referenceSpace,
      layer: layerResult.layer,
      inputSources: listWebXRInputSources(sessionResult.session),
      reason: layerResult.ok ? null : layerResult.reason,
      renderMode: 'webxr-session',
    };

    renderLoop = createWebXRRenderLoop(sessionResult.session, (time, frame, session) => {
      state = {
        ...state,
        frameCount: state.frameCount + 1,
        lastFrameTime: time,
        inputSources: listWebXRInputSources(session),
      };
      onFrame?.(time, frame, snapshotState());
    });

    return { ok: true, state: snapshotState() };
  }

  async function stop() {
    renderLoop?.stop();
    renderLoop = null;
    let session = state.session;
    let ended = await endWebXRSession(session);
    state = {
      ...state,
      status: 'stopped',
      session: null,
      referenceSpace: null,
      layer: null,
      inputSources: [],
      renderMode: 'dom-fallback',
    };
    return { ok: ended, state: snapshotState() };
  }

  return {
    setScene,
    start,
    stop,
    getState: snapshotState,
    getDiagnostics(options = {}) {
      return createXRSceneDiagnostics(snapshotState(), options);
    },
  };
}
