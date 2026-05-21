import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyProjectTransactions,
  applyProjectTransactionsFromMessages,
  extractProjectTransactionsFromMessages,
  portalRuntimeProjectId,
} from '../../web/services/project-transaction-messages.js';

describe('project transaction message adapter', () => {
  it('extracts project-transaction-v1 fenced JSON from agent messages', () => {
    const messages = [
      { role: 'user', text: 'ignore this ```project-transaction-v1\n{"id":"bad"}\n```' },
      {
        role: 'agent',
        text: [
          'Ready.',
          '```project-transaction-v1',
          '{"version":"project-transaction-v1","id":"tx:add-panel","operations":[{"type":"layout.addPanel","layout":"graph","panel":{"id":"events","component":"sn-list-item"}}]}',
          '```',
        ].join('\n'),
      },
    ];

    const transactions = extractProjectTransactionsFromMessages(messages);

    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].id, 'tx:add-panel');
    assert.equal(transactions[0].operations[0].type, 'layout.addPanel');
  });

  it('accepts JSON fences and arrays when the transaction version is explicit', () => {
    const messages = [{
      role: 'agent',
      text: [
        '```json',
        '[',
        '{"version":"project-transaction-v1","id":"tx:set-theme","operations":[{"type":"theme.setModifier","theme":"default","name":"density","value":0.92}]}',
        ']',
        '```',
      ].join('\n'),
    }];

    const transactions = extractProjectTransactionsFromMessages(messages);

    assert.deepEqual(transactions.map((transaction) => transaction.id), ['tx:set-theme']);
  });

  it('deduplicates applied transactions and normalizes Portal runtime targets', () => {
    const applied = new Set();
    const dispatched = [];
    const messages = [{
      role: 'agent',
      text: [
        '```project-transaction-v1',
        '{"version":"project-transaction-v1","id":"tx:add-panel","targetProject":"22132d30","operations":[{"type":"layout.addPanel","layout":"graph","panel":{"id":"events","component":"sn-list-item"}}]}',
        '```',
      ].join('\n'),
    }];

    const first = applyProjectTransactionsFromMessages({
      messages,
      projectId: '22132d30',
      applied,
      dispatch: (event) => dispatched.push(event),
    });
    const second = applyProjectTransactionsFromMessages({
      messages,
      projectId: '22132d30',
      applied,
      dispatch: (event) => dispatched.push(event),
    });

    assert.equal(first.length, 1);
    assert.equal(second.length, 0);
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].type, 'agent-portal-project-transaction');
    assert.equal(dispatched[0].detail.projectId, '22132d30');
    assert.equal(dispatched[0].detail.transaction.targetProject, 'agent-portal:22132d30');
  });

  it('uses the global runtime id when project id is empty', () => {
    assert.equal(portalRuntimeProjectId(null), 'agent-portal:global');
  });

  it('applies transactions supplied by websocket or persisted chat state', () => {
    const dispatched = [];
    const applied = new Set();
    const transaction = {
      version: 'project-transaction-v1',
      id: 'tx:ws',
      targetProject: 'agent-portal:22132d30',
      operations: [{ type: 'theme.setModifier', theme: 'default', name: 'density', value: 1.05 }],
    };

    const first = applyProjectTransactions({
      transactions: [transaction],
      projectId: '22132d30',
      applied,
      dispatch: (event) => dispatched.push(event),
    });
    const second = applyProjectTransactions({
      transactions: [transaction],
      projectId: '22132d30',
      applied,
      dispatch: (event) => dispatched.push(event),
    });

    assert.equal(first.length, 1);
    assert.equal(second.length, 0);
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].detail.transaction.id, 'tx:ws');
  });
});
