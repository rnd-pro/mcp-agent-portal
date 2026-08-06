export function readJsonCache(key) {
  if (typeof localStorage === 'undefined') return undefined
  let raw = localStorage.getItem(key)
  if (raw == null) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export function writeJsonCache(key, value) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

export function readStringCache(key) {
  if (typeof localStorage === 'undefined') return undefined
  return localStorage.getItem(key) ?? undefined
}

export function writeStringCache(key, value) {
  if (typeof localStorage === 'undefined') return
  if (value == null) localStorage.removeItem(key)
  else localStorage.setItem(key, String(value))
}
