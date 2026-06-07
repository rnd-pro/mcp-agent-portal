import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

const PANEL_THEME_FILES = [
  'web/panels/ActionBoard/ActionBoard.css.js',
  'web/panels/PipelineManager/PipelineStep.js',
  'web/panels/ProjectItem/ProjectItem.css.js',
  'web/panels/Marketplace/McpServerCard.js',
  'web/panels/Marketplace/ContextCard.js',
  'web/panels/Marketplace/Marketplace.css.js',
  'web/panels/RuntimeControl/RuntimeControl.css.js',
  'web/panels/ToolExplorer/ToolCard.js',
];

const LIGHT_DOM_ROOT_STYLE_FILES = [
  ['web/panels/ActionBoard/ActionBoard.css.js', 'pg-action-board'],
  ['web/panels/ActiveTasks/ActiveTasks.css.js', 'pg-active-tasks'],
  ['web/panels/AgentListPanel/AgentListItem.css.js', 'pg-agent-list-item'],
  ['web/panels/FileTree/FileTree.css.js', 'pg-file-tree'],
  ['web/panels/GroupManager/GroupManager.css.js', 'pg-group-manager'],
  ['web/panels/Marketplace/ContextCard.js', 'mp-context-card'],
  ['web/panels/Marketplace/Marketplace.css.js', 'pg-marketplace'],
  ['web/panels/Marketplace/McpCatalogSection.js', 'mp-catalog-section'],
  ['web/panels/Marketplace/McpServerCard.js', 'mp-server-card'],
  ['web/panels/PeerReview/PeerReview.css.js', 'pg-peer-review'],
  ['web/panels/PipelineManager/PipelineItem.js', 'pm-pipeline-item'],
  ['web/panels/PipelineManager/PipelineManager.css.js', 'pg-pipeline-mgr'],
  ['web/panels/PipelineManager/PipelineStep.js', 'pm-pipeline-step'],
  ['web/panels/ProjectItem/ProjectItem.css.js', 'pg-project-item'],
  ['web/panels/RuntimeControl/RuntimeControl.css.js', 'pg-runtime-control'],
  ['web/panels/RuntimeControl/RuntimeControl.css.js', 'rc-instance-item'],
  ['web/panels/SettingsPanel/SettingsPanel.css.js', 'pg-settings-panel'],
  ['web/panels/SkillLibraryPanel/SkillListItem.css.js', 'pg-skill-list-item'],
  ['web/panels/SkillManager/AgentPortalTree.css.js', 'pg-agent-portal-tree'],
  ['web/panels/SkillManager/OpenLibraryTree.css.js', 'pg-agent-portal-library'],
  ['web/panels/ToolExplorer/ToolCard.js', 'te-tool-card'],
  ['web/panels/ToolExplorer/ToolExplorer.css.js', 'pg-tool-explorer'],
  ['web/panels/ToolExplorer/ToolServerItem.js', 'te-server-item'],
  ['web/panels/Topology/TopologyPanel.css.js', 'topology-panel'],
  ['web/panels/WorkflowExplorer/WorkflowExplorer.css.js', 'pg-workflow-explorer'],
  ['web/panels/WorkflowExplorer/WorkflowItem.js', 'we-workflow-item'],
  ['web/panels/WorkflowExplorer/WorkflowStep.js', 'we-workflow-step'],
];

function assertLightDomRootSelector(source, tag, relative) {
  let escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(
    source,
    new RegExp(`(^|,)\\s*${escaped}(?:\\s|\\{|\\[|\\.|:|,)`, 'm'),
    `${relative} rootStyles must include ${tag} so Light DOM theme styles apply`
  );
}

describe('portal panel theme contract', () => {
  it('keeps product rootStyles compatible with Light DOM injection', () => {
    for (let [relative, tag] of LIGHT_DOM_ROOT_STYLE_FILES) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');

      assertLightDomRootSelector(source, tag, relative);
    }
  });

  it('keeps reusable product panels on symbiote-ui font tokens', () => {
    for (let relative of PANEL_THEME_FILES) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');

      for (let literal of [
        'var(--sn-font,',
        'var(--sn-font-mono,',
        'font-family: monospace',
        'ui-monospace',
        'SFMono-Regular',
        'JetBrains Mono',
        'Fira Code',
        'Menlo',
        'Monaco',
        'Consolas',
        '-apple-system',
        'sans-serif',
      ]) {
        assert.equal(
          source.includes(literal),
          false,
          `${relative} must not copy provider font fallback ${literal}`
        );
      }
    }
  });

  it('uses provider typography tokens where owned panels set font families', () => {
    for (let relative of PANEL_THEME_FILES) {
      let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      let fontDeclarations = source.match(/font-family:\s*[^;]+;/g) ?? [];

      for (let declaration of fontDeclarations) {
        assert.match(
          declaration,
          /font-family:\s*var\(--sn-font(?:-mono)?\);/,
          `${relative} must use --sn-font or --sn-font-mono without local fallbacks`
        );
      }
    }
  });

  it('keeps project item icon button styles scoped to the project item action', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/panels/ProjectItem/ProjectItem.css.js'), 'utf8');

    assert.equal(
      /(^|[^.#\\w-])sn-button\\[variant="icon"\\]/.test(source),
      false,
      'ProjectItem must not hide every light-DOM icon button in the page'
    );
    assert.match(source, /\.project-remove\[variant="icon"\]/);
  });
});
