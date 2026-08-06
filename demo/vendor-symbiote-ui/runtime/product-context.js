export const PRODUCT_CONTEXT_VERSION = 'product-context-v1';
export const PRODUCT_CONTEXT_SCHEMA_ID = 'https://rnd-pro.github.io/symbiote-ui/schemas/product-context-v1.json';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRecord(value) {
  return isObject(value) ? { ...value } : {};
}

function normalizeText(value, fallback = '') {
  let text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function normalizeId(value, fallback = '') {
  let text = normalizeText(value, fallback);
  return text.toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '');
}

function normalizeToolName(value, productId = '') {
  let base = normalizeText(value);
  let prefix = normalizeText(productId).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  let name = base || (prefix ? `${prefix}_action` : 'product_action');
  name = name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
  if (!/^[a-zA-Z_]/.test(name)) name = `product_${name}`;
  return name || 'product_action';
}

function normalizeStringArray(value) {
  let items = Array.isArray(value) ? value : (value == null ? [] : [value]);
  return [...new Set(items.map((item) => normalizeText(item)).filter(Boolean))];
}

function normalizeSchema(schema) {
  if (isObject(schema)) return { ...schema };
  return {
    type: 'object',
    additionalProperties: true,
  };
}

function normalizeProduct(source = {}) {
  let product = isObject(source.product) ? source.product : source;
  let id = normalizeId(product.id || product.productId || product.name, 'product');
  return {
    id,
    name: normalizeText(product.name || product.label || product.title, id),
    category: normalizeText(product.category || product.type, 'product'),
    description: normalizeText(product.description || product.summary),
    url: normalizeText(product.url || product.href),
    metadata: normalizeRecord(product.metadata),
  };
}

function normalizeView(source = {}, index = 0) {
  let id = normalizeId(source.id || source.viewId || source.name, `view-${index + 1}`);
  return {
    id,
    label: normalizeText(source.label || source.title || source.name, id),
    route: normalizeText(source.route || source.path || source.href, `#${id}`),
    description: normalizeText(source.description || source.summary),
    componentRefs: normalizeStringArray(source.componentRefs || source.components),
    entityRefs: normalizeStringArray(source.entityRefs || source.entities),
    actionRefs: normalizeStringArray(source.actionRefs || source.actions),
    active: Boolean(source.active),
    metadata: normalizeRecord(source.metadata),
  };
}

function normalizeComponentRef(source = {}, index = 0) {
  let component = normalizeText(source.component || source.tagName || source.tag);
  let id = normalizeId(source.id || source.refId || source.componentId || component, `component-${index + 1}`);
  return {
    id,
    component,
    descriptor: normalizeText(source.descriptor || source.descriptorId || source.componentDescriptor),
    schema: normalizeText(source.schema || source.descriptorSchema || source.schemaVersion),
    version: normalizeText(source.version || source.descriptorVersion || source.contract?.schemaVersion),
    capabilities: normalizeStringArray(source.capabilities || source.contract?.capabilities),
    componentId: normalizeText(source.componentId || source.runtimeId || source.elementId),
    selector: normalizeText(source.selector),
    viewId: normalizeId(source.viewId || source.view),
    role: normalizeText(source.role || source.semanticRole, component || 'component'),
    description: normalizeText(source.description || source.summary),
    entityRefs: normalizeStringArray(source.entityRefs || source.entities),
    actionRefs: normalizeStringArray(source.actionRefs || source.actions),
    metadata: normalizeRecord(source.metadata),
  };
}

function normalizeEntity(source = {}, index = 0) {
  let id = normalizeId(source.id || source.entityId || source.key || source.label, `entity-${index + 1}`);
  return {
    id,
    type: normalizeText(source.type || source.kind, 'entity'),
    label: normalizeText(source.label || source.title || source.name, id),
    description: normalizeText(source.description || source.summary),
    status: normalizeText(source.status || source.state),
    componentRefs: normalizeStringArray(source.componentRefs || source.components),
    actionRefs: normalizeStringArray(source.actionRefs || source.actions),
    data: isObject(source.data) ? { ...source.data } : undefined,
    metadata: normalizeRecord(source.metadata),
  };
}

