import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

function readSource(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

describe('route parameter contract', () => {
  it('keeps project global while chat remains scoped to the current section', () => {
    let app = readSource('web/app.js');
    let agentChat = readSource('web/panels/AgentChat/AgentChat.js');

    assert.match(app, /registerGlobalParam\('project'\);/);
    assert.equal(
      app.includes("registerGlobalParam('project', 'chat')"),
      false,
      'chat must not be registered as a global route param'
    );

    for (let relative of [
      'web/components/ChatSidebar/ChatSidebar.js',
      'web/panels/AgentChat/AgentChat.js',
      'web/panels/ChatList/ChatList.js',
    ]) {
      let source = readSource(relative);
      assert.equal(
        source.includes("setGlobalParam('chat'"),
        false,
        `${relative} must not promote chat to a global route param`
      );
      assert.match(source, /updateParams\(\{\s*chat:/, `${relative} must update chat on the active route only`);
    }

    assert.match(app, /let routeChat = routeChatId \? \(dashState\.chats \|\| \[\]\)\.find/);
    assert.match(app, /let routeChatMismatch = routeChatId && \(!routeChat \|\| routeChat\.projectId !== projectId\);/);
    assert.match(app, /let activeChatMismatch = dashState\.activeChatId && \(!activeChat \|\| activeChat\.projectId !== projectId\);/);
    assert.match(agentChat, /if \(!chatId\) \{[\s\S]*dashState\.activeChatId = null;[\s\S]*active-chat-changed/);
  });

  it('preserves project query when project-local actions jump between routed sections', () => {
    let quickOpen = readSource('web/components/QuickOpen/QuickOpen.js');
    let codeViewer = readSource('web/panels/CodeViewer/CodeViewer.js');

    assert.match(quickOpen, /let params = parseQuery\(route\.query \|\| ''\);/);
    assert.match(quickOpen, /buildHash\('explorer', file, params\)/);
    assert.equal(quickOpen.includes('`#explorer/${file}`'), false);
    assert.equal(quickOpen.includes('location.hash = `explorer/${file}`'), false);

    assert.match(codeViewer, /let params = \{ \.\.\.parseQuery\(route\.query \|\| ''\), focus: path \};/);
    assert.match(codeViewer, /window\.location\.hash = buildHash\('graph', '', params\);/);
    assert.equal(codeViewer.includes('`#graph?focus=${encodeURIComponent(path)}`'), false);
  });
});
