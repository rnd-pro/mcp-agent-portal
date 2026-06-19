import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  getHomeSections,
  getProjectSections,
  getLayout,
  panelTypes,
} = await import('../../web/router-registry.js?route-layout-behavior-test');
const {
  layoutMatchesSection,
} = await import('../../web/layout-policy.js?route-layout-behavior-test');

function walkLayout(root) {
  if (!root) return [];
  if (root.type === 'split') {
    return [root, ...walkLayout(root.first), ...walkLayout(root.second)];
  }
  return [root];
}

function assertBehavior(sectionId, node) {
  assert.ok(node.behavior, `${sectionId}:${node.panelType || node.type} must declare layout behavior`);
  assert.equal(typeof node.behavior.importance, 'number', `${sectionId}:${node.id} must declare importance`);
  assert.equal(typeof node.behavior.minInlineSize, 'number', `${sectionId}:${node.id} must declare minInlineSize`);
  assert.equal(typeof node.behavior.minBlockSize, 'number', `${sectionId}:${node.id} must declare minBlockSize`);
  assert.match(node.behavior.collapse, /^(auto|manual|never)$/);
  assert.match(node.behavior.overflow, /^(collapse|scroll-inline|scroll-block|scroll)$/);
  assert.match(node.behavior.responsiveMode, /^(preserve|stack|scroll-inline)$/);
}

describe('Agent Portal routed layout behavior metadata', () => {
  it('attaches responsive behavior metadata to every routed layout node', () => {
    let sections = [...getHomeSections(), ...getProjectSections()];
    assert.ok(sections.length > 0);

    for (let section of sections) {
      let root = getLayout(section.id);
      assert.ok(root, `${section.id} must provide a runtime layout`);
      for (let node of walkLayout(root)) {
        assertBehavior(section.id, node);
      }
    }
  });

  it('keeps the global chat dock recoverable while the workspace can scroll inline', () => {
    let root = getLayout('explorer');

    assert.equal(root.type, 'split');
    assert.equal(root.direction, 'horizontal');
    assert.equal(root.behavior.overflow, 'scroll-inline');
    assert.equal(root.behavior.responsiveMode, 'scroll-inline');

    assert.equal(root.second.panelType, 'agent-chat');
    assert.equal(root.second.global, true);
    assert.equal(root.second.collapsed, true);
    assert.equal(root.second.behavior.collapse, 'manual');
    assert.equal(root.second.behavior.overflow, 'scroll-block');
    assert.ok(root.second.behavior.minInlineSize >= 360);
  });

  it('keeps the dashboard route as one chat panel without a second global chat', () => {
    let root = getLayout('dashboard');
    assert.equal(root.type, 'panel');
    assert.equal(root.panelType, 'agent-chat');
    assert.equal(root.behavior.collapse, 'manual');
    assert.equal(root.behavior.responsiveMode, 'stack');
    assert.equal(walkLayout(root).filter((node) => node.panelType === 'agent-chat').length, 1);
  });

  it('adds the project chat process graph as a collapsed right panel', () => {
    let root = getLayout('agent-chat');
    let nodes = walkLayout(root);

    assert.equal(root.type, 'split');
    assert.equal(root.direction, 'horizontal');
    assert.equal(root.behavior.overflow, 'scroll-inline');
    assert.equal(root.first.panelType, 'agent-chat');
    assert.equal(root.second.panelType, 'agent-process-graph');
    assert.equal(root.second.collapsed, true);
    assert.equal(root.second.behavior.collapse, 'manual');
    assert.equal(root.second.behavior.minInlineSize, 320);
    assert.equal(nodes.filter((node) => node.panelType === 'agent-chat').length, 1);
    assert.equal(nodes.filter((node) => node.panelType === 'agent-process-graph').length, 1);

    assert.equal(panelTypes['agent-process-graph'].component, 'pg-agent-process-graph');
    assert.equal(panelTypes['agent-process-graph'].attributes, undefined);
  });

  it('renders workflow board as a board plus markdown layout window', () => {
    let root = getLayout('workflow-board');
    let nodes = walkLayout(root);

    assert.equal(nodes.filter((node) => node.panelType === 'workflow-board').length, 1);
    assert.equal(nodes.filter((node) => node.panelType === 'workflow-card-markdown').length, 1);
    assert.equal(panelTypes['workflow-card-markdown'].component, 'pg-workflow-card-markdown');
    assert.equal(layoutMatchesSection('workflow-board', root), true);
    assert.equal(layoutMatchesSection('workflow-board', root.first.first), false);
  });

  it('rejects saved route layouts that predate responsive behavior metadata', () => {
    let oldStandaloneChat = {
      id: 'old-dashboard-chat',
      type: 'panel',
      panelType: 'agent-chat',
      collapsed: false,
    };
    let oldExplorer = {
      id: 'old-explorer-root',
      type: 'split',
      direction: 'horizontal',
      first: {
        id: 'old-file-tree',
        type: 'panel',
        panelType: 'file-tree',
      },
      second: {
        id: 'old-code-viewer',
        type: 'panel',
        panelType: 'code-viewer',
      },
    };

    assert.equal(layoutMatchesSection('dashboard', oldStandaloneChat), false);
    assert.equal(layoutMatchesSection('agent-chat', oldStandaloneChat), false);
    assert.equal(layoutMatchesSection('explorer', oldExplorer), false);
    assert.equal(layoutMatchesSection('dashboard', getLayout('dashboard')), true);
    assert.equal(layoutMatchesSection('agent-chat', getLayout('agent-chat')), true);
    assert.equal(layoutMatchesSection('explorer', getLayout('explorer')), true);
  });
});