function normalizeAction(source = {}, index = 0, productId = '') {
  let id = normalizeId(source.id || source.actionId || source.name || source.title, `action-${index + 1}`);
  let explicitName = source.name || source.toolName;
  let name = normalizeToolName(explicitName || `${productId}-${id}`, productId);
  return {
    id,
    name,
    title: normalizeText(source.title || source.label || source.name, id),
    description: normalizeText(source.description || source.summary),
    type: normalizeText(source.type || source.kind || 'intent'),
    inputSchema: normalizeSchema(source.inputSchema || source.schema),
    componentRefs: normalizeStringArray(source.componentRefs || source.components),
    entityRefs: normalizeStringArray(source.entityRefs || source.entities),
    viewRefs: normalizeStringArray(source.viewRefs || source.views),
    eventName: normalizeText(source.eventName || source.event),
    intent: normalizeRecord(source.intent),
    permission: normalizeText(source.permission || source.permissionHint),
    destructive: Boolean(source.destructive),
    allowed: source.allowed !== false,
    metadata: normalizeRecord(source.metadata),
  };
}

function normalizeEventLogItem(source = {}, index = 0) {
  let id = normalizeId(source.id || source.eventId || source.title, `event-${index + 1}`);
  return {
    id,
    type: normalizeText(source.type || source.kind || 'event'),
    title: normalizeText(source.title || source.label, id),
    detail: normalizeText(source.detail || source.description || source.summary),
    status: normalizeText(source.status || source.state),
    timestamp: normalizeText(source.timestamp || source.time),
    viewId: normalizeId(source.viewId || source.view),
    actionId: normalizeId(source.actionId || source.action),
    entityId: normalizeId(source.entityId || source.entity),
    componentRefId: normalizeId(source.componentRefId || source.componentRef),
    data: isObject(source.data) ? { ...source.data } : undefined,
    metadata: normalizeRecord(source.metadata),
  };
}

function buildProductSummary(product, views = []) {
  let viewText = views.length ? ` Views: ${views.map((view) => view.label).join(', ')}.` : '';
  return `${product.name}: ${product.description || product.category}.${viewText}`.trim();
}

function normalizeProductWebMcp(product, actions = [], views = [], source = {}) {
  let webmcp = isObject(source.webmcp) ? source.webmcp : {};
  let productDescription = normalizeText(
    webmcp.productDescription || source.agent?.productDescription,
    buildProductSummary(product, views)
  );
  return {
    mode: actions.length ? 'product-actions' : 'described-only',
    productDescription,
    toolNames: actions.map((action) => action.name),
    componentContext: 'Product context links domain entities and actions to neutral symbiote-ui component contracts.',
    actionPolicy: 'Actions are host-owned product intents; descriptors do not execute product policy by themselves.',
    references: normalizeStringArray(webmcp.references),
  };
}

function normalizeAgentContext(product, views = [], source = {}) {
  let agent = isObject(source.agent) ? source.agent : {};
  return {
    summary: normalizeText(agent.summary, buildProductSummary(product, views)),
    usage: normalizeText(agent.usage, `Use this context to inspect and operate ${product.name}.`),
    audience: normalizeText(agent.audience || agent.userRole),
    constraints: normalizeStringArray(agent.constraints),
  };
}

