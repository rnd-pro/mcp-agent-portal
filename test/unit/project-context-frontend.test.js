import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

function readSource(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

describe('project scoped frontend data loading', () => {
  it('passes active project id through skeleton and file API calls', () => {
    let source = readSource('web/app.js');

    assert.match(source, /function getProjectScopedPathArgs\(params = \{\}\)/);
    assert.match(source, /let projectId = getApiProjectId\(params\);/);
    assert.match(source, /path: resolveProjectPath\(params\.path, projectId\)/);
    assert.match(source, /"\/api\/skeleton": \{ name: "get_skeleton", args: p => getProjectScopedPathArgs\(p\) \}/);
    assert.match(source, /"\/api\/file": \{ name: "compact", args: p => \(\{ action: "compact_file", \.\.\.getProjectScopedPathArgs\(p\), beautify: true \}\) \}/);
    assert.match(source, /"\/api\/docs": \{ name: "docs", args: p => \(\{ action: "get", path: resolveProjectPath\('\.', getApiProjectId\(p\)\) \|\| '\.', file: p\.file \|\| p\.path, projectId: getApiProjectId\(p\) \}\) \}/);
    assert.match(source, /api\('\/api\/skeleton', \{ projectId \}\)/);
    assert.match(source, /if \(_currentProjectId !== projectId\) return;/);
    assert.match(source, /projectId === _currentProjectId && state\.skeleton && skeletonMatchesProject\(state\.skeleton, projectId\)/);
    assert.match(source, /function skeletonMatchesProject\(skeleton, projectId\)/);
    assert.match(source, /function getActiveRouteProjectId\(\)/);
    assert.match(source, /!t \|\| !skeletonMatchesProject\(t, getActiveRouteProjectId\(\)\)/);
    assert.match(source, /!e \|\| !skeletonMatchesProject\(e, getActiveRouteProjectId\(\)\)/);
    assert.match(source, /requiresPublicSource = String\(project\?\.path \|\| ''\)\.includes\('\/workspace\/public-projects\/'\)/);
    assert.match(source, /location\.pathname\.includes\('\/demos\/agent-portal-vr\/'\) && Boolean\(projectId\)/);
    assert.match(source, /if \(!sourceProjectId\) return !requiresPublicSource;/);
    assert.match(source, /if \(!skeletonMatchesProject\(sk, projectId\)\) return;/);
    assert.match(source, /routeProjectId \|\| dashState\.activeProjectId \|\| null/);
    assert.match(source, /emit\('file-selected', \{ path: subPath, projectId, fromRoute: true \}\)/);
    assert.match(source, /new URL\(path, baseUrl\)/);
    assert.ok(source.includes("String(e.prefix || '').replace(/^\\/+/, '')"));
  });

  it('keeps explorer document loads scoped to the route project', () => {
    let codeViewerSource = readSource('web/panels/CodeViewer/CodeViewer.js');
    let ctxPanelSource = readSource('web/panels/CtxPanel/CtxPanel.js');
    let localeSource = readSource('web/common/portal-locales.js');

    assert.match(codeViewerSource, /_loadRequestId = 0;/);
    assert.match(codeViewerSource, /this\._loadFile\(event\.detail\.path, event\.detail\.projectId\)/);
    assert.match(codeViewerSource, /api\("\/api\/file", \{ path, projectId \}\)/);
    assert.match(codeViewerSource, /if \(requestId !== this\._loadRequestId\) return;/);
    assert.match(codeViewerSource, /resolveProjectPath\(path, projectId\)/);

    assert.match(ctxPanelSource, /import \{ getSourceLanguage \} from 'symbiote-ui\/ui';/);
    assert.match(ctxPanelSource, /_loadRequestId = 0;/);
    assert.match(ctxPanelSource, /let projectId = detail\.projectId \|\| getActiveRouteProjectId\(\);/);
    assert.match(ctxPanelSource, /getSourceLanguage\(file\) === 'md'/);
    assert.match(ctxPanelSource, /api\('\/api\/docs', \{ file, projectId \}\)/);
    assert.match(ctxPanelSource, /if \(requestId !== this\._loadRequestId\) return;/);
    assert.match(ctxPanelSource, /tPortal\('text\.markdownShownInViewer'\)/);
    assert.match(localeSource, /'portal\.text\.markdownShownInViewer'/);
  });

  it('prevents panel self-fetches from accepting stale project skeletons', () => {
    let fileTreeSource = readSource('web/panels/FileTree/FileTree.js');
    let graphSource = readSource('web/panels/dep-graph.js');

    assert.match(fileTreeSource, /api\('\/api\/skeleton', \{ projectId \}\)/);
    assert.match(fileTreeSource, /getActiveRouteProjectId\(\) !== projectId/);
    assert.match(fileTreeSource, /state\.skeleton && skeletonMatchesProject\(state\.skeleton, getActiveRouteProjectId\(\)\)/);
    assert.match(fileTreeSource, /dashEvents\.addEventListener\('active-project-changed'/);
    assert.match(fileTreeSource, /customElements\.whenDefined\('sn-tree-panel'\)/);
    assert.match(fileTreeSource, /customElements\.whenDefined\('sn-tree-view'\)/);
    assert.match(fileTreeSource, /setTreeItems\(this, this\._treeItems, this\.\$\.filterText\)/);
    assert.match(fileTreeSource, /this\.querySelector\('sn-tree-panel'\)/);
    assert.match(fileTreeSource, /panel\.setItems\(this\._treeItems\)/);
    assert.match(fileTreeSource, /skeletonMatchesProject\(event\.detail, getActiveRouteProjectId\(\)\)/);
    assert.match(fileTreeSource, /skeletonMatchesProject\(skeleton, projectId\)/);
    assert.match(graphSource, /api\('\/api\/skeleton', \{ projectId \}\)/);
    assert.match(graphSource, /getActiveRouteProjectId\(\) !== projectId/);
    assert.match(graphSource, /!state\.skeleton \|\| !skeletonMatchesProject\(state\.skeleton, getActiveRouteProjectId\(\)\)/);
    assert.match(graphSource, /dashEvents\.addEventListener\('active-project-changed', this\._onActiveProjectChanged\)/);
    assert.match(graphSource, /skeletonMatchesProject\(e\.detail, getActiveRouteProjectId\(\)\)/);
    assert.match(graphSource, /skeletonMatchesProject\(skeleton, projectId\)/);
  });

  it('keeps the final project directory visible in the topbar path', () => {
    let appSource = readSource('web/app.js');
    let styleSource = readSource('web/style.css');

    assert.match(appSource, /formatProjectPathForTopbar\(proj\.path\)/);
    assert.match(appSource, /parts\.slice\(-3\)\.join\('\/'\)/);
    assert.match(styleSource, /#active-project-path\s*\{[\s\S]*text-overflow: ellipsis;/);
  });

  it('projects the active tab accent into chat composer hover styling', () => {
    let projectTabsSource = readSource('web/components/ProjectTabs/ProjectTabs.js');

    assert.match(projectTabsSource, /let activeProject = history\.find\(\(p\) => p\.id === activeId\);/);
    assert.match(projectTabsSource, /root\.style\.setProperty\('--project-accent', activeColor\);/);
    assert.match(projectTabsSource, /root\.style\.setProperty\('--sn-composer-send-hover-bg', activeColor\);/);
    assert.match(projectTabsSource, /root\.style\.removeProperty\('--sn-composer-send-hover-bg'\);/);
  });

  it('clears the selected chat when switching project tabs', () => {
    let projectTabsSource = readSource('web/components/ProjectTabs/ProjectTabs.js');

    assert.match(projectTabsSource, /navigate\('agent-chat', '', \{ project: id, chat: null \}\);/);
    assert.match(projectTabsSource, /navigate\('agent-chat', '', \{ project: data\.id, chat: null \}\);/);
  });

  it('declares a runtime base path before API calls are patched', () => {
    let indexSource = readSource('web/index.html');
    let appSource = readSource('web/app.js');

    assert.match(indexSource, /<base href="\$\{basePath \|\| '\/'\}">/);
    assert.ok(indexSource.indexOf('<base href=') < indexSource.indexOf('<script type="importmap">'));
    assert.match(indexSource, /src="app\.js\?v=xr-spatial-readiness"/);
    assert.ok(appSource.includes('import "./common/base-path.js";'));
  });
});
