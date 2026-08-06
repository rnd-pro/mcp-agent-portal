let installedClocks = [];

export function installRenderClock(clock) {
  if (!clock || typeof clock.now !== 'function') {
    throw new TypeError('Render clock must provide a now() function');
  }
  let entry = { clock };
  let disposed = false;
  installedClocks.push(entry);
  return () => {
    if (disposed) return;
    disposed = true;
    let index = installedClocks.indexOf(entry);
    if (index >= 0) installedClocks.splice(index, 1);
  };
}

export function renderNow() {
  let entry = installedClocks.at(-1);
  if (!entry) return globalThis.performance?.now?.() ?? Date.now();
  let value = entry.clock.now();
  if (!Number.isFinite(value)) {
    throw new RangeError('Render clock now() must return a finite number');
  }
  return value;
}
