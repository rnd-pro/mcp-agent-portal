#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseHTML } from 'linkedom';

import { normalizeWorkflowBoardPayload } from '../../web/services/workflow-board.js';
import {
  buildWorkflowBoardProjectionFromContext,
  createWorkflowBoardRenderContext,
} from '../../web/panels/WorkflowBoard/workflow-board-render-context.js';
import { decideWorkflowBoardRealtimeRefresh } from '../../web/panels/WorkflowBoard/workflow-board-realtime.js';
import {
  cardFooterChips,
  cardMetaChips,
  deriveCardTicker,
} from '../../web/panels/WorkflowBoard/workflow-card-presentation.js';
import {
  agentName,
  isCardActive,
  latestRun,
} from '../../web/panels/WorkflowBoard/workflow-card-telemetry.js';

const DEFAULT_COLUMNS = [
  ['ideas', 'Ideas / Inbox'],
  ['backlog', 'Backlog'],
  ['ready', 'Tasks'],
  ['in-progress', 'In Progress'],
  ['quality-audit', 'Quality Audit'],
  ['commit-publish', 'Commit / Publish'],
  ['needs-decision', 'Needs Decision'],
  ['done', 'Done'],
];
const CARD_FACE_CHIP_BUDGET = 4;

class TestCSSStyleSheet {
  replaceSync(text) {
    this.cssText = text;
  }
}

function parseArgs(argv) {
  let options = {
    cards: 1000,
    runsPerCard: 3,
    eventsPerCard: 4,
    bursts: 50,
    burstWidth: 12,
    reportPath: path.join('tmp', 'workflow-board-performance-harness', 'report.json'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    let arg = argv[index];
    if (arg === '--cards') options.cards = Math.max(1, Number(argv[++index]) || options.cards);
    else if (arg === '--runs-per-card') options.runsPerCard = Math.max(1, Number(argv[++index]) || options.runsPerCard);
    else if (arg === '--events-per-card') options.eventsPerCard = Math.max(0, Number(argv[++index]) || options.eventsPerCard);
    else if (arg === '--bursts') options.bursts = Math.max(1, Number(argv[++index]) || options.bursts);
    else if (arg === '--burst-width') options.burstWidth = Math.max(1, Number(argv[++index]) || options.burstWidth);
    else if (arg === '--report') options.reportPath = argv[++index] || options.reportPath;
  }
  return options;
}

function installDom() {
  let { window } = parseHTML('<!doctype html><html><body></body></html>');
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    customElements: window.customElements,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    CSSStyleSheet: TestCSSStyleSheet,
    requestAnimationFrame(callback) {
      callback(performance.now());
      return 1;
    },
    cancelAnimationFrame() {},
  });
  window.document.adoptedStyleSheets = [];
  Object.defineProperty(window.HTMLElement.prototype, 'adoptedStyleSheets', {
    configurable: true,
    get() {
      return this.__symbioteSsrSheets || [];
    },
    set(value) {
      this.__symbioteSsrSheets = value;
    },
  });
  window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    let height = this.classList?.contains('sn-kanban-column-header') ? 36 : 24;
    return { height, width: 240, top: 0, left: 0, right: 240, bottom: height };
  };
}

