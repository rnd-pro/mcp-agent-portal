import { isGraphColorReference, normalizeGraphColorReference } from './theme-contract.js'

export const EMPTY_PROJECT_GRAPH_METADATA = Object.freeze({
  version: 1,
  clusters: [],
  nodeDescriptions: {},
  stories: [],
  layoutPins: {},
  hiddenNodes: [],
  focusPresets: [],
})

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'cluster'
}

function normalizePatterns(cluster) {
  let values = [
    ...(Array.isArray(cluster.paths) ? cluster.paths : []),
    ...(Array.isArray(cluster.patterns) ? cluster.patterns : []),
    ...(Array.isArray(cluster.nodes) ? cluster.nodes : []),
    ...(Array.isArray(cluster.path) ? cluster.path : []),
    ...(Array.isArray(cluster.pattern) ? cluster.pattern : []),
    ...(Array.isArray(cluster.node) ? cluster.node : []),
    ...(typeof cluster.path === 'string' ? [cluster.path] : []),
    ...(typeof cluster.pattern === 'string' ? [cluster.pattern] : []),
    ...(typeof cluster.node === 'string' ? [cluster.node] : []),
    ...(typeof cluster.match === 'string' ? [cluster.match] : []),
  ]
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : []
}

function normalizeStoryBeats(story) {
  let beats = Array.isArray(story.beats) ? story.beats : []
  return beats
    .filter((beat) => beat && typeof beat === 'object')
    .map((beat, index) => {
      let id = slugify(beat.id || beat.label || beat.title || `beat-${index + 1}`)
      let label = String(beat.label || beat.title || id).trim()
      return {
        id,
        label,
        narrative: String(beat.narrative || beat.description || '').trim(),
        nodes: normalizeStringArray(beat.nodes),
        edges: normalizeStringArray(beat.edges),
        clusterId: String(beat.clusterId || beat.cluster || '').trim(),
        focusPath: String(beat.focusPath || beat.path || '').trim(),
      }
    })
}

function normalizeStories(input) {
  let stories = Array.isArray(input) ? input : []
  return stories
    .filter((story) => story && typeof story === 'object')
    .map((story, index) => {
      let id = slugify(story.id || story.label || story.title || `story-${index + 1}`)
      let label = String(story.label || story.title || id).trim()
      return {
        id,
        label,
        description: String(story.description || '').trim(),
        beats: normalizeStoryBeats(story),
      }
    })
    .filter((story) => story.beats.length > 0)
}

function assertStringArray(value, pathName) {
  if (value === undefined) return
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`Invalid project graph metadata: ${pathName} must be an array of non-empty strings`)
  }
}

function validateStoriesInput(stories) {
  if (stories === undefined) return
  if (!Array.isArray(stories)) {
    throw new Error('Invalid project graph metadata: "stories" must be an array')
  }

  for (let storyIndex = 0; storyIndex < stories.length; storyIndex++) {
    let story = stories[storyIndex]
    if (!story || typeof story !== 'object' || Array.isArray(story)) {
      throw new Error(`Invalid project graph metadata: stories[${storyIndex}] must be an object`)
    }
    for (let key of ['id', 'label', 'title', 'description']) {
      if (story[key] !== undefined && typeof story[key] !== 'string') {
        throw new Error(`Invalid project graph metadata: stories[${storyIndex}].${key} must be a string`)
      }
    }
    if (!Array.isArray(story.beats) || story.beats.length === 0) {
      throw new Error(`Invalid project graph metadata: stories[${storyIndex}].beats must be a non-empty array`)
    }
    for (let beatIndex = 0; beatIndex < story.beats.length; beatIndex++) {
      let beat = story.beats[beatIndex]
      if (!beat || typeof beat !== 'object' || Array.isArray(beat)) {
        throw new Error(`Invalid project graph metadata: stories[${storyIndex}].beats[${beatIndex}] must be an object`)
      }
      for (let key of ['id', 'label', 'title', 'narrative', 'description', 'clusterId', 'cluster', 'focusPath', 'path']) {
        if (beat[key] !== undefined && typeof beat[key] !== 'string') {
          throw new Error(`Invalid project graph metadata: stories[${storyIndex}].beats[${beatIndex}].${key} must be a string`)
        }
      }
      assertStringArray(beat.nodes, `stories[${storyIndex}].beats[${beatIndex}].nodes`)
      assertStringArray(beat.edges, `stories[${storyIndex}].beats[${beatIndex}].edges`)
    }
  }
}

