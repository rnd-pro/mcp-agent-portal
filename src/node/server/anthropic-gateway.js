import { randomUUID } from 'node:crypto';
import { readConfig } from '../config-store.js';

const DEFAULT_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'];

function parseBody(req, maxBytes = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > maxBytes) {
        req.destroy(new Error('Payload Too Large'));
        reject(new Error('Payload Too Large'));
      }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (err) { reject(err); }
    });
  });
}

function getGatewayConfig() {
  let config = readConfig();
  let gateway = config.anthropicGateway || config.settings?.anthropicGateway || {};
  let providers = gateway.providers || {};

  if (!providers.deepseek) {
    providers.deepseek = {
      type: 'openai-compatible',
      baseUrl: 'https://api.deepseek.com',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      models: DEFAULT_MODELS,
    };
  }

  return {
    enabled: gateway.enabled !== false,
    authToken: gateway.authToken || process.env.ANTHROPIC_GATEWAY_AUTH_TOKEN || null,
    defaultModel: gateway.defaultModel || 'deepseek-v4-flash',
    plannerModel: gateway.plannerModel || 'deepseek-v4-pro',
    providers,
    aliases: {
      haiku: gateway.defaultModel || 'deepseek-v4-flash',
      sonnet: gateway.defaultModel || 'deepseek-v4-flash',
      opus: gateway.plannerModel || 'deepseek-v4-pro',
      ...(gateway.aliases || {}),
    },
  };
}

function isAuthorized(req, config) {
  if (!config.authToken) return true;
  let header = req.headers.authorization || req.headers['x-api-key'] || '';
  let token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
  return token === config.authToken;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function anthropicError(res, status, message, type = 'invalid_request_error') {
  sendJson(res, status, {
    type: 'error',
    error: { type, message },
  });
}

function normalizePath(baseUrl, suffix) {
  let base = baseUrl.replace(/\/+$/, '');
  return `${base}${suffix}`;
}

function isAnthropicProvider(provider) {
  return provider?.type === 'anthropic' || provider?.type === 'anthropic-compatible';
}

function resolveModel(requestedModel, config) {
  let model = requestedModel || config.defaultModel;
  let lower = model.toLowerCase();
  for (let [alias, target] of Object.entries(config.aliases)) {
    if (lower.includes(alias)) {
      model = target;
      break;
    }
  }

  for (let [id, provider] of Object.entries(config.providers)) {
    let models = provider.models || [];
    if (models.includes(model)) return { providerId: id, provider, upstreamModel: model, model };
    if (model.startsWith(`${id}/`)) {
      return { providerId: id, provider, upstreamModel: model.slice(id.length + 1), model };
    }
  }

  let [providerId, provider] = Object.entries(config.providers)[0] || [];
  return { providerId, provider, upstreamModel: model, model };
}

function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(block => block.type === 'text')
    .map(block => block.text || '')
    .join('\n');
}

function convertMessages(messages = []) {
  let out = [];

  for (let message of messages) {
    let content = message.content;
    if (typeof content === 'string') {
      out.push({ role: message.role, content });
      continue;
    }

    if (!Array.isArray(content)) {
      out.push({ role: message.role, content: '' });
      continue;
    }

    if (message.role === 'assistant') {
      let text = textFromContent(content);
      let toolCalls = content
        .filter(block => block.type === 'tool_use')
        .map(block => ({
          id: block.id || `toolu_${randomUUID().replaceAll('-', '')}`,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input || {}),
          },
        }));
      out.push({
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    let textBlocks = content.filter(block => block.type === 'text');
    if (textBlocks.length > 0) {
      out.push({ role: message.role, content: textBlocks.map(block => block.text || '').join('\n') });
    }

    for (let block of content.filter(block => block.type === 'tool_result')) {
      out.push({
        role: 'tool',
        tool_call_id: block.tool_use_id,
        content: typeof block.content === 'string' ? block.content : textFromContent(block.content),
      });
    }
  }

  return out;
}

function convertTools(tools = []) {
  return dedupeTools(tools).map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.input_schema || { type: 'object', properties: {} },
    },
  }));
}

function dedupeTools(tools = []) {
  let seen = new Set();
  let out = [];
  for (let tool of tools || []) {
    if (!tool?.name) continue;
    if (seen.has(tool.name)) continue;
    seen.add(tool.name);
    out.push(tool);
  }
  return out;
}

