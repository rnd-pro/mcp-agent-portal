import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  createLayoutGroupModel,
  createLayoutGroupSections,
  createLayoutGroupTabs,
  getActiveLayoutGroup,
  getHomeLayoutGroup,
  normalizeLayoutGroups,
} from '../layout/LayoutShellMenu/layout-groups.js';

const sidebarSectionSource = new URL('../layout/LayoutSidebar/SidebarSection.js', import.meta.url);
const sidebarSectionTemplateSource = new URL('../layout/LayoutSidebar/SidebarSection.tpl.js', import.meta.url);

function installMinimalDom() {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, init = {}) {
      super(type, init);
      this.detail = init.detail;
    }
  };
  globalThis.CSSStyleSheet = class CSSStyleSheet {
    replaceSync() {}
  };
  globalThis.HTMLElement = class HTMLElement extends EventTarget {
    constructor() {
      super();
      this._attrs = new Map();
      this.style = { setProperty() {}, removeProperty() {} };
      this.ref = {};
      this.templateProcessors = { add() {} };
    }

    getAttribute(name) {
      return this._attrs.has(name) ? this._attrs.get(name) : null;
    }

    setAttribute(name, value) {
      this._attrs.set(name, String(value));
    }

    removeAttribute(name) {
      this._attrs.delete(name);
    }

    toggleAttribute(name, value) {
      if (value) this.setAttribute(name, '');
      else this.removeAttribute(name);
    }

    hasAttribute(name) {
      return this._attrs.has(name);
    }

    querySelector() {
      return null;
    }
  };
  globalThis.customElements = {
    define() {},
    get() {},
    whenDefined() {
      return Promise.resolve();
    },
  };
  globalThis.window = { customElements: globalThis.customElements };
  globalThis.document = {
    head: { append() {}, querySelector() { return null; } },
    createElement() {
      return {
        setAttribute() {},
        append() {},
        sheet: { insertRule() {} },
      };
    },
    querySelector() {
      return null;
    },
  };
}

test('layout groups normalize tabs, sidebar sections, and host metadata', () => {
  let groups = normalizeLayoutGroups([
    {
      id: 'overview',
      name: 'Overview',
      icon: 'view_quilt',
      sidebarLabel: 'Agent Chat',
      sidebarIcon: 'smart_toy',
      tabsVisible: false,
      closeable: false,
      behavior: { responsiveMode: 'stack' },
      host: { panelType: 'overview' },
      createLayout: () => null,
    },
    {
      id: 'graph',
      name: 'Graph',
      icon: 'hub',
      color: 'var(--accent)',
      closeable: true,
      metadata: { panelType: 'graph' },
    },
    {
      id: 'disabled',
      name: 'Disabled',
      icon: 'block',
      disabled: true,
      tabsVisible: false,
    },
  ]);

  assert.equal(groups.length, 3);
  assert.equal(groups[0].sidebarLabel, 'Agent Chat');
  assert.equal(groups[0].sidebarIcon, 'smart_toy');
  assert.equal(groups[0].tabsVisible, false);
  assert.equal(groups[0].closeable, false);
  assert.deepEqual(groups[0].behavior, { responsiveMode: 'stack' });
  assert.deepEqual(groups[0].host, { panelType: 'overview' });
  assert.equal('createLayout' in groups[0], false);
  assert.equal(groups[1].closeable, true);
  assert.deepEqual(groups[1].host, { panelType: 'graph' });
  assert.equal(groups[2].disabled, true);
});

test('layout group model derives home, active tab, and sidebar state together', () => {
  let model = createLayoutGroupModel([
    { id: 'overview', name: 'Overview', icon: 'home', tabsVisible: false },
    { id: 'graph', name: 'Graph', icon: 'hub', sidebarVisible: false },
    { id: 'chat', name: 'Chat', icon: 'forum', disabled: true },
    { id: 'theme', name: 'Theme', icon: 'palette', closeable: true },
  ], 'graph');

  assert.equal(model.homeGroupId, 'overview');
  assert.equal(model.activeId, 'graph');
  assert.equal(model.activeGroup.id, 'graph');
  assert.deepEqual(model.tabs.map((tab) => [tab.id, tab.isActive, tab.closeable, tab.disabled]), [
    ['graph', true, false, false],
    ['chat', false, false, true],
    ['theme', false, true, false],
  ]);
  assert.deepEqual(model.sidebarSections.map((section) => [section.id, section.label, section.disabled]), [
    ['overview', 'Overview', false],
    ['chat', 'Chat', true],
    ['theme', 'Theme', false],
  ]);
});

