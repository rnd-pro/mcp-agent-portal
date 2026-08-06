/* eslint-env browser */
export class SubgraphRouter {
  #canvas = null;
  #config = {};
  #isAutoRouting = false;
  #canvasDepth = 0;
  #listeners = [];
  #destroyed = false;

  /**
   * @param {HTMLElement} canvas - NodeCanvas instance
   * @param {Object} config - Configuration options
   * @param {String} [config.hashPrefix='graph'] - URL hash routing prefix
   * @param {Map} [config.fileMap] - Map of file paths to node IDs
   * @param {Map} [config.dirNodeMap] - Map of directory paths to node IDs
   * @param {Map} [config.symbolMap] - Map of symbol IDs to { name, file }
   * @param {Set} [config.drillableFiles] - Set of file paths that contain symbol subgraphs
   * @param {Function} [config.onNavigate] - Callback after successful navigation
   */
  constructor(canvas, config = {}) {
    this.#canvas = canvas;
    this.updateConfig(config);
    this.#bindListeners();
  }

  updateConfig(config = {}) {
    this.#config = {
      hashPrefix: 'graph',
      fileMap: new Map(),
      dirNodeMap: new Map(),
      symbolMap: new Map(),
      drillableFiles: new Set(),
      onNavigate: () => {},
      ...this.#config,
      ...config,
    };
  }

  /**
   * Internal router depth tracker
   * @returns {number}
   */
  get depth() {
    return this.#canvasDepth;
  }

  /**
   * Prevent hash rewriting during automatic routing across layers
   */
  #runAutoRouting(fn) {
    this.#isAutoRouting = true;
    fn();
    this.#isAutoRouting = false;
  }

  #bindListeners() {
    let handleEnter = (e) => {
      this.#canvasDepth++;
      if (this.#isAutoRouting) return;

      let nodeId = e.detail?.nodeId;
      if (!nodeId) return;


      let path = null;
      for (const [key, id] of this.#config.dirNodeMap.entries()) {
        if (id === nodeId) {
          path = key;
          break;
        }
      }
      if (!path) {
        for (const [key, id] of this.#config.fileMap.entries()) {
          if (id === nodeId) {
            path = key;
            break;
          }
        }
      }

      if (path) {
        let hash = window.location.hash;
        let [, queryStr] = hash.split('?');
        let params = new URLSearchParams(queryStr || '');

        params.set('in', '1');


        if (!params.has('symbol') || !this.#config.drillableFiles.has(path)) {
          params.delete('symbol');
        }

        let newQuery = params.toString();
        history.replaceState(null, '', `#${this.#config.hashPrefix}/${path}?${newQuery}`);
      }
    };

    let handleExit = (e) => {
      let level = e.detail?.level;
      this.#canvasDepth = typeof level === 'number' ? level : Math.max(0, this.#canvasDepth - 1);
      if (this.#isAutoRouting) return;


      let hashPath = window.location.hash
        .replace(`#${this.#config.hashPrefix}/`, '')
        .split('?')[0]
        .split('&')[0];


      let exitedDirPath = hashPath;
      if (this.#config.fileMap?.has(hashPath)) {
        let parts = hashPath.split('/');
        parts.pop();
        exitedDirPath = parts.join('/') + '/';
      }

      if (exitedDirPath && !this.#config.dirNodeMap?.has(exitedDirPath)) {
        let segments = exitedDirPath.replace(/\/$/, '').split('/');
        while (segments.length > 0) {
          let candidate = segments.join('/') + '/';
          if (this.#config.dirNodeMap?.has(candidate)) {
            exitedDirPath = candidate;
            break;
          }
          segments.pop();
        }
      }

      let updateUrl = (newPath, setIn = false, setFocus = null) => {
        let hash = window.location.hash;
        let [, queryStr] = hash.split('?');
        let params = new URLSearchParams(queryStr || '');

        let newBase = `#${this.#config.hashPrefix}`;
        if (newPath) newBase += `/${newPath}`;

        if (setIn) params.set('in', '1');
        else params.delete('in');

        if (setFocus) params.set('focus', setFocus);
        else params.delete('focus');

        params.delete('symbol');

        let newQuery = params.toString();
        let newHash = newQuery ? `${newBase}?${newQuery}` : newBase;
        history.replaceState(null, '', newHash);
      };

      if (this.#canvasDepth > 0) {

        if (this.#config.dirNodeMap?.has(exitedDirPath)) {
          updateUrl(exitedDirPath, true, null);
        } else if (exitedDirPath) {
          updateUrl(exitedDirPath, false, null);
        }
      } else {

        if (exitedDirPath) {
          updateUrl(null, false, exitedDirPath);
        } else {
          updateUrl(null, false, null);
        }
      }


      if (exitedDirPath) {
        requestAnimationFrame(() => {
          let nodeId =
            this.#config.dirNodeMap?.get(exitedDirPath) || this.#config.fileMap?.get(exitedDirPath);
          if (nodeId && this.#canvas.flyToNode) {
            this.#canvas.flyToNode(nodeId, { zoom: 0.8 });
          } else if (this.#canvas.fitView) {
            this.#canvas.fitView();
          }
        });
      } else if (this.#canvas.fitView) {
        requestAnimationFrame(() => this.#canvas.fitView());
      }
    };

    this.#canvas.addEventListener('subgraph-enter', handleEnter);
    this.#canvas.addEventListener('subgraph-exit', handleExit);

    this.#listeners.push(
      { name: 'subgraph-enter', fn: handleEnter },
      { name: 'subgraph-exit', fn: handleExit }
    );
  }

  /**
   * Reads URL hash and triggers initial drill down + focus sequence.
   *
   * Universal URL semantics:
   * - `#graph`                                      → root, fit view
   * - `#graph?focus=src/analysis/`                   → root, fly to analysis node
   * - `#graph/src/analysis/?in=1`                    → drill into analysis
   * - `#graph/src/analysis/?in=1&focus=file.js`      → drill into analysis, focus file.js
   * - `#graph/src/analysis/file.js?in=1`             → drill into analysis, drill into file
   * - `#graph/src/analysis/file.js?in=1&symbol=name` → drill into file, focus symbol
   * - `#graph/src/analysis/`                         → root, fly to analysis node
   *
   * @param {NodeEditor} editor
   */
  restoreFromHash(editor) {
    if (this.#destroyed || !this.#canvas) return;

    let hash = window.location.hash;
    let prefix = `#${this.#config.hashPrefix}`;
    if (!hash.startsWith(prefix)) return;

    let afterPrefix = hash.slice(prefix.length);


    let qIdx = afterPrefix.indexOf('?');
    let pathPart = qIdx >= 0 ? afterPrefix.slice(0, qIdx) : afterPrefix;
    let queryStr = qIdx >= 0 ? afterPrefix.slice(qIdx + 1) : '';
    let params = new URLSearchParams(queryStr);

    let drillPath = pathPart.replace(/^\//, '');
    let hasDrillFlag = params.get('in') === '1';
    let focusParam = params.get('focus');
    let symbolParam = params.get('symbol');


    if (!drillPath && !focusParam && !hasDrillFlag && !symbolParam) {


      this.#isAutoRouting = true;
      let safetyCounter = 10;
      let doPopStep = () => {
        if (this.#canvasDepth <= 0 || safetyCounter-- <= 0) {
          this.#isAutoRouting = false;
          this.#canvas.fitView?.();
          return;
        }

        let onExit = () => {
          this.#canvas.removeEventListener('subgraph-exit', onExit);

          requestAnimationFrame(doPopStep);
        };
        this.#canvas.addEventListener('subgraph-exit', onExit);
        this.#canvas.drillUp?.();
      };
      doPopStep();
      return;
    }


    if (!drillPath && focusParam) {
      this.navigateTo(decodeURIComponent(focusParam), 0, false);
      return;
    }


    if (drillPath && hasDrillFlag) {
      let drilled = this.#restoreDrillDown(drillPath, editor, true);


      if (drilled && focusParam) {
        let fullFocusPath = drillPath + decodeURIComponent(focusParam);
        requestAnimationFrame(() => {
          this.navigateTo(fullFocusPath, 0, false);
        });
      }


      if (drilled && symbolParam) {
        requestAnimationFrame(() => {
          this.restoreSymbolFocus(drillPath);
        });
      }
      return;
    }


    if (drillPath) {
      this.navigateTo(drillPath, 0, false);
    }
  }

  #restoreDrillDown(targetPath, editor, autoDrill = false) {
    if (!this.#canvas) return false;


    for (const node of editor.getNodes()) {
      if (!node._isSubgraph) continue;
      let nodePath = node.params?.path;
      if (!nodePath) continue;


      if (nodePath === targetPath) {
        if (autoDrill) {
          this.#runAutoRouting(() => {
            this.#canvas.drillDown(node.id);
          });
          if (this.#canvas.fitView) {
            requestAnimationFrame(() => this.#canvas.fitView());
          }
        } else {

          this.#canvas.flyToNode?.(node.id, { zoom: 0.8 }) || this.#canvas.selectNode?.(node.id);
        }
        return true;
      }


      if (targetPath.startsWith(nodePath)) {
        this.#runAutoRouting(() => {
          this.#canvas.drillDown(node.id);
        });

        requestAnimationFrame(() => {
          this.navigateTo(targetPath, 0, autoDrill);
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Restore visual symbol focus from &symbol= URL parameter.
   * Called after autoDrill into a file subgraph to select the target function/class node.
   * @param {string} filePath - the file we drilled into
   */
  restoreSymbolFocus(filePath) {
    let hashParts = window.location.hash.split('&symbol=');
    if (hashParts.length < 2) return;
    let symbolName = decodeURIComponent(hashParts[1].split('&')[0]);
    if (!symbolName || !this.#config.symbolMap) return;

    for (const [nodeId, params] of this.#config.symbolMap) {
      if (params.name === symbolName && params.file === filePath) {
        this.#canvas?.selectNode(nodeId);
        return;
      }
    }
  }

  /**
   * Focus viewport on a specific node by path
   * @param {string} targetPath - e.g. 'src/core/event-bus.js'
   * @param {number} depth - Internal recursion depth limit
   * @param {boolean} autoDrill - Attempt to drill into target if it is a Subgraph
   * @returns {boolean} true if node found and focused
   */
  navigateTo(targetPath, depth = 0, autoDrill = false) {
    if (this.#destroyed || !this.#canvas || !this.#config.fileMap || depth > 5) return false;


    let targetId = null;
    let isFile = true;
    if (this.#config.fileMap.has(targetPath)) {
      targetId = this.#config.fileMap.get(targetPath);
    } else if (this.#config.dirNodeMap && this.#config.dirNodeMap.has(targetPath)) {
      targetId = this.#config.dirNodeMap.get(targetPath);
      isFile = false;
    }

    if (!targetId) return false;

    let positions =
      typeof this.#canvas.getPositions === 'function' ? this.#canvas.getPositions() : {};
    let pos = positions[targetId];


    if (!pos && typeof this.#canvas.drillDown === 'function') {
      if (this.#config.dirNodeMap) {


        let searchPath = targetPath;
        if (isFile) {

          let parts = targetPath.split('/');
          parts.pop();
          searchPath = parts.join('/') + '/';
          if (searchPath === '/') searchPath = './';
        }


        let segments = searchPath.replace(/\/$/, '').split('/');
        while (segments.length > 0) {
          let candidateDir = segments.join('/') + '/';
          let dirId = this.#config.dirNodeMap.get(candidateDir);
          if (dirId && positions[dirId]) {

            this.#runAutoRouting(() => {
              this.#canvas.drillDown(dirId);
            });
            requestAnimationFrame(() => this.navigateTo(targetPath, depth + 1, autoDrill));
            return true;
          }
          segments.pop();
        }

        let rootId = this.#config.dirNodeMap.get('./');
        if (rootId && positions[rootId]) {
          this.#runAutoRouting(() => {
            this.#canvas.drillDown(rootId);
          });
          requestAnimationFrame(() => this.navigateTo(targetPath, depth + 1, autoDrill));
          return true;
        }


        if (this.#canvasDepth > 0) {
          this.#runAutoRouting(() => {
            this.#canvas.drillUp?.();
          });
          requestAnimationFrame(() => this.navigateTo(targetPath, depth + 1, autoDrill));
          return true;
        }
      }
      return false;
    }


    if (autoDrill && isFile && this.#config.drillableFiles?.has(targetPath)) {
      this.#runAutoRouting(() => {
        this.#canvas.drillDown?.(targetId);
      });
      requestAnimationFrame(() => {
        if (this.#canvas.fitView) this.#canvas.fitView();

        this.restoreSymbolFocus(targetPath);
      });
      return true;
    }


    if (this.#canvas.flyToNode) {
      this.#canvas.flyToNode(targetId, { zoom: 0.8 });
    } else {

      this.#canvas.selectNode?.(targetId);
    }

    this.#config.onNavigate(targetPath);
    return true;
  }

  destroy() {
    this.#destroyed = true;
    for (const listener of this.#listeners) {
      this.#canvas.removeEventListener(listener.name, listener.fn);
    }
    this.#listeners = [];
  }
}
