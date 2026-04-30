import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('adapters-registry', () => {
  it('resolveAdapter returns factory for known types', async () => {
    let { resolveAdapter } = await import('../../src/node/adapters/index.js');
    
    let gemini = resolveAdapter('gemini');
    assert.equal(typeof gemini, 'function', 'gemini should resolve to factory function');
    
    let claude = resolveAdapter('claude');
    assert.equal(typeof claude, 'function', 'claude should resolve to factory function');
  });

  it('resolveAdapter throws for unknown type with valid options', async () => {
    let { resolveAdapter } = await import('../../src/node/adapters/index.js');
    
    assert.throws(
      () => resolveAdapter('unknown-adapter'),
      (err) => {
        assert.ok(err.message.includes('Unknown adapter type'), 'should mention unknown type');
        assert.ok(err.message.includes('gemini'), 'should list gemini as valid');
        assert.ok(err.message.includes('claude'), 'should list claude as valid');
        return true;
      }
    );
  });

  it('listAdapterTypes returns all registered types', async () => {
    let { listAdapterTypes } = await import('../../src/node/adapters/index.js');
    
    let { types, metadata } = listAdapterTypes();
    assert.ok(Array.isArray(types), 'should return array of types');
    assert.ok(types.includes('gemini'), 'should include gemini');
    assert.ok(types.includes('claude'), 'should include claude');
    assert.ok(types.includes('opencode'), 'should include opencode (metadata only)');
    assert.ok(types.includes('pool'), 'should include pool');
    assert.ok(metadata, 'should return metadata');
    assert.equal(types.length, 4, 'should have exactly 4 adapter types in metadata');
  });
});
