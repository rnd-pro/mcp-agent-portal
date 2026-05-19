import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('state-sync patch application', () => {
  it('merges chat patches without dropping existing metadata', async () => {
    let { __stateSyncTest } = await import('../../web/state-sync.js?test=merge');

    __stateSyncTest.applySnapshot({
      v: 1,
      state: {
        chats: {
          chat1: {
            id: 'chat1',
            projectId: 'project1',
            parentChatId: null,
            name: 'Active Chat',
            pendingTaskId: null,
          },
        },
      },
    });

    __stateSyncTest.applyPatch({
      v: 2,
      ops: [
        {
          op: 'merge',
          path: 'chats/chat1',
          value: { pendingTaskId: 'task1', updatedAt: 123 },
        },
      ],
    });

    assert.deepEqual(__stateSyncTest.getState().chats.chat1, {
      id: 'chat1',
      projectId: 'project1',
      parentChatId: null,
      name: 'Active Chat',
      pendingTaskId: 'task1',
      updatedAt: 123,
    });
  });

  it('applies server delete patches', async () => {
    let { __stateSyncTest } = await import('../../web/state-sync.js?test=delete');

    __stateSyncTest.applySnapshot({
      v: 1,
      state: { chats: { chat1: { id: 'chat1' } } },
    });

    __stateSyncTest.applyPatch({
      v: 2,
      ops: [{ op: 'delete', path: 'chats/chat1' }],
    });

    assert.equal(__stateSyncTest.getState().chats.chat1, undefined);
  });
});