test('layout groups fall back from disabled active id to the home group', () => {
  let groups = normalizeLayoutGroups([
    { id: 'overview', name: 'Overview', tabsVisible: false },
    { id: 'chat', name: 'Chat', disabled: true },
  ]);

  assert.equal(getHomeLayoutGroup(groups).id, 'overview');
  assert.equal(getActiveLayoutGroup(groups, 'chat').id, 'overview');
  assert.deepEqual(createLayoutGroupTabs(groups, 'chat').map((tab) => [tab.id, tab.isActive, tab.disabled]), [
    ['chat', false, true],
  ]);
  assert.deepEqual(createLayoutGroupSections(groups).map((section) => [section.id, section.disabled]), [
    ['overview', false],
    ['chat', true],
  ]);
});

test('sidebar sections expose cancelable selection before router navigation', async () => {
  let [source, template] = await Promise.all([
    readFile(sidebarSectionSource, 'utf8'),
    readFile(sidebarSectionTemplateSource, 'utf8'),
  ]);

  assert.match(source, /sidebar-section-select/);
  assert.match(source, /cancelable:\s*true/);
  assert.match(source, /sidebar\?\.routerSync === false/);
  assert.match(source, /navigate\(sectionId\)/);
  assert.match(source, /#getSectionId\(\)/);
  assert.match(source, /this\.dataset\.sectionId/);
  assert.match(template, /'@data-section-id':\s*'sectionId'/);
  assert.match(source, /item\.addEventListener\('click',\s*this\.\$\.onSectionClick\)/);
  assert.match(source, /\.sec-expand'\)\?\.addEventListener\('click',\s*this\.\$\.onExpandToggle\)/);
  assert.match(source, /\.sec-eye'\)\?\.addEventListener\('click',\s*this\.\$\.onToggleVisibility\)/);
  assert.doesNotMatch(template, /onclick:\s*'onSectionClick'/);
  assert.doesNotMatch(template, /onclick:\s*'onExpandToggle'/);
  assert.doesNotMatch(template, /onclick:\s*'onToggleVisibility'/);
});

test('layout shell menu emits normalized group intents without host executable state', async () => {
  installMinimalDom();
  let { LayoutShellMenu } = await import('../layout/LayoutShellMenu/LayoutShellMenu.js');
  let source = await readFile(new URL('../layout/LayoutShellMenu/LayoutShellMenu.js', import.meta.url), 'utf8');
  let shell = new LayoutShellMenu();
  shell.initCallback();

  let changes = [];
  let closes = [];
  shell.addEventListener('layout-group-change', (event) => changes.push(event.detail));
  shell.addEventListener('layout-group-close', (event) => closes.push(event.detail));

  shell.setGroups([
    { id: 'overview', name: 'Overview', tabsVisible: false },
    {
      id: 'graph',
      name: 'Graph',
      icon: 'hub',
      closeable: true,
      host: { panelType: 'graph' },
      createLayout: () => null,
    },
    { id: 'disabled', name: 'Disabled', disabled: true },
  ], 'overview');

  assert.equal(shell.selectGroup('graph', 'api'), true);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].id, 'graph');
  assert.equal(changes[0].source, 'api');
  assert.equal(changes[0].group.id, 'graph');
  assert.deepEqual(changes[0].group.host, { panelType: 'graph' });
  assert.equal('createLayout' in changes[0].group, false);

  assert.equal(shell.selectGroup('disabled', 'api'), false);
  assert.equal(changes.length, 1);

  shell.dispatchEvent(new CustomEvent('project-tabs-close', {
    bubbles: true,
    composed: true,
    detail: { id: 'graph' },
  }));
  assert.equal(closes.length, 1);
  assert.equal(closes[0].id, 'graph');
  assert.equal(closes[0].source, 'tabs-close');
  assert.match(source, /homeLabel:\s*home\?\.name \|\| home\?\.label \|\| ''/);
  assert.match(source, /homeIcon:\s*home\?\.icon \|\| 'home'/);
});

test('layout shell menu does not sync nested workspace sidebars as shell navigation', async () => {
  installMinimalDom();
  let { LayoutShellMenu } = await import('../layout/LayoutShellMenu/LayoutShellMenu.js');
  let source = await readFile(new URL('../layout/LayoutShellMenu/LayoutShellMenu.js', import.meta.url), 'utf8');
  let shell = new LayoutShellMenu();
  shell.initCallback();

  let nestedSyncs = 0;
  let slottedSections = null;
  let slottedActiveCalls = 0;
  let nestedWorkspaceSidebar = {
    setSections() { nestedSyncs += 1; },
    setActiveSection() { nestedSyncs += 1; },
  };
  let slottedSidebar = {
    tagName: 'LAYOUT-SIDEBAR',
    matches: (selector) => selector === 'layout-sidebar',
    setSections(items) { slottedSections = items; },
    setActiveSection() { slottedActiveCalls += 1; },
  };

  shell.querySelector = (selector) => (selector === 'layout-sidebar' ? nestedWorkspaceSidebar : null);
  shell.ref.sidebarSlot = { assignedElements: () => [] };
  shell.setGroups([{ id: 'home', name: 'Home', icon: 'home' }, { id: 'ops', name: 'Ops', icon: 'bolt' }], 'ops');

  assert.equal(nestedSyncs, 0);
  assert.equal(slottedSections, null);
  assert.doesNotMatch(source, /querySelector\('layout-sidebar'\)/);

  shell.ref.sidebarSlot = { assignedElements: () => [slottedSidebar] };
  shell.setGroups([{ id: 'home', name: 'Home', icon: 'home' }, { id: 'ops', name: 'Ops', icon: 'bolt' }], 'ops');

  assert.deepEqual(slottedSections.map((section) => section.id), ['home', 'ops']);
  assert.equal(slottedActiveCalls, 1);
  assert.equal(slottedSidebar.routerSync, false);
});

test('project tabs require explicit closeable flag for close affordances', async () => {
  let [source, styles] = await Promise.all([
    readFile(new URL('../layout/ProjectTabs/ProjectTabs.js', import.meta.url), 'utf8'),
    readFile(new URL('../layout/ProjectTabs/ProjectTabs.css.js', import.meta.url), 'utf8'),
  ]);

  assert.match(source, /closeable:\s*tab\.closeable === true/);
  assert.match(source, /this\.\$\.disabled \|\| !this\.\$\.closeable/);
  assert.doesNotMatch(source, /closeable:\s*tab\.closeable !== false/);
  assert.match(styles, /\.tab-close\[hidden\]\s*\{[\s\S]*?display: none;/);
});

test('project tabs mark the home button active when active group is hidden from tabs', async () => {
  let { ProjectTabs } = await import('../layout/ProjectTabs/ProjectTabs.js');
  let tabs = { $: { activeId: null, homeId: null, isHomeActive: false, tabs: [], homeIcon: 'home', homeLabel: 'Home' } };

  ProjectTabs.prototype.setTabs.call(tabs, [{ id: 'graph', name: 'Graph' }], 'overview', {
    homeId: 'overview',
    homeIcon: 'bolt',
    homeLabel: 'Главная',
  });

  assert.equal(tabs.$.activeId, 'overview');
  assert.equal(tabs.$.homeId, 'overview');
  assert.equal(tabs.$.homeIcon, 'bolt');
  assert.equal(tabs.$.homeLabel, 'Главная');
  assert.equal(tabs.$.isHomeActive, true);
  assert.deepEqual(tabs.$.tabs.map((tab) => [tab.id, tab.isActive]), [
    ['graph', false],
  ]);

  ProjectTabs.prototype.setTabs.call(tabs, [{ id: 'graph', name: 'Graph' }], 'graph', { homeId: 'overview' });

  assert.equal(tabs.$.isHomeActive, false);
  assert.equal(tabs.$.tabs[0].isActive, true);
});
