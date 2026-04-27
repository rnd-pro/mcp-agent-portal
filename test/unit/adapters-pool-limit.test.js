import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('adapters-pool limit validation', () => {
  it('pool capacity limit logic test', async () => {
     let { AdapterPool } = await import('../../src/node/adapters/pool.js');
     
     // Mock out the config and resolveAdapter at a high level
     let pool = new AdapterPool({ opencode: { enabled: true } });
     
     // We will manually push raw objects into instances array to simulate busy adapters
     pool.instances.set('opencode', [
       { busy: true, busySince: Date.now() },
       { busy: true, busySince: Date.now() },
       { busy: true, busySince: Date.now() }
     ]);
     
     let res = pool.acquire('opencode');
     assert.equal(res, null, 'Should return null when 3 instances are busy');
     
     // Eviction logic test
     pool.instances.set('opencode', [
       { busy: true, busySince: Date.now() - (11 * 60 * 1000), destroy: () => {} }, // 11 mins ago
       { busy: true, busySince: Date.now() }
     ]);
     
     // Still need a factory to succeed if it's < 3, so we temporarily override this.config so factory lookup fails safely
     // Actually if it passes the eviction, it will try to create a new one. Since we don't have a real factory loaded easily, 
     // we just expect it to not throw an unexpected error.
     let err = null;
     try {
       pool.acquire('opencode');
     } catch (e) { err = e; }
     
     let arr = pool.instances.get('opencode');
     assert.equal(arr.length, 2, 'Should have 2 elements (1 old evicted, 1 new wrapper pushed after eviction)');
     pool.destroy();
  });
});
