import { cleanString, finiteNonNegativeNumber, isObject } from './render-utils.js';

function metadataKeyList(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((key) => cleanString(key, ''))
    .filter(Boolean))];
}

export function createStageProgressTracker(options = {}) {
  options = isObject(options) ? options : {};
  let metadataKeys = metadataKeyList(options.metadataKeys);
  let configuredTimelineLimit = Number(options.timelineLimit ?? 160);
  let timelineLimit = Number.isFinite(configuredTimelineLimit) && configuredTimelineLimit > 0
    ? Math.max(1, Math.round(configuredTimelineLimit))
    : 160;

  function compactStageMetadata(patch = {}) {
    let metadata = {};
    for (let key of metadataKeys) {
      if (patch[key] !== undefined && patch[key] !== null && patch[key] !== '') metadata[key] = patch[key];
    }
    return metadata;
  }

  function recordStageEvidence(job, patch = {}) {
    let at = Math.max(0, Number(job?.updatedAt || 0));
    let stage = cleanString(job?.stage, 'running');
    let metadata = compactStageMetadata(patch);
    job.stageEvidence = isObject(job.stageEvidence) ? job.stageEvidence : {};
    job.stageOrder = Array.isArray(job.stageOrder) ? job.stageOrder : [];
    job.progressTimeline = Array.isArray(job.progressTimeline) ? job.progressTimeline : [];
    let record = job.stageEvidence[stage];
    if (!record) {
      record = {
        stage,
        enteredAt: at,
        lastAt: at,
        eventCount: 0,
        enteredProgress: job.progress ?? 0,
        lastProgress: job.progress ?? 0,
        cacheHits: 0,
        cacheMisses: 0,
      };
      job.stageEvidence[stage] = record;
      job.stageOrder.push(stage);
    }
    record.lastAt = Math.max(record.lastAt || at, at);
    record.eventCount += 1;
    record.lastProgress = job.progress ?? record.lastProgress ?? 0;
    Object.assign(record, metadata);
    if (typeof metadata.cacheHit === 'boolean') {
      if (metadata.cacheHit) record.cacheHits += 1;
      else record.cacheMisses += 1;
    }

    let lastTransition = job.progressTimeline[job.progressTimeline.length - 1];
    if (!lastTransition || lastTransition.stage !== stage) {
      job.progressTimeline.push({
        stage,
        at,
        lastAt: at,
        progress: job.progress ?? 0,
        eventCount: 1,
        ...metadata,
      });
    } else {
      lastTransition.lastAt = Math.max(lastTransition.lastAt || at, at);
      lastTransition.progress = job.progress ?? lastTransition.progress ?? 0;
      lastTransition.eventCount = Number(lastTransition.eventCount || 0) + 1;
      Object.assign(lastTransition, metadata);
    }
    if (job.progressTimeline.length > timelineLimit) {
      job.progressTimeline.splice(0, job.progressTimeline.length - timelineLimit);
    }
  }

  function normalizeStageEvidenceEntry(entry = {}, nextEntry = null, job = {}) {
    let enteredAt = Math.max(0, Number(entry.enteredAt || 0));
    let lastAt = Math.max(enteredAt, Number(entry.lastAt || enteredAt));
    let endAt = nextEntry
      ? Math.max(enteredAt, Number(nextEntry.enteredAt || enteredAt))
      : Math.max(enteredAt, lastAt, Number(job.finishedAt || 0));
    let normalized = {
      stage: cleanString(entry.stage, 'running'),
      enteredAt,
      lastAt,
      durationMs: Math.max(0, endAt - enteredAt),
      eventCount: Math.max(0, Math.round(Number(entry.eventCount || 0))),
      enteredProgress: finiteNonNegativeNumber(entry.enteredProgress, 0) ?? 0,
      lastProgress: finiteNonNegativeNumber(entry.lastProgress, 0) ?? 0,
    };
    for (let key of metadataKeys) {
      if (entry[key] !== undefined && entry[key] !== null && entry[key] !== '') normalized[key] = entry[key];
    }
    if (Number(entry.cacheHits || 0) > 0) normalized.cacheHits = Math.round(Number(entry.cacheHits));
    if (Number(entry.cacheMisses || 0) > 0) normalized.cacheMisses = Math.round(Number(entry.cacheMisses));
    return normalized;
  }

  function buildStageDurations(job = {}) {
    let stageEvidence = isObject(job.stageEvidence) ? job.stageEvidence : {};
    let order = Array.isArray(job.stageOrder) ? job.stageOrder : Object.keys(stageEvidence);
    let entries = order
      .map((stage) => stageEvidence[stage])
      .filter(Boolean)
      .sort((a, b) => Number(a.enteredAt || 0) - Number(b.enteredAt || 0));
    return entries.map((entry, index) => normalizeStageEvidenceEntry(entry, entries[index + 1], job));
  }

  function buildProgressTimeline(job = {}) {
    let timeline = Array.isArray(job.progressTimeline) ? job.progressTimeline : [];
    return timeline
      .map((entry) => {
        let normalized = {
          stage: cleanString(entry.stage, 'running'),
          at: Math.max(0, Number(entry.at || 0)),
          lastAt: Math.max(0, Number(entry.lastAt || entry.at || 0)),
          progress: finiteNonNegativeNumber(entry.progress, 0) ?? 0,
          eventCount: Math.max(0, Math.round(Number(entry.eventCount || 0))),
        };
        for (let key of metadataKeys) {
          if (entry[key] !== undefined && entry[key] !== null && entry[key] !== '') normalized[key] = entry[key];
        }
        return normalized;
      })
      .filter((entry) => entry.stage && entry.at > 0);
  }

  return {
    compactStageMetadata,
    recordStageEvidence,
    buildStageDurations,
    buildProgressTimeline,
  };
}
