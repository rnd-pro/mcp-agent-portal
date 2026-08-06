import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createProductWebMcpBundle,
  getModelContext,
  publishProductRuntimeContext,
  registerProductContextTools,
  registerWebMcpTool,
} from '../webmcp.js';

test('getModelContext ignores the deprecated navigator surface', () => {
  let previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { modelContext: { registerTool() {} } } });
  try {
    assert.equal(getModelContext({}), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete globalThis.navigator;
  }
});

test('registerWebMcpTool maps AbortSignal lifecycle options to the native surface without double cleanup', async () => {
  let controller = new AbortController();
  let seenDescriptor;
  let seenOptions;
  let unregisterCalls = 0;
  let target = {
    modelContext: {
      async registerTool(descriptor, options) {
        seenDescriptor = descriptor;
        seenOptions = options;
        let unregister = () => {
          unregisterCalls += 1;
        };
        options.signal.addEventListener('abort', unregister, { once: true });
        return unregister;
      },
    },
  };

  let registration = await registerWebMcpTool({
    name: 'inspect_record',
    description: 'Inspect the selected record',
    inputSchema: { type: 'object' },
    execute() {},
  }, target, { signal: controller.signal, exposedTo: ['https://agent.example'] });

  assert.equal(seenDescriptor.name, 'inspect_record');
  assert.ok(seenOptions.signal instanceof AbortSignal);
  assert.notEqual(seenOptions.signal, controller.signal);
  assert.deepEqual(seenOptions.exposedTo, ['https://agent.example']);
  assert.equal(registration.nativeActive, false);
  controller.abort();
  registration.unregister();
  registration.unregister();
  assert.equal(unregisterCalls, 1);
});

test('registerWebMcpTool rejects an initially aborted external signal with its exact reason', async () => {
  let controller = new AbortController();
  let reason = new Error('registration cancelled');
  let registerCalls = 0;
  controller.abort(reason);

  await assert.rejects(
    registerWebMcpTool({
      name: 'cancelled_tool',
      execute() {},
    }, {
      modelContext: {
        registerTool() {
          registerCalls += 1;
        },
      },
    }, { signal: controller.signal }),
    (error) => error === reason,
  );
  assert.equal(registerCalls, 0);
});

test('registerWebMcpTool creates an AbortError when an initially aborted signal has no reason', async () => {
  await assert.rejects(
    registerWebMcpTool({
      name: 'cancelled_tool_without_reason',
      execute() {},
    }, {}, { signal: { aborted: true, reason: undefined } }),
    (error) => error?.name === 'AbortError',
  );
});

test('registerProductContextTools binds executeAction to native descriptors and executes it', async () => {
  let originalHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = class HTMLElement {};

  try {
    let capturedDescriptor;
    let seenCommand;
    let seenContext;

    let target = {
      modelContext: {
        async registerTool(descriptor) {
          capturedDescriptor = descriptor;
          return () => {};
        }
      }
    };

    let productContext = {
      product: { id: 'test-product', name: 'Test Product' },
      actions: [{ id: 'test-action', name: 'test_action', allowed: true }]
    };

    let bundle = await registerProductContextTools(productContext, {
      target,
      executeAction(command, context) {
        seenCommand = command;
        seenContext = context;
        return { success: true };
      }
    });

    assert.ok(capturedDescriptor, 'Should have registered a descriptor');
    assert.equal(capturedDescriptor.name, 'test_action');

    let result = await capturedDescriptor.execute({ key: 'val' });

    assert.deepEqual(seenCommand, { tool: 'test_action', input: { key: 'val' } });
    assert.ok(seenContext, 'Execution context should be passed');
    assert.equal(seenContext.action.id, 'test-action');
    assert.equal(seenContext.descriptor, capturedDescriptor);
    assert.equal(result.success, true);
  } finally {
    if (originalHTMLElement) {
      globalThis.HTMLElement = originalHTMLElement;
    } else {
      delete globalThis.HTMLElement;
    }
  }
});

