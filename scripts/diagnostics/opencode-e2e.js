/**
 * E2E diagnostic test: WebSocket chat pipeline with streaming validation
 * Traces every step: connect → send → delegated → streaming events → done/error
 *
 * Usage: PORTAL_HOST=<host> node test/integration/opencode-e2e.js
 */
import WebSocket from 'ws';

const HOST = process.env.PORTAL_HOST || 'portal.local';
const MODEL = process.env.TEST_MODEL || 'openrouter/deepseek/deepseek-v3.2';
const WS_URL = `ws://${HOST}/ws/chat`;
const CHAT_ID = 'test-e2e-' + Date.now();
const TIMEOUT_S = 60;

console.log(`\n🧪 E2E Chat Pipeline Diagnostic`);
console.log(`   URL: ${WS_URL}`);
console.log(`   Model: ${MODEL}`);
console.log(`   Chat ID: ${CHAT_ID}`);
console.log(`   Timeout: ${TIMEOUT_S}s\n`);

const ws = new WebSocket(WS_URL);
let taskId = null;
let streamedChunks = 0;
let toolCalls = 0;
let toolResults = 0;
let errors = [];
let startTime = Date.now();

function elapsed() {
  return ((Date.now() - startTime) / 1000).toFixed(1) + 's';
}

ws.on('open', () => {
  console.log(`[${elapsed()}] ✅ WebSocket connected`);

  const msg = {
    method: 'chat.send',
    params: {
      chatId: CHAT_ID,
      prompt: 'respond with exactly: "hello world"',
      provider: 'opencode',
      model: MODEL,
      timeout: TIMEOUT_S,
    },
  };

  console.log(`[${elapsed()}] 📤 Sending chat.send (provider=opencode, model=${MODEL})`);
  ws.send(JSON.stringify(msg));
});

const timeout = setTimeout(() => {
  console.log(`\n[${elapsed()}] ⏰ TIMEOUT after ${TIMEOUT_S}s`);
  console.log(`   Task ID: ${taskId || 'NONE'}`);
  console.log(`   Streamed chunks: ${streamedChunks}`);
  console.log(`   Tool calls: ${toolCalls}`);
  console.log(`   Errors: ${errors.length}`);
  ws.close();
  process.exit(1);
}, TIMEOUT_S * 1000);

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());

    switch (msg.method) {
      case 'chat.delegated':
        taskId = msg.params?.taskId;
        console.log(`[${elapsed()}] 📋 Delegated — taskId=${taskId || 'MISSING!'}`);
        if (!taskId) {
          console.log(`   ❌ Full response:`, JSON.stringify(msg, null, 2));
        }
        break;

      case 'chat.event': {
        let ev = msg.params?.event;
        if (!ev) {
          console.log(`[${elapsed()}] ⚠️  chat.event with no event payload:`, JSON.stringify(msg.params));
          break;
        }
        if (ev.type === 'message' && ev.role === 'system') {
          console.log(`[${elapsed()}] 🔧 System: "${ev.content}"`);
        } else if (ev.type === 'message' && ev.role === 'assistant') {
          streamedChunks++;
          console.log(`[${elapsed()}] 💬 Stream #${streamedChunks}: "${(ev.content || '').substring(0, 100)}"`);
        } else if (ev.type === 'tool_use') {
          toolCalls++;
          console.log(`[${elapsed()}] 🔨 Tool: ${ev.name || ev.tool_name}`);
        } else if (ev.type === 'tool_result') {
          toolResults++;
          console.log(`[${elapsed()}] 📎 Tool result`);
        } else if (ev.type === 'error') {
          errors.push(ev.message || ev.error);
          console.log(`[${elapsed()}] ⚠️  Error event: ${ev.message || ev.error}`);
        } else {
          console.log(`[${elapsed()}] 📦 Event: type=${ev.type} role=${ev.role}`);
        }
        break;
      }

      case 'chat.done': {
        clearTimeout(timeout);
        let responsePreview = (msg.params?.text || '').substring(0, 200);
        console.log(`[${elapsed()}] ✅ DONE`);
        console.log(`   Response: "${responsePreview}"`);

        // Validation summary
        console.log(`\n📊 Streaming Report:`);
        console.log(`   Streamed chunks: ${streamedChunks}`);
        console.log(`   Tool calls: ${toolCalls}`);
        console.log(`   Tool results: ${toolResults}`);
        console.log(`   Errors: ${errors.length}`);

        let pass = true;
        if (streamedChunks === 0) {
          console.log(`   ❌ FAIL: No streaming chunks received — streaming is broken!`);
          pass = false;
        } else {
          console.log(`   ✅ PASS: Streaming works (${streamedChunks} chunk(s))`);
        }

        if (errors.length > 0) {
          console.log(`   ⚠️  Errors during execution: ${errors.join('; ')}`);
        }

        ws.close();
        process.exit(pass ? 0 : 1);
        break;
      }

      case 'chat.error':
        console.log(`[${elapsed()}] ❌ ERROR: ${msg.params?.text || msg.params?.error}`);
        clearTimeout(timeout);
        ws.close();
        process.exit(1);
        break;

      default:
        console.log(`[${elapsed()}] ❓ Unknown method: ${msg.method}`, JSON.stringify(msg.params || {}).substring(0, 100));
    }
  } catch (e) {
    console.log(`[${elapsed()}] 📥 Parse error:`, data.toString().substring(0, 200));
  }
});

ws.on('error', (err) => {
  console.log(`[${elapsed()}] ❌ WS error: ${err.message}`);
  process.exit(1);
});

ws.on('close', () => {
  console.log(`[${elapsed()}] 🔌 WebSocket closed`);
});
