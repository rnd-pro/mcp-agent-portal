import {
  applyXRThemeToPanel,
  createWebXREmulationAdapter,
  createXRSpatialScene,
  createXRThemeSnapshot,
  createXRVisualAgentReadinessSummary,
  createXRVisualTestSummary,
  getWebXRSupport,
} from 'symbiote-node/xr';

const caseSelect = document.querySelector('#case');
const runButton = document.querySelector('#run');
const emulateButton = document.querySelector('#emulate');
const statusList = document.querySelector('#status');
const checksOutput = document.querySelector('#checks');
const panelMapOutput = document.querySelector('#panel-map');
const agentReportOutput = document.querySelector('#agent-report');
const topView = document.querySelector('#top-view');
const frontView = document.querySelector('#front-view');

const params = new URLSearchParams(location.search);
const initialCase = params.get('case') || 'baseline';
const EXPECTED_CASE_ISSUES = {
  baseline: [],
  overlap: ['panel-world-overlap'],
  'bad-facing': ['viewer-facing'],
  'too-high': ['pose-comfort'],
  'low-texture': ['texture-density-readable'],
  'missing-controls': ['frame-visuals-present', 'controller-rays-visible', 'hit-reticle-visible'],
};

let support = null;
let emulator = {
  installed: false,
  runtime: 'native',
  reason: null,
  devui: false,
};
let lastSummary = null;
let pageErrors = [];

window.__xrVisualAuditReport = null;

window.addEventListener('error', (event) => {
  pageErrors.push({
    type: 'error',
    message: event.message || 'script-error',
  });
});

window.addEventListener('unhandledrejection', (event) => {
  pageErrors.push({
    type: 'unhandledrejection',
    message: event.reason?.message || String(event.reason || 'unhandled-rejection'),
  });
});

function createRuntimeLayout() {
  return {
    id: 'xr-audit-root',
    component: 'panel-layout',
    layout: { direction: 'horizontal' },
    children: [
      {
        id: 'audit-nav',
        component: 'sn-navigation-panel',
        layout: { weight: 0.22 },
        props: { title: 'Navigation' },
      },
      {
        id: 'audit-main',
        component: 'sn-graph-surface',
        layout: { weight: 0.42 },
        props: { title: 'Graph' },
      },
      {
        id: 'audit-chat',
        component: 'sn-chat-surface',
        layout: { weight: 0.24 },
        props: { title: 'Chat' },
      },
      {
        id: 'audit-status',
        component: 'sn-status-strip',
        layout: { weight: 0.12 },
        props: { title: 'Status' },
      },
    ],
  };
}

function setRows(rows) {
  statusList.replaceChildren(...rows.flatMap(([label, value]) => {
    let term = document.createElement('dt');
    let detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value == null || value === '' ? '-' : String(value);
    return [term, detail];
  }));
}

function postDiagnostic(event, extra = {}) {
  fetch('/api/xr-diagnostics/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event,
      pageUrl: location.href,
      visualAudit: lastSummary
        ? {
          status: lastSummary.status,
          panelCount: lastSummary.panelCount,
          warnCount: lastSummary.warnCount,
          failCount: lastSummary.failCount,
          issues: lastSummary.issues.map((issue) => issue.id),
        }
        : null,
      ...extra,
    }),
    keepalive: true,
  }).catch(() => {});
}

function applyCase(scene, name) {
  let panels = scene.panels.map((panel) => ({ ...panel }));
  if (name === 'overlap' && panels[1]) {
    panels[1] = {
      ...panels[1],
      position: [...panels[0].position],
      rotation: [...panels[0].rotation],
    };
  }
  if (name === 'bad-facing' && panels[0]) {
    panels[0] = {
      ...panels[0],
      rotation: [0, 56, 0],
    };
  }
  if (name === 'too-high' && panels[0]) {
    panels[0] = {
      ...panels[0],
      position: [panels[0].position[0], 2.45, panels[0].position[2]],
    };
  }
  return {
    ...scene,
    panels,
  };
}

function createScene(name) {
  let scene = createXRSpatialScene(createRuntimeLayout(), {
    themeScope: 'default-provider',
    preview: { pixelsPerMeter: 160 },
    userSpace: {
      eyeHeight: 1.62,
      comfortRadius: 1.8,
    },
  });
  let themed = applyCase(scene, name);
  let themeSnapshot = createXRThemeSnapshot(document);
  themed.panels = themed.panels.map((panel) => applyXRThemeToPanel(panel, themeSnapshot));
  return {
    scene: themed,
    themeSnapshot,
  };
}