test('registerProductContextTools registers the exact descriptors from a supplied canonical bundle', async () => {
  let productContext = {
    product: { id: 'test-product', name: 'Test Product' },
    actions: [{ id: 'canonical-action', name: 'canonical_action', allowed: true }],
  };
  let executions = 0;
  let bundle = createProductWebMcpBundle(productContext, {
    executeAction() {
      executions += 1;
      return { success: true };
    },
  });
  let capturedDescriptor;
  let registrationSignal;
  let target = {
    modelContext: {
      registerTool(descriptor, options) {
        capturedDescriptor = descriptor;
        registrationSignal = options.signal;
      },
    },
  };

  let producer = await registerProductContextTools(productContext, {
    bundle,
    target,
    publishContext: false,
  });

  assert.equal(capturedDescriptor, bundle.descriptors[0]);
  assert.equal(capturedDescriptor, producer.descriptors[0]);
  let nativeExecute = capturedDescriptor.execute;
  await nativeExecute({ value: 1 });
  producer.refresh({ activeWindowId: 'refreshed-window' }, { publishContext: false });
  assert.equal(capturedDescriptor, producer.descriptors[0]);
  await nativeExecute({ value: 2 });
  assert.equal(executions, 2);

  producer.unregister();
  assert.equal(registrationSignal.aborted, true);
});

test('registerProductContextTools rejects malformed supplied bundles before registration', async () => {
  let productContext = {
    product: { id: 'test-product', name: 'Test Product' },
    actions: [{ id: 'canonical-action', name: 'canonical_action', allowed: true }],
  };
  let registrationCalls = 0;
  let target = {
    modelContext: {
      registerTool() {
        registrationCalls += 1;
      },
    },
  };

  await assert.rejects(
    registerProductContextTools(productContext, { bundle: {}, target }),
    /bundle requires context/,
  );

  let bundle = createProductWebMcpBundle(productContext, { executeAction() {} });
  await assert.rejects(
    registerProductContextTools(productContext, {
      bundle: {
        ...bundle,
        descriptors: [{ ...bundle.descriptors[0], execute: undefined }],
      },
      target,
    }),
    /ToolDescriptor canonical_action requires an execute function/,
  );
  assert.equal(registrationCalls, 0);
});

test('createProductWebMcpBundle aligns descriptor enrichment exactly with allowed action indexes (index drift fix)', async () => {
  let productContext = {
    product: { id: 'test-product', name: 'Test Product' },
    actions: [
      { id: 'first-action', name: 'first_action', allowed: false },
      { id: 'second-action', name: 'second_action', allowed: true }
    ]
  };

  let enrichCalls = [];
  let bundle = createProductWebMcpBundle(productContext, {
    enrichActionDescriptor(descriptor, action) {
      enrichCalls.push({ descriptor, action });
      descriptor.enriched = true;
      return descriptor;
    }
  });

  assert.equal(bundle.descriptors.length, 1);
  assert.equal(bundle.descriptors[0].name, 'second_action');
  assert.equal(enrichCalls.length, 1);
  assert.equal(enrichCalls[0].action.id, 'second-action');
  assert.equal(enrichCalls[0].descriptor.name, 'second_action');
});

test('registerWebMcpTool and registerProductContextTools honor nativeActive:false / supportsNativeToolDescriptor:false on target modelContext', async () => {
  let originalHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = class HTMLElement {};

  try {
    let productContext = {
      product: { id: 'test-product', name: 'Test Product' },
      actions: [{ id: 'test-action', name: 'test_action', allowed: true }]
    };

    let target1 = {
      modelContext: {
        nativeActive: false,
        async registerTool(descriptor) {
          return () => {};
        }
      }
    };
    let result1 = await registerProductContextTools(productContext, {
      target: target1,
      executeAction() {}
    });
    assert.equal(result1.nativeActive, false);

    let target2 = {
      modelContext: {
        supportsNativeToolDescriptor: false,
        async registerTool(descriptor) {
          return () => {};
        }
      }
    };
    let result2 = await registerProductContextTools(productContext, {
      target: target2,
      executeAction() {}
    });
    assert.equal(result2.nativeActive, false);
  } finally {
    if (originalHTMLElement) {
      globalThis.HTMLElement = originalHTMLElement;
    } else {
      delete globalThis.HTMLElement;
    }
  }
});