export function normalizeProductContext(input = {}) {
  let source = isObject(input) ? input : {};
  let product = normalizeProduct(source);
  let views = (Array.isArray(source.views) ? source.views : []).map(normalizeView);
  let componentRefs = (Array.isArray(source.componentRefs) ? source.componentRefs : [])
    .map(normalizeComponentRef);
  let entities = (Array.isArray(source.entities) ? source.entities : []).map(normalizeEntity);
  let actions = (Array.isArray(source.actions) ? source.actions : [])
    .map((action, index) => normalizeAction(action, index, product.id));
  let eventSource = Array.isArray(source.eventLog)
    ? source.eventLog
    : (Array.isArray(source.events) ? source.events : []);
  let eventLog = eventSource.map(normalizeEventLogItem);
  let agent = normalizeAgentContext(product, views, source);
  let webmcp = normalizeProductWebMcp(product, actions, views, source);

  return {
    version: PRODUCT_CONTEXT_VERSION,
    schema: PRODUCT_CONTEXT_SCHEMA_ID,
    product,
    agent,
    views,
    componentRefs,
    entities,
    actions,
    eventLog,
    webmcp,
    metadata: normalizeRecord(source.metadata),
  };
}

function normalizeRuntimeItem(source = {}, index = 0, fallbackKind = 'surface') {
  let item = isObject(source) ? source : { id: source, title: source };
  let kind = normalizeText(item.kind || item.type || item.resourceType || item.panelType, fallbackKind);
  let id = normalizeText(item.id || item.runtimeId || item.targetId || item.panelId, `${kind}-${index + 1}`);
  let children = Array.isArray(item.children)
    ? item.children
    : (Array.isArray(item.panels) ? item.panels : []);
  return {
    id,
    kind,
    title: normalizeText(item.title || item.label || item.name, id),
    role: normalizeText(item.role || item.windowRole || item.semanticRole),
    component: normalizeText(item.component || item.tagName || item.componentId),
    viewId: normalizeId(item.viewId || item.view || item.resourceType),
    resourceType: normalizeText(item.resourceType || item.panelType),
    selector: normalizeText(item.selector),
    summary: normalizeText(item.summary || item.description),
    entityRefs: normalizeStringArray(item.entityRefs || item.entities),
    actionRefs: normalizeStringArray(item.actionRefs || item.actions),
    collapsed: Boolean(item.collapsed),
    layoutPresetId: normalizeText(item.layoutPresetId || item.layoutPreset || item.presetId),
    target: normalizeRuntimeTarget(item),
    targetSemantics: normalizeText(item.targetSemantics || item.semantics || item.target?.semantics),
    state: normalizeRecord(item.state),
    metadata: normalizeRecord(item.metadata),
    children: children.map((child, childIndex) => normalizeRuntimeItem(child, childIndex, 'component')),
  };
}

function normalizeRuntimeTarget(source = {}) {
  let target = isObject(source.target) ? source.target : {};
  return {
    id: normalizeText(target.id || source.targetId || source.id),
    kind: normalizeText(target.kind || target.type || source.targetKind || source.kind || source.type),
    selector: normalizeText(target.selector || source.targetSelector || source.selector),
    component: normalizeText(target.component || source.targetComponent || source.component || source.tagName),
    viewId: normalizeId(target.viewId || source.targetViewId || source.viewId || source.view),
    entityRefs: normalizeStringArray(target.entityRefs || source.targetEntityRefs),
    actionRefs: normalizeStringArray(target.actionRefs || source.targetActionRefs),
    semantics: normalizeText(target.semantics || source.targetSemantics || source.semantics),
    metadata: normalizeRecord(target.metadata),
  };
}

function normalizeRuntimeLayoutPreset(source = {}, index = 0) {
  let preset = isObject(source) ? source : { id: source, label: source };
  let id = normalizeId(preset.id || preset.presetId || preset.name, `layout-preset-${index + 1}`);
  return {
    id,
    label: normalizeText(preset.label || preset.title || preset.name, id),
    description: normalizeText(preset.description || preset.summary),
    componentRefs: normalizeStringArray(preset.componentRefs || preset.components),
    viewRefs: normalizeStringArray(preset.viewRefs || preset.views),
    metadata: normalizeRecord(preset.metadata),
  };
}