function createTelemetry(name) {
  if (name === 'missing-controls') {
    return {
      active: true,
      panelFrameVisuals: 0,
      controllerRayVisuals: 0,
      hitReticleVisuals: 0,
      interactionEvents: 0,
    };
  }
  return {
    active: true,
    panelFrameVisuals: 4,
    controllerRayVisuals: emulator.installed ? 2 : 1,
    hitReticleVisuals: 1,
    interactionEvents: 1,
    hover: { panelId: 'audit-main' },
  };
}

function drawTopView(summary) {
  let issueIds = new Set(summary.issues.flatMap((issue) => issue.panelIds || issue.overlaps?.flatMap((overlap) => overlap.panelIds) || []));
  let nodes = [
    '<line class="axis" x1="360" y1="0" x2="360" y2="320"></line>',
    '<line class="axis" x1="0" y1="270" x2="720" y2="270"></line>',
    '<circle class="eye" cx="360" cy="270" r="7"></circle>',
  ];
  for (let panel of summary.panelMap) {
    let rect = panel.worldRect;
    let x = 360 + rect.left * 160;
    let y = 270 + rect.z * 90;
    let width = Math.max(12, (rect.right - rect.left) * 160);
    let height = 18;
    let issue = issueIds.has(panel.panelId) ? ' issue' : '';
    nodes.push(`<rect class="panel-shape${issue}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height}" rx="4"></rect>`);
    nodes.push(`<text class="label" x="${(x + 6).toFixed(2)}" y="${(y + 14).toFixed(2)}">${panel.panelId}</text>`);
  }
  topView.innerHTML = nodes.join('');
}

function drawFrontView(summary) {
  let issueIds = new Set(summary.issues.flatMap((issue) => issue.panelIds || issue.overlaps?.flatMap((overlap) => overlap.panelIds) || []));
  let nodes = [
    '<line class="axis" x1="360" y1="0" x2="360" y2="320"></line>',
    '<line class="axis" x1="0" y1="160" x2="720" y2="160"></line>',
  ];
  for (let panel of summary.panelMap) {
    let rect = panel.worldRect;
    let x = 360 + rect.left * 150;
    let y = 160 - (rect.top - 1.6) * 120;
    let width = Math.max(18, (rect.right - rect.left) * 150);
    let height = Math.max(12, (rect.top - rect.bottom) * 120);
    let issue = issueIds.has(panel.panelId) ? ' issue' : '';
    nodes.push(`<rect class="panel-shape${issue}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" rx="4"></rect>`);
    nodes.push(`<text class="label" x="${(x + 6).toFixed(2)}" y="${(y + 16).toFixed(2)}">${panel.panelId}</text>`);
  }
  frontView.innerHTML = nodes.join('');
}

function createAgentReport(selectedCase, summary) {
  let statusRows = [...statusList.querySelectorAll('dt')].map((term) => ({
    label: term.textContent,
    value: term.nextElementSibling?.textContent || '',
  }));
  let report = {
    version: 'xr-visual-agent-report-v1',
    case: selectedCase,
    status: summary.status,
    panelCount: summary.panelCount,
    warningCount: summary.warnCount,
    failureCount: summary.failCount,
    issueIds: summary.issues.map((issue) => issue.id),
    svg: {
      topPanelShapes: topView.querySelectorAll('.panel-shape').length,
      frontPanelShapes: frontView.querySelectorAll('.panel-shape').length,
      topLabels: topView.querySelectorAll('.label').length,
      frontLabels: frontView.querySelectorAll('.label').length,
    },
    outputs: {
      statusRows: statusRows.length,
      checksBytes: checksOutput.textContent.length,
      panelMapBytes: panelMapOutput.textContent.length,
    },
    emulation: {
      requested: params.get('emulate') === '1',
      installed: Boolean(emulator.installed),
      runtime: emulator.runtime || 'iwer',
      devui: Boolean(emulator.devui),
      reason: emulator.reason || null,
    },
    support: {
      status: support?.status || null,
      reason: support?.reason || null,
      immersiveVr: support?.sessions?.immersiveVr ?? null,
      immersiveAr: support?.sessions?.immersiveAr ?? null,
    },
    pageErrors: [...pageErrors],
  };
  report.readiness = createXRVisualAgentReadinessSummary({
    visual: summary,
    expectedStatus: selectedCase === 'baseline' ? 'pass' : 'warning',
    expectedIssueIds: EXPECTED_CASE_ISSUES[selectedCase] || [],
    svg: report.svg,
    outputs: report.outputs,
    pageErrors: report.pageErrors,
    requireBrowserArtifacts: true,
  });
  return report;
}