test('registerWebMcpTool supports detached execution callback invocation', async () => {
  let target = {
    modelContext: {
      async registerTool(descriptor) {
        return () => {};
      }
    }
  };
  let executed = false;
  let registration = await registerWebMcpTool({
    name: 'test_detached',
    description: 'test description',
    inputSchema: { type: 'object' },
    execute(input) {
      assert.deepEqual(input, { key: 'value' });
      executed = true;
    }
  }, target);

  let execute = registration.descriptor.execute;
  await execute({ key: 'value' });
  assert.ok(executed, 'Execute callback should run when invoked detached');
});

test('real shim markers on modelContext yield nativeActive:false', async () => {
  let target = {
    modelContext: {
      nativeActive: false,
      async registerTool(descriptor) {
        return () => {};
      }
    }
  };
  let registration = await registerWebMcpTool({
    name: 'test_shim',
    description: 'test description',
    inputSchema: { type: 'object' },
    execute() {}
  }, target);

  assert.equal(registration.nativeActive, false);
});

test('registerProductContextTools registers with executeAction-only options bag using global document', async () => {
  let originalHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = class HTMLElement {};

  let seenDescriptor = null;
  let originalDocument = globalThis.document;
  globalThis.document = {
    modelContext: {
      async registerTool(descriptor) {
        seenDescriptor = descriptor;
        return () => {};
      }
    }
  };

  try {
    let productContext = {
      product: { id: 'test-product', name: 'Test Product' },
      actions: [{ id: 'test-action', name: 'test_action', allowed: true }]
    };
    let executed = false;
    let result = await registerProductContextTools(productContext, {
      executeAction(command) {
        assert.equal(command.tool, 'test_action');
        executed = true;
        return { success: true };
      }
    });

    assert.equal(result.nativeActive, true);
    assert.equal(result.descriptors.length, 1);
    assert.equal(seenDescriptor, result.descriptors[0]);
    await seenDescriptor.execute({});
    assert.ok(executed);
  } finally {
    if (originalHTMLElement) {
      globalThis.HTMLElement = originalHTMLElement;
    } else {
      delete globalThis.HTMLElement;
    }
    if (originalDocument !== undefined) {
      globalThis.document = originalDocument;
    } else {
      delete globalThis.document;
    }
  }
});

test('registerWebMcpTool passes exactly signal and exposedTo keys to native registerTool', async () => {
  let seenOptions;
  let target = {
    modelContext: {
      async registerTool(descriptor, options) {
        seenOptions = options;
        return () => {};
      }
    }
  };

  let controller = new AbortController();
  await registerWebMcpTool({
    name: 'test_options',
    description: 'test description',
    execute() {}
  }, target, {
    signal: controller.signal,
    exposedTo: ['https://agent.example'],
    nativeActive: true,
    extraInternalFlag: 'should-not-leak'
  });

  assert.ok(seenOptions.signal instanceof AbortSignal);
  assert.deepEqual(seenOptions.exposedTo, ['https://agent.example']);
  assert.ok(!('extraInternalFlag' in seenOptions));
  assert.ok(!('nativeActive' in seenOptions));
  assert.equal(Object.keys(seenOptions).length, 2);
});

test('lifecycle abort unregisters when native registerTool returns undefined', async () => {
  let registrationSignal;
  let target = {
    modelContext: {
      async registerTool(descriptor, options) {
        registrationSignal = options.signal;
      }
    }
  };

  let registration = await registerWebMcpTool({
    name: 'test_undef',
    description: 'test description',
    execute() {}
  }, target);

  assert.equal(typeof registration.unregister, 'function');
  assert.doesNotThrow(() => registration.unregister());
  assert.equal(registrationSignal.aborted, true);
});

test('registerProductContextTools fails fast before first native registration if execute is missing', async () => {
  let productContext = {
    product: { id: 'test-product', name: 'Test Product' },
    actions: [
      { id: 'test-action-1', name: 'test_action_1', allowed: true },
      { id: 'test-action-2', name: 'test_action_2', allowed: true }
    ]
  };

  let registrations = 0;
  let target = {
    modelContext: {
      async registerTool(descriptor) {
        registrations++;
        return () => {};
      }
    }
  };

  await assert.rejects(
    async () => {
      await registerProductContextTools(productContext, { target });
    },
    /ToolDescriptor test_action_1 requires an execute function/
  );

  assert.equal(registrations, 0, 'No native tool should have been registered');
});

