import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('plugin-loader', () => {
  it('PluginLoader constructor initializes empty state', async () => {
    let { PluginLoader } = await import('../../src/node/plugins/plugin-loader.js');
    
    let loader = new PluginLoader();
    assert.ok(loader, 'should create instance');
    assert.equal(typeof loader.initAll, 'function', 'should have initAll method');
    assert.equal(typeof loader.destroyAll, 'function', 'should have destroyAll method');
    assert.equal(typeof loader.dispatchAlert, 'function', 'should have dispatchAlert method');
  });

  it('dispatchAlert does not throw when no plugins loaded', async () => {
    let { PluginLoader } = await import('../../src/node/plugins/plugin-loader.js');
    
    let loader = new PluginLoader();
    assert.doesNotThrow(() => {
      loader.dispatchAlert({ type: 'crash', server: 'test', message: 'test error' });
    });
  });

  it('destroyAll does not throw when no plugins loaded', async () => {
    let { PluginLoader } = await import('../../src/node/plugins/plugin-loader.js');
    
    let loader = new PluginLoader();
    await assert.doesNotReject(async () => {
      await loader.destroyAll();
    });
  });

  it('keeps missing plugin diagnostics quiet and structured by default', async () => {
    let { PluginLoader } = await import('../../src/node/plugins/plugin-loader.js');
    let warnCalls = 0;
    let oldWarn = console.warn;
    console.warn = () => { warnCalls++; };

    try {
      let loader = new PluginLoader({ plugins: { missing: { enabled: true } } });
      await loader.initAll();

      assert.equal(warnCalls, 0);
      assert.equal(loader.failures.length, 1);
      assert.equal(loader.failures[0].level, 'warn');
      assert.match(loader.failures[0].message, /missing/);
    } finally {
      console.warn = oldWarn;
    }
  });
});
