/**
 * WebSocket Command Injector for Grok Bridge
 * Injects into page context to access Grok's WebSocket connections
 * Can send commands and receive results via the existing WS connection
 */
/* global window */

(function () {
  'use strict';

  const INJECTOR_ID = 'grok-ws-injector';
  if (window[INJECTOR_ID]) return;
  window[INJECTOR_ID] = true;

  console.log('[WS-Injector] Initializing...');


  let activeConnections = new Map();


  let OriginalWebSocket = window.WebSocket;
  let messages = [];

  /**
   * Report message to extension
   */
  function report(dir, url, data) {
    let msg = {
      timestamp: Date.now(),
      direction: dir,
      url,
      data: typeof data === 'string' ? data : '[Binary]',
      dataType: typeof data,
    };
    messages.push(msg);
    if (messages.length > 100) messages.shift();

    let icon = dir === 'send' ? '↑' : '↓';
    let preview = typeof data === 'string' ? data.substring(0, 80) : '[binary]';
    console.log(`[WS] ${icon} ${url.substring(0, 50)}`, preview);

    window.dispatchEvent(new CustomEvent('grok-ws-message', { detail: msg }));
  }

  /**
   * Wrapped WebSocket constructor
   */
  window.WebSocket = function (url, protocols) {
    console.log('[WS-Injector] New connection:', url);

    let ws = protocols ? new OriginalWebSocket(url, protocols) : new OriginalWebSocket(url);


    if (url.includes('/ws/imagine/')) {
      let connId = Date.now().toString();
      activeConnections.set(connId, { ws, url, createdAt: Date.now() });
      console.log(`[WS-Injector] Stored imagine connection: ${connId}`);

      ws.addEventListener('close', () => {
        activeConnections.delete(connId);
        console.log(`[WS-Injector] Removed connection: ${connId}`);
      });
    }


    let origSend = ws.send.bind(ws);
    ws.send = function (data) {
      report('send', url, data);
      return origSend(data);
    };


    ws.addEventListener('message', function (e) {
      report('receive', url, e.data);
    });

    return ws;
  };


  window.WebSocket.prototype = OriginalWebSocket.prototype;
  window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
  window.WebSocket.OPEN = OriginalWebSocket.OPEN;
  window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
  window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;

  /**
   * Get all captured messages
   */
  window.getGrokWebSocketMessages = function () {
    return [...messages];
  };

  /**
   * Clear captured messages
   */
  window.clearGrokWebSocketMessages = function () {
    messages.length = 0;
  };

  /**
   * Get active WebSocket connections
   */
  window.getGrokWebSocketConnections = function () {
    let result = [];
    activeConnections.forEach((conn, id) => {
      result.push({
        id,
        url: conn.url,
        readyState: conn.ws.readyState,
        createdAt: conn.createdAt,
      });
    });
    return result;
  };

  /**
   * Ensure there's an active imagine WebSocket connection
   * Creates one if it doesn't exist
   * @returns {Promise<WebSocket>} Active WebSocket
   */
  window.ensureImagineWebSocket = function () {
    return new Promise((resolve, reject) => {

      let existingWs = null;
      activeConnections.forEach((conn) => {
        if (conn.url.includes('/ws/imagine/listen') && conn.ws.readyState === 1) {
          existingWs = conn.ws;
        }
      });

      if (existingWs) {
        console.log('[WS-Injector] Using existing WebSocket connection');
        resolve(existingWs);
        return;
      }

      console.log('[WS-Injector] Creating new WebSocket connection...');


      let ws = new WebSocket('wss://grok.com/ws/imagine/listen');

      ws.onopen = () => {
        console.log('[WS-Injector] New WebSocket connection opened');
        resolve(ws);
      };

      ws.onerror = (err) => {
        console.error('[WS-Injector] WebSocket connection failed:', err);
        reject(new Error('Failed to create WebSocket connection'));
      };


      setTimeout(() => {
        if (ws.readyState !== 1) {
          ws.close();
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  };

  /**
   * Send message through active imagine WebSocket
   * @param {object} message - Message to send (will be JSON stringified)
   * @param {string} ourRequestId - Our request ID to track this generation
   * @returns {Promise<object>} - Response from server
   */
  window.sendGrokImagineMessage = function (message, ourRequestId) {
    return new Promise((resolve, reject) => {

      let imagineWs = null;
      activeConnections.forEach((conn) => {
        if (conn.url.includes('/ws/imagine/listen') && conn.ws.readyState === 1) {
          imagineWs = conn.ws;
        }
      });

      if (!imagineWs) {
        reject(new Error('No active imagine WebSocket connection'));
        return;
      }

      console.log(`[WS-Injector] Sending message, waiting for completed response`);


      let timeout = setTimeout(() => {
        imagineWs.removeEventListener('message', handler);
        reject(new Error('Timeout waiting for response (60s)'));
      }, 60000);

      let results = [];
      let finalResult = null;

      function handler(event) {
        try {
          let data = JSON.parse(event.data);


          if (data.type === 'json') {
            results.push(data);
          }


          if (data.type === 'image' && data.url && data.percentage_complete === 100) {
            if (!finalResult) {
              finalResult = data;
              clearTimeout(timeout);
              imagineWs.removeEventListener('message', handler);
              console.log(`[WS-Injector] Final image ready: ${data.job_id}`);
              console.log(`[WS-Injector] URL: ${data.url}`);
              resolve({
                ourRequestId,
                results,
                lastResult: data,
                finalUrl: data.url,
              });
            }
          }
        } catch (parseError) {
          if (typeof event.data === 'string') {
            console.debug('[WS-Injector] Ignored non-JSON message:', parseError.message);
          }
        }
      }

      imagineWs.addEventListener('message', handler);


      imagineWs.send(JSON.stringify(message));
    });
  };

  /**
   * Wait for image generation to complete (passive listener)
   * Used after triggering generation via UI (edit mode)
   * @param {number} timeout - Max wait time in ms
   * @returns {Promise<object>} - Final image data with URL
   */
  window.waitForImageComplete = function (timeout = 120000) {
    return new Promise((resolve, reject) => {

      let imagineWs = null;
      activeConnections.forEach((conn) => {
        if (conn.url.includes('/ws/imagine/listen') && conn.ws.readyState === 1) {
          imagineWs = conn.ws;
        }
      });

      if (!imagineWs) {
        reject(new Error('No active imagine WebSocket connection'));
        return;
      }

      console.log('[WS-Injector] Waiting for image completion...');

      let timeoutId = setTimeout(() => {
        imagineWs.removeEventListener('message', handler);
        reject(new Error('Timeout waiting for image completion'));
      }, timeout);

      let completedImages = [];

      function handler(event) {
        try {
          let data = JSON.parse(event.data);


          if (data.type === 'image' && data.url && data.percentage_complete === 100) {
            completedImages.push(data);
            console.log(
              `[WS-Injector] Image complete: ${data.job_id} (${completedImages.length} total)`,
            );


            setTimeout(() => {
              clearTimeout(timeoutId);
              imagineWs.removeEventListener('message', handler);
              console.log(`[WS-Injector] All images ready: ${completedImages.length}`);
              resolve({
                images: completedImages,
                firstUrl: completedImages[0]?.url,
                count: completedImages.length,
              });
            }, 2000);
          }
        } catch (parseError) {
          if (typeof event.data === 'string') {
            console.debug('[WS-Injector] Ignored non-JSON message:', parseError.message);
          }
        }
      }

      imagineWs.addEventListener('message', handler);
    });
  };

  /**
   * Generate image via WebSocket
   * @param {string} prompt - Image prompt
   * @param {object} options - Generation options
   * @returns {Promise<object>} - Generation result
   */
  window.generateGrokImage = async function (prompt, options = {}) {
    let { aspectRatio = '2:3', enableNsfw = true, skipUpsampler = false } = options;

    let requestId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;


    let imagineWs = await window.ensureImagineWebSocket();


    let resetMsg = {
      type: 'conversation.item.create',
      timestamp: Date.now(),
      item: {
        type: 'message',
        content: [{ type: 'reset' }],
      },
    };

    imagineWs.send(JSON.stringify(resetMsg));
    console.log('[WS-Injector] Sent reset');


    await new Promise((r) => setTimeout(r, 100));

    let promptMsg = {
      type: 'conversation.item.create',
      timestamp: Date.now(),
      item: {
        type: 'message',
        content: [
          {
            requestId,
            text: prompt,
            type: 'input_text',
            properties: {
              section_count: 0,
              is_kids_mode: false,
              enable_nsfw: enableNsfw,
              skip_upsampler: skipUpsampler,
              is_initial: false,
              aspect_ratio: aspectRatio,
            },
          },
        ],
      },
    };

    console.log(`[WS-Injector] Generating image: "${prompt}" (${requestId})`);

    return window.sendGrokImagineMessage(promptMsg, requestId);
  };


  window.addEventListener('grok-generate-command', async (event) => {
    let { prompt, options, commandId } = event.detail;

    try {
      console.log(`[WS-Injector] Received generate command: ${commandId}`);
      let result = await window.generateGrokImage(prompt, options);


      window.dispatchEvent(
        new CustomEvent('grok-generate-result', {
          detail: {
            commandId,
            success: true,
            result: {
              jobId: result.lastResult?.job_id,
              imageId: result.lastResult?.image_id,
              prompt: result.lastResult?.prompt,
              fullPrompt: result.lastResult?.full_prompt,
              modelName: result.lastResult?.model_name,
              imageUrl: result.finalUrl || result.lastResult?.url,
              previewCount: result.imageBlobs?.length || 0,
            },
          },
        }),
      );
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent('grok-generate-result', {
          detail: {
            commandId,
            success: false,
            error: error.message,
          },
        }),
      );
    }
  });


  window.addEventListener('grok-wait-image-command', async (event) => {
    let { commandId, timeout } = event.detail;

    try {
      console.log(`[WS-Injector] Waiting for image completion: ${commandId}`);
      let result = await window.waitForImageComplete(timeout || 120000);

      window.dispatchEvent(
        new CustomEvent('grok-wait-image-result', {
          detail: {
            commandId,
            success: true,
            result,
          },
        }),
      );
    } catch (error) {
      window.dispatchEvent(
        new CustomEvent('grok-wait-image-result', {
          detail: {
            commandId,
            success: false,
            error: error.message,
          },
        }),
      );
    }
  });


  let originalFetch = window.fetch;
  let fetchLogs = [];

  window.fetch = async function (input, init = {}) {
    let url = typeof input === 'string' ? input : input.url;
    let method = init.method || 'GET';


    if (url.includes('/api/') || url.includes('/rest/') || url.includes('imagine')) {
      let logEntry = {
        timestamp: Date.now(),
        url,
        method,
        body: null,
      };


      if (init.body) {
        try {
          if (typeof init.body === 'string') {
            logEntry.body = init.body.substring(0, 2000);
          } else if (init.body instanceof FormData) {
            logEntry.body = '[FormData]';
            logEntry.formData = {};
            for (const [key, value] of init.body.entries()) {
              logEntry.formData[key] = value instanceof File ? `[File: ${value.name}]` : value;
            }
          }
        } catch (e) {
          console.warn('[WS-Injector] Failed to capture fetch body:', e.message);
        }
      }

      fetchLogs.push(logEntry);
      if (fetchLogs.length > 50) fetchLogs.shift();

      console.log(
        `[Fetch] ${method} ${url.substring(0, 80)}`,
        logEntry.body ? logEntry.body.substring(0, 100) : '',
      );


      window.dispatchEvent(new CustomEvent('grok-fetch', { detail: logEntry }));
    }

    return originalFetch.apply(this, arguments);
  };


  window.getGrokFetchLogs = function () {
    return fetchLogs;
  };


  window.grokImageToVideo = async function (params) {
    let { assetId, assetUrl, prompt, mode, aspectRatio, videoLength } = params;

    let message = `${assetUrl} ${prompt || ''} --mode=${mode || 'normal'}`.trim();

    let response = await originalFetch('https://grok.com/rest/app-chat/conversations/new', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        temporary: true,
        modelName: 'grok-3',
        message,
        fileAttachments: [assetId],
        toolOverrides: { videoGen: true },
        enableSideBySide: true,
        responseMetadata: {
          experiments: [],
          modelConfigOverride: {
            modelMap: {
              videoGenModelConfig: {
                parentPostId: assetId,
                aspectRatio: aspectRatio || '2:3',
                videoLength: videoLength || 6,
                isVideoEdit: false,
              },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      let errBody = await response.text();
      throw new Error(`Video gen failed: ${response.status} - ${errBody}`);
    }

    return await response.json();
  };

  window.grokUpscaleVideo = async function (videoId) {
    let response = await originalFetch('https://grok.com/rest/media/video/upscale', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId }),
    });

    if (!response.ok) {
      let errBody = await response.text();
      throw new Error(`Upscale failed: ${response.status} - ${errBody}`);
    }

    return await response.json();
  };


  window.addEventListener('grok-video-command', async (event) => {
    let { action, params, commandId } = event.detail;

    try {
      let result;

      if (action === 'imageToVideo') {
        console.log('[WS-Injector] Starting video generation...');
        result = await window.grokImageToVideo(params);
      } else if (action === 'upscaleVideo') {
        console.log('[WS-Injector] Starting upscale...');
        result = await window.grokUpscaleVideo(params.videoId);
      }

      window.dispatchEvent(
        new CustomEvent('grok-video-result', {
          detail: { commandId, success: true, result },
        }),
      );
    } catch (error) {
      console.error('[WS-Injector] Video command error:', error);
      window.dispatchEvent(
        new CustomEvent('grok-video-result', {
          detail: { commandId, success: false, error: error.message },
        }),
      );
    }
  });

  console.log('[WS-Injector] Ready!');
  console.log('[WS-Injector] API: generateGrokImage(prompt, {aspectRatio, enableNsfw})');
  console.log(
    '[WS-Injector] API: grokImageToVideo({assetId, assetUrl, prompt, mode, aspectRatio, videoLength})',
  );
  console.log('[WS-Injector] API: grokUpscaleVideo(videoId)');
  console.log('[WS-Injector] API: getGrokWebSocketConnections()');
  console.log('[WS-Injector] API: getGrokWebSocketMessages()');
  console.log('[WS-Injector] API: getGrokFetchLogs()');
})();