async function nextTick() {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

function iso(offsetSeconds) {
  return new Date(Date.UTC(2026, 6, 3, 12, 0, 0) + offsetSeconds * 1000).toISOString();
}

function cardRuns(cardIndex, runsPerCard, burst = 0) {
  return Array.from({ length: runsPerCard }, (_, runIndex) => {
    let latest = runIndex === runsPerCard - 1;
    let active = latest && (cardIndex + burst) % 7 === 0;
    return {
      id: `run-${cardIndex}-${runIndex}`,
      boardId: 'agent-workflow-default',
      cardId: `card-${String(cardIndex).padStart(4, '0')}`,
      status: active ? 'running' : 'completed',
      leaseOwner: `agent-${cardIndex % 12}`,
      startedAt: iso(cardIndex * 10 + runIndex),
      updatedAt: iso(cardIndex * 10 + runIndex + burst),
      completedAt: active ? '' : iso(cardIndex * 10 + runIndex + 3),
      tokens: 400 + cardIndex + runIndex,
      chatId: `chat-${cardIndex % 40}`,
    };
  });
}

function cardEvents(cardIndex, eventsPerCard, burst = 0) {
  return Array.from({ length: eventsPerCard }, (_, eventIndex) => ({
    id: `event-${cardIndex}-${eventIndex}`,
    eventType: eventIndex % 2 === 0 ? 'transition' : 'note',
    status: eventIndex % 3 === 0 ? 'accepted' : 'completed',
    actor: `agent-${(cardIndex + eventIndex) % 12}`,
    timestamp: iso(cardIndex * 12 + eventIndex + burst),
    fromColumnId: DEFAULT_COLUMNS[(cardIndex + eventIndex) % DEFAULT_COLUMNS.length][0],
    toColumnId: DEFAULT_COLUMNS[(cardIndex + eventIndex + 1) % DEFAULT_COLUMNS.length][0],
    note: `Synthetic event ${eventIndex} for card ${cardIndex}`,
  }));
}

function buildFixture(options) {
  let columns = DEFAULT_COLUMNS.map(([id, title], order) => ({
    id,
    title,
    order,
    automation: { action: id === 'needs-decision' ? 'await_human' : 'on_enter' },
  }));
  let cards = Array.from({ length: options.cards }, (_, index) => {
    let id = `card-${String(index).padStart(4, '0')}`;
    let columnId = columns[index % columns.length].id;
    let dependsOn = index > 0 && index % 3 === 0
      ? [{ cardId: `card-${String(index - 1).padStart(4, '0')}`, releaseWhen: 'done', onUpstreamFailure: 'block_and_escalate' }]
      : [];
    let runs = cardRuns(index, options.runsPerCard);
    return {
      id,
      boardId: 'agent-workflow-default',
      projectId: 'agent-portal',
      columnId,
      title: `Workflow card ${index}`,
      body: `Long inspector-only body for synthetic card ${index}.\n\nAcceptance criteria and diagnostic notes stay off the card face.`,
      kind: index % 5 === 0 ? 'audit' : 'implementation',
      priority: index % 17 === 0 ? 'high' : 'normal',
      status: runs.at(-1)?.status || 'completed',
      lifecycle: runs.at(-1)?.status === 'running' ? 'running' : 'idle',
      resourceGroup: ['integrity', 'resilience', 'model', 'governance'][index % 4],
      owner: `agent-${index % 12}`,
      assignedAgent: `agent-${index % 12}`,
      entityRefs: { goalId: `goal-${index % 25}`, chatId: `chat-${index % 40}`, taskIds: [`task-${index}`] },
      flags: index % 11 === 0 ? ['needs_audit'] : [],
      dependsOn,
      runs,
      events: cardEvents(index, options.eventsPerCard),
      version: 1,
      updatedAt: iso(index),
      createdAt: iso(0),
      metadata: index % 37 === 0 ? {
        escalation: {
          kind: 'needs_human',
          detail: 'Choose a deployment region for this branch.',
          lastEscalation: {
            detail: 'Choose a deployment region for this branch.',
            options: [{ id: 'eastus', label: 'East US' }, { id: 'westeurope', label: 'West Europe' }],
          },
        },
      } : {},
    };
  });
  return {
    id: 'agent-workflow-default',
    boardId: 'agent-workflow-default',
    title: 'Agent Workflow Default',
    mode: 'autonomous',
    version: 1,
    columns,
    transitions: columns.slice(0, -1).map((column, index) => ({
      from: column.id,
      to: columns[index + 1].id,
      gate: index > 2 ? 'audit' : 'operator',
    })),
    cards,
    events: [{ id: 'board-event-1', eventType: 'board_loaded', timestamp: iso(0), actor: 'harness' }],
  };
}

function updateFixtureForBurst(fixture, burst, options) {
  let nextCards = fixture.cards.map(card => ({ ...card }));
  for (let offset = 0; offset < options.burstWidth; offset += 1) {
    let index = (burst * options.burstWidth + offset) % nextCards.length;
    let card = nextCards[index];
    let runs = cardRuns(index, options.runsPerCard, burst + 1);
    nextCards[index] = {
      ...card,
      status: runs.at(-1)?.status || card.status,
      lifecycle: runs.at(-1)?.status === 'running' ? 'running' : 'idle',
      runs,
      events: cardEvents(index, options.eventsPerCard, burst + 1),
      version: Number(card.version || 0) + 1,
      updatedAt: iso(index + burst + 1),
    };
  }
  return {
    ...fixture,
    version: fixture.version + 1,
    cards: nextCards,
    events: [{ id: `board-event-${burst + 2}`, eventType: 'board_burst', timestamp: iso(burst + 1), actor: 'harness' }],
  };
}

function toKanbanModel(board, context) {
  let downstream = context.downstreamDependencyCounts;
  return {
    id: board.boardId || board.id,
    title: board.title,
    mode: board.mode,
    columns: context.columns.map(column => ({
      id: column.id,
      title: column.title,
      description: column.description || column.gate || '',
      automation: column.automation,
      boardMode: board.mode,
      cards: column.cards.map(card => toKanbanCard(card, downstream)),
    })),
  };
}

function toKanbanCard(card, downstream) {
  let agent = agentName(card, latestRun(card));
  let footerCandidates = cardFooterChips(card, {
    blockedBy: Array.isArray(card.raw?.dependsOn ?? card.dependsOn) ? (card.raw?.dependsOn ?? card.dependsOn).length : 0,
    unlocks: downstream.get(card.id) ?? 0,
    agentChip: agent ? { label: agent, icon: 'smart_toy', kind: 'agent', accent: '', title: agent } : null,
  });
  let footer = footerCandidates.slice(0, CARD_FACE_CHIP_BUDGET);
  if (footerCandidates.length > footer.length) {
    footer.push({ label: `+${footerCandidates.length - footer.length}`, kind: 'overflow' });
  }
  return {
    id: card.id,
    columnId: card.columnId,
    title: card.title,
    summary: card.summary || '',
    busy: isCardActive(card),
    ticker: deriveCardTicker(card),
    meta: cardMetaChips(card),
    footer,
    actions: [],
    draggable: true,
    raw: card,
  };
}

function compactStatusProjection(board, context) {
  let columns = context.columns.map(column => ({
    id: column.id,
    title: column.title,
    automation: column.automation,
    count: column.cards.length,
    activeCount: column.cards.filter(isCardActive).length,
    blockedCount: column.cards.filter(card => (card.blockers || []).length > 0).length,
    recoveryCount: column.cards.filter(card => (card.flags || []).includes('needs_resume')).length,
  }));
  return {
    schema: 'workflow-board-compact-projection/v1',
    view: 'status',
    board: { id: board.boardId || board.id, title: board.title, mode: board.mode, version: board.version },
    boardId: board.boardId || board.id,
    columns,
    counts: Object.fromEntries(columns.map(column => [column.id, column.count])),
    cards: [],
    activeCards: [],
    blockedCards: [],
    events: board.events.slice(-1),
    runtime: { runningTaskCount: context.visibleCards.filter(isCardActive).length },
    version: board.version,
  };
}

function bytes(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function countNodes(root) {
  return root.querySelectorAll('*').length;
}

function cardNodeMap(root) {
  return new Map([...root.querySelectorAll('[data-sn-board-card-id]')]
    .map(node => [node.getAttribute('data-sn-board-card-id'), node]));
}

function summarize(values) {
  let sorted = values.slice().sort((a, b) => a - b);
  let pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  let sum = sorted.reduce((acc, value) => acc + value, 0);
  return {
    count: sorted.length,
    totalMs: Number(sum.toFixed(3)),
    meanMs: Number((sum / Math.max(1, sorted.length)).toFixed(3)),
    p50Ms: Number(pick(0.5).toFixed(3)),
    p95Ms: Number(pick(0.95).toFixed(3)),
    maxMs: Number((sorted.at(-1) ?? 0).toFixed(3)),
  };
}

function timed(fn) {
  let started = performance.now();
  let value = fn();
  return { value, ms: performance.now() - started };
}

async function run() {
  let options = parseArgs(process.argv.slice(2));
  installDom();
  await import('symbiote-ui/board');

  let scope = { scope: 'project', projectId: 'agent-portal' };
  let fixture = buildFixture(options);
  let normalized = timed(() => normalizeWorkflowBoardPayload(fixture, scope));
  let contextResult = timed(() => createWorkflowBoardRenderContext(normalized.value, scope));
  let projection = buildWorkflowBoardProjectionFromContext(contextResult.value);
  let compactStatus = compactStatusProjection(normalized.value, contextResult.value);
  let kanbanModel = toKanbanModel(normalized.value, contextResult.value);

  let optimizedBoard = document.createElement('sn-kanban-board');
  document.body.append(optimizedBoard);
  await nextTick();
  let initialRender = timed(() => optimizedBoard.setBoard(kanbanModel));
  await nextTick();
  let initialNodeCount = countNodes(optimizedBoard);

  let optimizedRefreshMs = [];
  let baselineRefreshMs = [];
  let realtimeDecisionMs = [];
  let renderContextMs = [contextResult.ms];
  let normalizeMs = [normalized.ms];
  let nodeDeltas = [];
  let cardElementReplacements = 0;
  let previousCardNodes = cardNodeMap(optimizedBoard);
  let previousNodeCount = countNodes(optimizedBoard);

  let baselineHost = document.createElement('section');
  document.body.append(baselineHost);

  for (let burst = 0; burst < options.bursts; burst += 1) {
    fixture = updateFixtureForBurst(fixture, burst, options);
    let normalizedBurst = timed(() => normalizeWorkflowBoardPayload(fixture, scope));
    normalizeMs.push(normalizedBurst.ms);
    let contextBurst = timed(() => createWorkflowBoardRenderContext(normalizedBurst.value, scope));
    renderContextMs.push(contextBurst.ms);
    let model = toKanbanModel(normalizedBurst.value, contextBurst.value);

    let taskPatch = Object.fromEntries(Array.from({ length: options.burstWidth }, (_, offset) => {
      let cardIndex = (burst * options.burstWidth + offset) % options.cards;
      return [`task-${cardIndex}`, {
        id: `task-${cardIndex}`,
        kind: 'workflow-runtime-task',
        projectId: 'agent-portal',
        workflowBoardId: 'agent-workflow-default',
        workflowCardId: `card-${String(cardIndex).padStart(4, '0')}`,
        status: 'running',
      }];
    }));
    realtimeDecisionMs.push(timed(() => decideWorkflowBoardRealtimeRefresh({
      key: 'tasks',
      value: taskPatch,
      board: normalizedBurst.value,
      scope,
    })).ms);

    let baseline = timed(() => {
      let fresh = document.createElement('sn-kanban-board');
      baselineHost.replaceChildren(fresh);
      fresh.setBoard(model);
    });
    baselineRefreshMs.push(baseline.ms);

    let optimized = timed(() => optimizedBoard.setBoard(model));
    optimizedRefreshMs.push(optimized.ms);
    await nextTick();

    let nextCardNodes = cardNodeMap(optimizedBoard);
    for (let [id, node] of previousCardNodes) {
      if (nextCardNodes.has(id) && nextCardNodes.get(id) !== node) cardElementReplacements += 1;
    }
    let nextNodeCount = countNodes(optimizedBoard);
    nodeDeltas.push(nextNodeCount - previousNodeCount);
    previousNodeCount = nextNodeCount;
    previousCardNodes = nextCardNodes;
  }

  let report = {
    version: 'workflow-board-performance-harness-v1',
    scenario: {
      cards: options.cards,
      runsPerCard: options.runsPerCard,
      eventsPerCard: options.eventsPerCard,
      bursts: options.bursts,
      burstWidth: options.burstWidth,
      dependencyCards: fixture.cards.filter(card => (card.dependsOn || []).length > 0).length,
    },
    payload: {
      fullBoardBytes: bytes(normalized.value),
      graphProjectionBytes: bytes(projection),
      compactStatusBytes: bytes(compactStatus),
      compactStatusRatio: Number((bytes(compactStatus) / Math.max(1, bytes(normalized.value))).toFixed(4)),
    },
    timing: {
      normalize: summarize(normalizeMs),
      renderContext: summarize(renderContextMs),
      initialRenderMs: Number(initialRender.ms.toFixed(3)),
      baselineFreshDomRefresh: summarize(baselineRefreshMs),
      optimizedReconciledRefresh: summarize(optimizedRefreshMs),
      realtimeDecision: summarize(realtimeDecisionMs),
    },
    dom: {
      initialNodeCount,
      finalNodeCount: previousNodeCount,
      cardElementReplacements,
      nodeDelta: {
        min: Math.min(...nodeDeltas),
        max: Math.max(...nodeDeltas),
        total: nodeDeltas.reduce((acc, value) => acc + value, 0),
      },
    },
  };

  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
  fs.writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    report: options.reportPath,
    scenario: report.scenario,
    payload: report.payload,
    timing: report.timing,
    dom: report.dom,
  }, null, 2));
}

run().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
