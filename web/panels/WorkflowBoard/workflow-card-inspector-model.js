export const INSPECTOR_HISTORY_LIMIT = 8;
export const INSPECTOR_RUN_LIMIT = 8;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function timestamp(value) {
  return Date.parse(value || '') || 0;
}

function runRecency(run = {}) {
  return timestamp(run.updatedAt || run.completedAt || run.startedAt);
}

function eventRecency(event = {}) {
  return timestamp(event.timestamp || event.createdAt || event.updatedAt);
}

function replaceLowestByScore(rows, item, score, limit) {
  if (rows.length < limit) {
    rows.push({ item, score });
    return;
  }
  let lowestIndex = 0;
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].score < rows[lowestIndex].score) lowestIndex = index;
  }
  if (score > rows[lowestIndex].score) rows[lowestIndex] = { item, score };
}

function selectRecent(items, limit, scoreFn) {
  let rows = [];
  for (let item of asArray(items)) {
    replaceLowestByScore(rows, item, scoreFn(item), limit);
  }
  return rows.map(row => row.item);
}

function sortRunsForDisplay(runs) {
  return runs.slice().sort((a, b) => (
    (timestamp(a.startedAt) - timestamp(b.startedAt))
    || normalizeText(a.id).localeCompare(normalizeText(b.id))
  ));
}

function sortEventsForDisplay(events) {
  return events.slice().sort((a, b) => (
    (eventRecency(b) - eventRecency(a))
    || normalizeText(a.id).localeCompare(normalizeText(b.id))
  ));
}

export function createInspectorRunsModel(card = {}, options = {}) {
  let limit = Number.isFinite(Number(options.limit)) ? Math.max(1, Math.floor(Number(options.limit))) : INSPECTOR_RUN_LIMIT;
  let selected = selectRecent(asArray(card.runs), limit, runRecency);
  let runs = sortRunsForDisplay(selected);
  return {
    totalCount: asArray(card.runs).length,
    runs,
    signature: JSON.stringify(runs.map(run => [
      normalizeText(run.id),
      normalizeText(run.leaseOwner),
      normalizeText(run.status),
      normalizeText(run.startedAt),
      normalizeText(run.updatedAt),
      normalizeText(run.completedAt),
      run.tokens ?? null,
      normalizeText(run.chatId),
    ])),
  };
}

export function createInspectorHistoryModel(card = {}, options = {}) {
  let limit = Number.isFinite(Number(options.limit))
    ? Math.max(1, Math.floor(Number(options.limit)))
    : INSPECTOR_HISTORY_LIMIT;
  let selected = selectRecent(asArray(card.events), limit, eventRecency);
  let events = sortEventsForDisplay(selected);
  return {
    totalCount: asArray(card.events).length,
    events,
    signature: JSON.stringify(events.map(event => [
      normalizeText(event.id),
      normalizeText(event.label),
      normalizeText(event.eventType),
      normalizeText(event.status),
      normalizeText(event.actor),
      normalizeText(event.timestamp || event.createdAt || event.updatedAt),
      normalizeText(event.note),
      normalizeText(event.fromColumnId),
      normalizeText(event.toColumnId),
    ])),
  };
}
