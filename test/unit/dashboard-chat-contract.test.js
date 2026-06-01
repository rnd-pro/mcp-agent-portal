import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { buildChatNavTree } from '../../web/components/ChatSidebar/chat-tree.js';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

function readSource(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function sectionBlock(source, id) {
  let marker = `registerSection('${id}',`;
  let start = source.indexOf(marker);
  assert.notEqual(start, -1, `Expected ${id} section registration`);
  let next = source.indexOf('registerSection(', start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

describe('dashboard chat route', () => {
  it('uses dashboard as the global chats surface instead of the server list', () => {
    let source = readSource('web/router-registry.js');
    let dashboard = sectionBlock(source, 'dashboard');

    assert.match(dashboard, /label:\s*tPortal\('text\.chats'\)/);
    assert.match(dashboard, /icon:\s*'forum'/);
    assert.match(dashboard, /scope:\s*'home'/);
    assert.match(dashboard, /LayoutTree\.createPanel\('agent-chat'\)/);
    assert.equal(dashboard.includes('pg-project-list'), false);
    assert.equal(dashboard.includes("createPanel('project-list')"), false);
    assert.equal(dashboard.includes('withChat'), false);

    assert.match(source, /'agent-chat':\s*\{\s*title:\s*tPortal\('text\.chats'\)/);
  });

  it('groups global chat navigation by project metadata', () => {
    let source = readSource('web/components/ChatSidebar/ChatSidebar.js');
    let treeSource = readSource('web/components/ChatSidebar/chat-tree.js');

    assert.match(source, /buildChatNavTree\(\{/);
    assert.match(treeSource, /function getProjectMeta\(projectId,\s*projectHistory\)/);
    assert.match(treeSource, /projectGroups\.set\(meta\.id,\s*\{/);
    assert.match(treeSource, /id:\s*`project-group:\$\{meta\.id\}`/);
    assert.match(treeSource, /isGroup:\s*true/);
    assert.match(treeSource, /agentColor:\s*meta\.color/);
    assert.match(treeSource, /if \(!projectId\)\s*\{/);
  });

  it('shows project group dividers only outside a concrete project chat scope', () => {
    let source = readSource('web/components/ChatSidebar/ChatSidebar.js');

    assert.match(
      source,
      /this\.setGroupDividers\(!dashState\.activeProjectId\);/,
      'Project-scoped chat navigation must not render global project group dividers'
    );
  });

  it('preserves recursive project chat trees on the global dashboard route', () => {
    let tree = buildChatNavTree({
      activeChatId: 'grandchild',
      projectHistory: [{ id: 'agent-portal', name: 'Agent Portal', color: '#4c8bf5' }],
      chats: [
        { id: 'root', projectId: 'agent-portal', name: 'Root chat', updatedAt: 3 },
        { id: 'child', parentChatId: 'root', projectId: 'agent-portal', name: 'Child chat', updatedAt: 2 },
        { id: 'grandchild', parentChatId: 'child', projectId: 'agent-portal', name: 'Grandchild chat', updatedAt: 1 },
      ],
    });

    assert.equal(tree.length, 1);
    assert.equal(tree[0].id, 'project-group:agent-portal');
    assert.equal(tree[0].agentColor, '#4c8bf5');
    assert.equal(tree[0].isActive, false);
    assert.equal(tree[0].isExpanded, true);
    assert.equal(tree[0].subChats.length, 1);
    assert.equal(tree[0].subChats[0].id, 'root');
    assert.equal(tree[0].subChats[0].isExpanded, true);
    assert.equal(tree[0].subChats[0].subChats.length, 1);
    assert.equal(tree[0].subChats[0].subChats[0].id, 'child');
    assert.equal(tree[0].subChats[0].subChats[0].isExpanded, true);
    assert.equal(tree[0].subChats[0].subChats[0].subChats.length, 1);
    assert.equal(tree[0].subChats[0].subChats[0].subChats[0].id, 'grandchild');
    assert.equal(tree[0].subChats[0].subChats[0].subChats[0].isActive, true);
  });

  it('keeps project groups inactive when a descendant chat is selected', () => {
    let tree = buildChatNavTree({
      activeChatId: 'child',
      projectHistory: [{ id: 'agent-portal', name: 'Agent Portal', color: '#4c8bf5' }],
      chats: [
        { id: 'root', projectId: 'agent-portal', name: 'Root chat', updatedAt: 3 },
        { id: 'child', parentChatId: 'root', projectId: 'agent-portal', name: 'Child chat', updatedAt: 2 },
      ],
    });

    assert.equal(tree[0].isActive, false);
    assert.equal(tree[0].isExpanded, true);
    assert.equal(tree[0].subChats[0].isExpanded, true);
    assert.equal(tree[0].subChats[0].subChats[0].isActive, true);
  });

  it('shows only meaningful chat source labels in the project tree', () => {
    let tree = buildChatNavTree({
      projectHistory: [{ id: 'agent-portal', name: 'Agent Portal', color: '#4c8bf5' }],
      chats: [
        { id: 'portal', projectId: 'agent-portal', name: 'Portal chat', adapter: 'pool', origin: 'portal', updatedAt: 3 },
        { id: 'mcp', projectId: 'agent-portal', name: 'MCP chat', adapter: 'pool', origin: 'mcp', updatedAt: 2 },
        { id: 'child', parentChatId: 'mcp', projectId: 'agent-portal', name: 'Child chat', adapter: 'pool', updatedAt: 1 },
      ],
    });

    let [portalChat, mcpChat] = tree[0].subChats;
    assert.equal(portalChat.adapter, '');
    assert.equal(portalChat.metaLabel, '');
    assert.equal(mcpChat.adapter, '');
    assert.equal(mcpChat.metaLabel, 'MCP');
    assert.equal(mcpChat.subChats[0].metaLabel, 'Agent');
  });

  it('marks only the selected global project chat group active', () => {
    let tree = buildChatNavTree({
      activeGroupId: 'project-group:agent-portal',
      expandedGroupIds: new Set(['project-group:agent-portal']),
      projectHistory: [{ id: 'agent-portal', name: 'Agent Portal', color: '#4c8bf5' }],
      chats: [
        { id: 'root', projectId: 'agent-portal', name: 'Root chat', updatedAt: 3 },
      ],
    });

    assert.equal(tree.length, 1);
    assert.equal(tree[0].id, 'project-group:agent-portal');
    assert.equal(tree[0].isActive, true);
    assert.equal(tree[0].isExpanded, true);
  });

  it('does not mark every expanded project group active', () => {
    let tree = buildChatNavTree({
      activeGroupId: 'project-group:agent-portal',
      expandedGroupIds: new Set(['project-group:agent-portal', 'project-group:tmp']),
      projectHistory: [
        { id: 'agent-portal', name: 'Agent Portal', color: '#4c8bf5' },
        { id: 'tmp', name: 'tmp', color: '#f06292' },
      ],
      chats: [
        { id: 'root', projectId: 'agent-portal', name: 'Root chat', updatedAt: 3 },
        { id: 'tmp-root', projectId: 'tmp', name: 'Tmp chat', updatedAt: 2 },
      ],
    });

    assert.equal(tree[0].id, 'project-group:agent-portal');
    assert.equal(tree[0].isActive, true);
    assert.equal(tree[0].isExpanded, true);
    assert.equal(tree[1].id, 'project-group:tmp');
    assert.equal(tree[1].isActive, false);
    assert.equal(tree[1].isExpanded, true);
  });

  it('keeps project group expansion on the existing sidebar toggle path', () => {
    let source = readSource('web/components/ChatSidebar/ChatSidebar.js');

    assert.match(source, /chat-sidebar-toggle', \(event\) => \{/);
    assert.match(source, /_handleGroupToggle\(event\.detail\?\.id, Boolean\(event\.detail\?\.expanded\)\)/);
    assert.match(source, /this\._expandedGroupIds\.add\(id\);/);
    assert.match(source, /this\._activeGroupId = id;/);
    assert.equal(source.includes("chatId.startsWith('project-group:')"), false);
  });

  it('selects project root chats independently from their subagent chats', () => {
    let tree = buildChatNavTree({
      projectId: 'agent-portal',
      activeChatId: 'root',
      projectHistory: [{ id: 'agent-portal', name: 'Agent Portal', color: '#4c8bf5' }],
      chats: [
        { id: 'root', projectId: 'agent-portal', name: 'Root chat', updatedAt: 3 },
        { id: 'child', parentChatId: 'root', projectId: 'agent-portal', name: 'Child chat', updatedAt: 2 },
      ],
    });

    assert.equal(tree.length, 1);
    assert.equal(tree[0].id, 'root');
    assert.equal(tree[0].isActive, true);
    assert.equal(tree[0].isExpanded, true);
    assert.equal(tree[0].subChats.length, 1);
    assert.equal(tree[0].subChats[0].id, 'child');
    assert.equal(tree[0].subChats[0].isActive, false);
  });

  it('keeps project chat links active on the global dashboard route', () => {
    let source = readSource('web/app.js');

    assert.match(
      source,
      /if \(projectId\) \{[\s\S]*if \(routeChatId\) updateParams\(\{ chat: null \}\);/,
      'Global dashboard must not clear ?chat links just because the selected chat belongs to a project'
    );
  });

  it('resynchronizes the chat panel when a visible chat row is selected again', () => {
    let source = readSource('web/components/ChatSidebar/ChatSidebar.js');
    let selectStart = source.indexOf('_selectChat(chatId)');
    let selectEnd = source.indexOf('_renderNavItems()', selectStart);
    let selectBlock = source.slice(selectStart, selectEnd);

    assert.equal(source.includes('dashState.activeChatId === chatId) return'), false);
    assert.match(source, /if \(!chatId\) return;/);
    assert.match(source, /updateParams\(\{ chat: chatId \}\);/);
    assert.match(source, /dashEmit\('active-chat-changed', \{ id: chatId \}\);/);
    assert.equal(
      selectBlock.includes('this._fetchChats()'),
      false,
      'Selecting a visible chat must not refetch and reorder the sidebar'
    );
  });

  it('keeps existing sidebar order stable when synced chat metadata changes', () => {
    let source = readSource('web/components/ChatSidebar/ChatSidebar.js');

    assert.match(source, /_mergeSyncedChats\(chatsObj\)/);
    assert.match(source, /for \(let chat of dashState\.chats \|\| \[\]\)/);
    assert.match(source, /existing\.push\(incoming\.get\(chat\.id\)\)/);
    assert.match(source, /let added = \[\.\.\.incoming\.values\(\)\]\.sort/);
    assert.match(source, /return \[\.\.\.existing, \.\.\.added\];/);
  });

  it('restores a project chat selection when the project chat route has no chat query', () => {
    let source = readSource('web/components/ChatSidebar/ChatSidebar.js');

    assert.match(source, /_ensureRouteActiveChat\(\)/);
    assert.match(source, /let projectId = dashState\.activeProjectId \|\| params\.project \|\| null;/);
    assert.match(source, /if \(params\.chat\) \{[\s\S]*this\._activeGroupId = null;/);
    assert.match(source, /activeChat\?\.projectId === projectId/);
    assert.match(source, /!projectId \|\| chat\.projectId === projectId/);
    assert.match(source, /updateParams\(\{ chat: chat\.id \}\);/);
    assert.match(source, /dashEmit\('active-chat-changed', \{ id: chat\.id, fromRouteDefault: true \}\);/);
  });

  it('rechecks project chat selection when the active project changes without a reload', () => {
    let source = readSource('web/components/ChatSidebar/ChatSidebar.js');

    assert.match(
      source,
      /dashEvents\.addEventListener\('active-project-changed', \(\) => \{[\s\S]*this\._ensureRouteActiveChat\(\);[\s\S]*this\._renderNavItems\(\);[\s\S]*\}\);/,
    );
    assert.match(
      source,
      /_renderNavItems\(\) \{[\s\S]*this\._ensureRouteActiveChat\(\);/,
      'Rendering the chat sidebar must recover route selection after project tab transitions'
    );
  });
});
