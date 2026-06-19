import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  decomposeWorkflowCard,
  normalizeWorkflowBoardPayload,
} from '../../web/services/workflow-board.js';

describe('workflow board web service', () => {
  it('preserves parent and child card references in normalized board payloads', () => {
    let board = normalizeWorkflowBoardPayload({
      projection: {
        board: {
          id: 'agent-workflow-default',
          columns: [{ id: 'backlog', title: 'Backlog' }],
          cards: [{
            id: 'parent-card',
            title: 'Parent',
            columnId: 'backlog',
            childCardIds: ['child-card'],
          }, {
            id: 'child-card',
            title: 'Child',
            columnId: 'backlog',
            parentCardId: 'parent-card',
          }],
        },
      },
    });

    assert.deepEqual(board.cards.find(card => card.id === 'parent-card').childCardIds, ['child-card']);
    assert.equal(board.cards.find(card => card.id === 'child-card').parentCardId, 'parent-card');
  });

  it('posts workflow decomposition requests through the shared action helper', async () => {
    let calls = [];
    let fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({ ok: true, result: { childCardIds: ['child-card'] } }),
      };
    };

    let result = await decomposeWorkflowCard({
      cardId: 'parent-card',
      childItems: [{ title: 'Child', owner: 'agent', acceptanceCriteria: ['Done'] }],
    }, { fetchImpl });

    assert.equal(result.ok, true);
    assert.equal(calls[0].url, '/api/workflow-board/decompose');
    assert.equal(calls[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].options.body).childItems[0].title, 'Child');
  });
});
