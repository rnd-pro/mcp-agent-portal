function readCount(value) {
  let count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function readSource(devPlane) {
  let source = devPlane?.root?.source;
  return typeof source === 'string' && source ? source : 'unknown';
}

function readIssueCount(devPlane) {
  return Array.isArray(devPlane?.issues) ? devPlane.issues.length : 0;
}

export function createDevPlaneRuntimeSummary(devPlane, t) {
  let label = t('text.devPlane');

  if (!devPlane || typeof devPlane !== 'object') {
    return {
      label,
      value: t('text.devPlaneUnavailable'),
      note: t('text.devPlaneUnavailableNote'),
      variant: 'unknown',
    };
  }

  if (devPlane.ok === true && devPlane.state === 'ready') {
    return {
      label,
      value: t('text.devPlaneReady'),
      note: t('text.devPlaneReadyNote', {
        browserImports: readCount(devPlane.summary?.browserImportCount),
        count: readCount(devPlane.summary?.packageCount),
        source: readSource(devPlane),
      }),
      variant: 'ready',
    };
  }

  if (devPlane.state === 'missing' && devPlane.configured !== true) {
    return {
      label,
      value: t('text.devPlaneMissing'),
      note: t('text.devPlaneMissingNote'),
      variant: 'missing',
    };
  }

  return {
    label,
    value: t(devPlane.state === 'error' ? 'text.devPlaneError' : 'text.devPlaneUnavailable'),
    note: t('text.devPlaneIssueNote', {
      count: readIssueCount(devPlane),
      source: readSource(devPlane),
    }),
    variant: devPlane.state === 'error' ? 'error' : 'unknown',
  };
}