test('allowed:false preserves correct action/descriptor pairing (no index drift)', async () => {
  let productContext = {
    product: { id: 'test-product', name: 'Test Product' },
    actions: [
      { id: 'action-1', name: 'action_1', allowed: false },
      { id: 'action-2', name: 'action_2', allowed: true, destructive: true },
      { id: 'action-3', name: 'action_3', allowed: false }
    ]
  };

  let seenActions = [];
  let bundle = createProductWebMcpBundle(productContext, {
    executeAction(command, context) {
      seenActions.push(context.action);
    }
  });

  assert.equal(bundle.descriptors.length, 1);
  assert.equal(bundle.descriptors[0].name, 'action_2');

  await bundle.descriptors[0].execute({});
  assert.equal(seenActions.length, 1);
  assert.equal(seenActions[0].id, 'action-2');
});

test('executable behavior remains after refresh without re-registration', async () => {
  let productContext = {
    product: { id: 'test-product', name: 'Test Product' },
    actions: [{ id: 'test-action', name: 'test_action', allowed: true }]
  };

  let registrations = 0;
  let target = {
    modelContext: {
      async registerTool(descriptor) {
        registrations++;
        return () => {};
      }
    }
  };

  let lastCommand;
  let lastContext;
  let producer = await registerProductContextTools(productContext, {
    target,
    executeAction(command, context) {
      lastCommand = command;
      lastContext = context;
    }
  });

  assert.equal(registrations, 1);

  let originalDesc = producer.descriptors[0];
  await originalDesc.execute({ val: 1 });
  assert.deepEqual(lastCommand, { tool: 'test_action', input: { val: 1 } });

  producer.refresh({ someNewRuntimeField: true });

  assert.equal(registrations, 1);

  await originalDesc.execute({ val: 2 });
  assert.deepEqual(lastCommand, { tool: 'test_action', input: { val: 2 } });
});

test('sync throws and async rejections in executeAction propagate stably', async () => {
  let productContext = {
    product: { id: 'test-product', name: 'Test Product' },
    actions: [
      { id: 'action-1', name: 'action_1', allowed: true },
      { id: 'action-2', name: 'action_2', allowed: true }
    ]
  };

  let bundle = createProductWebMcpBundle(productContext, {
    executeAction(command) {
      if (command.tool === 'action_1') {
        throw new Error('Sync error in action_1');
      } else {
        return Promise.reject(new Error('Async rejection in action_2'));
      }
    }
  });

  await assert.rejects(
    async () => {
      await bundle.descriptors[0].execute({});
    },
    /Sync error in action_1/
  );

  await assert.rejects(
    async () => {
      await bundle.descriptors[1].execute({});
    },
    /Async rejection in action_2/
  );
});

test('destructive action descriptors have destructiveHint: true on the annotations while retaining destructive in annotations and not top-level', () => {
  let productContext = {
    product: { id: 'test-product', name: 'Test Product' },
    actions: [
      { id: 'action-destructive', name: 'action_destructive', allowed: true, destructive: true },
      { id: 'action-normal', name: 'action_normal', allowed: true, destructive: false }
    ]
  };

  let bundle = createProductWebMcpBundle(productContext);

  assert.equal(bundle.descriptors[0].annotations.destructiveHint, true);
  assert.equal(bundle.descriptors[0].annotations.destructive, true);
  assert.ok(!('destructiveHint' in bundle.descriptors[0]));

  assert.equal(bundle.descriptors[1].annotations.destructiveHint, false);
  assert.equal(bundle.descriptors[1].annotations.destructive, false);
  assert.ok(!('destructiveHint' in bundle.descriptors[1]));
});