export function normalizeRuntimeSafeAction(source = {}, index = 0) {
  let action = isObject(source) ? source : { id: source, title: source };
  let id = normalizeId(action.id || action.actionId || action.name || action.toolName, `safe-action-${index + 1}`);
  return {
    id,
    name: normalizeText(action.name || action.toolName),
    title: normalizeText(action.title || action.label || action.name, id),
    reason: normalizeText(action.reason || action.description || action.summary),
    componentRefs: normalizeStringArray(action.componentRefs || action.components),
    entityRefs: normalizeStringArray(action.entityRefs || action.entities),
    viewRefs: normalizeStringArray(action.viewRefs || action.views),
    targetRefs: normalizeStringArray(action.targetRefs || action.targets),
    safe: action.safe !== false && action.allowed !== false,
    metadata: normalizeRecord(action.metadata),
  };
}

function normalizeRuntimeActionRefs(source = {}, safeActions = []) {
  let explicitRefs = normalizeStringArray(source.safeActionRefs || source.allowedActionRefs || source.actionRefs);
  return [...new Set([...explicitRefs, ...safeActions.map((action) => action.id).filter(Boolean)])];
}

export function createRuntimeSafeActionFromProductAction(action = {}, overrides = {}) {
  let productAction = isObject(action) ? action : {};
  return normalizeRuntimeSafeAction({
    id: productAction.id || productAction.actionId || productAction.name || productAction.toolName,
    name: productAction.name || productAction.toolName,
    title: productAction.title || productAction.label || productAction.name,
    reason: productAction.description || productAction.summary,
    componentRefs: productAction.componentRefs || productAction.components,
    entityRefs: productAction.entityRefs || productAction.entities,
    viewRefs: productAction.viewRefs || productAction.views,
    safe: productAction.destructive !== true && productAction.allowed !== false,
    metadata: productAction.metadata,
    ...overrides,
  });
}

export function normalizeRuntimeEnrichment(source = {}, index = 0) {
  let item = isObject(source) ? source : { id: source, title: source };
  let id = normalizeId(item.id || item.enrichmentId || item.title, `enrichment-${index + 1}`);
  return {
    id,
    type: normalizeText(item.type || item.kind || 'context'),
    title: normalizeText(item.title || item.label || item.name, id),
    detail: normalizeText(item.detail || item.description || item.summary),
    source: normalizeText(item.source || item.owner || 'host'),
    componentRefs: normalizeStringArray(item.componentRefs || item.components),
    entityRefs: normalizeStringArray(item.entityRefs || item.entities),
    viewRefs: normalizeStringArray(item.viewRefs || item.views),
    targetRefs: normalizeStringArray(item.targetRefs || item.targets),
    actionRefs: normalizeStringArray(item.actionRefs || item.actions),
    priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 0,
    metadata: normalizeRecord(item.metadata),
  };
}

export function normalizeRuntimeHook(source = {}, index = 0) {
  let hook = isObject(source) ? source : { id: source, title: source };
  let id = normalizeId(hook.id || hook.hookId || hook.title, `hook-${index + 1}`);
  return {
    id,
    title: normalizeText(hook.title || hook.label || hook.name, id),
    description: normalizeText(hook.description || hook.summary),
    mode: normalizeText(hook.mode || hook.kind || 'assist'),
    trigger: normalizeRecord(hook.trigger || hook.match),
    componentRefs: normalizeStringArray(hook.componentRefs || hook.components),
    entityRefs: normalizeStringArray(hook.entityRefs || hook.entities),
    viewRefs: normalizeStringArray(hook.viewRefs || hook.views),
    targetRefs: normalizeStringArray(hook.targetRefs || hook.targets),
    actionRefs: normalizeStringArray(hook.actionRefs || hook.actions),
    safeActionRefs: normalizeStringArray(hook.safeActionRefs || hook.safeActions),
    metadata: normalizeRecord(hook.metadata),
  };
}

