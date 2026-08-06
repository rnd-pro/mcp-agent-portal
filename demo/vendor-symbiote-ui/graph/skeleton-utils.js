const basenameIndexes = new WeakMap()

export function dirOf(filePath) {
  if (!filePath) return './'
  const idx = filePath.lastIndexOf('/')
  return idx >= 0 ? filePath.slice(0, idx + 1) : './'
}

export function baseName(filePath) {
  if (!filePath) return '?'
  const idx = filePath.lastIndexOf('/')
  return idx >= 0 ? filePath.slice(idx + 1) : filePath
}

function buildBasenameIndex(knownFiles) {
  const cached = basenameIndexes.get(knownFiles)
  if (cached) return cached

  const index = new Map()
  for (const file of knownFiles) {
    const base = baseName(file)
    if (!index.has(base)) index.set(base, file)
    if (!base.endsWith('.js') && !index.has(base + '.js')) {
      index.set(base + '.js', file)
    }
  }
  basenameIndexes.set(knownFiles, index)
  return index
}

export function resolveImport(importPath, fromFile, knownFiles) {
  if (knownFiles.has(importPath)) return importPath
  if (knownFiles.has(importPath + '.js')) return importPath + '.js'

  if (importPath.startsWith('.')) {
    const dir = dirOf(fromFile)
    let resolved = dir + importPath.replace(/^\.\//, '')
    const parts = resolved.split('/')
    const normalized = []
    for (const part of parts) {
      if (part === '..') normalized.pop()
      else if (part !== '.') normalized.push(part)
    }
    resolved = normalized.join('/')

    if (knownFiles.has(resolved)) return resolved
    if (knownFiles.has(resolved + '.js')) return resolved + '.js'
    if (knownFiles.has(resolved + '/index.js')) return resolved + '/index.js'
  }

  const base = importPath.split('/').pop()
  const index = buildBasenameIndex(knownFiles)
  return index.get(base) || index.get(base.replace(/\.js$/, '')) || null
}

export function collectSkeletonFiles(skeleton = {}) {
  const files = new Set()
  const assetFiles = new Set()
  const classFiles = new Set()

  for (const data of Object.values(skeleton.n || {})) {
    if (data.f) {
      files.add(data.f)
      classFiles.add(data.f)
    }
  }
  for (const file of Object.keys(skeleton.X || {})) {
    files.add(file)
  }
  for (const [dir, names] of Object.entries(skeleton.f || {})) {
    for (const name of names) {
      files.add(dir === './' ? name : dir + name)
    }
  }
  for (const [dir, names] of Object.entries(skeleton.a || {})) {
    for (const name of names) {
      const fullPath = dir === './' ? name : dir + name
      files.add(fullPath)
      assetFiles.add(fullPath)
    }
  }

  return { files, assetFiles, classFiles }
}