test('canonical descriptor identity and execution after refresh', async () => {
  let registeredDescriptor;
  let target = {
    modelContext: {
      async registerTool(descriptor) {
        registeredDescriptor = descriptor;
        return () => {};
      }
    }
  };

  let productContext = {
    product: { id: 'test-product', name: 'Test Product' },
    actions: [{ id: 'test-action', name: 'test_action', allowed: true }]
  };

  let executeCalls = [];
  let producer = await registerProductContextTools(productContext, {
    target,
    executeAction(command, context) {
      executeCalls.push({ command, context });
      return { success: true };
    }
  });

  assert.equal(registeredDescriptor, producer.descriptors[0], 'registeredDescriptor should be strictly equal to producer.descriptors[0] before refresh');
  let nativeExecute = registeredDescriptor.execute;

  await nativeExecute({ inputVal: 1 });
  assert.equal(executeCalls.length, 1);
  assert.equal(executeCalls[0].command.input.inputVal, 1);

  producer.refresh({ someRuntime: true });

  assert.equal(registeredDescriptor, producer.descriptors[0], 'registeredDescriptor should be strictly equal to producer.descriptors[0] after refresh');

  await nativeExecute({ inputVal: 2 });
  assert.equal(executeCalls.length, 2);
  assert.equal(executeCalls[1].command.input.inputVal, 2);
});

test('browser registration rejection propagates', async () => {
  let target = {
    modelContext: {
      async registerTool() {
        throw new Error('Failed to register browser tool');
      }
    }
  };

  await assert.rejects(
    async () => {
      await registerWebMcpTool({
        name: 'test_reject',
        execute() {}
      }, target);
    },
    /Failed to register browser tool/
  );
});

test('partial registration rolls back on failure', async () => {
  let registeredTools = [];
  let unregisteredCount = 0;
  let target = {
    modelContext: {
      async registerTool(descriptor, options) {
        if (descriptor.name === 'fail_action') {
          throw new Error('Forced registration failure');
        }
        registeredTools.push(descriptor);
        let unregister = () => {
          unregisteredCount++;
        };
        options.signal.addEventListener('abort', unregister, { once: true });
        return unregister;
      }
    }
  };

  let productContext = {
    product: { id: 'test-product', name: 'Test Product' },
    actions: [
      { id: 'ok-action', name: 'ok_action', allowed: true },
      { id: 'fail-action', name: 'fail_action', allowed: true }
    ]
  };

  await assert.rejects(
    async () => {
      await registerProductContextTools(productContext, {
        target,
        executeAction() {}
      });
    },
    /Forced registration failure/
  );

  assert.equal(registeredTools.length, 1);
  assert.equal(registeredTools[0].name, 'ok_action');
  assert.equal(unregisteredCount, 1, 'Should have unregistered previously registered tools');
});

test('external abort reason is forwarded to internal signal', async () => {
  let controller = new AbortController();
  let seenSignal;
  let target = {
    modelContext: {
      async registerTool(descriptor, options) {
        seenSignal = options.signal;
        return () => {};
      }
    }
  };

  let registrationPromise = registerWebMcpTool({
    name: 'test_abort_reason',
    execute() {}
  }, target, { signal: controller.signal });

  controller.abort('my-custom-reason');

  await registrationPromise;

  assert.ok(seenSignal.aborted);
  assert.equal(seenSignal.reason, 'my-custom-reason');
});

test('signal-owned cleanup stays idempotent when native registerTool also returns its abort listener', async () => {
  let disposerCalls = 0;
  let target = {
    modelContext: {
      async registerTool(descriptor, options) {
        let dispose = () => {
          disposerCalls++;
        };
        options.signal.addEventListener('abort', dispose, { once: true });
        return dispose;
      }
    }
  };

  let registration = await registerWebMcpTool({
    name: 'test_idempotency',
    execute() {}
  }, target);

  registration.unregister();
  registration.unregister();
  registration.unregister();

  assert.equal(disposerCalls, 1, 'Disposer should be called exactly once');
});

