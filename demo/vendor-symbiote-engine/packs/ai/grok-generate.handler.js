/**
 * ai/grok-generate — Image/Video generation via Grok browser automation
 *
 * Uses Chrome extension bridge to automate grok.com for:
 * - Text-to-image generation (via WebSocket injection)
 * - Image editing (reference-based generation)
 * - Image-to-video conversion
 * - Batch processing with worker pool
 *
 * Architecture:
 * - Bridge server (localhost:3333) ↔ Chrome extension (grok-bridge)
 * - SELECTORS: stable DOM selectors (aria-label preferred)
 * - ACTIONS: atomic bridge commands
 * - WORKFLOWS: composed sequences
 *
 * Ported from Mr-Computer/modules/ai-music-video/src/services/grok-*.js
 *
 * @module symbiote-engine/packs/ai/grok-generate
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

function requestSignal(timeoutMs, parentSignal) {
  let timeoutSignal = AbortSignal.timeout(timeoutMs);
  return parentSignal && AbortSignal.any
    ? AbortSignal.any([parentSignal, timeoutSignal])
    : timeoutSignal;
}

export default {
  type: 'ai/grok-generate',
  category: 'ai',
  icon: 'auto_awesome',

  driver: {
    description: 'Generate images/videos via Grok browser automation',
    inputs: [
      { name: 'prompt', type: 'string' },
      { name: 'referencePath', type: 'string' },
    ],
    outputs: [
      { name: 'result', type: 'any' },
      { name: 'error', type: 'string' },
    ],
    params: {
      operation: {
        type: 'string',
        default: 'image',
        description: 'Operation: image | image-edit | video | batch-images | batch-videos | check',
      },
      bridgeUrl: {
        type: 'string',
        default: 'http://localhost:3333',
        description: 'Bridge server URL',
      },
      outputDir: { type: 'string', default: '/tmp/grok-output', description: 'Output directory' },
      globalStyle: { type: 'string', default: '', description: 'Global style prefix for prompts' },
      filename: { type: 'string', default: '', description: 'Output filename (without extension)' },
      enableUpscale: { type: 'boolean', default: false, description: 'HD upscale for videos' },
      workerId: { type: 'string', default: '', description: 'Worker ID for multi-tab' },

      segments: { type: 'any', default: null, description: 'Segments for batch operations' },
      workers: { type: 'int', default: 1, description: 'Parallel workers for batch' },

      imagePath: { type: 'string', default: '', description: 'Source image for video gen' },
      videoPrompt: { type: 'string', default: '', description: 'Camera movement prompt for video' },
    },
  },

  lifecycle: {
    validate: (inputs, params) => {
      if (params.operation === 'check') return true;
      if (params.operation === 'image' && !inputs.prompt) return false;
      if (params.operation === 'image-edit' && (!inputs.prompt || !inputs.referencePath))
        return false;
      if (params.operation === 'video' && !params.imagePath) return false;
      return true;
    },

    cacheKey: (inputs, params) => {
      return `grok:${params.operation}:${params.filename || inputs.prompt?.substring(0, 30) || ''}`;
    },

    execute: async (inputs, params) => {
      try {
        let op = params.operation;
        let bridge = createBridgeClient(params.bridgeUrl);

        if (op === 'check') {
          let ok = await bridge.checkHealth();
          return { result: { healthy: ok }, error: null };
        }

        if (op === 'image') {
          let result = await generateImage(bridge, inputs.prompt, params);
          return { result, error: null };
        }

        if (op === 'image-edit') {
          let result = await editImage(bridge, inputs.prompt, inputs.referencePath, params);
          return { result, error: null };
        }

        if (op === 'video') {
          let result = await generateVideo(bridge, params);
          return { result, error: null };
        }

        if (op === 'batch-images') {
          let results = await batchImages(bridge, params);
          return { result: results, error: null };
        }

        if (op === 'batch-videos') {
          let results = await batchVideos(bridge, params);
          return { result: results, error: null };
        }

        return { result: null, error: `Unknown operation: ${op}` };
      } catch (err) {
        return { result: null, error: err.message };
      }
    },
  },
};


function createBridgeClient(baseUrl) {
  let sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function sendCommand(action, cmdParams = {}, timeout = 30000, workerId = null) {
    let payload = { action, params: cmdParams };
    if (workerId) payload.workerId = workerId;

    let sendRes = await fetch(`${baseUrl}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!sendRes.ok) throw new Error('Failed to send command');
    let { id } = await sendRes.json();

    let start = Date.now();
    while (Date.now() - start < timeout) {
      await sleep(500);
      try {
        let res = await fetch(`${baseUrl}/result/${id}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) continue;
        let data = await res.json();
        if (data.error && data.error !== 'Result not found or not ready') {
          throw new Error(data.error);
        }
        if (data.result !== undefined) return data.result;
      } catch (e) {
        if (e.message !== 'Result not found or not ready') {

        }
      }
    }
    throw new Error(`Timeout: ${action}`);
  }

  return {
    sendCommand,
    sleep,

    async checkHealth() {
      try {
        let res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
        return res.ok;
      } catch {
        return false;
      }
    },


    async navigate(url, workerId) {
      return sendCommand('navigate', { url }, 30000, workerId);
    },
    async waitFor(selector, timeout = 15000, workerId = null) {
      return sendCommand('waitForSelector', { selector, timeout }, timeout + 5000, workerId);
    },
    async click(selector, workerId) {
      return sendCommand('click', { selector }, 30000, workerId);
    },
    async type(selector, text, workerId) {
      return sendCommand('type', { selector, text }, 30000, workerId);
    },
    async uploadFile(base64, mimeType, filename, workerId) {
      return sendCommand('uploadFile', { base64, mimeType, filename }, 30000, workerId);
    },
    async queryAll(selector, workerId) {
      return sendCommand('querySelectorAll', { selector }, 30000, workerId);
    },
    async getAttribute(selector, attribute, workerId) {
      return sendCommand('getAttribute', { selector, attribute }, 30000, workerId);
    },
    async getPageInfo(workerId) {
      return sendCommand('getPageInfo', {}, 30000, workerId);
    },
    async refresh(workerId) {
      return sendCommand('refresh', {}, 30000, workerId);
    },


    async generateImageWS(prompt, options, workerId) {
      return sendCommand('generateImage', { prompt, options }, 90000, workerId);
    },
    async fetchImage(url, workerId) {
      return sendCommand('fetchImage', { url }, 30000, workerId);
    },
    async waitForImageComplete(timeout = 120000, workerId) {
      return sendCommand('waitForImageComplete', { timeout }, timeout + 5000, workerId);
    },


    async showZones(layer = 'all', workerId) {
      return sendCommand('showClickableZones', { layer }, 30000, workerId);
    },
    async clickZone(zone, workerId) {
      return sendCommand('clickZone', { zone }, 30000, workerId);
    },
    async hideZones(workerId) {
      return sendCommand('hideZones', {}, 30000, workerId);
    },
  };
}


const SEL = {
  promptEditor: '.tiptap.ProseMirror',
  editPrompt: '[aria-label="Введите для изменения изображения..."]',
  videoPrompt: 'textarea[aria-label="Сделать видео"]',
  imageCard: 'div.group\\/media-post-masonry-card img',
  firstImage: 'div.group\\/media-post-masonry-card:first-child img',
  video: 'video',
  downloadBtn: '[aria-label="Скачать"]',
  sendBtn: '[aria-label="Отправить"]',
  preferenceBtn: 'button:has(svg.lucide-thumbs-up)',
  moderatedContent: 'img[alt="Moderated"], svg.lucide-eye-off',
  errorToast: '[data-sonner-toast][data-type="error"]',
  hdButton: 'button .text-\\[10px\\].font-bold',
};


/**
 * Navigate to /imagine page (skip if already there)
 * @param {Object} bridge
 * @param {string} workerId
 */
