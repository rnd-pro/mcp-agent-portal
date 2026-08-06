import { createXRPanelTextureQualitySummary } from './layout-projection.js';

const VERTEX_SHADER = `
attribute vec3 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
uniform mat4 u_matrix;

void main() {
  gl_Position = u_matrix * vec4(a_position, 1.0);
  v_texCoord = a_texCoord;
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_texture;

void main() {
  gl_FragColor = texture2D(u_texture, v_texCoord);
}
`;

function hasFn(source, name) {
  return typeof source?.[name] === 'function';
}

function createShader(gl, type, source) {
  let shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (hasFn(gl, 'getShaderParameter') && !gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    let message = hasFn(gl, 'getShaderInfoLog') ? gl.getShaderInfoLog(shader) : '';
    throw new Error(`XR WebGL shader compile failed: ${message}`);
  }
  return shader;
}

function createProgram(gl) {
  let vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  let fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  let program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (hasFn(gl, 'getProgramParameter') && !gl.getProgramParameter(program, gl.LINK_STATUS)) {
    let message = hasFn(gl, 'getProgramInfoLog') ? gl.getProgramInfoLog(program) : '';
    throw new Error(`XR WebGL program link failed: ${message}`);
  }
  return program;
}

function createTexture(gl, color = [46, 49, 55, 255]) {
  let texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri?.(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri?.(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri?.(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri?.(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D?.(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array(color),
  );
  return texture;
}

function degreesToRadians(value) {
  return Number(value || 0) * Math.PI / 180;
}

function multiplyMatrix(a, b) {
  let out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[0 * 4 + row] * b[column * 4 + 0] +
        a[1 * 4 + row] * b[column * 4 + 1] +
        a[2 * 4 + row] * b[column * 4 + 2] +
        a[3 * 4 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function identityMatrix() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

function translationMatrix([x = 0, y = 0, z = 0] = []) {
  let out = identityMatrix();
  out[12] = Number(x || 0);
  out[13] = Number(y || 0);
  out[14] = Number(z || 0);
  return out;
}

function rotationXMatrix(radians) {
  let c = Math.cos(radians);
  let s = Math.sin(radians);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1,
  ]);
}

function rotationYMatrix(radians) {
  let c = Math.cos(radians);
  let s = Math.sin(radians);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ]);
}

function rotationZMatrix(radians) {
  let c = Math.cos(radians);
  let s = Math.sin(radians);
  return new Float32Array([
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

function panelModelMatrix(panel) {
  let rotation = Array.isArray(panel?.rotation) ? panel.rotation : [0, 0, 0];
  let model = translationMatrix(Array.isArray(panel?.position) ? panel.position : [0, 0, -1.6]);
  model = multiplyMatrix(model, rotationZMatrix(degreesToRadians(rotation[2])));
  model = multiplyMatrix(model, rotationYMatrix(degreesToRadians(rotation[1])));
  model = multiplyMatrix(model, rotationXMatrix(degreesToRadians(rotation[0])));
  return model;
}

function viewProjectionMatrix(view) {
  let projection = view?.projectionMatrix;
  let inverseView = view?.transform?.inverse?.matrix;
  if (!projection || !inverseView) return null;
  return multiplyMatrix(projection, inverseView);
}

function getPanelRect(panel, index, total) {
  let rect = panel?.relativeRect;
  if (rect) {
    let margin = 0.05;
    let width = Math.max(0.12, Number(rect.width || 0.25) * (2 - margin * 2));
    let height = Math.max(0.12, Number(rect.height || 0.25) * (2 - margin * 2));
    return {
      left: -1 + margin + Number(rect.x || 0) * (2 - margin * 2),
      top: 1 - margin - Number(rect.y || 0) * (2 - margin * 2),
      width,
      height,
    };
  }

  let columns = Math.min(2, Math.max(1, Math.ceil(Math.sqrt(total || 1))));
  let rows = Math.max(1, Math.ceil((total || 1) / columns));
  let column = index % columns;
  let row = Math.floor(index / columns);
  let gap = 0.08;
  let width = (2 - gap * (columns + 1)) / columns;
  let height = (2 - gap * (rows + 1)) / rows;
  return {
    left: -1 + gap + column * (width + gap),
    top: 1 - gap - row * (height + gap),
    width,
    height,
  };
}

function verticesForRect(rect) {
  let x1 = rect.left;
  let x2 = rect.left + rect.width;
  let y1 = rect.top;
  let y2 = rect.top - rect.height;
  return new Float32Array([
    x1, y1, 0, 0, 0,
    x2, y1, 0, 1, 0,
    x1, y2, 0, 0, 1,
    x1, y2, 0, 0, 1,
    x2, y1, 0, 1, 0,
    x2, y2, 0, 1, 1,
  ]);
}

function verticesForPanel(panel) {
  let width = Math.max(0.05, Number(panel?.size?.[0] || 0.6));
  let height = Math.max(0.05, Number(panel?.size?.[1] || 0.4));
  let x1 = -width / 2;
  let x2 = width / 2;
  let y1 = height / 2;
  let y2 = -height / 2;
  return new Float32Array([
    x1, y1, 0, 0, 0,
    x2, y1, 0, 1, 0,
    x1, y2, 0, 0, 1,
    x1, y2, 0, 0, 1,
    x2, y1, 0, 1, 0,
    x2, y2, 0, 1, 1,
  ]);
}

function getViewport(layer, view, fallback) {
  if (view && hasFn(layer, 'getViewport')) {
    let viewport = layer.getViewport(view);
    if (viewport) return viewport;
  }
  return fallback;
}

function getViews(frame, referenceSpace) {
  let pose = referenceSpace && hasFn(frame, 'getViewerPose')
    ? frame.getViewerPose(referenceSpace)
    : null;
  return Array.isArray(pose?.views) && pose.views.length ? pose.views : [null];
}

export function createXRWebGLLayerPanelRenderer(options = {}) {
  let htmlCanvasRenderer = options.htmlCanvasRenderer || null;
  let requireTextureUpload = Boolean(options.requireTextureUpload);
  let texturePixelRatio = Number(options.texturePixelRatio || 1);
  let program = null;
  let buffer = null;
  let positionLocation = -1;
  let texCoordLocation = -1;
  let textureLocation = null;
  let matrixLocation = null;
  let textures = new Map();
  let lastFrame = null;

  function ensure(gl) {
    if (program) return true;
    if (!gl || !hasFn(gl, 'createProgram') || !hasFn(gl, 'createTexture')) return false;
    program = createProgram(gl);
    buffer = gl.createBuffer();
    positionLocation = gl.getAttribLocation(program, 'a_position');
    texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
    textureLocation = gl.getUniformLocation?.(program, 'u_texture') || null;
    matrixLocation = gl.getUniformLocation?.(program, 'u_matrix') || null;
    return true;
  }

  function textureFor(gl, panelId) {
    if (!textures.has(panelId)) {
      textures.set(panelId, createTexture(gl));
    }
    return textures.get(panelId);
  }

  function drawPanel(gl, panel, index, total, viewProjection) {
    let texture = textureFor(gl, panel.id);
    gl.activeTexture?.(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    let upload;
    try {
      upload = htmlCanvasRenderer?.renderPanel?.(panel.id, gl, {
        target: gl.TEXTURE_2D,
      }) || { rendered: false, reason: 'missing-html-canvas-renderer' };
    } catch (error) {
      upload = {
        rendered: false,
        mode: 'webgl',
        reason: error?.name || 'texture-upload-failed',
        message: error?.message || '',
      };
    }
    let usesFallbackTexture = !upload.rendered;
    if (usesFallbackTexture && requireTextureUpload) {
      return {
        ...upload,
        rendered: false,
        textured: false,
        fallbackTexture: false,
        strictTextureUpload: true,
      };
    }

    let vertices = viewProjection ? verticesForPanel(panel) : verticesForRect(getPanelRect(panel, index, total));
    let matrix = viewProjection
      ? multiplyMatrix(viewProjection, panelModelMatrix(panel))
      : identityMatrix();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW || gl.DYNAMIC_DRAW);
    if (textureLocation) gl.uniform1i?.(textureLocation, 0);
    if (matrixLocation) gl.uniformMatrix4fv?.(matrixLocation, false, matrix);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 20, 12);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return {
      ...upload,
      rendered: true,
      textured: !usesFallbackTexture,
      fallbackTexture: usesFallbackTexture,
      strictTextureUpload: requireTextureUpload,
      quality: createXRPanelTextureQualitySummary(panel, {
        texturePixelRatio,
        textureWidth: upload.textureWidth,
        textureHeight: upload.textureHeight,
      }),
    };
  }

  function renderFrame({ gl, layer, frame, referenceSpace, scene } = {}) {
    let panels = Array.isArray(scene?.panels) ? scene.panels : [];
    if (!gl || !layer || !panels.length || !ensure(gl)) {
      lastFrame = {
        rendered: false,
        reason: !gl ? 'missing-gl' : !layer ? 'missing-layer' : !panels.length ? 'missing-panels' : 'renderer-init-failed',
        panelCount: panels.length,
      };
      return lastFrame;
    }

    if (hasFn(gl, 'bindFramebuffer')) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
    }
    gl.useProgram(program);
    gl.disable?.(gl.DEPTH_TEST);
    gl.enable?.(gl.BLEND);
    gl.blendFunc?.(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let fallbackViewport = {
      x: 0,
      y: 0,
      width: Number(layer.framebufferWidth || gl.drawingBufferWidth || 0),
      height: Number(layer.framebufferHeight || gl.drawingBufferHeight || 0),
    };
    let views = getViews(frame, referenceSpace);
    let uploads = [];
    let viewports = [];

    for (let view of views) {
      let viewport = getViewport(layer, view, fallbackViewport);
      let normalizedViewport = {
        x: Number(viewport.x || 0),
        y: Number(viewport.y || 0),
        width: Number(viewport.width || fallbackViewport.width),
        height: Number(viewport.height || fallbackViewport.height),
      };
      viewports.push(normalizedViewport);
      gl.viewport?.(normalizedViewport.x, normalizedViewport.y, normalizedViewport.width, normalizedViewport.height);
      if (gl.SCISSOR_TEST != null) gl.enable?.(gl.SCISSOR_TEST);
      gl.scissor?.(normalizedViewport.x, normalizedViewport.y, normalizedViewport.width, normalizedViewport.height);
      gl.clearColor?.(0, 0, 0, 0);
      gl.clear?.(gl.COLOR_BUFFER_BIT);
      let viewProjection = viewProjectionMatrix(view);
      panels.forEach((panel, index) => {
        try {
          uploads.push({ panelId: panel.id, worldSpace: Boolean(viewProjection), ...drawPanel(gl, panel, index, panels.length, viewProjection) });
        } catch (error) {
          uploads.push({
            panelId: panel.id,
            rendered: false,
            mode: 'webgl',
            reason: error?.name || 'panel-render-failed',
            message: error?.message || '',
          });
        }
      });
    }

    lastFrame = {
      rendered: uploads.some((item) => item.rendered),
      viewCount: views.length,
      panelCount: panels.length,
      renderedPanels: uploads.filter((item) => item.rendered).length,
      texturedPanels: uploads.filter((item) => item.textured).length,
      strictTextureUpload: requireTextureUpload,
      viewports,
      textureQuality: uploads
        .filter((item) => item.quality)
        .map((item) => item.quality),
      lowQualityPanels: uploads
        .filter((item) => item.quality?.status === 'low')
        .map((item) => item.panelId),
      fallbackPanels: uploads.filter((item) => item.fallbackTexture).map((item) => ({
        panelId: item.panelId,
        reason: item.reason || 'render-failed',
        message: item.message || '',
      })),
      failedPanels: uploads.filter((item) => !item.rendered).map((item) => ({
        panelId: item.panelId,
        reason: item.reason || 'render-failed',
        message: item.message || '',
      })),
      space: uploads.some((item) => item.worldSpace) ? 'world' : 'clip',
    };
    return lastFrame;
  }

  return {
    renderFrame,
    getState() {
      return {
        preparedTextures: textures.size,
        lastFrame,
      };
    },
  };
}