test('property publication restores exact pre-existing descriptors and preserves later third-party changes', () => {
  let bundle = createProductWebMcpBundle({
    product: { id: 'test-product', name: 'Test Product' },
    actions: [],
  });
  let canonicalBaseline = { source: 'canonical-baseline' };
  let aliasBaseline = { source: 'alias-baseline' };
  let modelContext = {};
  Object.defineProperty(modelContext, 'symbiote.productRuntimeContext', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: canonicalBaseline,
  });
  Object.defineProperty(modelContext, 'productRuntimeContext', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: aliasBaseline,
  });
  let canonicalDescriptor = Object.getOwnPropertyDescriptor(modelContext, 'symbiote.productRuntimeContext');
  let aliasDescriptor = Object.getOwnPropertyDescriptor(modelContext, 'productRuntimeContext');

  let publication = publishProductRuntimeContext(bundle.contextView, { modelContext });
  assert.equal(modelContext['symbiote.productRuntimeContext'], bundle.contextView);
  assert.equal(modelContext.productRuntimeContext, bundle.contextView);
  publication.unregister();
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(modelContext, 'symbiote.productRuntimeContext'),
    canonicalDescriptor,
  );
  assert.deepEqual(Object.getOwnPropertyDescriptor(modelContext, 'productRuntimeContext'), aliasDescriptor);

  let replacement = publishProductRuntimeContext(bundle.contextView, { modelContext });
  let thirdPartyValue = { source: 'third-party' };
  modelContext['symbiote.productRuntimeContext'] = thirdPartyValue;
  replacement.unregister();
  assert.equal(modelContext['symbiote.productRuntimeContext'], thirdPartyValue);
  assert.deepEqual(Object.getOwnPropertyDescriptor(modelContext, 'productRuntimeContext'), aliasDescriptor);
});

test('publication-staging failure preserves the exact old producer publication context and descriptors', async () => {
  let productContext = {
    product: { id: 'test-product', name: 'Test Product' },
    actions: [{ id: 'refresh-action', name: 'refresh_action', allowed: true }],
  };
  let modelContext = { registerTool() {} };
  let producer = await registerProductContextTools(productContext, {
    target: { modelContext },
    executeAction() {},
  });
  let oldContextView = producer.contextView;
  let oldRuntime = producer.runtime;
  let oldPublication = producer.publication;
  let oldDescriptor = producer.descriptors[0];
  let oldDescriptorState = Object.getOwnPropertyDescriptors(oldDescriptor);
  let aliasValue = modelContext.productRuntimeContext;
  Object.defineProperty(modelContext, 'productRuntimeContext', {
    configurable: true,
    enumerable: true,
    get() {
      return aliasValue;
    },
    set() {
      throw new Error('replacement property failed');
    },
  });
  let aliasDescriptor = Object.getOwnPropertyDescriptor(modelContext, 'productRuntimeContext');

  assert.throws(
    () => producer.refresh({ activeWindowId: 'next-window' }),
    /replacement property failed/,
  );

  assert.equal(producer.contextView, oldContextView);
  assert.equal(producer.runtime, oldRuntime);
  assert.equal(producer.publication, oldPublication);
  assert.equal(producer.descriptors[0], oldDescriptor);
  assert.deepEqual(Object.getOwnPropertyDescriptors(oldDescriptor), oldDescriptorState);
  assert.equal(modelContext['symbiote.productRuntimeContext'], oldContextView);
  assert.equal(modelContext.productRuntimeContext, oldContextView);
  assert.deepEqual(Object.getOwnPropertyDescriptor(modelContext, 'productRuntimeContext'), aliasDescriptor);
});

