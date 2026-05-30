// @ctx .context/web/panels/code-viewer.ctx
import Symbiote from "@symbiotejs/symbiote";
import {
  api,
  events,
  state,
  formatStats,
  getActiveRouteProjectId,
  resolveProjectPath,
} from "../../app.js";
import {
  buildHash,
  buildDirectoryInfo,
  getRoute,
  getSourceLanguage,
  isDirectoryLikePath,
  parseQuery,
} from "symbiote-node/ui";
import template from "./CodeViewer.tpl.js";
import css from "./CodeViewer.css.js";

function normalizeSkeletonDir(dir) {
  return dir === "./" ? "" : String(dir || "").replace(/^\.\//, "").replace(/\/$/, "");
}

function directoryIndexFromSkeleton(skeleton = null) {
  if (!skeleton) return { directories: [] };
  const directories = new Set();
  for (const group of [skeleton.f, skeleton.a]) {
    if (!group) continue;
    for (const dir of Object.keys(group)) {
      const normalized = normalizeSkeletonDir(dir);
      directories.add(normalized);
      const parts = normalized.split("/").filter(Boolean);
      for (let index = 1; index < parts.length; index++) {
        directories.add(parts.slice(0, index).join("/"));
      }
    }
  }
  return { directories: [...directories] };
}

function directoryInfoFromSkeleton(path, skeleton = null) {
  if (!skeleton) return null;

  const norm = String(path || "").replace(/\/$/, "");
  const prefix = norm ? `${norm}/` : "";
  const files = [];
  const subdirectories = new Set();
  const fileTypes = {};

  for (const group of [skeleton.f, skeleton.a]) {
    if (!group) continue;
    for (const [dir, items] of Object.entries(group)) {
      const normalized = normalizeSkeletonDir(dir);
      const fullDir = normalized ? `${normalized}/` : "";
      if (!fullDir.startsWith(prefix) && normalized !== norm) continue;
      for (const item of items) {
        const fullPath = `${fullDir}${item}`;
        if (!fullPath.startsWith(prefix)) continue;
        const rel = fullPath.slice(prefix.length);
        const slashIdx = rel.indexOf("/");
        if (slashIdx > 0) {
          subdirectories.add(rel.slice(0, slashIdx));
        } else {
          files.push(rel);
        }
        const dot = rel.lastIndexOf(".");
        const ext = dot >= 0 ? rel.slice(dot) : "(no ext)";
        fileTypes[ext] = (fileTypes[ext] || 0) + 1;
      }
    }
  }

  let symbolCount = 0;
  if (skeleton.n) {
    for (const node of Object.values(skeleton.n)) {
      if (node?.f && node.f.startsWith(prefix)) symbolCount++;
    }
  }

  return {
    files,
    subdirectories: [...subdirectories],
    fileTypes,
    totalFiles: Object.values(fileTypes).reduce((sum, count) => sum + count, 0),
    totalSubdirectories: subdirectories.size,
    symbolCount,
  };
}

export class CodeViewer extends Symbiote {
  _loadRequestId = 0;

  initCallback() {
    this.addEventListener("source-viewer-show-graph", (event) => {
      const path = event.detail?.path;
      if (path) {
        let route = getRoute();
        let params = { ...parseQuery(route.query || ''), focus: path };
        window.location.hash = buildHash('graph', '', params);
      }
    });

    events.addEventListener("file-selected", (event) => this._loadFile(event.detail.path, event.detail.projectId));
    events.addEventListener("follow-focus-changed", (event) => {
      const detail = event.detail;
      if (detail.type !== "file" || !detail.target) return;
      this._loadFile(detail.target, getActiveRouteProjectId());
      if (detail.meta?.startLine) {
        setTimeout(() => this._getSourceViewer()?.scrollToLine?.(detail.meta.startLine), 200);
      }
    });

    if (state.activeFile) requestAnimationFrame(() => this._loadFile(state.activeFile, getActiveRouteProjectId()));
  }

  _getSourceViewer() {
    return this.querySelector("source-viewer");
  }

  async _loadFile(path, projectId = getActiveRouteProjectId()) {
    const viewer = this._getSourceViewer();
    if (!viewer) return;

    const requestId = ++this._loadRequestId;
    viewer.showEmpty(path);
    const lang = getSourceLanguage(path);

    const directoryIndex = directoryIndexFromSkeleton(state.skeleton);
    if (isDirectoryLikePath(path, directoryIndex)) {
      viewer.showDirectory(path, buildDirectoryInfo(path, directoryInfoFromSkeleton(path, state.skeleton)));
      return;
    }

    if (lang === "image") {
      viewer.showImage(path);
      return;
    }

    if (lang === "binary") {
      viewer.showBinary(path);
      return;
    }

    try {
      const [file, rawFile] = await Promise.all([
        api("/api/file", { path, projectId }),
        api("/api/raw-file", { path, projectId }).catch(() => null),
      ]);
      if (requestId !== this._loadRequestId) return;

      const code = typeof file.code === "string"
        ? file.code
        : typeof file.compressed === "string"
          ? file.compressed
          : file.content || JSON.stringify(file, null, 2);
      const raw = file.raw || rawFile?.content || code;
      const isReadable = !(file.ctxTok && file.ctxTok > 0);

      viewer.showFile({
        path,
        raw,
        lang,
        isReadable,
        statsText: file.codeTok && file.expanded ? formatStats(file) : "",
        transform: (context) => this._transformFile({ ...context, projectId }),
      });

      this._lintCurrentFile(path, projectId);
    } catch (error) {
      if (requestId !== this._loadRequestId) return;
      viewer.showError(path, error);
    }
  }

  async _transformFile({ path, isReadable, projectId = getActiveRouteProjectId() }) {
    if (isReadable) {
      const result = await api("/api/compact-file", { path, projectId });
      return {
        code: result?.code || "// Compression unavailable",
        statsText: result ? `Compressed: ${(result.compressed / 1000).toFixed(1)}K chars (${result.savings})` : "",
      };
    }

    const result = await api("/api/expand-file", { path, projectId });
    return {
      code: result?.code || "// Expand unavailable",
      statsText: result ? `Expanded: ${(result.decompiled / 1000).toFixed(1)}K chars | JSDocs injected: ${result.injected || 0}` : "",
    };
  }

  async _lintCurrentFile(path, projectId = getActiveRouteProjectId()) {
    const lang = getSourceLanguage(path);
    if (lang !== "js" && lang !== "mjs") return;

    const viewer = this._getSourceViewer();
    if (!viewer) return;

    try {
      const response = await fetch("/api/lint-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: resolveProjectPath(path, projectId) }),
      });
      const diagnostics = await response.json();
      if (Array.isArray(diagnostics) && diagnostics[0]?.messages?.length > 0) {
        viewer.setDiagnostics(diagnostics[0].messages);
      } else {
        viewer.clearDiagnostics();
      }
    } catch {
      viewer.clearDiagnostics();
    }
  }
}

CodeViewer.template = template;
CodeViewer.rootStyles = css;
CodeViewer.reg("pg-code-viewer");
