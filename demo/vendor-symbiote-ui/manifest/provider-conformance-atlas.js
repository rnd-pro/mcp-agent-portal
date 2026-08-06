import { listComponents } from './component-registry.js';

export const PROVIDER_CONFORMANCE_ATLAS_SCHEMA = 'provider-conformance-atlas-v1';
export const PROVIDER_CONFORMANCE_CASE_SCHEMA = 'provider-conformance-case-v1';
export const PROVIDER_CONFORMANCE_RECEIPT_SCHEMA = 'provider-conformance-receipt-v1';

export const HTML_INPUT_TYPES = Object.freeze([
  'button',
  'checkbox',
  'color',
  'date',
  'datetime-local',
  'email',
  'file',
  'hidden',
  'image',
  'month',
  'number',
  'password',
  'radio',
  'range',
  'reset',
  'search',
  'submit',
  'tel',
  'text',
  'time',
  'url',
  'week',
]);

const HTML_INPUT_REFERENCE = 'https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input';
const INPUT_EVENT_REFERENCE = 'https://developer.mozilla.org/en-US/docs/Web/API/Element/input_event';
const CHANGE_EVENT_REFERENCE = 'https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/change_event';
const CLICK_EVENT_REFERENCE = 'https://developer.mozilla.org/en-US/docs/Web/API/Element/click_event';

