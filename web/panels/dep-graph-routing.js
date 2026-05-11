export function getGraphSearchString(locationObj = window.location) {
  return locationObj.search || (locationObj.hash.includes('?') ? locationObj.hash.split('?')[1] : '');
}

export function getGraphUrlParams(locationObj = window.location) {
  return new URLSearchParams(getGraphSearchString(locationObj));
}

export function parseGraphHash(hash = window.location.hash) {
  const [hashBase, queryStr] = hash.replace('#', '').split('?');
  const hashParams = hashBase.split('/');
  if (hashParams[0] === 'graph') hashParams.shift();
  return {
    path: hashParams.join('/'),
    params: new URLSearchParams(queryStr || ''),
  };
}

export function updateHashParam(key, value, locationObj = window.location, historyObj = history) {
  const [basePath, queryStr] = locationObj.hash.split('?');
  const params = new URLSearchParams(queryStr || '');
  if (value === null || value === undefined) {
    params.delete(key);
  } else {
    params.set(key, value);
  }
  const newQuery = params.toString();
  const newHash = newQuery ? `${basePath}?${newQuery}` : basePath;
  historyObj.replaceState(null, '', newHash);
}