function normalizeRuntimeLogItems(value) {
  return (Array.isArray(value) ? value : []).map((item, index) => ({
    id: normalizeText(item?.id || item?.eventId, `runtime-event-${index + 1}`),
    type: normalizeText(item?.type || item?.kind, 'event'),
    title: normalizeText(item?.title || item?.label),
    detail: normalizeText(item?.detail || item?.description || item?.summary),
    timestamp: normalizeText(item?.timestamp || item?.time),
    data: isObject(item?.data) ? { ...item.data } : normalizeRecord(item),
  }));
}

export function normalizeRuntimeContext(input = {}) {
  let source = isObject(input) ? input : {};
  let windows = Array.isArray(source.windows) ? source.windows : [];
  let tabs = Array.isArray(source.tabs) ? source.tabs : [];
  let surfaces = Array.isArray(source.surfaces)
    ? source.surfaces
    : (windows.length ? windows : (Array.isArray(source.openViews) ? source.openViews : []));
  let cues = Array.isArray(source.cues)
    ? source.cues
    : (Array.isArray(source.targets) ? source.targets : []);
  let safeActionSource = Array.isArray(source.safeActions)
    ? source.safeActions
    : (Array.isArray(source.allowedActions) ? source.allowedActions : []);
  let safeActions = safeActionSource.map(normalizeRuntimeSafeAction);
  return {
    activeViewId: normalizeText(source.activeViewId || source.activeId || source.activeTabId),
    activeSurfaceId: normalizeText(source.activeSurfaceId || source.activeWindowId || source.activeBoardId),
    activeWindowId: normalizeText(source.activeWindowId || source.activeSurfaceId),
    activeTabId: normalizeText(source.activeTabId || source.activeViewId),
    locale: normalizeText(source.locale),
    selectedEntityRefs: normalizeStringArray(source.selectedEntityRefs || source.selectedEntities || source.selectedEntityIds),
    safeActionRefs: normalizeRuntimeActionRefs(source, safeActions),
    safeActions,
    collapsed: normalizeRecord(source.collapsed || source.collapsedState),
    layoutPresets: (Array.isArray(source.layoutPresets) ? source.layoutPresets : [])
      .map(normalizeRuntimeLayoutPreset),
    windows: windows.map((window, index) => normalizeRuntimeItem(window, index, 'window')),
    tabs: tabs.map((tab, index) => normalizeRuntimeItem(tab, index, 'tab')),
    surfaces: surfaces.map((surface, index) => normalizeRuntimeItem(surface, index, 'surface')),
    cues: cues.map((cue, index) => normalizeRuntimeItem(cue, index, 'cue')),
    focus: Array.isArray(source.focus) ? source.focus.map(normalizeRecord) : [],
    capabilities: normalizeRecord(source.capabilities),
    enrichment: (Array.isArray(source.enrichment) ? source.enrichment : [])
      .map(normalizeRuntimeEnrichment),
    hooks: (Array.isArray(source.hooks) ? source.hooks : [])
      .map(normalizeRuntimeHook),
    recentInteractions: normalizeRuntimeLogItems(source.recentInteractions || source.interactions),
    recentDataChanges: normalizeRuntimeLogItems(source.recentDataChanges || source.dataChanges),
    metadata: normalizeRecord(source.metadata),
  };
}

export function createProductRuntimeContext(input = {}, runtime) {
  let source = isObject(input) ? input : {};
  let context = normalizeProductContext(input);
  return {
    ...context,
    runtime: normalizeRuntimeContext(runtime === undefined ? source.runtime : runtime),
  };
}

export function createProductContextAgentView(input = {}) {
  let context = normalizeProductContext(input);
  return {
    version: context.version,
    product: context.product,
    summary: context.agent.summary,
    usage: context.agent.usage,
    views: context.views,
    componentRefs: context.componentRefs,
    entities: context.entities,
    actions: context.actions,
    eventLog: context.eventLog,
    webmcp: context.webmcp,
  };
}