function sanitizeAnthropicBody(body = {}) {
  if (!Array.isArray(body.tools)) return body;
  return { ...body, tools: dedupeTools(body.tools) };
}

function buildOpenAIRequest(body, modelInfo) {
  let messages = [];
  if (body.system) {
    messages.push({ role: 'system', content: textFromContent(body.system) || String(body.system) });
  }
  messages.push(...convertMessages(body.messages || []));

  let request = {
    model: modelInfo.upstreamModel,
    messages,
    max_tokens: body.max_tokens,
    temperature: body.temperature,
    top_p: body.top_p,
    stream: body.stream === true,
  };

  let tools = convertTools(body.tools || []);
  if (tools.length > 0) {
    request.tools = tools;
    request.tool_choice = body.tool_choice?.type === 'any' ? 'required' : 'auto';
  }

  for (let key of Object.keys(request)) {
    if (request[key] === undefined) delete request[key];
  }
  return request;
}

function anthropicContentFromOpenAI(message) {
  let content = [];
  if (message?.content) {
    content.push({ type: 'text', text: message.content });
  }
  for (let call of message?.tool_calls || []) {
    let input = {};
    try { input = JSON.parse(call.function?.arguments || '{}'); } catch {}
    content.push({
      type: 'tool_use',
      id: call.id || `toolu_${randomUUID().replaceAll('-', '')}`,
      name: call.function?.name || 'tool',
      input,
    });
  }
  return content.length > 0 ? content : [{ type: 'text', text: '' }];
}

function anthropicStopReason(choice) {
  if (choice?.finish_reason === 'tool_calls') return 'tool_use';
  if (choice?.finish_reason === 'length') return 'max_tokens';
  return 'end_turn';
}

function toAnthropicResponse(openai, requestedModel, modelInfo) {
  let choice = openai.choices?.[0] || {};
  return {
    id: `msg_${randomUUID().replaceAll('-', '')}`,
    type: 'message',
    role: 'assistant',
    model: requestedModel || modelInfo.model,
    content: anthropicContentFromOpenAI(choice.message || {}),
    stop_reason: anthropicStopReason(choice),
    stop_sequence: null,
    usage: {
      input_tokens: openai.usage?.prompt_tokens || 0,
      output_tokens: openai.usage?.completion_tokens || 0,
    },
  };
}

async function callOpenAICompatible(provider, request) {
  let apiKey = provider.apiKey || (provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : null);
  if (!apiKey) {
    throw new Error(`Missing API key. Set ${provider.apiKeyEnv || 'provider apiKey'} for ${provider.baseUrl}.`);
  }

  let url = normalizePath(provider.baseUrl, '/chat/completions');
  let response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(provider.headers || {}),
    },
    body: JSON.stringify({ ...request, stream: false }),
  });

  let text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    throw new Error(data.error?.message || data.message || text || `Upstream HTTP ${response.status}`);
  }
  return data;
}