async function ensureOnImagine(bridge, workerId) {
  try {
    let pageInfo = await bridge.getPageInfo(workerId);
    let url = pageInfo?.url || '';

    if (url.includes('grok.com/imagine') && !url.includes('/imagine/post/')) {
      try {
        await bridge.waitFor(SEL.promptEditor, 5000, workerId);
        return;
      } catch {
        await bridge.refresh(workerId);
        await bridge.sleep(3000);
      }
    }
  } catch {

  }

  await bridge.navigate('https://grok.com/imagine', workerId);
  await bridge.sleep(3000);
  await bridge.waitFor(SEL.promptEditor, 15000, workerId);
}

/**
 * Generate image via WebSocket (text-to-image)
 * @param {Object} bridge
 * @param {string} prompt
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function generateImage(bridge, prompt, params) {
  let { outputDir, filename, globalStyle, workerId } = params;
  let fullPrompt = globalStyle ? `${globalStyle}, ${prompt}` : prompt;

  await mkdir(outputDir, { recursive: true });


  let wsResult = await bridge.generateImageWS(fullPrompt, {}, workerId || null);

  if (!wsResult?.imageUrl) {
    throw new Error('No image URL from WebSocket generation');
  }


  let imageData = await bridge.fetchImage(wsResult.imageUrl, workerId || null);


  let outputName = filename || `grok-${Date.now()}`;
  let outputPath = path.join(outputDir, `${outputName}.png`);

  let base64Data = imageData.dataUrl.split(',')[1];
  await writeFile(outputPath, Buffer.from(base64Data, 'base64'));

  return {
    imagePath: outputPath,
    imageUrl: wsResult.imageUrl,
    prompt: fullPrompt,
  };
}

/**
 * Edit image with reference (upload + prompt)
 * @param {Object} bridge
 * @param {string} prompt
 * @param {string} referencePath
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function editImage(bridge, prompt, referencePath, params) {
  let { outputDir, filename, workerId } = params;
  await mkdir(outputDir, { recursive: true });


  await ensureOnImagine(bridge, workerId || null);


  let imageBuffer = await readFile(path.resolve(referencePath));
  let base64 = imageBuffer.toString('base64');
  let ext = path.extname(referencePath).toLowerCase();
  let mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

  await bridge.uploadFile(base64, mimeType, `image${ext}`, workerId || null);
  await bridge.sleep(2000);


  await bridge.waitFor(SEL.editPrompt, 15000, workerId || null);
  await bridge.type(SEL.editPrompt, prompt, workerId || null);


  await bridge.click(SEL.sendBtn, workerId || null);


  let wsResult = await bridge.waitForImageComplete(120000, workerId || null);

  if (!wsResult?.firstUrl) {
    throw new Error('No image from edit generation');
  }


  let imageData = await bridge.fetchImage(wsResult.firstUrl, workerId || null);
  let outputName = filename || `grok-edit-${Date.now()}`;
  let outputPath = path.join(outputDir, `${outputName}.png`);

  let base64Data = imageData.dataUrl.split(',')[1];
  await writeFile(outputPath, Buffer.from(base64Data, 'base64'));

  return { imagePath: outputPath, imageUrl: wsResult.firstUrl };
}

/**
 * Generate video from image (image-to-video)
 * @param {Object} bridge
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function generateVideo(bridge, params) {
  let { imagePath, videoPrompt, outputDir, filename, enableUpscale, workerId } = params;
  await mkdir(outputDir, { recursive: true });


  await ensureOnImagine(bridge, workerId || null);


  let imageBuffer = await readFile(path.resolve(imagePath));
  let base64 = imageBuffer.toString('base64');
  let ext = path.extname(imagePath).toLowerCase();
  let mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

  await bridge.uploadFile(base64, mimeType, `image${ext}`, workerId || null);
  await bridge.sleep(3000);


  if (videoPrompt) {
    await bridge.waitFor(SEL.videoPrompt, 15000, workerId || null);
    await bridge.type(SEL.videoPrompt, videoPrompt, workerId || null);
    await bridge.sleep(500);
  }


  await bridge.showZones('all', workerId || null);
  await bridge.sleep(500);


  await bridge.click(SEL.sendBtn, workerId || null);
  try {
    await bridge.hideZones(workerId || null);
  } catch {

  }


  let videoUrl = await waitForVideo(bridge, 90000, workerId || null);


  let outputName = filename || `grok-video-${Date.now()}`;
  let outputPath = path.join(outputDir, `${outputName}.mp4`);

  let videoResponse = await fetch(videoUrl, {
    signal: requestSignal(120000, params.signal),
  });
  if (!videoResponse.ok) throw new Error(`Failed to download video: ${videoResponse.status}`);
  let buffer = await videoResponse.arrayBuffer();
  await writeFile(outputPath, Buffer.from(buffer));

  let result = { videoPath: outputPath, videoUrl };


  if (enableUpscale) {
    try {
      await triggerUpscale(bridge, workerId || null);
      let hdUrl = await waitForHD(bridge, 120000, workerId || null, videoUrl);

      let hdPath = path.join(outputDir, `${outputName}_hd.mp4`);
      let hdResponse = await fetch(hdUrl, {
        signal: requestSignal(120000, params.signal),
      });
      if (hdResponse.ok) {
        let hdBuffer = await hdResponse.arrayBuffer();
        await writeFile(hdPath, Buffer.from(hdBuffer));
        result.hdVideoPath = hdPath;
        result.hdVideoUrl = hdUrl;
      }
    } catch (e) {
      result.upscaleError = e.message;
    }
  }

  return result;
}


/**
 * Wait for video element with mp4 src
 * @param {Object} bridge
 * @param {number} timeout
 * @param {string} workerId
 * @param {string} prevUrl
 * @returns {Promise<string>}
 */