test('descriptor commit failure rolls back a staged publication and every partial descriptor mutation', async () => {
  let productContext = {
    product: { id: 'test-product', name: 'Test Product' },
    actions: [
      { id: 'first-action', name: 'first_action', allowed: true },
      { id: 'second-action', name: 'second_action', allowed: true },
    ],
  };
  let publicationWrites = 0;
  let canonicalSlot = { source: 'canonical-baseline' };
  let aliasSlot = { source: 'alias-baseline' };
  let modelContext = { registerTool() {} };
  Object.defineProperty(modelContext, 'symbiote.productRuntimeContext', {
    configurable: true,
    enumerable: false,
    get() {
      return canonicalSlot;
    },
    set(value) {
      publicationWrites += 1;
      canonicalSlot = value;
    },
  });
  Object.defineProperty(modelContext, 'productRuntimeContext', {
    configurable: true,
    enumerable: true,
    get() {
      return aliasSlot;
    },
    set(value) {
      publicationWrites += 1;
      aliasSlot = value;
    },
  });
  let producer = await registerProductContextTools(productContext, {
    target: { modelContext },
    executeAction() {},
  });
  let descriptorArray = producer.descriptors;
  let descriptorIdentities = [...producer.descriptors];
  let oldContextView = producer.contextView;
  let oldRuntime = producer.runtime;
  let oldPublication = producer.publication;
  let firstDescription = producer.descriptors[0].description;
  let firstDescriptorWrites = 0;
  Object.defineProperty(producer.descriptors[0], 'description', {
    configurable: true,
    enumerable: true,
    get() {
      return firstDescription;
    },
    set(value) {
      assert.notEqual(canonicalSlot, oldContextView);
      assert.notEqual(aliasSlot, oldContextView);
      firstDescriptorWrites += 1;
      firstDescription = value;
    },
  });
  Object.defineProperty(producer.descriptors[1], 'name', {
    ...Object.getOwnPropertyDescriptor(producer.descriptors[1], 'name'),
    writable: false,
  });
  let descriptorStates = producer.descriptors.map((descriptor) => Object.getOwnPropertyDescriptors(descriptor));
  let descriptorFields = producer.descriptors.map((descriptor) => ({
    name: descriptor.name,
    description: descriptor.description,
    execute: descriptor.execute,
    annotations: descriptor.annotations,
  }));
  let canonicalDescriptor = Object.getOwnPropertyDescriptor(modelContext, 'symbiote.productRuntimeContext');
  let aliasDescriptor = Object.getOwnPropertyDescriptor(modelContext, 'productRuntimeContext');
  publicationWrites = 0;

  assert.throws(
    () => producer.refresh({ activeWindowId: 'next-window' }),
    TypeError,
  );

  assert.equal(firstDescriptorWrites, 1);
  assert.equal(publicationWrites, 4);
  assert.equal(producer.descriptors, descriptorArray);
  assert.deepEqual(producer.descriptors, descriptorIdentities);
  for (let [index, descriptor] of producer.descriptors.entries()) {
    assert.equal(descriptor, descriptorIdentities[index]);
    assert.deepEqual(Object.getOwnPropertyDescriptors(descriptor), descriptorStates[index]);
    assert.equal(descriptor.name, descriptorFields[index].name);
    assert.equal(descriptor.description, descriptorFields[index].description);
    assert.equal(descriptor.execute, descriptorFields[index].execute);
    assert.equal(descriptor.annotations, descriptorFields[index].annotations);
  }
  assert.equal(producer.contextView, oldContextView);
  assert.equal(producer.runtime, oldRuntime);
  assert.equal(producer.publication, oldPublication);
  assert.equal(modelContext['symbiote.productRuntimeContext'], oldContextView);
  assert.equal(modelContext.productRuntimeContext, oldContextView);
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(modelContext, 'symbiote.productRuntimeContext'),
    canonicalDescriptor,
  );
  assert.deepEqual(Object.getOwnPropertyDescriptor(modelContext, 'productRuntimeContext'), aliasDescriptor);
});

test('successful property refresh unregister restores the baseline instead of the superseded runtime view', async () => {
  let productContext = {
    product: { id: 'test-product', name: 'Test Product' },
    actions: [{ id: 'refresh-action', name: 'refresh_action', allowed: true }],
  };
  let canonicalBaseline = { source: 'canonical-baseline' };
  let aliasBaseline = { source: 'alias-baseline' };
  let modelContext = { registerTool() {} };
  Object.defineProperty(modelContext, 'symbiote.productRuntimeContext', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: canonicalBaseline,
  });
  Object.defineProperty(modelContext, 'productRuntimeContext', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: aliasBaseline,
  });
  let canonicalDescriptor = Object.getOwnPropertyDescriptor(modelContext, 'symbiote.productRuntimeContext');
  let aliasDescriptor = Object.getOwnPropertyDescriptor(modelContext, 'productRuntimeContext');
  let producer = await registerProductContextTools(productContext, {
    target: { modelContext },
    executeAction() {},
  });
  let supersededContextView = producer.contextView;

  producer.refresh({ activeWindowId: 'next-window' });
  assert.notEqual(producer.contextView, supersededContextView);
  assert.equal(modelContext['symbiote.productRuntimeContext'], producer.contextView);
  assert.equal(modelContext.productRuntimeContext, producer.contextView);
  producer.unregister();

  assert.deepEqual(
    Object.getOwnPropertyDescriptor(modelContext, 'symbiote.productRuntimeContext'),
    canonicalDescriptor,
  );
  assert.deepEqual(Object.getOwnPropertyDescriptor(modelContext, 'productRuntimeContext'), aliasDescriptor);
  assert.notEqual(modelContext['symbiote.productRuntimeContext'], supersededContextView);
  assert.notEqual(modelContext.productRuntimeContext, supersededContextView);
});