async function callOpenAICompatibleStream(provider, request, res, requestedModel, modelInfo) {
  let apiKey = provider.apiKey || (provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : null);
  if (!apiKey) {
    throw new Error(`Missing API key. Set ${provider.apiKeyEnv || 'provider apiKey'} for ${provider.baseUrl}.`);
  }

  let response = await fetch(normalizePath(provider.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${apiKey}`,
      ...(provider.headers || {}),
    },
    body: JSON.stringify({ ...request, stream: true }),
  });

  if (!response.ok) {
    let text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    throw new Error(data.error?.message || data.message || text || `Upstream HTTP ${response.status}`);
  }

  await streamOpenAIChunksAsAnthropic(response, res, requestedModel, modelInfo);
}

function beginAnthropicSse(res, message) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  writeSse(res, 'message_start', {
    type: 'message_start',
    message: { ...message, content: [], stop_reason: null, stop_sequence: null },
  });
}

async function streamOpenAIChunksAsAnthropic(response, res, requestedModel, modelInfo) {
  let message = {
    id: `msg_${randomUUID().replaceAll('-', '')}`,
    type: 'message',
    role: 'assistant',
    model: requestedModel || modelInfo.model,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  };

  beginAnthropicSse(res, message);

  let contentIndex = null;
  let toolIndexes = new Map();
  let toolNames = new Map();
  let nextIndex = 0;
  let finishReason = null;
  let usage = null;

  function ensureTextBlock() {
    if (contentIndex !== null) return contentIndex;
    contentIndex = nextIndex++;
    writeSse(res, 'content_block_start', {
      type: 'content_block_start',
      index: contentIndex,
      content_block: { type: 'text', text: '' },
    });
    return contentIndex;
  }

  function ensureToolBlock(call) {
    let key = call.index ?? call.id ?? toolIndexes.size;
    if (toolIndexes.has(key)) return toolIndexes.get(key);
    let index = nextIndex++;
    let name = call.function?.name || toolNames.get(key) || 'tool';
    toolNames.set(key, name);
    toolIndexes.set(key, index);
    writeSse(res, 'content_block_start', {
      type: 'content_block_start',
      index,
      content_block: {
        type: 'tool_use',
        id: call.id || `toolu_${randomUUID().replaceAll('-', '')}`,
        name,
        input: {},
      },
    });
    return index;
  }

  let decoder = new TextDecoder();
  let buffer = '';
  for await (let chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (let rawLine of lines) {
      let line = rawLine.trim();
      if (!line || line.startsWith(':')) continue;
      if (!line.startsWith('data:')) continue;
      let dataLine = line.slice('data:'.length).trim();
      if (dataLine === '[DONE]') continue;

      let chunkData;
      try { chunkData = JSON.parse(dataLine); } catch { continue; }
      if (chunkData.usage) usage = chunkData.usage;

      for (let choice of chunkData.choices || []) {
        if (choice.finish_reason) finishReason = choice.finish_reason;
        let delta = choice.delta || {};
        if (delta.content) {
          let index = ensureTextBlock();
          writeSse(res, 'content_block_delta', {
            type: 'content_block_delta',
            index,
            delta: { type: 'text_delta', text: delta.content },
          });
        }

        for (let call of delta.tool_calls || []) {
          let key = call.index ?? call.id ?? toolIndexes.size;
          if (call.function?.name) toolNames.set(key, call.function.name);
          let index = ensureToolBlock(call);
          if (call.function?.arguments) {
            writeSse(res, 'content_block_delta', {
              type: 'content_block_delta',
              index,
              delta: { type: 'input_json_delta', partial_json: call.function.arguments },
            });
          }
        }
      }
    }
  }

  if (contentIndex === null && toolIndexes.size === 0) ensureTextBlock();
  if (contentIndex !== null) writeSse(res, 'content_block_stop', { type: 'content_block_stop', index: contentIndex });
  for (let index of toolIndexes.values()) {
    writeSse(res, 'content_block_stop', { type: 'content_block_stop', index });
  }

  let stopReason = anthropicStopReason({ finish_reason: finishReason });
  writeSse(res, 'message_delta', {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: usage?.completion_tokens || 0 },
  });
  writeSse(res, 'message_stop', { type: 'message_stop' });
  res.end();
}

async function proxyAnthropicCompatible(provider, suffix, req, res, body = null, modelInfo = null) {
  let apiKey = provider.apiKey || (provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : null);
  if (!apiKey) {
    throw new Error(`Missing API key. Set ${provider.apiKeyEnv || 'provider apiKey'} for ${provider.baseUrl}.`);
  }

  let payload = body;
  if (payload && modelInfo?.upstreamModel) {
    payload = { ...payload, model: modelInfo.upstreamModel };
  }
  if (payload) payload = sanitizeAnthropicBody(payload);

  let headers = {
    ...(payload ? { 'Content-Type': 'application/json' } : {}),
    Accept: req.headers.accept || 'application/json',
    'x-api-key': apiKey,
    Authorization: `Bearer ${apiKey}`,
    ...(req.headers['anthropic-version'] ? { 'anthropic-version': req.headers['anthropic-version'] } : {}),
    ...(req.headers['anthropic-beta'] ? { 'anthropic-beta': req.headers['anthropic-beta'] } : {}),
    ...(provider.headers || {}),
  };

  let upstream = await fetch(normalizePath(provider.baseUrl, suffix), {
    method: req.method,
    headers,
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });

  let contentType = upstream.headers.get('content-type') || 'application/json';
  res.writeHead(upstream.status, {
    'Content-Type': contentType,
    ...(contentType.includes('text/event-stream') ? {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    } : {}),
  });

  if (upstream.body && contentType.includes('text/event-stream')) {
    for await (let chunk of upstream.body) res.write(chunk);
    res.end();
    return;
  }

  let text = await upstream.text();
  res.end(text);
}

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function streamAnthropicResponse(res, message) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  writeSse(res, 'message_start', {
    type: 'message_start',
    message: { ...message, content: [], stop_reason: null, stop_sequence: null },
  });

  message.content.forEach((block, index) => {
    if (block.type === 'text') {
      writeSse(res, 'content_block_start', {
        type: 'content_block_start',
        index,
        content_block: { type: 'text', text: '' },
      });
      if (block.text) {
        writeSse(res, 'content_block_delta', {
          type: 'content_block_delta',
          index,
          delta: { type: 'text_delta', text: block.text },
        });
      }
    } else if (block.type === 'tool_use') {
      writeSse(res, 'content_block_start', {
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
      });
      let input = JSON.stringify(block.input || {});
      if (input !== '{}') {
        writeSse(res, 'content_block_delta', {
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: input },
        });
      }
    }
    writeSse(res, 'content_block_stop', { type: 'content_block_stop', index });
  });

  writeSse(res, 'message_delta', {
    type: 'message_delta',
    delta: { stop_reason: message.stop_reason, stop_sequence: null },
    usage: { output_tokens: message.usage.output_tokens },
  });
  writeSse(res, 'message_stop', { type: 'message_stop' });
  res.end();
}

function countTokens(body) {
  let raw = JSON.stringify({
    system: body.system || '',
    messages: body.messages || [],
    tools: body.tools || [],
  });
  return Math.max(1, Math.ceil(raw.length / 4));
}

function listModels(config) {
  let ids = new Set();
  for (let [providerId, provider] of Object.entries(config.providers)) {
    for (let model of provider.models || []) {
      ids.add(model);
      ids.add(`${providerId}/${model}`);
    }
  }
  Object.values(config.aliases).forEach(model => ids.add(model));
  return [...ids].map(id => ({
    id,
    type: 'model',
    display_name: id,
    created_at: '2026-04-24T00:00:00Z',
  }));
}

/**
 * Create an Anthropic Messages API compatible gateway handler.
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createAnthropicGatewayHandler() {
  return async function handleAnthropicGateway(req, res) {
    let url = new URL(req.url, 'http://localhost');
    let config = getGatewayConfig();

    if (!config.enabled) return anthropicError(res, 503, 'Anthropic gateway is disabled.');
    if (!isAuthorized(req, config)) return anthropicError(res, 401, 'Invalid gateway token.', 'authentication_error');

    try {
      if (req.method === 'GET' && url.pathname === '/anthropic/health') {
        return sendJson(res, 200, { ok: true, providers: Object.keys(config.providers), defaultModel: config.defaultModel });
      }

      if (req.method === 'GET' && url.pathname === '/anthropic/v1/models') {
        return sendJson(res, 200, { data: listModels(config), has_more: false, first_id: null, last_id: null });
      }

      if (req.method === 'POST' && url.pathname === '/anthropic/v1/messages/count_tokens') {
        let body = await parseBody(req);
        let modelInfo = resolveModel(body.model, config);
        if (isAnthropicProvider(modelInfo.provider)) {
          return proxyAnthropicCompatible(modelInfo.provider, '/v1/messages/count_tokens', req, res, body, modelInfo);
        }
        return sendJson(res, 200, { input_tokens: countTokens(body) });
      }

      if (req.method === 'POST' && url.pathname === '/anthropic/v1/messages') {
        let body = await parseBody(req);
        let modelInfo = resolveModel(body.model, config);
        if (!modelInfo.provider) throw new Error('No gateway providers configured.');
        if (isAnthropicProvider(modelInfo.provider)) {
          return proxyAnthropicCompatible(modelInfo.provider, '/v1/messages', req, res, body, modelInfo);
        }

        if ((modelInfo.provider.type || 'openai-compatible') !== 'openai-compatible') {
          throw new Error(`Unsupported provider type: ${modelInfo.provider.type}`);
        }

        let upstreamRequest = buildOpenAIRequest(body, modelInfo);
        if (body.stream) {
          return callOpenAICompatibleStream(modelInfo.provider, upstreamRequest, res, body.model, modelInfo);
        }
        let upstream = await callOpenAICompatible(modelInfo.provider, upstreamRequest);
        let message = toAnthropicResponse(upstream, body.model, modelInfo);

        return sendJson(res, 200, message);
      }

      return anthropicError(res, 404, `Unknown Anthropic gateway endpoint: ${req.method} ${url.pathname}`);
    } catch (err) {
      return anthropicError(res, 500, err.message || String(err), 'api_error');
    }
  };
}