async function waitForVideo(bridge, timeout = 90000, workerId = null, prevUrl = null) {
  let start = Date.now();

  while (Date.now() - start < timeout) {
    await bridge.sleep(3000);


    try {
      let errors = await bridge.queryAll(SEL.errorToast, workerId);
      if (errors.count > 0) throw new Error('RATE_LIMIT_REACHED');
    } catch (e) {
      if (e.message === 'RATE_LIMIT_REACHED') throw e;
    }


    try {
      let moderated = await bridge.queryAll(SEL.moderatedContent, workerId);
      if (moderated.count > 0) throw new Error('CONTENT_MODERATED');
    } catch (e) {
      if (e.message === 'CONTENT_MODERATED') throw e;
    }


    try {
      let prefs = await bridge.queryAll(SEL.preferenceBtn, workerId);
      if (prefs.count >= 2) {
        await bridge.refresh(workerId);
        await bridge.sleep(3000);
        continue;
      }
    } catch {

    }


    try {
      let result = await bridge.getAttribute(SEL.video, 'src', workerId);
      let videoUrl = result.value;
      if (videoUrl?.includes('.mp4')) {
        if (prevUrl && videoUrl === prevUrl) continue;
        return videoUrl;
      }
    } catch {

    }
  }

  throw new Error('Timeout waiting for video');
}