test('custom publisher refresh registers the replacement before unregistering the old publication', async () => {
  let events = [];
  let modelContext = {
    registerTool() {},
    registerContext(payload) {
      let id = payload.value.runtime.activeWindowId || 'initial';
      events.push(`register:${id}`);
      return () => events.push(`unregister:${id}`);
    },
  };
  let producer = await registerProductContextTools({
    product: { id: 'test-product', name: 'Test Product' },
    actions: [{ id: 'refresh-action', name: 'refresh_action', allowed: true }],
  }, {
    target: { modelContext },
    executeAction() {},
  });

  producer.refresh({ activeWindowId: 'next-window' });
  assert.deepEqual(events, [
    'register:initial',
    'register:next-window',
    'unregister:initial',
  ]);
  producer.unregister();
  assert.equal(events.at(-1), 'unregister:next-window');
});

test('publication failure rolls back every tool registration and partial property publication', async () => {
  let registrationSignals = [];
  let cleanupCalls = 0;
  let publisherCalls = 0;
  let propertySetterCalls = 0;
  let aliasBaseline = { source: 'pre-existing-alias' };
  let modelContext = {
    registerTool(descriptor, options) {
      registrationSignals.push(options.signal);
      let cleanup = () => {
        cleanupCalls += 1;
      };
      options.signal.addEventListener('abort', cleanup, { once: true });
      return cleanup;
    },
    registerContext() {
      publisherCalls += 1;
      throw new Error('publisher failed');
    },
  };
  Object.defineProperty(modelContext, 'productRuntimeContext', {
    configurable: true,
    enumerable: false,
    get() {
      return aliasBaseline;
    },
    set(value) {
      propertySetterCalls += 1;
      throw new Error(`property publication failed: ${Boolean(value)}`);
    },
  });
  let aliasDescriptor = Object.getOwnPropertyDescriptor(modelContext, 'productRuntimeContext');

  await assert.rejects(
    registerProductContextTools({
      product: { id: 'test-product', name: 'Test Product' },
      actions: [
        { id: 'action-1', name: 'action_1', allowed: true },
        { id: 'action-2', name: 'action_2', allowed: true },
      ],
    }, {
      target: { modelContext },
      executeAction() {},
    }),
    /property publication failed/,
  );

  assert.equal(registrationSignals.length, 2);
  assert.ok(registrationSignals.every((signal) => signal.aborted));
  assert.equal(cleanupCalls, 2);
  assert.equal(publisherCalls, 1);
  assert.equal(propertySetterCalls, 1);
  assert.equal(Object.hasOwn(modelContext, 'symbiote.productRuntimeContext'), false);
  assert.equal(modelContext.productRuntimeContext, aliasBaseline);
  assert.deepEqual(Object.getOwnPropertyDescriptor(modelContext, 'productRuntimeContext'), aliasDescriptor);
});

test('out-of-band execution context is forwarded to executeAction', async () => {
  let productContext = {
    product: { id: 'test-product', name: 'Test Product' },
    actions: [{ id: 'test-action', name: 'test_action', allowed: true }]
  };

  let seenContext;
  let bundle = createProductWebMcpBundle(productContext, {
    executeAction(command, context) {
      seenContext = context;
      return { success: true };
    }
  });

  let dummySignal = new AbortController().signal;
  let dummySource = {};
  let dummySettled = () => {};

  await bundle.descriptors[0].execute({ val: 1 }, {
    signal: dummySignal,
    source: dummySource,
    onSettled: dummySettled
  });

  assert.equal(seenContext.signal, dummySignal);
  assert.equal(seenContext.source, dummySource);
  assert.equal(seenContext.onSettled, dummySettled);
});
