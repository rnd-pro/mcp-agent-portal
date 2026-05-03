import {
  NodeEditor,
  Node,
  SubgraphNode,
  Connection,
  Socket,
  Input,
  Output,
  computeAutoLayout,
} from 'symbiote-node';

// ── Socket types (for wire coloring) ──
const S_IMPORT = new Socket('import');
S_IMPORT.color = '#c87533';   // copper
const S_EXPORT = new Socket('export');
S_EXPORT.color = '#d4a04a';   // gold

/**
 * Extract directory from file path
 * @param {string} filePath
 * @returns {string}
 */
function dirOf(filePath) {
  if (!filePath) return './';
  const idx = filePath.lastIndexOf('/');
  return idx >= 0 ? filePath.slice(0, idx + 1) : './';
}

/**
 * Short filename for node label
 * @param {string} filePath
 * @returns {string}
 */
function baseName(filePath) {
  if (!filePath) return '?';
  const idx = filePath.lastIndexOf('/');
  return idx >= 0 ? filePath.slice(idx + 1) : filePath;
}



/**
 * Resolve import path to a known file
 * @param {string} importPath
 * @param {string} fromFile
 * @param {Set<string>} knownFiles
 * @returns {string|null}
 */
function resolveImport(importPath, fromFile, knownFiles) {
  // Direct match
  if (knownFiles.has(importPath)) return importPath;

  // Try with .js extension
  if (knownFiles.has(importPath + '.js')) return importPath + '.js';

  // Relative resolution
  if (importPath.startsWith('.')) {
    const dir = dirOf(fromFile);
    let resolved = dir + importPath.replace(/^\.\//, '');
    // Normalize ../ segments
    const parts = resolved.split('/');
    const normalized = [];
    for (const part of parts) {
      if (part === '..') normalized.pop();
      else if (part !== '.') normalized.push(part);
    }
    resolved = normalized.join('/');

    if (knownFiles.has(resolved)) return resolved;
    if (knownFiles.has(resolved + '.js')) return resolved + '.js';
    // Try index
    if (knownFiles.has(resolved + '/index.js')) return resolved + '/index.js';
  }

  // Module name match via pre-built index — O(1) instead of O(N)
  const base = importPath.split('/').pop();
  const idx = buildBasenameIndex(knownFiles);
  return idx.get(base) || idx.get(base.replace(/\.js$/, '')) || null;
}

let _basenameIndex = null;
let _indexedSet = null;
function buildBasenameIndex(knownFiles) {
  if (_indexedSet === knownFiles) return _basenameIndex;
  _indexedSet = knownFiles;
  _basenameIndex = new Map();
  for (const file of knownFiles) {
    const base = file.split('/').pop();
    _basenameIndex.set(base, file);
    if (!base.endsWith('.js')) {
      _basenameIndex.set(base + '.js', file);
    }
  }
  return _basenameIndex;
}

/**
 * Build a file-level graph from skeleton data.
 * Each file becomes a Node, each import relationship becomes a Connection.
 *
 * @param {object} skeleton - skeleton from get_skeleton
 * @returns {{ editor: NodeEditor, fileMap: Map<string, string> }}
 */
function buildFileGraph(skeleton) {
  const editor = new NodeEditor();
  const fileMap = new Map(); // filePath → nodeId
  const dirMap = new Map(); // dirPath → nodeId (hub nodes)

  // Collect all files that have symbols
  const files = new Set();
  const assetFiles = new Set(); // non-source files (.css, .html, .json, .md, etc.)
  // From nodes (classes) — each has .f (file) property
  for (const data of Object.values(skeleton.n || {})) {
    if (data.f) files.add(data.f);
  }
  // From exports map — keys are files
  for (const file of Object.keys(skeleton.X || {})) {
    files.add(file);
  }
  // From source files without symbols
  for (const [dir, names] of Object.entries(skeleton.f || {})) {
    for (const name of names) {
      files.add(dir === './' ? name : dir + name);
    }
  }
  // From non-source/asset files (.css, .html, .json, .md, etc.)
  for (const [dir, names] of Object.entries(skeleton.a || {})) {
    for (const name of names) {
      const fullPath = dir === './' ? name : dir + name;
      files.add(fullPath);
      assetFiles.add(fullPath);
    }
  }

  if (files.size === 0) return { editor, fileMap };

  // Group files by directory
  const dirFiles = new Map();
  for (const file of files) {
    const dir = dirOf(file);
    if (!dirFiles.has(dir)) dirFiles.set(dir, []);
    dirFiles.get(dir).push(file);
  }

  // TODO Phase 2: Create directory hub nodes when LOD zoom expansion is ready
  // Hub nodes without connections create disconnected groups — skip for now

  // Create file nodes (standard HTML nodes with icons)
  for (const file of files) {
    const dir = dirOf(file);
    const label = baseName(file);
    const isAsset = assetFiles.has(file);
    const node = new Node(label, {
      type: isAsset ? 'asset' : 'file',
      category: isAsset ? 'asset' : 'file',
    });
    node.params = { path: file, dir };

    // Every file has one output (exports) and one input (imports)
    node.addOutput('out', new Output(S_EXPORT, ''));
    node.addInput('in', new Input(S_IMPORT, ''));

    editor.addNode(node);
    fileMap.set(file, node.id);
  }

  // Build import edges from skeleton.I (file-level import map)
  // skeleton.I[file] = [source1, source2, ...]
  const edgesAdded = new Set();
  for (const [srcFile, sources] of Object.entries(skeleton.I || {})) {
    const srcId = fileMap.get(srcFile);
    if (!srcId) continue;

    for (const impPath of sources) {
      // Skip node builtins and external packages
      if (impPath.startsWith('node:') || (!impPath.startsWith('.') && !impPath.startsWith('/'))) continue;

      const targetFile = resolveImport(impPath, srcFile, files);
      if (!targetFile) continue;

      const tgtId = fileMap.get(targetFile);
      if (!tgtId || tgtId === srcId) continue;

      const edgeKey = `${srcId}->${tgtId}`;
      if (edgesAdded.has(edgeKey)) continue;
      edgesAdded.add(edgeKey);

      const srcNode = editor.getNode(srcId);
      const tgtNode = editor.getNode(tgtId);
      try {
        const conn = new Connection(srcNode, 'out', tgtNode, 'in');
        // Phase 3: tag cross-directory connections as "via"
        const srcDir = dirOf(srcFile);
        const tgtDir = dirOf(targetFile);
        if (srcDir !== tgtDir) {
          conn._via = true;
          conn._srcDir = srcDir;
          conn._tgtDir = tgtDir;
        }
        editor.addConnection(conn);
      } catch {
        // Skip invalid connections
      }
    }
  }

  // Hub node: find node with highest connectivity → module category
  const connCounts = new Map();
  for (const conn of editor.getConnections()) {
    connCounts.set(conn.from, (connCounts.get(conn.from) || 0) + 1);
    connCounts.set(conn.to, (connCounts.get(conn.to) || 0) + 1);
  }
  let maxConns = 0;
  let hubId = null;
  for (const [nodeId, count] of connCounts) {
    if (count > maxConns) {
      maxConns = count;
      hubId = nodeId;
    }
  }
  if (hubId) {
    const hubNode = editor.getNode(hubId);
    if (hubNode && hubNode.options) {
      hubNode.options.category = 'module';
    }
  }

  // ── Build Reverse ID Lookup ──
  const idToPath = new Map();
  for (const [path, id] of fileMap.entries()) idToPath.set(id, path);

  return { editor, fileMap, dirMap, dirFiles, idToPath };
}

/**
 * Build a hierarchical SubgraphNode graph:
 *   Level 0: directories (SubgraphNode)
 *   Level 1: files inside directories (SubgraphNode or Node)
 *   Level 2: functions/exports inside files (Node)
 *
 * @param {object} skeleton
 * @returns {{ editor: NodeEditor, fileMap: Map<string, string> }}
 */
function buildStructuredGraph(skeleton) {
  const editor = new NodeEditor();
  const fileMap = new Map();
  const symbolMap = new Map();
  const L = skeleton.L || {}; // legend: abbreviation → full name
  const N = skeleton.n || {}; // classes: className → { f, m, ... }

  // Build class-name set for classification
  const classNames = new Set(Object.keys(N));
  // Map file → set of class names defined in it
  const fileClasses = new Map();
  for (const [className, data] of Object.entries(N)) {
    if (data.f) {
      if (!fileClasses.has(data.f)) fileClasses.set(data.f, new Set());
      fileClasses.get(data.f).add(className);
    }
  }

  // Collect all files
  const files = new Set();
  const assetFiles = new Set();
  for (const data of Object.values(N)) {
    if (data.f) files.add(data.f);
  }
  for (const file of Object.keys(skeleton.X || {})) {
    files.add(file);
  }
  for (const [dir, names] of Object.entries(skeleton.f || {})) {
    for (const name of names) {
      files.add(dir === './' ? name : dir + name);
    }
  }
  // Non-source/asset files (.css, .html, .json, .md, etc.)
  for (const [dir, names] of Object.entries(skeleton.a || {})) {
    for (const name of names) {
      const fullPath = dir === './' ? name : dir + name;
      files.add(fullPath);
      assetFiles.add(fullPath);
    }
  }

  if (files.size === 0) return { editor, fileMap };

  // Group files by directory
  const dirFiles = new Map();
  for (const file of files) {
    const dir = dirOf(file);
    if (!dirFiles.has(dir)) dirFiles.set(dir, []);
    dirFiles.get(dir).push(file);
  }

  /**
   * Classify a file based on its content and name
   * @param {string} file
   * @returns {string} category
   */
  function classifyFile(file) {
    if (assetFiles.has(file)) return 'asset';
    const name = baseName(file).toLowerCase();
    const classes = fileClasses.get(file);
    if (classes && classes.size > 0) return 'class';
    if (name === 'index.js' || name === 'index.mjs') return 'module';
    if (name.includes('test') || name.includes('spec')) return 'control';
    if (name.includes('config') || name.includes('.json')) return 'data';
    return 'file';
  }

  /**
   * Resolve export abbreviation to full name
   * @param {string} abbr
   * @returns {string}
   */
  function resolveName(abbr) {
    return L[abbr] || abbr;
  }

  // ── Phase 1: Create all Directory SubgraphNodes (without nesting yet) ──
  const dirNodeMap = new Map();    // dirPath → nodeId
  const dirSubgraphs = new Map();  // dirPath → SubgraphNode instance

  // Sort directories by depth (shortest first) so parents are created before children
  const sortedDirs = [...dirFiles.keys()].sort((a, b) => {
    const dA = a.split('/').filter(Boolean).length;
    const dB = b.split('/').filter(Boolean).length;
    return dA - dB || a.localeCompare(b);
  });

  for (const dir of sortedDirs) {
    const dirFileList = dirFiles.get(dir);

    // Root directory './' is NOT a node — its contents go directly into the root editor
    const isRoot = (dir === './');
    const targetEditor = isRoot ? editor : null;

    let dirSubgraph = null;
    let innerEditor;

    if (isRoot) {
      innerEditor = editor;
    } else {
      const dirLabel = dir.replace(/\/$/, '').split('/').pop() || 'root';
      dirSubgraph = new SubgraphNode(dirLabel, {
        category: 'directory',
      });
      dirSubgraph.params = { path: dir, isDirectory: true };
      dirSubgraph.addOutput('out', new Output(S_EXPORT, ''));
      dirSubgraph.addInput('in', new Input(S_IMPORT, ''));
      innerEditor = dirSubgraph.getInnerEditor();
    }

    // ── File nodes inside this directory ──
    for (const file of dirFileList) {
      const fileLabel = baseName(file);
      const exports = skeleton.X?.[file] || [];
      const fileCategory = classifyFile(file);
      const classes = fileClasses.get(file);

      let fileNode;
      if (exports.length > 0) {
        fileNode = new SubgraphNode(fileLabel, {
          category: fileCategory,
        });
        fileNode.params = { path: file, dir, calculatedHeight: 60 + exports.length * 50 };

        const fileInnerEditor = fileNode.getInnerEditor();
        for (const abbr of exports) {
          const abbrId = typeof abbr === 'object' ? abbr.id : abbr;
          const fullName = resolveName(abbrId);
          const isClass = classes && classes.has(fullName);
          const fnNode = new Node(fullName, {
            type: isClass ? 'class' : 'function',
            category: isClass ? 'class' : 'function',
          });
          fnNode.params = { name: fullName, file };
          symbolMap.set(fnNode.id, fnNode.params);
          fileInnerEditor.addNode(fnNode);
        }
      } else {
        fileNode = new Node(fileLabel, {
          type: 'file',
          category: fileCategory,
        });
        fileNode.params = { path: file, dir };
      }

      fileNode.addOutput('out', new Output(S_EXPORT, ''));
      fileNode.addInput('in', new Input(S_IMPORT, ''));

      innerEditor.addNode(fileNode);
      fileMap.set(file, fileNode.id);
    }

    // ── File-level import edges within this directory ──
    const edgesAdded = new Set();
    for (const [srcFile, sources] of Object.entries(skeleton.I || {})) {
      const srcId = fileMap.get(srcFile);
      if (!srcId) continue;
      const srcDir = dirOf(srcFile);
      if (srcDir !== dir) continue;

      for (const impPath of sources) {
        if (impPath.startsWith('node:') || (!impPath.startsWith('.') && !impPath.startsWith('/'))) continue;
        const targetFile = resolveImport(impPath, srcFile, files);
        if (!targetFile) continue;

        const tgtId = fileMap.get(targetFile);
        if (!tgtId || tgtId === srcId) continue;
        if (dirOf(targetFile) !== dir) continue;

        const edgeKey = `${srcId}->${tgtId}`;
        if (edgesAdded.has(edgeKey)) continue;
        edgesAdded.add(edgeKey);

        const srcNode = innerEditor.getNode(srcId);
        const tgtNode = innerEditor.getNode(tgtId);
        if (srcNode && tgtNode) {
          try {
            innerEditor.addConnection(new Connection(srcNode, 'out', tgtNode, 'in'));
          } catch { /* skip */ }
        }
      }
    }

    if (dirSubgraph) {
      dirSubgraphs.set(dir, dirSubgraph);
      dirNodeMap.set(dir, dirSubgraph.id);
    }
  }

  // ── Phase 2: Nest child directories inside parent directories ──
  // Root './' is not a node, so its children go directly into root editor.
  for (const dir of sortedDirs) {
    if (dir === './') continue; // root dir contents already in root editor
    const dirSubgraph = dirSubgraphs.get(dir);
    if (!dirSubgraph) continue;
    
    // Find parent directory
    const segments = dir.replace(/\/$/, '').split('/');
    segments.pop();
    
    let parentDir = null;
    while (segments.length > 0) {
      const candidate = segments.join('/') + '/';
      if (dirSubgraphs.has(candidate)) {
        parentDir = candidate;
        break;
      }
      segments.pop();
    }
    
    if (parentDir) {
      // Nest inside parent's inner editor
      const parentSubgraph = dirSubgraphs.get(parentDir);
      parentSubgraph.getInnerEditor().addNode(dirSubgraph);
    } else {
      // No parent (or parent is './') → add to root editor
      editor.addNode(dirSubgraph);
    }
  }

  // ── Cross-directory edges ──
  // Edges between directories that share the same parent go into that parent's inner editor.
  // Edges between top-level directories go into the root editor.
  const crossEdges = new Set();
  for (const [srcFile, sources] of Object.entries(skeleton.I || {})) {
    const srcDir = dirOf(srcFile);
    const srcDirId = dirNodeMap.get(srcDir);
    if (!srcDirId) continue;

    for (const impPath of sources) {
      if (impPath.startsWith('node:') || (!impPath.startsWith('.') && !impPath.startsWith('/'))) continue;
      const targetFile = resolveImport(impPath, srcFile, files);
      if (!targetFile) continue;

      const tgtDir = dirOf(targetFile);
      if (tgtDir === srcDir) continue;

      const tgtDirId = dirNodeMap.get(tgtDir);
      if (!tgtDirId || tgtDirId === srcDirId) continue;

      const edgeKey = `${srcDirId}->${tgtDirId}`;
      if (crossEdges.has(edgeKey)) continue;
      crossEdges.add(edgeKey);

      // Find the common parent editor that contains BOTH directory nodes
      // Walk up both paths to find shared ancestor
      const srcSegments = srcDir.replace(/\/$/, '').split('/');
      const tgtSegments = tgtDir.replace(/\/$/, '').split('/');
      
      // Find common prefix 
      let commonLen = 0;
      while (commonLen < srcSegments.length && commonLen < tgtSegments.length &&
             srcSegments[commonLen] === tgtSegments[commonLen]) {
        commonLen++;
      }
      const commonPath = commonLen > 0 ? srcSegments.slice(0, commonLen).join('/') + '/' : null;
      
      // The editor that holds both nodes is the common parent's inner editor,
      // or the root editor if they share no parent.
      let targetEditor = editor; // default: root editor
      if (commonPath && dirSubgraphs.has(commonPath)) {
        targetEditor = dirSubgraphs.get(commonPath).getInnerEditor();
      }

      const srcNode = targetEditor.getNode(srcDirId);
      const tgtNode = targetEditor.getNode(tgtDirId);
      if (srcNode && tgtNode) {
        try {
          targetEditor.addConnection(new Connection(srcNode, 'out', tgtNode, 'in'));
        } catch { /* skip */ }
      }
    }
  }

  // ── Pre-compute inner positions for drill-down (recursive) ──
  const symbolNodes = []; // Track internal symbol nodes for idToPath linking

  function computeInnerPositions(subgraph) {
    if (!subgraph._isSubgraph) return;
    const inner = subgraph.getInnerEditor();
    const innerPos = computeAutoLayout(inner, { nodeHeight: 80, gapY: 100 });
    subgraph.setInnerPositions(innerPos);

    let minX = 0, maxX = 260;
    let minY = 0, maxY = 60;
    
    for (const pos of Object.values(innerPos)) {
      if (pos.x < minX) minX = pos.x;
      if (pos.x + 260 > maxX) maxX = pos.x + 260;
      if (pos.y < minY) minY = pos.y;
      if (pos.y + 60 > maxY) maxY = pos.y + 60;
    }

    subgraph.params = subgraph.params || {};
    subgraph.params.calculatedWidth = maxX - minX + 60;
    subgraph.params.calculatedHeight = maxY - minY + 100;

    for (const childNode of inner.getNodes()) {
      if (childNode._isSubgraph) {
        computeInnerPositions(childNode);
        // If it's a file node (has params.path and no isDirectory), collect symbols
        if (childNode.params?.path && !childNode.params?.isDirectory) {
          const fileInner = childNode.getInnerEditor();
          for (const fnNode of fileInner.getNodes()) {
            symbolNodes.push({ id: fnNode.id, file: childNode.params.path });
          }
        }
      }
    }
  }

  for (const rootNode of editor.getNodes()) {
    computeInnerPositions(rootNode);
  }

  // ── Build Reverse ID Lookup ──
  const idToPath = new Map();
  for (const [path, id] of fileMap.entries()) idToPath.set(id, path);
  for (const [path, id] of dirNodeMap.entries()) idToPath.set(id, path);
  for (const node of symbolNodes) idToPath.set(node.id, node.file);

  return { editor, fileMap, dirFiles, dirNodeMap, idToPath, symbolMap };
}
export { buildFileGraph, buildStructuredGraph };