/**
 * Trigger HD upscale via menu
 * @param {Object} bridge
 * @param {string} workerId
 */
async function triggerUpscale(bridge, workerId) {
  await bridge.showZones('all', workerId);
  await bridge.sleep(500);

  try {
    await bridge.click('[aria-label="Больше опций"]', workerId);
    await bridge.sleep(1000);

    await bridge.click('[role="menuitem"]:nth-child(5)', workerId);
  } catch {

    await bridge.sendCommand('clickByText', { text: 'Улучшить' }, 30000, workerId);
  }
  try {
    await bridge.hideZones(workerId);
  } catch {

  }
}

/**
 * Wait for HD video after upscale
 * @param {Object} bridge
 * @param {number} timeout
 * @param {string} workerId
 * @param {string} sdUrl
 * @returns {Promise<string>}
 */
async function waitForHD(bridge, timeout = 120000, workerId = null, sdUrl = null) {
  let start = Date.now();
  let lastError = null;

  while (Date.now() - start < timeout) {
    await bridge.sleep(3000);

    try {
      let hdExists = null;
      try {
        hdExists = await bridge.waitFor(SEL.hdButton, 5000, workerId);
      } catch (error) {
        lastError = error;
      }

      if (hdExists) {
        let result = await bridge.getAttribute(SEL.video, 'src', workerId);
        if (result.value?.includes('.mp4')) return result.value;
      }

      if (sdUrl) {
        let result = await bridge.getAttribute(SEL.video, 'src', workerId);
        if (result.value?.includes('.mp4') && result.value !== sdUrl) return result.value;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Timeout waiting for HD video${lastError ? `. Last error: ${lastError.message}` : ''}`,
  );
}


/**
 * Batch image generation
 * @param {Object} bridge
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function batchImages(bridge, params) {
  let { segments, outputDir } = params;
  let results = {};
  await mkdir(outputDir, { recursive: true });

  for (const seg of segments) {
    try {
      let result = await generateImage(bridge, seg.prompt || seg.text, {
        ...params,
        filename: seg.promptId || seg.id,
      });
      results[seg.promptId || seg.id] = result.imagePath;
    } catch (e) {
      console.error(`🔴 [GrokBatch] Image failed: ${seg.promptId} - ${e.message}`);
      results[seg.promptId || seg.id] = null;
    }
  }

  return {
    total: segments.length,
    success: Object.values(results).filter(Boolean).length,
    results,
  };
}

/**
 * Batch video generation
 * @param {Object} bridge
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function batchVideos(bridge, params) {
  let { segments, outputDir } = params;
  let results = {};
  await mkdir(outputDir, { recursive: true });

  for (const seg of segments) {
    if (!seg.imagePath) continue;

    try {
      let result = await generateVideo(bridge, {
        ...params,
        imagePath: seg.imagePath,
        videoPrompt: seg.videoPrompt || seg.cameraPrompt || '',
        filename: seg.promptId || seg.id,
      });
      results[seg.promptId || seg.id] = result.videoPath;
    } catch (e) {
      console.error(`🔴 [GrokBatch] Video failed: ${seg.promptId} - ${e.message}`);
      results[seg.promptId || seg.id] = null;
    }
  }

  return {
    total: segments.length,
    success: Object.values(results).filter(Boolean).length,
    results,
  };
}
