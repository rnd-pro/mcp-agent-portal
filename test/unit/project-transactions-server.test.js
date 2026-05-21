import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractPortalProjectTransactions,
  extractProjectTransactionsFromResult,
  extractProjectTransactionsFromText,
  normalizePortalProjectTransaction,
  portalRuntimeProjectId,
} from '../../src/node/project-transactions.js';

describe('server project transaction adapter', () => {
  it('extracts fenced project transactions from final agent text', () => {
    const text = [
      'Applied.',
      '```project-transaction-v1',
      '{"version":"project-transaction-v1","id":"tx:add-panel","operations":[{"type":"layout.addPanel","layout":"graph","panel":{"id":"events","component":"sn-list-item"}}]}',
      '```',
    ].join('\n');

    const transactions = extractProjectTransactionsFromText(text);

    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].id, 'tx:add-panel');
  });

  it('extracts structured project transactions from parsed runner results', () => {
    const transactions = extractProjectTransactionsFromResult({
      response: 'no fence here',
      metadata: {
        projectTransactions: [{
          version: 'project-transaction-v1',
          id: 'tx:theme',
          operations: [{ type: 'theme.setModifier', theme: 'default', name: 'density', value: 0.95 }],
        }],
      },
    });

    assert.deepEqual(transactions.map((transaction) => transaction.id), ['tx:theme']);
  });

  it('normalizes raw Portal project targets to runtime project targets', () => {
    const transaction = normalizePortalProjectTransaction({
      version: 'project-transaction-v1',
      id: 'tx:target',
      targetProject: '22132d30',
      operations: [{ type: 'theme.setModifier', theme: 'default', name: 'density', value: 1 }],
    }, '22132d30');

    assert.equal(transaction.targetProject, 'agent-portal:22132d30');
    assert.equal(portalRuntimeProjectId('22132d30'), 'agent-portal:22132d30');
  });

  it('rejects transactions targeting another runtime project', () => {
    assert.throws(() => normalizePortalProjectTransaction({
      version: 'project-transaction-v1',
      id: 'tx:wrong-target',
      targetProject: 'agent-portal:other',
      operations: [{ type: 'theme.setModifier', theme: 'default', name: 'density', value: 1 }],
    }, '22132d30'), /targets "agent-portal:other"/);
  });

  it('deduplicates accepted transactions by Portal runtime target and id', () => {
    const text = [
      '```json',
      '[',
      '{"version":"project-transaction-v1","id":"tx:once","operations":[{"type":"theme.setModifier","theme":"default","name":"density","value":1}]}',
      ']',
      '```',
    ].join('\n');
    const applied = new Set();

    const first = extractPortalProjectTransactions({ text, projectId: '22132d30', applied });
    const second = extractPortalProjectTransactions({ text, projectId: '22132d30', applied });

    assert.equal(first.accepted.length, 1);
    assert.equal(first.rejected.length, 0);
    assert.equal(second.accepted.length, 0);
  });
});