function renderAgentReport(selectedCase, summary) {
  let report = createAgentReport(selectedCase, summary);
  document.body.dataset.visualAuditStatus = report.status;
  document.body.dataset.visualAuditCase = report.case;
  document.body.dataset.visualAuditFailures = String(report.failureCount);
  document.body.dataset.visualAuditWarnings = String(report.warningCount);
  window.__xrVisualAuditReport = report;
  agentReportOutput.textContent = JSON.stringify(report, null, 2);
  return report;
}

async function runAudit() {
  let selectedCase = caseSelect.value;
  let { scene, themeSnapshot } = createScene(selectedCase);
  let textureOptions = selectedCase === 'low-texture'
    ? { textureWidth: 256, textureHeight: 192, minPixelsPerMeter: 900 }
    : { preferTargetDensity: true };

  support = await getWebXRSupport(window);
  lastSummary = createXRVisualTestSummary(scene, {
    ...textureOptions,
    telemetry: createTelemetry(selectedCase),
    expectInteraction: true,
    expectedFrameVisuals: scene.panels.length,
  });

  setRows([
    ['Case', selectedCase],
    ['Secure context', String(window.isSecureContext)],
    ['navigator.xr', String(Boolean(window.navigator?.xr))],
    ['IWER', emulator.installed ? `installed${emulator.devui ? ' + DevUI' : ''}` : emulator.reason || emulator.runtime],
    ['Support', support?.status || support?.reason || 'unknown'],
    ['Theme scope', scene.themeScope],
    ['Theme tokens', String(Object.keys(themeSnapshot.tokens || {}).length)],
    ['Panels', String(lastSummary.panelCount)],
    ['Visual audit', lastSummary.status],
    ['Warnings', String(lastSummary.warnCount)],
    ['Failures', String(lastSummary.failCount)],
  ]);
  checksOutput.textContent = JSON.stringify(lastSummary.checks, null, 2);
  panelMapOutput.textContent = JSON.stringify(lastSummary.panelMap, null, 2);
  drawTopView(lastSummary);
  drawFrontView(lastSummary);
  let report = renderAgentReport(selectedCase, lastSummary);
  postDiagnostic('xr-visual-audit-ran', {
    case: selectedCase,
    support: support?.status || null,
    agentReport: {
      status: report.status,
      warningCount: report.warningCount,
      failureCount: report.failureCount,
      issueIds: report.issueIds,
      topPanelShapes: report.svg.topPanelShapes,
      frontPanelShapes: report.svg.frontPanelShapes,
      pageErrorCount: report.pageErrors.length,
    },
  });
}

async function installIwer() {
  emulateButton.disabled = true;
  emulateButton.textContent = 'Installing IWER...';
  postDiagnostic('xr-visual-audit-iwer-install-requested');
  try {
    let [{ XRDevice, metaQuest3 }, { DevUI }] = await Promise.all([
      import('iwer'),
      import('@iwer/devui'),
    ]);
    let adapter = createWebXREmulationAdapter({
      globalThis: window,
      preferNative: false,
      module: { XRDevice, metaQuest3 },
      profile: 'metaQuest3',
    });
    let result = await adapter.install();
    emulator = {
      installed: Boolean(result.installed),
      runtime: result.runtime || 'iwer',
      reason: result.reason || null,
      devui: false,
    };
    if (result.device) {
      new DevUI(result.device);
      emulator.devui = true;
    }
    postDiagnostic(result.ok ? 'xr-visual-audit-iwer-installed' : 'xr-visual-audit-iwer-install-failed', {
      reason: result.reason || null,
    });
  } catch (error) {
    pageErrors.push({
      type: 'iwer-install',
      message: error?.message || String(error),
    });
    emulator = {
      installed: false,
      runtime: 'iwer',
      reason: error?.message || String(error),
      devui: false,
    };
    postDiagnostic('xr-visual-audit-iwer-install-error', { reason: emulator.reason });
  } finally {
    emulateButton.disabled = false;
    emulateButton.textContent = emulator.installed ? 'IWER installed' : 'Install IWER';
    await runAudit();
  }
}

if ([...caseSelect.options].some((option) => option.value === initialCase)) {
  caseSelect.value = initialCase;
}
caseSelect.addEventListener('change', runAudit);
runButton.addEventListener('click', runAudit);
emulateButton.addEventListener('click', installIwer);

if (params.get('emulate') === '1') {
  installIwer();
} else {
  runAudit();
}