function digest(value) {
  let text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function eventNames(component) {
  return (component.contract?.events || [])
    .map((event) => event?.name)
    .filter(Boolean);
}

function intentEventNames(tool = {}) {
  let annotations = tool.annotations || {};
  return [
    annotations.intentEvent,
    ...(Array.isArray(annotations.intentEvents) ? annotations.intentEvents : []),
  ].filter(Boolean);
}

function controlComponents(components) {
  return components.filter((component) => component.category === 'control'
    || component.contract?.capabilities?.includes('form-control'));
}

function sampleForSchema(schema = {}, label = 'fixture') {
  if (Array.isArray(schema.enum) && schema.enum.length) return clone(schema.enum[0]);
  if (schema.const !== undefined) return clone(schema.const);
  let type = Array.isArray(schema.type) ? schema.type.find((item) => item !== 'null') : schema.type;
  if (type === 'boolean') return true;
  if (type === 'integer') return Number.isFinite(schema.minimum) ? Math.ceil(schema.minimum) : 1;
  if (type === 'number') return Number.isFinite(schema.minimum) ? schema.minimum : 1;
  if (type === 'array') return [sampleForSchema(schema.items || {}, `${label}-item`)];
  if (type === 'object' || schema.properties) {
    let result = {};
    for (let key of schema.required || []) {
      result[key] = sampleForSchema(schema.properties?.[key] || {}, key);
    }
    return result;
  }
  return label;
}

function webMcpPayloadCases(tool = {}) {
  let schema = tool.inputSchema || { type: 'object', properties: {} };
  let properties = schema.properties || {};
  let baseline = sampleForSchema(schema, 'fixture');
  let variants = [{ id: 'required-baseline', payload: baseline }];
  for (let [property, propertySchema] of Object.entries(properties)) {
    let values = Array.isArray(propertySchema.enum)
      ? propertySchema.enum
      : propertySchema.type === 'boolean'
        ? [false, true]
        : [sampleForSchema(propertySchema, `${property}-fixture`)];
    for (let [index, value] of values.entries()) {
      variants.push({
        id: `${property}-${index + 1}`,
        property,
        payload: { ...clone(baseline), [property]: clone(value) },
      });
    }
  }
  let seen = new Set();
  return variants.filter((variant) => {
    let key = JSON.stringify(variant.payload);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function descriptorValues(descriptor = {}) {
  if (Array.isArray(descriptor.enum) && descriptor.enum.length) return descriptor.enum;
  let type = String(descriptor.type || 'string').toLowerCase();
  if (type.includes('boolean')) return [false, true];
  if (type.includes('number') || type.includes('integer')) return [0, 1];
  if (type.includes('array')) return [[], ['fixture']];
  if (type.includes('object')) return [{}, { fixture: true }];
  return ['', 'fixture value'];
}

function componentInputCases(component) {
  let descriptors = new Map();
  for (let source of [component.contract?.attributes || [], component.contract?.properties || []]) {
    for (let descriptor of source) {
      if (!descriptor?.name || String(descriptor.type || '').toLowerCase().includes('function')) continue;
      if (!descriptors.has(descriptor.name)) descriptors.set(descriptor.name, descriptor);
    }
  }
  let cases = [];
  for (let [name, descriptor] of descriptors) {
    for (let [index, value] of descriptorValues(descriptor).entries()) {
      cases.push({
        schemaVersion: PROVIDER_CONFORMANCE_CASE_SCHEMA,
        caseId: `control:${component.tagName}:${name}:${index + 1}`,
        kind: 'component-input',
        component: {
          tagName: component.tagName,
          category: component.category,
          capabilities: component.contract?.capabilities || [],
        },
        fixture: {
          initialValue: index === 0 ? clone(descriptorValues(descriptor)[1] ?? null) : clone(descriptorValues(descriptor)[0] ?? null),
          inputName: name,
          inputType: descriptor.type || 'string',
          value: clone(value),
        },
        action: { type: 'interact-control', inputName: name, value: clone(value) },
        expected: {
          value: clone(value),
          visibleResult: true,
          reset: true,
          eventNames: [],
        },
        execution: { admission: 'executable', requiresHostAdapter: false },
      });
    }
  }
  return cases;
}

function htmlInputAdmission(type) {
  if (type === 'password') {
    return { admission: 'restricted', reason: 'Credential entry is excluded from presentation fixtures.' };
  }
  if (type === 'hidden') {
    return { admission: 'non-visual', reason: 'Hidden inputs have no visual interaction surface.' };
  }
  if (type === 'file') {
    return { admission: 'host-adapter', reason: 'File interaction requires a controlled in-memory fixture.' };
  }
  if (type === 'image') {
    return { admission: 'host-adapter', reason: 'Image submit uses a controlled local fixture asset.' };
  }
  return { admission: 'executable', reason: '' };
}

function htmlInputEvents(type) {
  if (['button', 'image', 'reset', 'submit'].includes(type)) return ['click'];
  if (type === 'hidden') return [];
  if (['checkbox', 'radio'].includes(type)) return ['input', 'change', 'click'];
  return ['input', 'change'];
}

function htmlInputValue(type) {
  if (['button', 'reset', 'submit'].includes(type)) return 'Run fixture';
  if (type === 'checkbox' || type === 'radio') return true;
  if (type === 'color') return '#336699';
  if (type === 'date') return '2026-07-13';
  if (type === 'datetime-local') return '2026-07-13T12:30';
  if (type === 'email') return 'presenter@example.test';
  if (type === 'file') return { name: 'presentation-fixture.txt', type: 'text/plain', size: 20 };
  if (type === 'month') return '2026-07';
  if (type === 'number' || type === 'range') return 42;
  if (type === 'search') return 'workspace result';
  if (type === 'tel') return '+10000000000';
  if (type === 'time') return '12:30';
  if (type === 'url') return 'https://example.test/workspace';
  if (type === 'week') return '2026-W29';
  return 'presentation fixture';
}

function htmlInputCases(fieldComponent) {
  return HTML_INPUT_TYPES.map((type) => {
    let execution = htmlInputAdmission(type);
    let command = ['button', 'image', 'reset', 'submit'].includes(type);
    return {
      schemaVersion: PROVIDER_CONFORMANCE_CASE_SCHEMA,
      caseId: `html-input:${type}`,
      kind: 'html-input-type',
      component: {
        tagName: fieldComponent?.tagName || 'sn-field',
        category: fieldComponent?.category || 'control',
        capabilities: fieldComponent?.contract?.capabilities || ['native-controls'],
      },
      fixture: {
        element: 'input',
        inputType: type,
        autocomplete: 'off',
        value: htmlInputValue(type),
      },
      action: { type: command ? 'activate-control' : 'interact-control', inputName: 'value', value: htmlInputValue(type) },
      expected: {
        ...(command ? {} : { value: htmlInputValue(type) }),
        visibleResult: type !== 'hidden',
        reset: !command && !['hidden', 'password'].includes(type),
        eventNames: htmlInputEvents(type),
      },
      execution: { ...execution, requiresHostAdapter: execution.admission === 'host-adapter' },
    };
  });
}

function supplementaryInputCases(fieldComponent) {
  return [
    { id: 'textarea', element: 'textarea', value: 'Multi-line presentation fixture', events: ['input', 'change'] },
    { id: 'select', element: 'select', value: 'fixture-option', events: ['input', 'change'] },
    { id: 'contenteditable', element: 'div', value: 'Rich editable fixture', events: ['beforeinput', 'input'] },
  ].map((variant) => ({
    schemaVersion: PROVIDER_CONFORMANCE_CASE_SCHEMA,
    caseId: `html-control:${variant.id}`,
    kind: 'html-input-surface',
    component: {
      tagName: fieldComponent?.tagName || 'sn-field',
      category: fieldComponent?.category || 'control',
      capabilities: fieldComponent?.contract?.capabilities || ['native-controls'],
    },
    fixture: { element: variant.element, inputType: variant.id, value: variant.value },
    action: { type: 'interact-control', inputName: 'value', value: variant.value },
    expected: { value: variant.value, visibleResult: true, reset: true, eventNames: variant.events },
    execution: { admission: 'executable', requiresHostAdapter: false },
  }));
}

function componentEventCases(components) {
  return components.flatMap((component) => (component.contract?.events || []).map((event) => ({
    schemaVersion: PROVIDER_CONFORMANCE_CASE_SCHEMA,
    caseId: `event:${component.tagName}:${event.name}`,
    kind: 'component-event',
    component: {
      tagName: component.tagName,
      category: component.category,
      capabilities: component.contract?.capabilities || [],
    },
    fixture: { eventName: event.name, detail: event.detail || [] },
    action: { type: 'trigger-declared-event', eventName: event.name },
    expected: { eventNames: [event.name], visibleResult: true, reset: true },
    execution: { admission: 'executable', requiresHostAdapter: true },
  })));
}

function webMcpCases(components) {
  return components.flatMap((component) => (component.contract?.webmcp?.tools || []).flatMap((tool) => (
    webMcpPayloadCases(tool).map((variant) => ({
      schemaVersion: PROVIDER_CONFORMANCE_CASE_SCHEMA,
      caseId: `webmcp:${component.tagName}:${tool.name}:${variant.id}`,
      kind: 'webmcp-input',
      component: {
        tagName: component.tagName,
        category: component.category,
        capabilities: component.contract?.capabilities || [],
      },
      fixture: {
        toolName: tool.name,
        inputSchema: clone(tool.inputSchema || {}),
        payload: variant.payload,
        variedProperty: variant.property || null,
      },
      action: { type: 'invoke-webmcp-tool', toolName: tool.name, payload: variant.payload },
      expected: {
        eventNames: intentEventNames(tool),
        visibleResult: true,
        reset: true,
      },
      execution: { admission: 'executable', requiresHostAdapter: true },
    }))
  )));
}

export function getProviderConformanceAtlas(options = {}) {
  let components = listComponents({
    includeInternal: options.includeInternal === true,
    includeExperimental: options.includeExperimental !== false,
  });
  let controls = controlComponents(components);
  let events = componentEventCases(components);
  let componentInputs = controls.flatMap(componentInputCases);
  let field = components.find((component) => component.tagName === 'sn-field');
  let nativeInputs = [...htmlInputCases(field), ...supplementaryInputCases(field)];
  let webmcp = webMcpCases(components);
  let cases = [...events, ...componentInputs, ...nativeInputs, ...webmcp];
  let sourceProjection = components.map((component) => ({
    tagName: component.tagName,
    events: eventNames(component),
    tools: (component.contract?.webmcp?.tools || []).map((tool) => tool.name),
  }));
  let atlas = {
    schemaVersion: PROVIDER_CONFORMANCE_ATLAS_SCHEMA,
    source: {
      componentRegistry: 'manifest/component-registry.js',
      registryDigest: digest(sourceProjection),
      references: [HTML_INPUT_REFERENCE, INPUT_EVENT_REFERENCE, CHANGE_EVENT_REFERENCE, CLICK_EVENT_REFERENCE],
    },
    policy: {
      credentialInput: 'restricted',
      autofill: 'disabled-in-fixtures',
      files: 'controlled-host-adapter',
      visualEvidence: 'event-log-and-result-surface',
    },
    controls: controls.map((component) => ({
      tagName: component.tagName,
      category: component.category,
      capabilities: component.contract?.capabilities || [],
      eventNames: eventNames(component),
    })),
    cases: { events, componentInputs, nativeInputs, webmcp },
    summary: {
      componentCount: components.length,
      controlCount: controls.length,
      declaredEventCount: events.length,
      componentInputCaseCount: componentInputs.length,
      nativeInputCaseCount: nativeInputs.length,
      webmcpToolCount: new Set(webmcp.map((item) => item.fixture.toolName)).size,
      webmcpInputCaseCount: webmcp.length,
      totalCaseCount: cases.length,
      executableCaseCount: cases.filter((item) => item.execution.admission === 'executable').length,
      hostAdapterCaseCount: cases.filter((item) => item.execution.requiresHostAdapter).length,
      excludedCaseCount: cases.filter((item) => ['restricted', 'non-visual'].includes(item.execution.admission)).length,
    },
  };
  if (options.includeCases === false) {
    let caseCatalog = Object.fromEntries(Object.entries(atlas.cases).map(([name, entries]) => [name, {
      count: entries.length,
      digest: digest(entries.map((entry) => entry.caseId)),
    }]));
    let { cases: _cases, ...summary } = atlas;
    return { ...summary, caseCatalog };
  }
  return atlas;
}

function sameValue(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  let leftKeys = Object.keys(left).sort();
  let rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    let key = leftKeys[index];
    if (key !== rightKeys[index] || !sameValue(left[key], right[key])) return false;
  }
  return true;
}

function eventNameList(value) {
  return (Array.isArray(value) ? value : []).map((event) => (
    typeof event === 'string' ? event : event?.name || event?.type
  )).filter(Boolean);
}

export async function executeProviderConformanceCase(testCase, adapter = {}) {
  if (!testCase || testCase.schemaVersion !== PROVIDER_CONFORMANCE_CASE_SCHEMA) {
    throw new TypeError('provider conformance execution requires provider-conformance-case-v1');
  }
  let startedAt = Date.now();
  let admission = testCase.execution?.admission || 'restricted';
  if (admission === 'restricted' || admission === 'non-visual') {
    return {
      schemaVersion: PROVIDER_CONFORMANCE_RECEIPT_SCHEMA,
      caseId: testCase.caseId,
      status: 'excluded',
      admission,
      excluded: true,
      exclusionReason: testCase.execution?.reason || `Case admission is ${admission}.`,
      passed: false,
      action: null,
      result: null,
      reset: null,
      failures: [],
      durationMs: Date.now() - startedAt,
    };
  }
  for (let method of ['mount', 'perform', 'snapshot', 'dispose']) {
    if (typeof adapter[method] !== 'function') {
      throw new TypeError(`provider conformance adapter requires ${method}()`);
    }
  }

  let mounted = null;
  let before = null;
  let actionReceipt = null;
  let resultReceipt = null;
  let resetReceipt = null;
  let failures = [];
  try {
    mounted = await adapter.mount(testCase);
    before = clone(await adapter.snapshot(mounted, testCase));
    actionReceipt = await adapter.perform(mounted, testCase.action, testCase);
    let after = await adapter.snapshot(mounted, testCase);
    let observedEvents = eventNameList([
      ...(actionReceipt?.events || []),
      ...(after?.events || []),
    ]);
    let missingEvents = (testCase.expected?.eventNames || [])
      .filter((name) => !observedEvents.includes(name));
    if (missingEvents.length) failures.push(`missing events: ${missingEvents.join(', ')}`);

    let actualValue = after?.value ?? actionReceipt?.value;
    if (Object.prototype.hasOwnProperty.call(testCase.expected || {}, 'value')
      && !sameValue(actualValue, testCase.expected.value)) {
      failures.push('result value does not match the fixture');
    }
    let visibleResult = Boolean(after?.visibleResult ?? actionReceipt?.visibleResult);
    if (testCase.expected?.visibleResult && !visibleResult) failures.push('visible result was not observed');
    resultReceipt = { ...after, observedEvents, visibleResult };

    if (testCase.expected?.reset) {
      if (typeof adapter.reset !== 'function') failures.push('adapter does not provide reset()');
      else {
        let resetAction = await adapter.reset(mounted, testCase, clone(before));
        let finalSnapshot = await adapter.snapshot(mounted, testCase);
        let resetPassed = sameValue(finalSnapshot, before);
        if (!resetPassed) failures.push('fixture did not return to its initial snapshot');
        resetReceipt = { ...resetAction, finalSnapshot, passed: resetPassed };
      }
    }
  } catch (error) {
    failures.push(error?.message || String(error));
  } finally {
    if (mounted !== null) await adapter.dispose(mounted, testCase);
  }
  return {
    schemaVersion: PROVIDER_CONFORMANCE_RECEIPT_SCHEMA,
    caseId: testCase.caseId,
    status: failures.length ? 'failed' : 'passed',
    admission,
    excluded: false,
    passed: failures.length === 0,
    action: actionReceipt,
    result: resultReceipt,
    reset: resetReceipt,
    failures,
    durationMs: Date.now() - startedAt,
  };
}
