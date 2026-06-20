import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

describe('resource groups demo contract', () => {
  it('publishes realistic resource group lanes with multiple model profiles', async () => {
    let { groups } = await import('../../demo/mock-data.js');
    let names = groups.map(group => group.name);

    assert.deepEqual(
      names,
      [
        'reasoning-heavy',
        'implementation',
        'review',
        'verification',
        'deepseek-pro-audit',
        'ui-implementation-deepseek',
      ]
    );

    for (let group of groups) {
      assert.ok(Array.isArray(group.profiles), `${group.name} must expose profile cells`);
      assert.ok(group.profiles.length >= 2, `${group.name} must render as a kanban column with multiple model cells`);
      assert.ok(group.rotation_mode, `${group.name} must include rotation policy`);
      assert.ok(group.max_agents, `${group.name} must include concurrency limit`);
      assert.ok(group.approval_mode, `${group.name} must include resource-group approval mode`);
      assert.ok(group.timeout, `${group.name} must include resource-group timeout`);
      assert.equal('agents' in group, false, `${group.name} must not duplicate agent ownership outside agent markdown`);
      assert.equal('fallback_profiles' in group, false, `${group.name} must use profiles[] as the only provider priority source`);
    }

    let byName = Object.fromEntries(groups.map(group => [group.name, group]));
    assert.equal(byName['reasoning-heavy'].policy, 'admin');
    assert.equal(byName['reasoning-heavy'].approval_mode, 'yolo');
    assert.equal(byName.implementation.policy, 'read-write');
    assert.equal(byName.implementation.approval_mode, 'auto_edit');
    assert.equal(byName.review.policy, 'read-only');
    assert.equal(byName.review.approval_mode, 'plan');
    assert.equal(byName.verification.timeout, 300);
  });

  it('keeps public demo model names current and removes test-only groups', () => {
    let source = fs.readFileSync(path.join(ROOT, 'demo/mock-data.js'), 'utf8');

    for (let stale of [
      'Frontend Team',
      'Research Squad',
      'modelA',
      'modelB',
      'modelC',
      'openrouter/test-model',
      'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite-preview',
      'gemini-3-pro-preview',
      'gemini-3-flash-preview',
      'gpt-4.5',
      'deepseek-chat',
      'deepseek-reasoner',
    ]) {
      assert.equal(source.includes(stale), false, `demo/mock-data.js must not expose stale or test-only value: ${stale}`);
    }
    for (let stalePattern of [
      /(?<![\w-])claude-sonnet-4(?![\w-])/,
      /(?<![\w-])claude-opus-4(?![\w-])/,
      /(?<![\w/-])deepseek-v4(?![\w/-])/,
    ]) {
      assert.equal(stalePattern.test(source), false, `demo/mock-data.js must not expose stale model pattern: ${stalePattern}`);
    }
  });

  it('renders resource group metadata with scoped agent icon colors', () => {
    let source = fs.readFileSync(path.join(ROOT, 'web/panels/GroupManager/GroupManager.js'), 'utf8');
    let templateSource = fs.readFileSync(path.join(ROOT, 'web/panels/GroupManager/GroupManager.tpl.js'), 'utf8');
    let cssSource = fs.readFileSync(path.join(ROOT, 'web/panels/GroupManager/GroupManager.css.js'), 'utf8');
    let skillManagerSource = fs.readFileSync(path.join(ROOT, 'web/panels/SkillManager/SkillManager.js'), 'utf8');

    assert.ok(source.includes("import 'symbiote-ui/board'"), 'GroupManager must use the shared Kanban board package export');
    assert.ok(templateSource.includes('sn-kanban-board'), 'GroupManager must render groups through the shared Kanban board primitive');
    assert.ok(source.includes('gm-agent-list'), 'GroupManager must show group agent ownership');
    assert.ok(source.includes('gm-agent-card'), 'GroupManager must render agents as movable cards');
    assert.ok(source.includes('data-agent-drop-group'), 'GroupManager must expose group agent drop zones');
    assert.ok(source.includes('_moveAgent'), 'GroupManager must support moving agents between groups');
    assert.ok(source.includes('_profileDropIndex'), 'GroupManager must calculate profile drop insertion positions');
    assert.ok(source.includes('_moveProfile(targetGroupName, targetIndex'), 'GroupManager must move profiles to an explicit priority index');
    assert.ok(source.includes('targetProfiles.splice(nextIndex, 0'), 'GroupManager must insert moved profiles at the drop position');
    assert.ok(source.includes('card.draggable = !profile.inherited'), 'GroupManager must not allow inherited provider profiles to be reordered');
    assert.ok(source.includes('gm-column-delete'), 'GroupManager column headers must expose delete, not manual save');
    assert.ok(source.includes("this._mcpCall('delete_group'"), 'GroupManager must delete groups through the MCP group tool');
    assert.ok(source.includes('_requestDeleteGroup'), 'GroupManager delete must use in-app two-step confirmation');
    assert.ok(source.includes('delete_forever'), 'GroupManager armed delete must show a stronger in-app icon');
    assert.equal(source.includes('window.confirm'), false, 'GroupManager must not use browser-native delete confirmations');
    assert.equal(source.includes('confirm('), false, 'GroupManager must not call browser-native confirmation APIs');
    assert.ok(!source.includes('gm-column-save'), 'GroupManager must not render a per-column manual save action');
    assert.ok(source.includes('el.onchange = async'), 'GroupManager config fields must autosave on change');
    assert.ok(source.includes("await this._saveGroup(group, `${group.name} saved`)"), 'GroupManager autosave edits must persist through create_group');
    assert.ok(source.includes('gm-agent-edit'), 'GroupManager must expose direct agent markdown editing');
    assert.ok(source.includes('_openAgentMarkdown'), 'GroupManager must route agent edit actions to the markdown editor');
    assert.ok(source.includes('buildHash(\'skills\''), 'GroupManager agent edit actions must target the Skills section');
    assert.ok(source.includes('path: `.agent-portal/agents/${agentSlug}.md`'), 'GroupManager must link agents to their markdown source');
    assert.ok(source.includes('/api/agents/resource-group'), 'GroupManager must persist agent group assignments');
    assert.ok(source.includes('/api/agents?ts=${Date.now()}'), 'GroupManager must cache-bust agent routing assignments');
    assert.ok(source.includes("{ cache: 'no-store' }"), 'GroupManager must not cache agent routing assignments');
    assert.equal(source.includes('group.agents'), false, 'GroupManager must not read legacy group agent ownership');
    assert.equal(source.includes('data-legacy'), false, 'GroupManager must not render legacy agent cards');
    assert.equal(source.includes('fallback_profiles'), false, 'GroupManager must not persist legacy fallback_profiles');
    assert.ok(source.includes('default chat'), 'GroupManager must mark the default chat agent');
    assert.ok(source.includes('normalizeAgentColor'), 'GroupManager must validate metadata colors before applying them');
    assert.ok(source.includes("iconWrap.style.setProperty('--gm-agent-color', color)"), 'GroupManager must pass agent markdown colors through a scoped CSS custom property');
    assert.ok(source.includes('profile.label || provider'), 'GroupManager must render profile labels when demo data provides them');
    assert.ok(source.includes('DEFAULT_CODEX_MODELS'), 'GroupManager must publish Codex CLI model choices for resource profiles');
    assert.ok(source.includes('gpt-5.5'), 'GroupManager must include the top Codex CLI model option');
    assert.ok(source.includes('PROVIDER_REASONING_LEVELS'), 'GroupManager must expose provider reasoning effort choices');
    assert.ok(source.includes('max'), 'GroupManager must include the top Claude reasoning effort option');
    assert.ok(source.includes('data-add-reasoning'), 'GroupManager must render a provider reasoning selector in add-profile controls');
    assert.match(cssSource, /\.gm-add-profile\[data-provider="codex"\] \[data-add-reasoning\],\s*\.gm-add-profile\[data-provider="claude"\] \[data-add-reasoning\]/, 'Codex and Claude add-profile controls must both show provider reasoning selector');
    assert.match(cssSource, /\.gm-add-profile:not\(\[data-provider="codex"\]\):not\(\[data-provider="claude"\]\) \[data-add-reasoning\]/, 'Providers without reasoning support must keep the add-profile reasoning selector hidden');
    assert.ok(source.includes('reasoningEffort'), 'GroupManager must persist provider reasoning effort on profiles');
    assert.ok(source.includes('gm-profile-meta-line'), 'GroupManager must show profile-level reasoning metadata');
    assert.ok(source.includes('APPROVAL_MODES'), 'GroupManager must publish approval-mode choices as group config');
    assert.ok(source.includes("approvalSelect.dataset.field = 'approval_mode'"), 'GroupManager must render group approval-mode control');
    assert.ok(source.includes("timeoutInput.dataset.field = 'timeout'"), 'GroupManager must render group timeout control');
    assert.ok(source.includes('approval_mode: group.approval_mode'), 'GroupManager must persist group approval mode');
    assert.ok(source.includes('timeout: group.timeout'), 'GroupManager must persist group timeout');
    assert.match(cssSource, /--sn-kanban-columns-height: max-content;/, 'Resource Groups board must size its row by the tallest column content');
    assert.match(cssSource, /--sn-kanban-columns-align: stretch;/, 'Resource Groups board must stretch shorter columns to the tallest column');
    assert.match(cssSource, /\.gm-board \.sn-kanban-column-body\s*\{[\s\S]*grid-template-rows: auto auto minmax\(0, 1fr\) auto;/, 'GroupManager must size product-specific column content inside the shared Kanban column body');
    assert.match(cssSource, /\.gm-profile\s*\{[\s\S]*grid-template-columns: 32px minmax\(0, 1fr\) 28px;/, 'GroupManager profile cards must keep stable icon, content, and action slots inside shared Kanban columns');
    assert.match(cssSource, /\.gm-column-delete\s*\{[\s\S]*margin-left: auto;/, 'Group delete must occupy the former header action slot');
    assert.match(cssSource, /\.gm-column-delete\[data-delete-armed="true"\]\s*\{[\s\S]*var\(--sn-danger-color\)/, 'Armed group delete must be styled in-app through theme danger tokens');
    assert.match(cssSource, /\.gm-agent-card\s*\{[\s\S]*width: 100%;[\s\S]*grid-template-columns: 32px minmax\(0, 1fr\) 28px;/, 'Agent cards must match provider card width and control slot sizing');
    assert.match(cssSource, /\.gm-agent-list\s*\{[\s\S]*flex-direction: column;/, 'Agent lists inside groups must stack full-width cards');
    assert.match(cssSource, /\.gm-agent-icon\s*\{[\s\S]*color: var\(--gm-agent-color, var\(--sn-node-selected\)\);/, 'Agent icons must use the color declared in agent markdown metadata');
    assert.match(cssSource, /\.gm-profile\.drop-before\s*\{[\s\S]*box-shadow: 0 -2px 0 var\(--sn-node-selected\);/, 'Profile reorder must show a themed before-drop marker');
    assert.match(cssSource, /\.gm-profile\.drop-after\s*\{[\s\S]*box-shadow: 0 2px 0 var\(--sn-node-selected\);/, 'Profile reorder must show a themed after-drop marker');
    assert.ok(skillManagerSource.includes('function routeFileRequest()'), 'SkillManager must support route-addressed markdown files');
    assert.ok(skillManagerSource.includes("panel !== 'skills'"), 'SkillManager must only honor path query values on the Skills route');
    assert.ok(skillManagerSource.includes('normalizeRoutePath(params.path)'), 'SkillManager must normalize route file paths');
    assert.ok(skillManagerSource.includes('fromRoute: true'), 'SkillManager route file loads must identify route-originated selection');
    assert.equal(source.replace("iconWrap.style.setProperty('--gm-agent-color', color);", '').includes('style.'), false, 'GroupManager must keep all non-agent-color styling in CSS');
  });

  it('routes error_fallback resource group profiles through runtime provider fallback', () => {
    let serverSource = fs.readFileSync(path.join(ROOT, 'packages/agent-pool-mcp/src/server.js'), 'utf8');
    let codexRunnerSource = fs.readFileSync(path.join(ROOT, 'packages/agent-pool-mcp/src/runner/codex-runner.js'), 'utf8');
    let claudeRunnerSource = fs.readFileSync(path.join(ROOT, 'packages/agent-pool-mcp/src/runner/claude-runner.js'), 'utf8');
    let schedulerSource = fs.readFileSync(path.join(ROOT, 'packages/agent-pool-mcp/src/scheduler/daemon.js'), 'utf8');
    let routerSource = fs.readFileSync(path.join(ROOT, 'src/node/proxy/task-router.js'), 'utf8');
    let toolDefinitionsSource = fs.readFileSync(path.join(ROOT, 'packages/agent-pool-mcp/src/tool-definitions.js'), 'utf8');
    let toolRouterSource = fs.readFileSync(path.join(ROOT, 'packages/agent-pool-mcp/src/tools/toolRouter.js'), 'utf8');

    assert.ok(serverSource.includes('buildRuntimeFallbackProfiles'), 'delegate_task must build an ordered profile fallback chain');
    assert.ok(serverSource.includes("rotationMode === 'error_fallback'"), 'runtime fallback must be tied to error_fallback resource groups');
    assert.ok(serverSource.includes("type: 'provider_fallback'"), 'agent-pool must emit a dedicated provider fallback event');
    assert.ok(serverSource.includes('pushTaskEvent(taskId'), 'provider fallback events must be visible to portal subscribers');
    assert.ok(serverSource.includes('runtimeProfiles.length > 1'), 'fallback must require multiple resource group profiles');
    assert.ok(routerSource.includes("case 'provider_fallback':"), 'portal task router must render provider fallback events');
    assert.ok(routerSource.includes("msgs.push({ role: 'system', text });"), 'fallback events must persist in chat messages');
    assert.ok(serverSource.includes('function handleDeleteGroup'), 'agent-pool must expose a group deletion handler');
    assert.ok(serverSource.includes('deleteGroup(cwd, args.name)'), 'group deletion handler must use the durable group store');
    assert.ok(toolDefinitionsSource.includes("name: 'delete_group'"), 'agent-pool tool definitions must publish delete_group');
    assert.ok(toolRouterSource.includes('delete_group: handlers.handleDeleteGroup'), 'agent-pool tool router must dispatch delete_group');
    assert.ok(serverSource.includes('reasoningEffort: profile.reasoningEffort'), 'agent-pool must pass selected provider reasoning effort to provider attempts');
    assert.ok(serverSource.includes('PROVIDER_REASONING_EFFORTS'), 'agent-pool must normalize reasoning effort by provider');
    assert.ok(serverSource.includes("provider === 'opencode' && effectiveModel"), 'agent-pool model validation must not reject Codex model IDs through the OpenCode catalog');
    assert.ok(codexRunnerSource.includes('model_reasoning_effort'), 'Codex runner must map reasoningEffort to Codex CLI config');
    assert.ok(claudeRunnerSource.includes('--effort'), 'Claude runner must map reasoningEffort to Claude Code --effort');
    assert.ok(schedulerSource.includes('--effort'), 'Claude scheduler runs must map reasoningEffort to Claude Code --effort');
    assert.ok(toolDefinitionsSource.includes('reasoningEffort'), 'agent-pool tool definitions must publish provider reasoning effort metadata');
    assert.equal(toolDefinitionsSource.includes('fallback_profiles'), false, 'agent-pool group schema must not publish legacy fallback_profiles');
    assert.ok(toolDefinitionsSource.includes('approval_mode'), 'agent-pool group schema must publish group-owned approval mode');
    assert.ok(serverSource.includes('resourceGroupApprovalMode(resourceGroup)'), 'delegate_task must resolve approval mode from resource groups');
    assert.ok(serverSource.includes('resourceGroup?.timeout'), 'delegate_task must resolve timeout from resource groups');
    assert.ok(serverSource.includes('const hasExplicitRuntimeRoute = Boolean(args.provider || args.model)'), 'explicit provider/model overrides must not inherit agent-owned resource groups');
    assert.ok(serverSource.includes('hasExplicitRuntimeRoute ? null : agentDef?.resourceGroup'), 'agent-owned resource groups must only apply when the runtime route is not explicit');
    assert.match(serverSource, /Resource group \\`\$\{resourceGroupName\}\\` not found/, 'missing resource groups must fail instead of falling back silently');
    assert.match(serverSource, /if \(resourceGroupName && !resourceGroup\) \{[\s\S]*isError: true,[\s\S]*\}/, 'missing resource groups must return an MCP error result');
    assert.equal(serverSource.includes('agentDef?.approvalMode'), false, 'delegate_task must not use agent frontmatter approval mode');
    assert.equal(serverSource.includes('agentDef?.policy'), false, 'delegate_task must not use agent frontmatter policy');
  });
});
