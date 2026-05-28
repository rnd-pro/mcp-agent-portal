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
    assert.ok(
      index.includes('/packages/symbiote-node/icons/material-symbols.css'),
      'web/index.html must use the provider-hosted Material Symbols stylesheet for deterministic icon rendering',
    );
    assert.equal(
      index.includes('fonts.googleapis.com/css2?family=Material+Symbols'),
      false,
      'web/index.html must not rely on Google-hosted Material Symbols for app chrome icons',
    );
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
    let workspace = fs.readFileSync(path.join(ROOT, 'web/components/PgWorkspace/PgWorkspace.js'), 'utf8');

    assert.ok(logic.includes("from 'symbiote-node/xr'"), 'SpatialLayout must consume public symbiote-node/xr exports');
    assert.ok(logic.includes('createXRSceneController'), 'SpatialLayout must use provider XR session controller');
    assert.ok(logic.includes('createXRPanelHost'), 'SpatialLayout must mount live runtime UI through the provider XR panel host');
    assert.ok(logic.includes('createXRHtmlCanvasRenderer'), 'SpatialLayout must use the provider HTML-in-Canvas bridge');
    assert.ok(logic.includes('createXRDomPanelWorkbench'), 'SpatialLayout must delegate DOM-backed XR panel source preparation to symbiote-node/xr');
    assert.ok(logic.includes('mountPreviewPanel'), 'SpatialLayout DOM preview must be built through the provider XR panel workbench');
    assert.ok(logic.includes('createXRThreePanelTextureBridge'), 'SpatialLayout XR texture sources must be bridged through the provider Three/WebXR path');
    assert.ok(logic.includes("this._statusItem('Surface', 'production:spatial-layout')"), 'SpatialLayout must visibly label itself as the production XR surface');
    assert.ok(logic.includes("this._statusItem('Panel content', 'portal-runtime-layout')"), 'SpatialLayout must visibly distinguish live portal layouts from diagnostic harness panels');
    assert.ok(logic.includes('resolvePortalSectionLayout'), 'SpatialLayout must resolve target layouts through the same saved-layout policy as routed sections');
    assert.ok(logic.includes('layoutMatchesSection'), 'SpatialLayout must not bypass section layout validation when projecting XR scenes');
    assert.ok(logic.includes('readTargetSectionParam'), 'SpatialLayout must expose its projected section as route state instead of silently diverging');
    assert.ok(logic.includes('renderCanvasPreview'), 'SpatialLayout must request provider-owned HTML-in-Canvas preview rendering through the workbench');
    assert.ok(logic.includes('createWebXRLaunchRecommendation'), 'SpatialLayout must use provider WebXR launch recommendation logic');
    assert.ok(logic.includes('createWebXRLaunchGateSummary'), 'SpatialLayout must use provider WebXR launch gate diagnostics');
    assert.ok(logic.includes('allowUnsupportedModeProbe: true'), 'SpatialLayout must keep the XR launch action available for provider-owned requestSession diagnostics when mode detection is inconclusive');
    assert.ok(logic.includes('launchGate.canProbeMode'), 'SpatialLayout must label provider launch probe mode distinctly from confirmed WebXR launch support');
    assert.equal(logic.includes('let texture = options.texture || this._createTextureGate()'), false, 'SpatialLayout launch gate must not merge WebXR session launch with live texture readiness');
    assert.ok(logic.includes('createXRTextureDebugModeSummary'), 'SpatialLayout must normalize texture debug mode through the provider');
    assert.ok(logic.includes('createXRTextureGateSummary'), 'SpatialLayout must use provider texture gate diagnostics');
    assert.ok(logic.includes('createXRPointerRayFromDomEvent'), 'SpatialLayout must use provider DOM pointer ray projection');
    assert.ok(logic.includes('createXRSceneQualitySummary'), 'SpatialLayout must use provider scene quality diagnostics');
    assert.ok(logic.includes('createXRReadinessSummary'), 'SpatialLayout must use provider XR readiness diagnostics');
    assert.ok(logic.includes('createXRVisualTestSummary'), 'SpatialLayout must use provider visual readiness diagnostics');
    assert.ok(logic.includes('createXRVisualAgentReadinessSummary'), 'SpatialLayout must post provider visual readiness to server diagnostics');
    assert.ok(logic.includes('createXRThreeInteractionReadinessSummary'), 'SpatialLayout must post provider interaction readiness to server diagnostics');
    assert.ok(logic.includes('readXRHtmlCanvasOriginTrialHeaderStatus'), 'SpatialLayout must use provider origin-trial response-header diagnostics');
    assert.ok(logic.includes('_createHtmlCanvasDiagnosticsPayload'), 'SpatialLayout must post HTML-in-Canvas response-header diagnostics to the server');
    assert.ok(logic.includes('HTML Canvas origin trial header'), 'SpatialLayout must display HTML-in-Canvas response-header status');
    assert.ok(logic.includes('HTML Canvas required browser'), 'SpatialLayout must display HTML-in-Canvas browser requirement status');
    assert.ok(logic.includes('HTML Canvas missing core'), 'SpatialLayout must display missing core HTML-in-Canvas APIs');
    assert.ok(logic.includes('HTML Canvas missing texture'), 'SpatialLayout must display missing texture HTML-in-Canvas APIs');
    assert.ok(logic.includes('Origin-Trial header'), 'SpatialLayout geometry diagnostics must include response-header status');
    assert.ok(logic.includes('_diagnosticClientId'), 'SpatialLayout must tag XR diagnostics with a stable per-page client id');
    assert.ok(logic.includes('createStableXRDiagnosticClientId'), 'SpatialLayout must use provider-owned stable XR diagnostic ids');
    assert.ok(logic.includes('createXRWorkbenchDiagnosticPayload'), 'SpatialLayout must use provider payload builder for public XR diagnostic redaction');
    assert.equal(logic.includes('redactXRDiagnosticUrl(location.href)'), false, 'SpatialLayout must not own public XR diagnostic URL redaction');
    assert.ok(logic.includes('_createSessionDiagnosticPayload'), 'SpatialLayout must post provider session telemetry as the top-level XR session payload');
    assert.ok(logic.includes('clientId: this._diagnosticClientId'), 'SpatialLayout must expose client id to server XR diagnostics');
    assert.ok(logic.includes('session: this._createSessionDiagnosticPayload()'), 'SpatialLayout must expose session telemetry to server XR diagnostics');
    assert.ok(logic.includes('createXRThreeSessionHealthSummary'), 'SpatialLayout must compose readiness from provider session health diagnostics');
    assert.ok(logic.includes('this.ref.enterButton.disabled'), 'SpatialLayout must disable XR launch when provider diagnostics say launch is blocked');
    assert.ok(logic.includes('spatial-session-blocked'), 'SpatialLayout must log provider launch gate blocks before starting XR');
    assert.ok(logic.includes('spatial-strict-texture-preflight-blocked'), 'SpatialLayout must log strict live-texture blocks before immersive entry while still allowing session diagnostics');
    assert.ok(logic.includes('spatial-three-session-start-intent'), 'SpatialLayout must log session start intent before provider start can fail early');
    assert.ok(logic.includes('XR diagnostics post'), 'SpatialLayout must expose server diagnostic POST status for headset debugging');
    assert.ok(logic.includes('this.dataset.xrDiagnosticPost'), 'SpatialLayout must expose diagnostic POST status on the host element');
    assert.ok(logic.includes('keepalive: body.length < 60000'), 'SpatialLayout must not use keepalive for oversized XR diagnostic payloads');
    assert.ok(logic.includes('textureGate.strict && textureGate.blocked'), 'SpatialLayout must use provider texture gate data before starting immersive XR');
    assert.ok(logic.includes('texture,'), 'SpatialLayout must post provider texture diagnostics beside launch gate diagnostics');
    assert.ok(logic.includes('debugMode: this._textureDebugMode'), 'SpatialLayout must include provider texture debug mode in texture diagnostics');
    assert.equal(logic.includes('strict: true'), false, 'SpatialLayout must not hardcode strict texture policy locally');
    assert.equal(logic.includes("texture: 'strict'"), false, 'SpatialLayout must not hardcode strict texture mode locally');
    assert.ok(logic.includes('readTextureDebugMode'), 'SpatialLayout must read texture diagnostics mode from route data');
    assert.ok(logic.includes('sceneQuality,'), 'SpatialLayout must post provider scene quality diagnostics beside launch and texture');
    assert.ok(logic.includes('readiness,'), 'SpatialLayout must post provider XR readiness diagnostics to the server timeline');
    assert.ok(logic.includes("from 'three'"), 'SpatialLayout host may supply Three to the optional provider adapter');
    assert.ok(logic.includes('createXRThreeWebXRAdapter'), 'SpatialLayout must use the provider Three/WebXR adapter for immersive panels');
    assert.ok(logic.includes('createXRThreeRenderHost'), 'SpatialLayout must delegate Three renderer/camera/scene setup to symbiote-node/xr');
    assert.ok(logic.includes('createXRThreeSessionController'), 'SpatialLayout must delegate Three/WebXR session lifecycle to symbiote-node/xr');
    assert.ok(logic.includes("this._postXRDiagnostic('spatial-three-frame'"), 'SpatialLayout must post throttled provider frame diagnostics during immersive sessions');
    assert.ok(logic.includes('createXRThreeSessionOptions'), 'SpatialLayout must build Three/WebXR session options through symbiote-node/xr');
    assert.ok(logic.includes("selectedMode === 'auto' ? WEBXR_MODES.immersiveVr : selectedMode"), 'SpatialLayout Auto mode must prefer immersive-vr for the Quest MVP production path');
    assert.ok(logic.includes('createPortalXRDeepGraphScene'), 'SpatialLayout must adapt project graph data through the portal XR deep-graph adapter');
    assert.ok(logic.includes("events.addEventListener('skeleton-loaded'"), 'SpatialLayout must rebuild deep graph diagnostics when project skeleton data arrives');
    assert.ok(logic.includes('deepGraph: this._deepGraph?.diagnostics'), 'SpatialLayout must expose XR deep-graph diagnostics without owning graph projection logic');
    assert.ok(logic.includes('Deep preview'), 'SpatialLayout must surface provider-owned XR deep-graph preview coverage diagnostics');
    assert.ok(logic.includes('this._deepGraph.previewSummary'), 'SpatialLayout must consume provider-owned deep graph preview summary data');
    assert.ok(logic.includes('Deep edge types'), 'SpatialLayout must surface provider-owned XR deep-graph edge diagnostics');
    assert.ok(logic.includes('Deep focus degree'), 'SpatialLayout must surface provider-owned XR deep-graph focus diagnostics');
    assert.ok(logic.includes('Deep focus preview'), 'SpatialLayout must surface provider-owned focus preview coverage diagnostics');
    assert.ok(logic.includes('_renderDeepGraphOverlay'), 'SpatialLayout must render the provider XR deep-graph preview overlay');
    assert.ok(logic.includes('createXRDeepGraphPreviewOverlay'), 'SpatialLayout must render deep graph preview overlays through symbiote-node/xr');
    assert.equal(logic.includes('for (let edge of this._deepGraph.preview.edges)'), false, 'SpatialLayout must not render deep graph edges locally');
    assert.equal(logic.includes('for (let graphNode of this._deepGraph.preview.nodes)'), false, 'SpatialLayout must not render deep graph nodes locally');
    assert.equal(logic.includes('Math.atan2'), false, 'SpatialLayout must not calculate deep graph edge angles locally');
    assert.ok(logic.includes('this._threeXRSessionController?.getDiagnostics'), 'SpatialLayout must post/display Three session diagnostics from symbiote-node/xr');
    assert.ok(logic.includes('_enterThreeXR'), 'SpatialLayout production XR must enter through the provider Three/WebXR path');
    assert.ok(logic.includes('spatial-production-xr-blocked'), 'SpatialLayout must report blocked production XR instead of falling through to a second renderer');
    assert.equal(logic.includes('createXRWebGLLayerPanelRenderer'), false, 'SpatialLayout must not keep a second production-like raw WebGL panel renderer');
    assert.equal(logic.includes('createXRWebGLLayerTarget'), false, 'SpatialLayout must not keep a second production-like raw WebGL layer target path');
    assert.equal(logic.includes('createXRWebGLLayerSize'), false, 'SpatialLayout must not size a separate raw WebGL fallback as production XR');
    assert.equal(logic.includes('_getXRLayerTarget'), false, 'SpatialLayout must not keep a lower-level XR layer fallback accessor');
    assert.equal(logic.includes('this._controller.start'), false, 'SpatialLayout must not start a second XR session controller after Three/WebXR fails');
    assert.equal(logic.includes('navigator.xr.requestSession'), false, 'SpatialLayout must not request Three WebXR sessions directly');
    assert.equal(logic.includes('setAnimationLoop'), false, 'SpatialLayout must not own the Three WebXR render loop');
    assert.equal(logic.includes('getController('), false, 'SpatialLayout must not wire Three XR controllers directly');
    assert.equal(logic.includes("addEventListener('selectstart'"), false, 'SpatialLayout must not own Three XR selectstart handlers');
    assert.equal(logic.includes("addEventListener('selectend'"), false, 'SpatialLayout must not own Three XR selectend handlers');
    assert.equal(logic.includes('_decorateThreeXRScene'), false, 'SpatialLayout must not decorate Three scenes locally');
    assert.equal(logic.includes('new THREE.Color'), false, 'SpatialLayout must not own Three scene background decoration');
    assert.equal(logic.includes('new THREE.HemisphereLight'), false, 'SpatialLayout must not own Three scene lights');
    assert.equal(logic.includes('.createRenderer('), false, 'SpatialLayout must not create Three renderers directly');
    assert.equal(logic.includes('.createCamera('), false, 'SpatialLayout must not create Three cameras directly');
    assert.equal(logic.includes('setPixelRatio'), false, 'SpatialLayout must not size Three renderer pixel ratio directly');
    assert.equal(logic.includes('setSize('), false, 'SpatialLayout must not size Three renderers directly');
    assert.equal(logic.includes('updateProjectionMatrix'), false, 'SpatialLayout must not own Three camera projection sizing');
    assert.equal(logic.includes("getContext('webgl2'"), false, 'SpatialLayout must not create XR WebGL contexts locally');
    assert.equal(logic.includes("getContext('webgl'"), false, 'SpatialLayout must not create XR WebGL contexts locally');
    assert.equal(logic.includes('makeXRCompatible'), false, 'SpatialLayout must not own XR WebGL compatibility negotiation');
    assert.equal(logic.includes('new THREE.Raycaster'), false, 'SpatialLayout must not own Three controller raycasting');
    assert.equal(logic.includes('new THREE.PlaneGeometry'), false, 'SpatialLayout must not build Three panel geometry locally');
    assert.equal(logic.includes('new THREE.MeshStandardMaterial'), false, 'SpatialLayout must not own Three panel materials');
    assert.equal(logic.includes('intersectObjects'), false, 'SpatialLayout must not duplicate provider hit testing');
    assert.equal(logic.includes('createXRThreeControllerRayAdapter'), false, 'SpatialLayout must use the public Three WebXR adapter, not provider sub-adapters');
    assert.equal(logic.includes('mountPanel(panel, content)'), false, 'SpatialLayout must not locally glue live DOM panel mounting');
    assert.equal(logic.includes('preparePanel(sourceElement, panel'), false, 'SpatialLayout must not locally glue HTML-in-Canvas source preparation');
    assert.equal(logic.includes("document.createElement('section')"), false, 'SpatialLayout must not locally construct XR panel shells');
    assert.equal(logic.includes('content.hidden = true'), false, 'SpatialLayout must not hide live DOM panels just because HTML-in-Canvas is detected');
    assert.equal(logic.includes('mountPanel(panel, canvas)'), false, 'SpatialLayout must not replace the visible DOM fallback with a canvas-only subtree');
    assert.equal(/\.drawElementImage\s*\(/.test(logic), false, 'SpatialLayout must not call experimental canvas APIs directly');
    assert.ok(logic.includes('createXRSpatialScene'), 'SpatialLayout must use provider human-space scene projection');
    assert.ok(logic.includes('createXRSpatialPreview'), 'SpatialLayout must use provider DOM preview projection');
    assert.ok(logic.includes('createXRThreePanelTextureBridge'), 'SpatialLayout must bridge the same DOM panel sources into the Three XR renderer');
    assert.ok(logic.includes('createXRThreeHtmlCanvasTextureResolver'), 'SpatialLayout must use provider HTML-in-Canvas texture resolver for Three XR panels');
    assert.ok(logic.includes('createXRThreeTextureCapabilitySummary'), 'SpatialLayout must report provider-owned Three texture capability diagnostics');
    assert.ok(logic.includes('createXRSpatialWorkbenchSummary'), 'SpatialLayout must aggregate XR workbench status through symbiote-node/xr');
    assert.ok(logic.includes('createXRWorkbenchDiagnosticPayload'), 'SpatialLayout must compose XR diagnostic payloads through symbiote-node/xr');
    assert.ok(logic.includes('createXRPanelGeometrySummary'), 'SpatialLayout must display provider-owned XR geometry summaries');
    assert.ok(logic.includes('textureQuality'), 'SpatialLayout must display provider-owned XR texture quality diagnostics');
    assert.ok(logic.includes('poseComfort'), 'SpatialLayout must display provider-owned XR pose comfort diagnostics');
    assert.ok(logic.includes('poseAdjustment'), 'SpatialLayout must display provider-owned XR pose adjustment diagnostics');
    assert.ok(logic.includes('facing'), 'SpatialLayout must display provider-owned XR facing diagnostics');
    assert.ok(logic.includes('rotationAdjustment'), 'SpatialLayout must display provider-owned XR rotation adjustment diagnostics');
    assert.equal(logic.includes('contentViewport ='), false, 'SpatialLayout must not calculate XR content viewport locally');
    assert.ok(logic.includes('createXRThemeSnapshot'), 'SpatialLayout must snapshot provider theme tokens through symbiote-node/xr');
    assert.ok(logic.includes('hitTestXRPanels'), 'SpatialLayout must use provider pointer hit testing');
    assert.ok(logic.includes('hitTestXRPanelFrame'), 'SpatialLayout must use provider XR panel frame hit zones');
    assert.ok(logic.includes('createXRPointerHitFromDomEvent'), 'SpatialLayout must normalize DOM fallback hits through symbiote-node/xr');
    assert.ok(logic.includes('dispatchPointerEvent'), 'SpatialLayout must relay XR pointer events through the provider panel host');
    assert.ok(logic.includes('event.xrPanelPointer'), 'SpatialLayout must not recursively relay provider-origin synthetic pointer events');
    assert.ok(logic.includes('_relayingPanelPointer'), 'SpatialLayout must guard synchronous provider pointer relay from bubbling back into itself');
    assert.ok(logic.includes('createXRPanelGestureState'), 'SpatialLayout must create XR gesture state through symbiote-node/xr');
    assert.ok(logic.includes('updateXRPanelGesture'), 'SpatialLayout must update XR gestures through symbiote-node/xr');
    assert.ok(logic.includes('createXRLayoutTransactionFromGesture'), 'SpatialLayout must create layout transactions through symbiote-node/xr');
    assert.ok(logic.includes('createXRLayoutTransactionFromPanelPose'), 'SpatialLayout must persist Three XR panel poses through symbiote-node/xr');
    assert.ok(logic.includes('frameTarget'), 'SpatialLayout must pass provider frame targets into XR gestures');
    assert.ok(logic.includes('XR hover frame'), 'SpatialLayout must display provider frame target diagnostics');
    assert.ok(logic.includes('XR resize size'), 'SpatialLayout must display provider resize size diagnostics');
    assert.equal(logic.includes('patch: { layout: { rect'), false, 'SpatialLayout must not build XR geometry patches locally');
    assert.ok(logic.includes('setPointerCapture'), 'SpatialLayout must keep DOM fallback drags captured until finish or cancel');
    assert.ok(
      logic.lastIndexOf('this._syncThreeXRScene();') > logic.indexOf('this.ref.space.append(node);'),
      'SpatialLayout must sync the Three XR scene after DOM/source panels are mounted',
    );
    assert.equal(logic.includes("createElement('article')"), false, 'SpatialLayout must not render placeholder spatial cards');
    assert.equal(css.includes('.psl-line'), false, 'SpatialLayout must not keep placeholder line styling');
    assert.equal(css.includes('opacity: 0.001'), false, 'SpatialLayout must not hide HTML-in-Canvas source panels through opacity because it leaks into XR textures');
    assert.ok(css.includes('.psl-geometry'), 'SpatialLayout must expose XR geometry diagnostics with provider tokens');
    assert.ok(css.includes('.psl-html-canvas'), 'SpatialLayout must expose HTML-in-Canvas diagnostics with provider tokens');
    assert.ok(css.includes('.psl-deep-graph'), 'SpatialLayout must expose XR deep graph overlay styling with provider tokens');
    assert.ok(css.includes('.psl-deep-node'), 'SpatialLayout must expose XR deep graph nodes with provider tokens');
    assert.ok(css.includes('.psl-deep-edge'), 'SpatialLayout must expose XR deep graph edges with provider tokens');
    assert.ok(css.includes('.psl-panel::before'), 'SpatialLayout must expose provider-style XR move affordances');
    assert.ok(css.includes('.psl-panel::after'), 'SpatialLayout must expose provider-style XR resize affordances');
    assert.ok(css.includes('--sn-xr-content-width'), 'SpatialLayout fallback must use provider XR content width');
    assert.ok(css.includes('--sn-xr-content-scale'), 'SpatialLayout fallback must use provider XR content scale');
    assert.equal(css.includes('transform: translate(-200vw, -200vh)'), false, 'SpatialLayout must not move HTML-in-Canvas source panels outside the paintable viewport');
    assert.equal(css.includes('.psl-xr-layer-canvas'), false, 'SpatialLayout must not keep unused raw XR layer canvas styling');
    assert.ok(logic.includes('Three diagnostic panels'), 'SpatialLayout must expose provider strict texture diagnostic panel counts');
    assert.equal(logic.includes('packages/symbiote-node'), false, 'SpatialLayout must not deep-import provider files');
    let deepGraphAdapter = fs.readFileSync(path.join(ROOT, 'web/services/xr-deep-graph-scene.js'), 'utf8');
    assert.ok(deepGraphAdapter.includes("from 'symbiote-node/xr'"), 'Deep graph adapter must consume public symbiote-node/xr exports');
    assert.ok(deepGraphAdapter.includes('createXRProjectDeepGraphProjection'), 'Deep graph adapter must use provider-owned project graph projection');
    assert.equal(deepGraphAdapter.includes('buildGraphModelFromSkeleton'), false, 'Deep graph adapter must not build graph models locally');
    assert.equal(deepGraphAdapter.includes('packages/symbiote-node'), false, 'Deep graph adapter must not deep-import provider files');
    assert.ok(router.includes("'spatial-layout'"), 'Spatial route panel type must be registered');
    assert.ok(router.includes("registerSection('spatial'"), 'Spatial section must be registered');
    assert.ok(workspace.includes('getHomeSections()'), 'workspace route preservation must validate home sections by workspace scope');
    assert.ok(workspace.includes('getProjectSections()'), 'workspace route preservation must validate project sections by workspace scope');
    assert.ok(workspace.includes('sections.some((section) => section.id === route.panel)'), 'workspace route preservation must not accept sections outside the active workspace scope');
    assert.ok(workspace.includes("navigate(defaultSection, '', { project: this._projectId })"), 'project workspace default navigation must keep the project route query');

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
