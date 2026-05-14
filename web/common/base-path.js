const apiPrefixes = ['/api/', '/ws/'];

export function getAppBasePath() {
  const baseEl = document.querySelector('base[href]');
  if (!baseEl) return '';
  const baseUrl = new URL(baseEl.href, window.location.href);
  if (baseUrl.origin !== window.location.origin) return '';
  const path = baseUrl.pathname.replace(/\/$/, '');
  return path === '' || path === '/' ? '' : path;
}

export function withAppBasePath(value, protocol = window.location.protocol) {
  const basePath = getAppBasePath();
  if (!basePath || typeof value !== 'string') return value;

  if (apiPrefixes.some((prefix) => value.startsWith(prefix))) {
    return `${basePath}${value}`;
  }

  if (value.startsWith(`${window.location.origin}/`)) {
    const url = new URL(value);
    if (apiPrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
      url.pathname = `${basePath}${url.pathname}`;
      return url.toString();
    }
  }

  if ((protocol === 'ws:' || protocol === 'wss:') && /^wss?:\/\//.test(value)) {
    const url = new URL(value);
    if (url.host === window.location.host && apiPrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
      url.pathname = `${basePath}${url.pathname}`;
      return url.toString();
    }
  }

  return value;
}

const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  if (typeof input === 'string') {
    return nativeFetch(withAppBasePath(input), init);
  }
  if (input instanceof URL) {
    return nativeFetch(new URL(withAppBasePath(input.toString())), init);
  }
  return nativeFetch(input, init);
};

const NativeWebSocket = window.WebSocket;
window.WebSocket = class PortalWebSocket extends NativeWebSocket {
  constructor(url, protocols) {
    super(withAppBasePath(String(url), new URL(String(url), window.location.href).protocol), protocols);
  }
};