export function normalizeProjectGraphMetadata(input = {}) {
  let source = input && typeof input === 'object' ? input : {}
  let clusters = Array.isArray(source.clusters) ? source.clusters : []
  let normalizedClusters = clusters
    .filter((cluster) => cluster && typeof cluster === 'object')
    .map((cluster, index) => {
      let id = slugify(cluster.id || cluster.label || cluster.name || `cluster-${index + 1}`)
      let label = String(cluster.label || cluster.name || id).trim()
      return {
        id,
        label,
        color: normalizeGraphColorReference(cluster.color, index),
        description: String(cluster.description || '').trim(),
        paths: normalizePatterns(cluster),
      }
    })
    .filter((cluster) => cluster.paths.length > 0)

  return {
    version: Number(source.version) || 1,
    clusters: normalizedClusters,
    nodeDescriptions: source.nodeDescriptions && typeof source.nodeDescriptions === 'object' ? source.nodeDescriptions : {},
    stories: normalizeStories(source.stories),
    layoutPins: source.layoutPins && typeof source.layoutPins === 'object' ? source.layoutPins : {},
    hiddenNodes: Array.isArray(source.hiddenNodes) ? source.hiddenNodes : [],
    focusPresets: Array.isArray(source.focusPresets) ? source.focusPresets : [],
  }
}

export function validateProjectGraphMetadata(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid project graph metadata: expected a JSON object')
  }

  if (input.version !== undefined && (!Number.isFinite(Number(input.version)) || Number(input.version) < 1)) {
    throw new Error('Invalid project graph metadata: "version" must be a positive number')
  }

  if (input.clusters !== undefined && !Array.isArray(input.clusters)) {
    throw new Error('Invalid project graph metadata: "clusters" must be an array')
  }

  for (let index = 0; index < (input.clusters || []).length; index++) {
    let cluster = input.clusters[index]
    if (!cluster || typeof cluster !== 'object' || Array.isArray(cluster)) {
      throw new Error(`Invalid project graph metadata: clusters[${index}] must be an object`)
    }
    let paths = normalizePatterns(cluster)
    if (paths.length === 0) {
      throw new Error(`Invalid project graph metadata: clusters[${index}] must define at least one path`)
    }
    if (cluster.color !== undefined && !isGraphColorReference(cluster.color)) {
      throw new Error(`Invalid project graph metadata: clusters[${index}].color must be a hex color or symbiote-ui CSS token reference`)
    }
  }

  for (let key of ['nodeDescriptions', 'layoutPins']) {
    if (input[key] !== undefined && (!input[key] || typeof input[key] !== 'object' || Array.isArray(input[key]))) {
      throw new Error(`Invalid project graph metadata: "${key}" must be an object`)
    }
  }

  validateStoriesInput(input.stories)

  for (let key of ['hiddenNodes', 'focusPresets']) {
    if (input[key] !== undefined && !Array.isArray(input[key])) {
      throw new Error(`Invalid project graph metadata: "${key}" must be an array`)
    }
  }

  return normalizeProjectGraphMetadata(input)
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

export function pathMatchesPattern(path, pattern) {
  if (!path || !pattern) return false
  let cleanPath = String(path).replace(/^\.\//, '')
  let cleanPattern = String(pattern).replace(/^\.\//, '')

  if (cleanPattern.includes('*')) {
    let regex = '^' + escapeRegex(cleanPattern)
      .replace(/\*\*/g, '\u0000')
      .replace(/\*/g, '[^/]*') + '$'
    return new RegExp(regex.replace(/\u0000/g, '.*')).test(cleanPath)
  }

  if (cleanPattern.endsWith('/')) {
    return cleanPath.startsWith(cleanPattern)
  }

  return cleanPath === cleanPattern || cleanPath.startsWith(`${cleanPattern}/`)
}

export function findClusterForPath(path, metadata) {
  let graphMetadata = normalizeProjectGraphMetadata(metadata)
  return graphMetadata.clusters.find((cluster) => (
    cluster.paths.some((pattern) => pathMatchesPattern(path, pattern))
  )) || null
}

export function buildSemanticGroups(fileMap, metadata) {
  let graphMetadata = normalizeProjectGraphMetadata(metadata)
  let assigned = new Set()
  let groups = {}

  for (let cluster of graphMetadata.clusters) {
    let memberIds = []
    for (let [filePath, nodeId] of fileMap.entries()) {
      if (assigned.has(nodeId)) continue
      if (!cluster.paths.some((pattern) => pathMatchesPattern(filePath, pattern))) continue
      assigned.add(nodeId)
      memberIds.push(nodeId)
    }
    if (memberIds.length > 0) groups[`cluster:${cluster.id}`] = memberIds
  }

  return groups
}

export function parseHexColor(color) {
  let value = String(color || '').trim()
  let match = value.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return null
  let hex = match[1].length === 3
    ? match[1].split('').map((ch) => ch + ch).join('')
    : match[1]
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ]
}
