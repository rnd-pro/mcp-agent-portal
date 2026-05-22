import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

describe('portal shell theme contract', () => {
  it('consumes symbiote-node theme tokens instead of copying provider colors', () => {
    let css = fs.readFileSync(path.join(ROOT, 'web/style.css'), 'utf8');
    for (let literal of [
      '#4c8bf5',
      '#4caf50',
      '#f44336',
      'rgba(76, 139, 245',
      'rgba(76, 175, 80',
      'rgba(244, 67, 54',
    ]) {
      assert.equal(css.includes(literal), false, `web/style.css must not copy provider color ${literal}`);
    }
    for (let token of [
      '--sn-node-selected',
      '--sn-success-color',
      '--sn-danger-color',
      '--sn-accent-bg',
      '--sn-scrollbar-thumb',
      '--sn-layout-resizer-hover-bg',
    ]) {
      assert.ok(css.includes(token), `web/style.css must consume ${token}`);
    }
  });

  it('keeps tree and skill panels on provider theme tokens', () => {
    for (let relative of [
      'web/panels/FileTree/FileTree.css.js',
      'web/panels/SkillManager/AgentPortalTree.css.js',
      'web/panels/SkillManager/OpenLibraryTree.css.js',
      'web/panels/SkillManager/SkillManager.css.js',
      'web/panels/SkillManager/SkillMetadata.js',
      'web/panels/CtxPanel/CtxPanel.css.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.equal(source.includes('hsl(35, 18%, 80%)'), false, `${relative} must not copy provider border fallback`);
      assert.equal(source.includes('hsl(37, 30%'), false, `${relative} must not copy provider surface fallback`);
      assert.equal(source.includes('hsl(30, 10%, 45%)'), false, `${relative} must not copy provider muted text fallback`);
      assert.equal(source.includes('hsl(30, 15%, 18%)'), false, `${relative} must not copy provider text fallback`);
    }
  });

  it('keeps runtime event rows on provider theme tokens', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/panels/EventItem/EventItem.css.js'), 'utf8');
    for (let literal of [
      '#60a5fa',
      '#4ade80',
      '#f87171',
      'rgba(96, 165, 250',
      'rgba(74, 222, 128',
      'rgba(248, 113, 113',
      'rgba(0,0,0',
      'rgba(255,255,255',
      'monospace)',
    ]) {
      assert.equal(source.includes(literal), false, `EventItem must not copy provider styling with ${literal}`);
    }
    for (let token of [
      '--sn-font-mono',
      '--sn-node-hover',
      '--sn-node-selected',
      '--sn-accent-bg-subtle',
      '--sn-success-bg',
      '--sn-danger-bg',
    ]) {
      assert.ok(source.includes(token), `EventItem must consume ${token}`);
    }
  });

  it('keeps shared agent chrome on provider theme tokens', () => {
    for (let relative of [
      'web/components/AgentBoard/AgentBoard.css.js',
      'web/components/FollowRibbon/FollowRibbon.css.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      for (let literal of [
        '#9e9e9e',
        '#2196f3',
        '#4caf50',
        '#f44336',
        '#ff9800',
        '#4c8bf5',
        '#888',
        'rgba(0,0,0',
        'rgba(0, 0, 0',
        'rgba(20, 20, 25',
        'rgba(76, 139, 245',
        'rgba(255, 255, 255',
        '--text-color-muted',
      ]) {
        assert.equal(source.includes(literal), false, `${relative} must not copy provider styling with ${literal}`);
      }
    }

    let agentBoard = fs.readFileSync(path.join(ROOT, 'web/components/AgentBoard/AgentBoard.css.js'), 'utf8');
    for (let token of ['--sn-shadow-sm', '--sn-cat-server', '--sn-success-color', '--sn-danger-color', '--sn-warning-color']) {
      assert.ok(agentBoard.includes(token), `AgentBoard must consume ${token}`);
    }

    let followRibbon = fs.readFileSync(path.join(ROOT, 'web/components/FollowRibbon/FollowRibbon.css.js'), 'utf8');
    for (let token of ['--sn-bg-overlay', '--sn-shadow-lg', '--sn-accent-glow', '--sn-font-ui', '--sn-text-dim']) {
      assert.ok(followRibbon.includes(token), `FollowRibbon must consume ${token}`);
    }
  });

  it('uses the symbiote tree panel component for project trees', () => {
    for (let relative of [
      'web/panels/FileTree/FileTree.tpl.js',
      'web/panels/SkillManager/AgentPortalTree.tpl.js',
      'web/panels/SkillManager/OpenLibraryTree.tpl.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(source.includes('<sn-tree-panel'), `${relative} must compose the library tree panel`);
      assert.equal(source.includes('<sn-tree-view'), false, `${relative} must not bypass tree panel chrome`);
      assert.equal(source.includes('pg-panel-toolbar'), false, `${relative} must not copy panel toolbar markup`);
    }
  });

  it('uses symbiote surface cards for reusable card shells', () => {
    for (let relative of [
      'web/panels/ActiveTasks/TaskCard.js',
      'web/panels/ToolExplorer/ToolCard.js',
      'web/panels/Marketplace/McpServerCard.js',
      'web/panels/Marketplace/ContextCard.js',
      'web/panels/PeerReview/PeerReview.tpl.js',
      'web/panels/PipelineManager/PipelineStep.js',
      'web/panels/ProjectItem/ProjectItem.tpl.js',
      'web/panels/RuntimeControl/InstanceItem.js',
      'web/panels/RuntimeControl/RuntimeControl.js',
      'web/panels/SettingsPanel/SettingsPanel.tpl.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(
        source.includes('<sn-card') || source.includes("createElement('sn-card')"),
        `${relative} must compose the library card surface`
      );
      assert.equal(source.includes('<div class="ui-card"'), false, `${relative} must not copy card shell markup`);
      assert.equal(source.includes("className = 'ui-card'"), false, `${relative} must not create copied card shell classes`);
    }
  });

  it('uses symbiote action buttons inside reusable card shells', () => {
    for (let relative of [
      'web/panels/ActiveTasks/TaskCard.js',
      'web/panels/ActiveTasks/ActiveTasks.tpl.js',
      'web/panels/ActiveContext/ActiveContext.js',
      'web/panels/ActiveContext/ActiveContext.tpl.js',
      'web/panels/GroupManager/GroupManager.js',
      'web/panels/GroupManager/GroupManager.tpl.js',
      'web/panels/Marketplace/McpServerCard.js',
      'web/panels/Marketplace/ContextCard.js',
      'web/panels/PipelineManager/PipelineManager.tpl.js',
      'web/panels/RuntimeControl/RuntimeControl.tpl.js',
      'web/panels/SettingsPanel/SettingsPanel.tpl.js',
      'web/panels/WorkflowExplorer/WorkflowExplorer.tpl.js',
      'packages/symbiote-node/chat/ChatList/ChatList.tpl.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(
        source.includes('<sn-button') ||
          source.includes("createElement('sn-button')") ||
          source.includes("makeElement('sn-button'"),
        `${relative} must compose the library action control`,
      );
      assert.equal(source.includes('class="ui-btn'), false, `${relative} must not copy button shell classes`);
      assert.equal(source.includes('ui-btn-icon'), false, `${relative} must not copy icon button shell classes`);
    }
  });

  it('uses symbiote field wrappers for reusable form shells', () => {
    for (let relative of [
      'web/panels/Marketplace/Marketplace.tpl.js',
      'web/panels/PeerReview/PeerReview.tpl.js',
      'web/panels/SettingsPanel/SettingsPanel.tpl.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(source.includes('<sn-field'), `${relative} must compose the library field wrapper`);
      assert.equal(source.includes('<div class="ui-field">'), false, `${relative} must not copy field shell markup`);
    }
  });

  it('uses symbiote list items for reusable selectable rows', () => {
    for (let relative of [
      'web/panels/PipelineManager/PipelineItem.js',
      'web/panels/ToolExplorer/ToolServerItem.js',
      'web/panels/WorkflowExplorer/WorkflowItem.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(source.includes('<sn-list-item'), `${relative} must compose the library list item`);
      assert.equal(source.includes('ui-item'), false, `${relative} must not copy list item shell classes`);
    }
  });

  it('uses symbiote list detail shells for reusable split detail panels', () => {
    for (let relative of [
      'web/panels/WorkflowExplorer/WorkflowExplorer.tpl.js',
      'web/panels/ToolExplorer/ToolExplorer.tpl.js',
      'web/panels/PipelineManager/PipelineManager.tpl.js',
      'web/panels/PeerReview/PeerReview.tpl.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(source.includes('<sn-list-detail-shell'), `${relative} must compose the library list detail shell`);
      assert.equal(source.includes('ui-split-container'), false, `${relative} must not copy split container markup`);
      assert.equal(source.includes('ui-sidebar'), false, `${relative} must not copy sidebar shell markup`);
      assert.equal(source.includes('ui-main'), false, `${relative} must not copy main detail shell markup`);
    }

    let pipelineSource = fs.readFileSync(path.join(ROOT, 'web/panels/PipelineManager/PipelineManager.js'), 'utf8');
    assert.equal(pipelineSource.includes('ui-details'), false, 'PipelineManager must not create copied detail shell classes');

    let peerSource = fs.readFileSync(path.join(ROOT, 'web/panels/PeerReview/PeerReview.tpl.js'), 'utf8');
    assert.equal(peerSource.includes('ui-container'), false, 'PeerReview must not copy container shell markup');
  });

  it('uses symbiote status badges for reusable status labels', () => {
    for (let relative of [
      'web/panels/ActiveTasks/TaskCard.js',
      'web/panels/Marketplace/ContextCard.js',
      'web/panels/PeerReview/PeerReview.js',
      'web/panels/PipelineManager/PipelineStep.js',
      'web/panels/Topology/TopologyPanel.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(source.includes('sn-badge'), `${relative} must compose the library status badge`);
      assert.equal(source.includes('ui-badge'), false, `${relative} must not copy badge shell classes`);
    }
  });

  it('uses symbiote status banners for reusable inline feedback', () => {
    for (let relative of [
      'web/panels/PeerReview/PeerReview.tpl.js',
      'web/panels/RuntimeControl/RuntimeControl.tpl.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(source.includes('sn-banner'), `${relative} must compose the library status banner`);
      assert.equal(source.includes('ui-banner'), false, `${relative} must not copy banner shell classes`);
      assert.equal(source.includes('rtc-state'), false, `${relative} must not copy runtime banner shell classes`);
    }

    for (let relative of [
      'web/panels/PeerReview/PeerReview.js',
      'web/panels/RuntimeControl/RuntimeControl.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(source.includes("setAttribute('variant'"), `${relative} must drive the library status banner through variants`);
      assert.ok(source.includes("removeAttribute('hidden'"), `${relative} must show the library status banner through attributes`);
      assert.equal(/stateBanner\.hidden\s*=/.test(source), false, `${relative} must not drive Symbiote banner visibility through hidden property assignment`);
      assert.equal(source.includes('ui-banner'), false, `${relative} must not copy banner shell classes`);
      assert.equal(source.includes('dataset.kind'), false, `${relative} must not keep local banner state attributes`);
    }
  });

  it('uses symbiote empty states for reusable placeholders', () => {
    for (let relative of [
      'web/panels/ActiveContext/ActiveContext.js',
      'web/panels/ActiveTasks/ActiveTasks.tpl.js',
      'web/panels/GroupManager/GroupManager.js',
      'web/panels/GroupManager/GroupManager.tpl.js',
      'web/panels/Marketplace/Marketplace.js',
      'web/panels/PeerReview/PeerReview.tpl.js',
      'web/panels/PipelineManager/PipelineManager.tpl.js',
      'web/panels/ProjectList/ProjectList.tpl.js',
      'web/panels/RuntimeControl/RuntimeControl.tpl.js',
      'web/panels/SettingsPanel/SettingsPanel.js',
      'web/panels/ToolExplorer/ToolExplorer.tpl.js',
      'web/panels/WorkflowExplorer/WorkflowExplorer.js',
      'web/panels/WorkflowExplorer/WorkflowExplorer.tpl.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(source.includes('sn-empty-state'), `${relative} must compose the library empty state`);
      assert.equal(source.includes('ui-empty-state'), false, `${relative} must not copy placeholder shell classes`);
    }
  });

  it('keeps active task cards off inline copied theme values', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/panels/ActiveTasks/TaskCard.js'), 'utf8');
    for (let literal of ['#9ca3af', '#404040', 'style="']) {
      assert.equal(source.includes(literal), false, `TaskCard must not copy provider styling with ${literal}`);
    }
    for (let token of ['--sn-font-mono', '--sn-text-dim']) {
      assert.ok(source.includes(token), `TaskCard must consume ${token}`);
    }
  });

  it('keeps active tasks panel off copied shared shell classes', () => {
    let template = fs.readFileSync(path.join(ROOT, 'web/panels/ActiveTasks/ActiveTasks.tpl.js'), 'utf8');
    for (let sharedClass of ['ui-container', 'ui-header', 'ui-title', 'ui-main']) {
      assert.equal(template.includes(sharedClass), false, `ActiveTasks must not copy ${sharedClass}`);
    }

    let source = fs.readFileSync(path.join(ROOT, 'web/panels/ActiveTasks/ActiveTasks.js'), 'utf8');
    assert.equal(source.includes('.style.'), false, 'ActiveTasks must not use inline style mutation');
  });

  it('keeps marketplace panel off copied shared shell classes', () => {
    let template = fs.readFileSync(path.join(ROOT, 'web/panels/Marketplace/Marketplace.tpl.js'), 'utf8');
    for (let sharedClass of ['ui-header', 'ui-title-large', 'ui-segmented-control', 'ui-field', 'ui-card-title']) {
      assert.equal(template.includes(sharedClass), false, `Marketplace must not copy ${sharedClass}`);
    }

    let source = fs.readFileSync(path.join(ROOT, 'web/panels/Marketplace/Marketplace.js'), 'utf8');
    assert.equal(source.includes('card.style.'), false, 'Marketplace card visual state must use classes');
  });

  it('keeps marketplace accents on provider theme tokens', () => {
    for (let relative of [
      'web/panels/Marketplace/Marketplace.css.js',
      'web/panels/Marketplace/McpCatalogSection.js',
      'web/panels/Marketplace/Marketplace.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      for (let literal of ['#a78bfa', '#7c3aed', '#4a9eff', '#2563eb', '#34d399', '#059669', '#f59e0b', '#d97706', '#6b7280', '#4b5563']) {
        assert.equal(source.includes(literal), false, `${relative} must consume provider tokens instead of ${literal}`);
      }
    }
  });

  it('keeps chat sidebar status icons on CSS classes and tokens', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/components/ChatSidebar/ChatSidebar.js'), 'utf8');
    assert.equal(source.includes('style="font-size'), false, 'ChatSidebar status icons must not inject inline style strings');
    assert.equal(source.includes('hsl(140'), false, 'ChatSidebar status icons must consume success tokens');
    assert.equal(source.includes('hsl(0'), false, 'ChatSidebar status icons must consume danger tokens');

    let itemCss = fs.readFileSync(path.join(ROOT, 'packages/symbiote-node/chat/ChatSidebarItem/ChatSidebarItem.css.js'), 'utf8');
    for (let token of ['--sn-success-color', '--sn-danger-color', '--sn-node-selected']) {
      assert.ok(itemCss.includes(token), `ChatSidebarItem must expose status styling through ${token}`);
    }
  });

  it('keeps topology panel off copied detail shell classes', () => {
    let template = fs.readFileSync(path.join(ROOT, 'web/panels/Topology/TopologyPanel.tpl.js'), 'utf8');
    for (let sharedClass of ['ui-main', 'ui-details-header', 'ui-details-title', 'ui-details-desc']) {
      assert.equal(template.includes(sharedClass), false, `TopologyPanel must not copy ${sharedClass}`);
    }

    let source = fs.readFileSync(path.join(ROOT, 'web/panels/Topology/TopologyPanel.js'), 'utf8');
    assert.equal(source.includes('style.color'), false, 'TopologyPanel status color must use classes');
    assert.equal(source.includes('Object.assign(typeBadge.style'), false, 'TopologyPanel badge styling must use variants/classes');
    assert.equal(source.includes('#8A2BE2'), false, 'TopologyPanel must not hardcode provider colors');
  });

  it('keeps runtime and group panels off copied header classes', () => {
    for (let relative of [
      'web/panels/RuntimeControl/RuntimeControl.tpl.js',
      'web/panels/GroupManager/GroupManager.tpl.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.equal(source.includes('ui-header'), false, `${relative} must not copy shared header classes`);
      assert.equal(source.includes('ui-title'), false, `${relative} must not copy shared title classes`);
      assert.equal(source.includes('ui-title-large'), false, `${relative} must not copy shared title classes`);
    }
  });

  it('keeps runtime status colors on provider tokens', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/panels/RuntimeControl/RuntimeControl.css.js'), 'utf8');
    assert.equal(source.includes('#4caf50'), false, 'RuntimeControl must not hardcode success green');
    assert.equal(source.includes('rgba(76, 175, 80'), false, 'RuntimeControl must not hardcode success rgba');
    assert.ok(source.includes('--sn-success-color'), 'RuntimeControl must consume --sn-success-color');
  });
});
