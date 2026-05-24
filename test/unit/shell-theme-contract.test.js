import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

describe('portal shell theme contract', () => {
  it('applies the symbiote-node default theme at the document root', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/app.js'), 'utf8');
    assert.ok(source.includes('DEFAULT_THEME'), 'web/app.js must import DEFAULT_THEME from symbiote-node/ui');
    assert.ok(source.includes('applyTheme'), 'web/app.js must import applyTheme from symbiote-node/ui');
    assert.match(
      source,
      /\b[a-zA-Z_$][\w$]*\(document\.documentElement,\s*[a-zA-Z_$][\w$]*\)/,
      'web/app.js must apply the provider theme to document.documentElement so tokens cascade into every layout',
    );

    let theme = fs.readFileSync(path.join(ROOT, 'packages/symbiote-node/themes/default-dark.js'), 'utf8');
    for (let token of [
      '--sn-theme-hue',
      '--sn-theme-chroma',
      '--sn-theme-bg-lightness',
      '--sn-theme-density',
      '--sn-bg',
      '--sn-panel-bg',
      '--sn-layout-gap-bg',
      '--sn-node-selected',
      '--sn-text',
    ]) {
      assert.ok(theme.includes(token), `default symbiote-node theme must provide ${token}`);
    }
  });

  it('consumes symbiote-node theme tokens instead of copying provider colors', () => {
    let css = fs.readFileSync(path.join(ROOT, 'web/style.css'), 'utf8');
    let index = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
    let icons = fs.readFileSync(path.join(ROOT, 'web/common/icons.js'), 'utf8');
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
    assert.equal(index.includes('style='), false, 'web/index.html must not carry inline visual styles');
    assert.equal(icons.includes('style='), false, 'markdown icon rendering must use theme classes');
    assert.equal(icons.includes('hsl('), false, 'markdown icon rendering must not hard-code colors');
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

  it('keeps runtime event rows on the provider event feed primitive', () => {
    let actionTemplate = fs.readFileSync(path.join(ROOT, 'web/panels/ActionBoard/ActionBoard.tpl.js'), 'utf8');
    let actionLogic = fs.readFileSync(path.join(ROOT, 'web/panels/ActionBoard/ActionBoard.js'), 'utf8');
    let opsTemplate = fs.readFileSync(path.join(ROOT, 'web/panels/OpsPanel/OpsPanel.tpl.js'), 'utf8');
    let eventFeedCss = fs.readFileSync(path.join(ROOT, 'packages/symbiote-node/display/EventFeed/EventFeed.css.js'), 'utf8');

    assert.ok(actionTemplate.includes('<sn-event-feed'), 'ActionBoard must compose the provider event feed');
    assert.ok(opsTemplate.includes('<sn-event-feed'), 'OpsPanel must compose the provider event feed');
    assert.ok(actionLogic.includes('toToolEventFeedItems'), 'ActionBoard must adapt portal events into provider event feed data');
    assert.equal(actionTemplate.includes('pg-event-item'), false, 'ActionBoard must not render local event item widgets');
    for (let token of [
      '--sn-font-mono',
      '--sn-node-hover',
      '--sn-cat-server',
      '--sn-success-color',
      '--sn-danger-color',
    ]) {
      assert.ok(eventFeedCss.includes(token), `EventFeed must consume ${token}`);
    }
  });

  it('keeps graph flow surfaces on provider theme tokens', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/panels/GraphFlows/GraphFlows.css.js'), 'utf8');
    let template = fs.readFileSync(path.join(ROOT, 'web/panels/GraphFlows/GraphFlows.tpl.js'), 'utf8');
    let logic = fs.readFileSync(path.join(ROOT, 'web/panels/GraphFlows/GraphFlows.js'), 'utf8');
    for (let literal of [
      '#181818',
      '#e0e0e0',
      '#222',
      '#2d2d2d',
      '#4c8bf5',
      '#888',
      '#f08f8f',
      'rgba(255,255,255',
      'rgba(76, 139, 245',
      'rgba(0,0,0',
      'system-ui, sans-serif',
    ]) {
      assert.equal(source.includes(literal), false, `GraphFlows must not copy provider styling with ${literal}`);
    }
    for (let token of [
      '--sn-panel-bg',
      '--sn-node-border',
      '--sn-list-item-bg',
      '--sn-list-item-border',
      '--sn-list-item-active-bg',
      '--sn-list-item-active-border',
      '--sn-bg-overlay',
      '--sn-danger-color',
      '--sn-text',
      '--sn-text-dim',
      '--sn-font',
    ]) {
      assert.ok(source.includes(token), `GraphFlows must consume ${token}`);
    }
    assert.ok(template.includes('<sn-button'), 'GraphFlows action controls must compose library buttons');
    assert.ok(logic.includes("createElement('sn-list-item')"), 'GraphFlows stories must compose library list items');
    assert.ok(logic.includes("createElement('sn-badge')"), 'GraphFlows tags must compose library badges');
    assert.ok(logic.includes("createElement('sn-empty-state')"), 'GraphFlows empty/error states must compose library empty states');
    assert.equal(template.includes('<button'), false, 'GraphFlows template must not own raw button shells');
    assert.equal(logic.includes("createElement('button')"), false, 'GraphFlows logic must not own raw button shells');
    assert.equal(source.includes('.flows-btn'), false, 'GraphFlows CSS must not copy button styling');
    assert.equal(source.includes('.flows-icon-btn'), false, 'GraphFlows CSS must not copy icon button styling');
  });

  it('keeps topology tables on the provider data table primitive', () => {
    let template = fs.readFileSync(path.join(ROOT, 'web/panels/Topology/TopologyPanel.tpl.js'), 'utf8');
    let logic = fs.readFileSync(path.join(ROOT, 'web/panels/Topology/TopologyPanel.js'), 'utf8');
    let styles = fs.readFileSync(path.join(ROOT, 'web/panels/Topology/TopologyPanel.css.js'), 'utf8');

    assert.ok(template.includes('<sn-data-table'), 'TopologyPanel must compose the reusable provider data table');
    assert.ok(logic.includes('setRows(rows)'), 'TopologyPanel must feed rows into the provider data table');
    assert.ok(logic.includes('badge: { label:'), 'TopologyPanel must pass structured badge data instead of rendered HTML');
    assert.equal(logic.includes('html:'), false, 'TopologyPanel must not pass rendered HTML into the data table');
    assert.equal(template.includes('<table'), false, 'TopologyPanel must not own raw table markup');
    assert.equal(styles.includes('.node-table'), false, 'TopologyPanel must not keep local table shell styling');
    for (let token of ['--sn-panel-bg', '--sn-text', '--sn-text-dim', '--sn-node-selected']) {
      assert.ok(styles.includes(token), `TopologyPanel must consume ${token}`);
    }
  });

  it('keeps dependency graph chrome on provider theme tokens', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/panels/dep-graph.css.js'), 'utf8');
    for (let literal of [
      '#1a1a1a',
      '#4c8bf5',
      '#4caf50',
      '#f44336',
      '#ff9800',
      '#888',
      '#e0e0e0',
      'rgba(',
      'var(--sn-border-subtle,',
      'var(--sn-bg-overlay,',
      'var(--sn-shadow-lg,',
      'var(--sn-text,',
      'var(--sn-font,',
      'var(--sn-node-selected,',
      'var(--sn-node-hover,',
      'var(--sn-danger-color,',
      'var(--sn-success-color,',
      'var(--sn-conn-color,',
      'var(--sn-cat-control,',
      'var(--sn-accent-glow,',
      'SF Mono',
      'JetBrains Mono',
      'monospace)',
    ]) {
      assert.equal(source.includes(literal), false, `dep-graph chrome must not copy provider styling with ${literal}`);
    }
    for (let token of [
      '--sn-node-border',
      '--sn-bg-overlay',
      '--sn-shadow-lg',
      '--sn-accent-bg-subtle',
      '--sn-font-mono',
      '--sn-conn-color',
      '--sn-cat-control',
    ]) {
      assert.ok(source.includes(token), `dep-graph chrome must consume ${token}`);
    }
  });

  it('keeps shared agent chrome on provider theme tokens', () => {
    for (let relative of [
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
      'web/panels/ProjectItem/ProjectItem.tpl.js',
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
      if (relative === 'web/panels/ProjectItem/ProjectItem.tpl.js') {
        assert.equal(source.includes('<button'), false, `${relative} must not own raw button markup`);
      }
    }
  });

  it('uses symbiote action buttons inside graph explorer controls', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/panels/dep-graph-template.js'), 'utf8');
    assert.ok(source.includes('<sn-button'), 'dep graph template must compose the library action control');
    assert.equal(source.includes('<button'), false, 'dep graph template must not own raw button markup');
    for (let action of ['fit', 'view-mode', 'path-style', 'graph-metadata', 'cluster-legend']) {
      assert.ok(source.includes(`data-action="${action}"`), `dep graph template must preserve ${action} action`);
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
      'web/panels/ActiveContext/ActiveContext.js',
      'web/panels/PipelineManager/PipelineItem.js',
      'web/panels/ToolExplorer/ToolServerItem.js',
      'web/panels/WorkflowExplorer/WorkflowItem.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(
        source.includes('<sn-list-item') || source.includes("createElement('sn-list-item')"),
        `${relative} must compose the library list item`
      );
      assert.equal(source.includes('ui-item'), false, `${relative} must not copy list item shell classes`);
    }

    let activeContext = fs.readFileSync(path.join(ROOT, 'web/panels/ActiveContext/ActiveContext.js'), 'utf8');
    assert.equal(activeContext.includes('Object.assign(row.style'), false, 'ActiveContext must not hand-style list rows');
    assert.equal(activeContext.includes('closeIcon.style.fontSize'), false, 'ActiveContext must not hand-style action icons');
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
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(source.includes('sn-badge'), `${relative} must compose the library status badge`);
      assert.equal(source.includes('ui-badge'), false, `${relative} must not copy badge shell classes`);
    }

    let dataTableSource = fs.readFileSync(path.join(ROOT, 'packages/symbiote-node/display/DataTable/DataTable.js'), 'utf8');
    assert.ok(dataTableSource.includes('sn-badge'), 'sn-data-table must compose the library status badge for structured badge cells');
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
      'web/panels/HealthPanel/HealthPanel.js',
      'web/panels/Marketplace/Marketplace.js',
      'web/panels/PeerReview/PeerReview.tpl.js',
      'web/panels/PipelineManager/PipelineManager.tpl.js',
      'web/panels/ProjectList/ProjectList.tpl.js',
      'web/panels/CtxPanel/CtxPanel.js',
      'web/panels/RuntimeControl/RuntimeControl.tpl.js',
      'web/panels/SettingsPanel/SettingsPanel.js',
      'web/panels/SkillManager/SkillMetadata.js',
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

    let contextCard = fs.readFileSync(path.join(ROOT, 'web/panels/Marketplace/ContextCard.js'), 'utf8');
    assert.equal(contextCard.includes('style.color'), false, 'Marketplace context status color must use attributes and CSS tokens');
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

  it('keeps workflow utility panels on provider theme tokens', () => {
    for (let relative of [
      'web/panels/WorkflowExplorer/WorkflowStep.js',
      'web/panels/ActionBoard/ActionBoard.css.js',
      'web/panels/SkillLibraryPanel/SkillListItem.css.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      for (let literal of [
        'rgba(0,0,0',
        'rgba(0, 0, 0',
        'rgba(255,255,255',
        'hsl(30, 80%, 60%)',
        "var(--sn-font,",
        "var(--sn-font-mono,",
        "var(--sn-node-bg,",
        "var(--sn-node-border,",
        "var(--sn-warning-color,",
        'font-family: monospace',
      ]) {
        assert.equal(source.includes(literal), false, `${relative} must not copy provider styling with ${literal}`);
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

  it('keeps operational panels on symbiote theme tokens without local fallbacks', () => {
    for (let relative of [
      'web/panels/SettingsPanel/SettingsPanel.css.js',
      'web/panels/SettingsPanel/SettingsPanel.js',
      'web/panels/OpsPanel/OpsPanel.css.js',
      'web/panels/HealthPanel/HealthPanel.css.js',
    ]) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      for (let literal of [
        '#4caf50',
        '#ff9800',
        '#f44336',
        '#ffb300',
        '#a9b7c6',
        '#fff',
        'rgba(0,0,0',
        'hsl(210, 45%, 45%)',
        'hsl(150, 55%, 38%)',
        'hsl(250, 35%, 50%)',
        'hsl(38, 55%, 42%)',
        'hsl(4, 55%, 48%)',
        "var(--sn-font,",
        "var(--sn-font-mono,",
        "var(--sn-text,",
        "var(--sn-text-dim,",
        "var(--sn-success-color,",
        "var(--sn-warning-color,",
        "var(--sn-danger-color,",
        "var(--sn-bg-overlay,",
        "var(--sn-cat-server,",
        "var(--sn-cat-data,",
        'Georgia',
        "'JetBrains Mono'",
        "'Fira Code'",
      ]) {
        assert.equal(source.includes(literal), false, `${relative} must not copy provider styling with ${literal}`);
      }
    }

    let settings = fs.readFileSync(path.join(ROOT, 'web/panels/SettingsPanel/SettingsPanel.js'), 'utf8');
    assert.equal(/style\.color\s*=\s*["']var\(--sn-[^)]+,/.test(settings), false, 'SettingsPanel inline status colors must be token-only');
    assert.equal(settings.includes('.style.'), false, 'SettingsPanel visual state must use CSS classes or attributes');

    let healthPanel = fs.readFileSync(path.join(ROOT, 'web/panels/HealthPanel/HealthPanel.js'), 'utf8');
    assert.ok(healthPanel.includes("createElement('sn-card')"), 'HealthPanel must compose library cards');
    assert.ok(healthPanel.includes("createElement('sn-metric')"), 'HealthPanel must compose library metrics');
    assert.equal(healthPanel.includes('pg-health-card'), false, 'HealthPanel must not copy card shell classes');
    assert.equal(healthPanel.includes('pg-placeholder'), false, 'HealthPanel must not copy placeholder shell classes');
    assert.equal(healthPanel.includes('pg-metric'), false, 'HealthPanel must not copy metric shell classes');
    assert.equal(healthPanel.includes('style="font-size'), false, 'HealthPanel must not inject inline icon styles');

    let ctxPanel = fs.readFileSync(path.join(ROOT, 'web/panels/CtxPanel/CtxPanel.js'), 'utf8');
    assert.ok(ctxPanel.includes("createElement('sn-list-item')"), 'CtxPanel must compose library list items for outline rows');
    assert.ok(ctxPanel.includes("createElement('code-block')"), 'CtxPanel must compose the library code block for raw docs');
    assert.equal(ctxPanel.includes('contentHTML'), false, 'CtxPanel must not render docs through HTML strings');
    assert.equal(ctxPanel.includes('outlineHTML'), false, 'CtxPanel must not render outline through HTML strings');
    assert.equal(ctxPanel.includes('pg-placeholder'), false, 'CtxPanel must not copy placeholder shell classes');
    assert.equal(ctxPanel.includes('style="font-size'), false, 'CtxPanel must not inject inline icon styles');

    let skillMetadata = fs.readFileSync(path.join(ROOT, 'web/panels/SkillManager/SkillMetadata.js'), 'utf8');
    assert.ok(skillMetadata.includes("createElement('sn-field')"), 'SkillMetadata must compose library field wrappers');
    assert.ok(skillMetadata.includes("createElement('sn-empty-state')"), 'SkillMetadata must compose library empty states');
    assert.equal(skillMetadata.includes('contentHTML'), false, 'SkillMetadata must not render metadata through HTML strings');
    assert.equal(skillMetadata.includes('pg-placeholder'), false, 'SkillMetadata must not copy placeholder shell classes');

    let agentChat = fs.readFileSync(path.join(ROOT, 'web/panels/AgentChat/AgentChat.js'), 'utf8');
    assert.equal(agentChat.includes('style="color'), false, 'AgentChat composer adapter must not inject inline colors');
    assert.equal(agentChat.includes('font-weight:500'), false, 'AgentChat composer adapter must leave typography to chat-composer CSS');

    let opsTemplate = fs.readFileSync(path.join(ROOT, 'web/panels/OpsPanel/OpsPanel.tpl.js'), 'utf8');
    let opsCss = fs.readFileSync(path.join(ROOT, 'web/panels/OpsPanel/OpsPanel.css.js'), 'utf8');
    assert.ok(opsTemplate.includes('<sn-event-feed'), 'OpsPanel must compose the library event feed');
    assert.equal(opsTemplate.includes('pg-placeholder'), false, 'OpsPanel must not copy placeholder markup');
    assert.equal(opsCss.includes('pg-placeholder'), false, 'OpsPanel must not copy placeholder shell classes');

    let actionBoardTemplate = fs.readFileSync(path.join(ROOT, 'web/panels/ActionBoard/ActionBoard.tpl.js'), 'utf8');
    assert.ok(actionBoardTemplate.includes('<sn-metric'), 'ActionBoard must compose library metrics');
    assert.equal(actionBoardTemplate.includes('style="'), false, 'ActionBoard template must keep visual styling in CSS');
    assert.equal(actionBoardTemplate.includes('ab-stat-value'), false, 'ActionBoard must not copy metric value shell classes');
    assert.equal(actionBoardTemplate.includes('ab-stat-label'), false, 'ActionBoard must not copy metric label shell classes');

    let settingsTemplate = fs.readFileSync(path.join(ROOT, 'web/panels/SettingsPanel/SettingsPanel.tpl.js'), 'utf8');
    let settingsSource = fs.readFileSync(path.join(ROOT, 'web/panels/SettingsPanel/SettingsPanel.js'), 'utf8');
    assert.ok(settingsTemplate.includes('<sn-metric'), 'SettingsPanel template metrics must compose library metrics');
    assert.ok(settingsSource.includes('createElement("sn-metric")'), 'SettingsPanel runtime metrics must compose library metrics');
    assert.equal(settingsTemplate.includes('pg-stg-metric'), false, 'SettingsPanel template must not copy metric shell classes');
    assert.equal(settingsSource.includes('pg-stg-metric'), false, 'SettingsPanel runtime metrics must not copy metric shell classes');

    let runtimeItem = fs.readFileSync(path.join(ROOT, 'web/panels/RuntimeControl/InstanceItem.js'), 'utf8');
    let runtimeSource = fs.readFileSync(path.join(ROOT, 'web/panels/RuntimeControl/RuntimeControl.js'), 'utf8');
    let runtimeCss = fs.readFileSync(path.join(ROOT, 'web/panels/RuntimeControl/RuntimeControl.css.js'), 'utf8');
    assert.ok(runtimeItem.includes('<sn-metric'), 'Runtime instance metrics must compose library metrics');
    assert.ok(runtimeSource.includes("createElement('sn-metric')"), 'Runtime summary metrics must compose library metrics');
    assert.equal(runtimeItem.includes('rtc-metric-label'), false, 'Runtime instance metrics must not copy metric label shell classes');
    assert.equal(runtimeItem.includes('rtc-metric-value'), false, 'Runtime instance metrics must not copy metric value shell classes');
    assert.equal(runtimeSource.includes('rtc-summary-label'), false, 'Runtime summary metrics must not copy metric label shell classes');
    assert.equal(runtimeSource.includes('rtc-summary-value'), false, 'Runtime summary metrics must not copy metric value shell classes');
    assert.equal(runtimeCss.includes('.rtc-metric '), false, 'RuntimeControl CSS must not keep local metric shells');

    let skillManager = fs.readFileSync(path.join(ROOT, 'web/panels/SkillManager/SkillManager.tpl.js'), 'utf8');
    let skillManagerCss = fs.readFileSync(path.join(ROOT, 'web/panels/SkillManager/SkillManager.css.js'), 'utf8');
    assert.ok(skillManager.includes('<sn-button'), 'SkillManager controls must compose library buttons');
    assert.equal(skillManager.includes('pg-mode-toggle'), false, 'SkillManager controls must not copy button shell classes');
    assert.equal(skillManagerCss.includes('pg-mode-toggle'), false, 'SkillManager CSS must not keep local button shells');
  });

  it('keeps project graph socket colors token-driven', () => {
    let source = fs.readFileSync(path.join(ROOT, 'packages/symbiote-node/canvas/project-graph-builder.js'), 'utf8');

    for (let literal of ['#c87533', '#d4a04a']) {
      assert.equal(source.includes(literal), false, `project-graph-builder must not hard-code socket color ${literal}`);
    }
    assert.ok(source.includes('var(--sn-dot-input)'), 'import sockets must inherit the provider input token');
    assert.ok(source.includes('var(--sn-dot-output)'), 'export sockets must inherit the provider output token');
  });

  it('keeps spatial layout as a thin symbiote-node XR consumer', () => {
    let logic = fs.readFileSync(path.join(ROOT, 'web/panels/SpatialLayout/SpatialLayout.js'), 'utf8');
    let css = fs.readFileSync(path.join(ROOT, 'web/panels/SpatialLayout/SpatialLayout.css.js'), 'utf8');
    let router = fs.readFileSync(path.join(ROOT, 'web/router-registry.js'), 'utf8');

    assert.ok(logic.includes("from 'symbiote-node/xr'"), 'SpatialLayout must consume public symbiote-node/xr exports');
    assert.ok(logic.includes('createXRSceneController'), 'SpatialLayout must use provider XR session controller');
    assert.ok(logic.includes('createXRPanelHost'), 'SpatialLayout must mount live runtime UI through the provider XR panel host');
    assert.ok(logic.includes('createXRHtmlCanvasRenderer'), 'SpatialLayout must use the provider HTML-in-Canvas bridge');
    assert.ok(logic.includes('createXRSpatialScene'), 'SpatialLayout must use provider human-space scene projection');
    assert.ok(logic.includes('createXRSpatialPreview'), 'SpatialLayout must use provider DOM preview projection');
    assert.ok(logic.includes('createXRThemeSnapshot'), 'SpatialLayout must snapshot provider theme tokens through symbiote-node/xr');
    assert.ok(logic.includes('hitTestXRPanels'), 'SpatialLayout must use provider pointer hit testing');
    assert.equal(logic.includes("createElement('article')"), false, 'SpatialLayout must not render placeholder spatial cards');
    assert.equal(css.includes('.psl-line'), false, 'SpatialLayout must not keep placeholder line styling');
    assert.equal(logic.includes('packages/symbiote-node'), false, 'SpatialLayout must not deep-import provider files');
    assert.ok(router.includes("'spatial-layout'"), 'Spatial route panel type must be registered');
    assert.ok(router.includes("registerSection('spatial'"), 'Spatial section must be registered');

    for (let token of [
      '--sn-bg',
      '--sn-panel-bg',
      '--sn-node-border',
      '--sn-node-selected',
      '--sn-xr-panel-bg',
      '--sn-xr-panel-border',
      '--sn-xr-pointer-color',
      '--sn-text',
      '--sn-text-dim',
    ]) {
      assert.ok(css.includes(token), `SpatialLayout CSS must consume ${token}`);
    }
    for (let literal of ['#4c8bf5', '#181818', '#222', 'rgba(', 'hsl(']) {
      assert.equal(css.includes(literal), false, `SpatialLayout CSS must not hard-code ${literal}`);
    }
  });
});
