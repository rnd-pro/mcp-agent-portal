const apiPrefixes = ['/api/', '/ws/']
const patchFlag = Symbol.for('symbiote-ui.base-path.patch')

export function getAppBasePath() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return ''
  const baseEl = document.querySelector('base[href]')
  if (!baseEl) return ''
  const baseUrl = new URL(baseEl.href, window.location.href)
  if (baseUrl.origin !== window.location.origin) return ''
  const path = baseUrl.pathname.replace(/\/$/, '')
  return path === '' || path === '/' ? '' : path
}

export function withAppBasePath(value, protocol = globalThis.window?.location?.protocol ?? 'http:') {
  const basePath = getAppBasePath()
  if (!basePath || typeof value !== 'string') return value

  if (apiPrefixes.some((prefix) => value.startsWith(prefix))) {
    return `${basePath}${value}`
  }

  if (typeof window !== 'undefined' && value.startsWith(`${window.location.origin}/`)) {
    const url = new URL(value)
    if (apiPrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
      url.pathname = `${basePath}${url.pathname}`
      return url.toString()
    }
  }

  if (typeof window !== 'undefined' && (protocol === 'ws:' || protocol === 'wss:') && /^wss?:\/\//.test(value)) {
    const url = new URL(value)
    if (url.host === window.location.host && apiPrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
      url.pathname = `${basePath}${url.pathname}`
      return url.toString()
    }
  }

  return value
}

export function installAppBasePathPatch(target = globalThis.window) {
  if (!target || target[patchFlag]) return false
  if (typeof target.fetch !== 'function') return false
  target[patchFlag] = true

  const nativeFetch = target.fetch.bind(target)
  target.fetch = (input, init) => {
    if (typeof input === 'string') {
      return nativeFetch(withAppBasePath(input), init)
    }
    if (input instanceof URL) {
      return nativeFetch(new URL(withAppBasePath(input.toString())), init)
    }
    return nativeFetch(input, init)
  }

  if (typeof target.WebSocket === 'function') {
    const NativeWebSocket = target.WebSocket
    target.WebSocket = class PortalWebSocket extends NativeWebSocket {
      constructor(url, protocols) {
        super(withAppBasePath(String(url), new URL(String(url), target.location.href).protocol), protocols)
      }
    }
  }

  return true
}

if (typeof window !== 'undefined') {
  installAppBasePathPatch(window)
}
