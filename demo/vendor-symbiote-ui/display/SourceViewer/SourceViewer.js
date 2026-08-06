import Symbiote from "@symbiotejs/symbiote";
import "../CodeBlock/CodeBlock.js";
import template from "./SourceViewer.tpl.js";
import css from "./SourceViewer.css.js";
import { translate } from "../../locale/index.js";
import {
  applySourceSyntaxTheme,
  normalizeSourceAction,
  normalizeSourceSyntaxTheme,
} from "../source-contract.js";

const EXT_LANG = {
  ".md": "md",
  ".markdown": "md",
  ".sql": "sql",
  ".json": "json",
  ".css": "css",
  ".html": "html",
  ".htm": "html",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".sh": "sh",
  ".bash": "bash",
  ".env": "env",
  ".ini": "ini",
  ".conf": "conf",
  ".cfg": "cfg",
  ".txt": "plain",
  ".csv": "csv",
  ".gitignore": "plain",
  ".dockerignore": "plain",
  ".editorconfig": "plain",
  ".py": "python",
  ".pyw": "python",
  ".pyi": "python",
  ".rb": "ruby",
  ".rake": "ruby",
  ".gemspec": "ruby",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".swift": "swift",
  ".c": "c",
  ".h": "c",
  ".cpp": "c",
  ".hpp": "c",
  ".cc": "c",
  ".cxx": "c",
  ".hh": "c",
  ".cs": "csharp",
  ".php": "php",
  ".phtml": "php",
  ".dart": "dart",
  ".lua": "lua",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".prisma": "prisma",
  ".dockerfile": "dockerfile",
  ".r": "plain",
  ".scala": "java",
  ".groovy": "java",
  ".gradle": "java",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".gif": "image",
  ".svg": "image",
  ".webp": "image",
  ".bmp": "image",
  ".ico": "image",
  ".pdf": "binary",
  ".zip": "binary",
  ".tar": "binary",
  ".gz": "binary",
  ".woff": "binary",
  ".woff2": "binary",
  ".ttf": "binary",
  ".eot": "binary",
  ".mp3": "binary",
  ".mp4": "binary",
  ".wav": "binary",
  ".avi": "binary",
  ".mov": "binary",
};

const FILE_LIKE_BASENAMES = new Set([
  "Dockerfile",
  "Makefile",
  "Procfile",
  "LICENSE",
  "README",
  "CHANGELOG",
  "Gemfile",
  "Rakefile",
  "Vagrantfile",
]);

function emit(el, type, detail = {}) {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

function normalizeDirectoryPath(path) {
  return String(path || "").replace(/^\.\//, "").replace(/\/$/, "");
}

export function getSourceLanguage(path) {
  if (!path) return "js";
  const base = path.split("/").pop() || "";
  const dot = path.lastIndexOf(".");
  if (dot >= 0) {
    const ext = EXT_LANG[path.substring(dot).toLowerCase()];
    if (ext) return ext;
  }
  if (base === "Dockerfile") return "dockerfile";
  if (["Makefile", "Procfile", "LICENSE", "README", "CHANGELOG"].some((name) => base.startsWith(name))) {
    return "plain";
  }
  return dot < 0 ? "plain" : "js";
}

export function isDirectoryLikePath(path, directoryIndex = null) {
  if (!path) return false;
  const norm = normalizeDirectoryPath(path);
  const base = norm.split("/").pop() || "";
  const pathLooksLikeDir = path.endsWith("/") || (!path.includes(".") && !FILE_LIKE_BASENAMES.has(base));
  if (pathLooksLikeDir) return true;
  if (!directoryIndex) return false;

  const directories = Array.isArray(directoryIndex.directories)
    ? directoryIndex.directories
    : [];
  for (const dir of directories) {
    const normalized = normalizeDirectoryPath(dir);
    if (normalized === norm || normalized.startsWith(`${norm}/`)) return true;
  }
  return false;
}

export function buildDirectoryInfo(path, directoryInfo = null) {
  const norm = normalizeDirectoryPath(path);
  const lines = [`Directory: ${norm || "."}`, "-".repeat(60), ""];
  if (!directoryInfo) {
    lines.push("Directory metadata is not available.");
    return lines.join("\n");
  }

  const subdirectories = Array.from(directoryInfo.subdirectories || []).map(String).filter(Boolean).sort();
  const directFiles = Array.from(directoryInfo.files || []).map(String).filter(Boolean).sort();
  const fileTypes = directoryInfo.fileTypes && typeof directoryInfo.fileTypes === "object"
    ? directoryInfo.fileTypes
    : {};

  if (subdirectories.length > 0) {
    lines.push(`Subdirectories (${subdirectories.length}):`);
    for (const dir of subdirectories) lines.push(`  - ${dir}/`);
    lines.push("");
  }

  if (directFiles.length > 0) {
    lines.push(`Files (${directFiles.length}):`);
    for (const file of directFiles) lines.push(`  - ${file}`);
    lines.push("");
  }

  const sortedExt = Object.entries(fileTypes).sort((a, b) => b[1] - a[1]);
  if (sortedExt.length > 0) {
    lines.push("File types:");
    for (const [ext, count] of sortedExt) {
      const bar = "#".repeat(Math.min(count, 30));
      lines.push(`  ${ext.padEnd(12)} ${String(count).padStart(4)}  ${bar}`);
    }
    lines.push("");
  }

  lines.push("-".repeat(60));
  const totalFiles = Number.isFinite(directoryInfo.totalFiles) ? directoryInfo.totalFiles : directFiles.length;
  const totalSubdirectories = Number.isFinite(directoryInfo.totalSubdirectories)
    ? directoryInfo.totalSubdirectories
    : subdirectories.length;
  lines.push(`Total: ${totalFiles} files across ${totalSubdirectories} subdirectories`);

  if (directoryInfo.symbolCount > 0) {
    lines.push(`Symbols: ${directoryInfo.symbolCount} exported nodes in this directory`);
  }

  return lines.join("\n");
}

export class SourceViewer extends Symbiote {
  init$ = {
    filename: "Select a file",
    hasFile: false,
    viewMode: "source",
    modeLabel: "source",
    statsText: "",
    showToggle: false,
    showGraphAction: true,
    showGraphTitle: translate('sourceViewer.showInGraph'),
    toggleModeTitle: translate('sourceViewer.toggleViewMode'),
    graphLabel: translate('sourceViewer.graphLabel'),
    saveLabel: "Save",
    saveIcon: "save",
    saveTitle: "Save source",
    showSaveAction: false,
    toggleIcon: "compress",
    onSourceAction: () => this.triggerSourceAction(),
    onShowGraph: () => emit(this, "source-viewer-show-graph", { path: this._currentPath }),
    onToggleMode: () => this.toggleMode(),
  };

  _currentPath = null;
  _fileData = null;
  _baseStatsText = "";
  _transformStatsText = "";
  _transformCache = null;
  _loadingTransform = false;
  _isReadable = true;
  _transformSource = null;
  _saveAction = null;
  _syntaxTheme = null;

  renderCallback() {
    this.sub("hasFile", (value) => {
      this.toggleAttribute("has-file", value);
    });
    this.sub("viewMode", (mode) => {
      const lang = this._fileData?.lang || getSourceLanguage(this._currentPath);
      this.toggleAttribute("mode-raw", mode === "source");
      if (lang === "md") {
        this.$.modeLabel = mode === "rendered" ? "rendered" : "source";
        this.$.toggleIcon = mode === "rendered" ? "article" : "code";
      } else {
        this.$.modeLabel = mode === "source" ? "source" : this._isReadable ? "compact" : "expanded";
        this.$.toggleIcon = this._isReadable ? "compress" : "open_in_full";
      }
    });
    for (const prop of ["statsText", "saveLabel", "graphLabel", "modeLabel", "saveTitle", "showGraphTitle", "toggleModeTitle"]) {
      this.sub(prop, () => this._syncHeaderText());
    }
    this._syncHeaderText();
  }

  getCodeBlock() {
    return this.querySelector("code-block");
  }

  setImageApiBase(base) {
    this.getCodeBlock()?.setImageApiBase(base);
  }

  showEmpty(filename = "Select a file") {
    this.$.filename = filename;
    this.$.hasFile = false;
    this.$.statsText = "";
    this.$.showToggle = false;
    this._currentPath = null;
    this._fileData = null;
    this._transformSource = null;
    this.setSaveAction(null);
    this.setSyntaxTheme(null);
    this.getCodeBlock()?.clearDiagnostics?.();
    this.getCodeBlock()?.clearContentSlots?.();
  }

  showDirectory(path, text) {
    this._showPlain(path, text, "directory");
  }

  showBinary(path, text = `// Binary file: ${path}\n// Cannot display binary content`) {
    this._showPlain(path, text, "binary");
  }

  showError(path, error) {
    const message = error instanceof Error ? error.message : String(error || "Unknown error");
    this._showPlain(path, `// Error: ${message}`, "error");
  }

  showImage(path) {
    this._resetForPath(path);
    this.setImageApiBase(this.getAttribute("image-api-base") || "");
    const codeBlock = this.getCodeBlock();
    if (codeBlock) {
      codeBlock.$.lang = "image";
      codeBlock.setBasePath(path);
      codeBlock.$.code = path;
    }
    this.$.viewMode = "rendered";
    this.$.modeLabel = "image";
    this.$.showToggle = false;
    this.$.hasFile = true;
  }

  showFile(options = {}) {
    const path = options.path || "";
    const lang = options.lang || getSourceLanguage(path);
    const raw = options.raw ?? options.code ?? "";
    let renderedRaw = options.renderedRaw ?? raw;
    this._resetForPath(path);
    this._isReadable = options.isReadable !== false;
    this._baseStatsText = options.statsText || "";
    this._transformSource = typeof options.transform === "function" ? options.transform : null;
    this._fileData = { raw, renderedRaw, lang };
    this.$.statsText = this._baseStatsText;
    this.setSaveAction(options.saveAction || options.save || null);
    this.setSyntaxTheme(options.syntaxTheme || { tokens: options.syntaxTokens });

    const codeBlock = this.getCodeBlock();
    if (lang === "md" || lang === "markdown") {
      this.$.viewMode = "rendered";
      this.$.modeLabel = "rendered";
      this.$.showToggle = true;
      if (codeBlock) {
        codeBlock.setContent(renderedRaw, "md", {
          basePath: path,
          syntaxTheme: this._syntaxTheme,
        });
      }
    } else {
      this.$.viewMode = "source";
      this.$.modeLabel = "source";
      this.$.showToggle = Boolean(this._transformSource);
      if (codeBlock) {
        codeBlock.setContent(raw, lang, { syntaxTheme: this._syntaxTheme });
      }
    }
    this.$.hasFile = true;
  }

  setSaveAction(action) {
    this._saveAction = normalizeSourceAction(action);
    this.$.showSaveAction = Boolean(this._saveAction);
    this.$.saveLabel = this._saveAction?.label || "Save";
    this.$.saveIcon = this._saveAction?.icon || "save";
    this.$.saveTitle = this._saveAction?.label || "Save source";
    this.toggleAttribute("has-save-action", Boolean(this._saveAction));
    return this._saveAction;
  }

  setSyntaxTheme(theme = null) {
    this._syntaxTheme = normalizeSourceSyntaxTheme(theme);
    applySourceSyntaxTheme(this, this._syntaxTheme);
    this.getCodeBlock()?.setSyntaxTheme?.(this._syntaxTheme);
    return this._syntaxTheme;
  }

  setSyntaxTokens(tokens = {}) {
    return this.setSyntaxTheme({ tokens });
  }

  _syncHeaderText() {
    this._setHeaderAttr(".sv-stats", "data-source-text", this.$.statsText);
    this._setHeaderAttr(".sv-save-label", "data-label", this.$.saveLabel);
    this._setHeaderAttr(".sv-graph-label", "data-label", this.$.graphLabel);
    this._setHeaderAttr(".sv-toggle-label", "data-label", this.$.modeLabel);
    this._setHeaderAttr(".sv-save-action", "aria-label", this.$.saveTitle || this.$.saveLabel);
    this._setHeaderAttr(".sv-graph-action", "aria-label", this.$.showGraphTitle || this.$.graphLabel);
    this._setHeaderAttr(".sv-toggle-action", "aria-label", this.$.toggleModeTitle || this.$.modeLabel);
  }

  _setHeaderAttr(selector, name, value) {
    const element = this.querySelector(selector);
    if (!element) return;
    const text = String(value || "").trim();
    if (text) {
      element.setAttribute(name, text);
    } else {
      element.removeAttribute(name);
    }
  }

  triggerSourceAction(extra = {}) {
    if (!this._saveAction || this._saveAction.disabled) return false;
    emit(this, "source-viewer-action", {
      action: this._saveAction,
      path: this._currentPath,
      language: this._fileData?.lang || getSourceLanguage(this._currentPath),
      content: this._fileData?.raw || "",
      ...extra,
    });
    return true;
  }

  async toggleMode() {
    if (!this._fileData) return;
    const lang = this._fileData.lang;
    if (lang === "md" || lang === "markdown") {
      this.$.viewMode = this.$.viewMode === "rendered" ? "source" : "rendered";
      await this._showCurrentMode();
      emit(this, "source-viewer-toggle-mode", { path: this._currentPath, mode: this.$.viewMode });
      return;
    }
    this.$.viewMode = this.$.viewMode === "source" ? "transformed" : "source";
    await this._showCurrentMode();
    emit(this, "source-viewer-toggle-mode", { path: this._currentPath, mode: this.$.viewMode });
  }

  async _showCurrentMode() {
    const codeBlock = this.getCodeBlock();
    if (!this._fileData || !codeBlock) return;
    const lang = this._fileData.lang;

    if (lang === "md" || lang === "markdown") {
      if (this.$.viewMode === "rendered") {
        codeBlock.setContent(this._fileData.renderedRaw, "md", {
          basePath: this._currentPath,
          syntaxTheme: this._syntaxTheme,
        });
      } else {
        codeBlock.setContent(this._fileData.raw, "plain", { syntaxTheme: this._syntaxTheme });
      }
      return;
    }

    if (this.$.viewMode !== "transformed") {
      this.$.statsText = this._baseStatsText;
      codeBlock.setContent(this._fileData.raw, lang, { syntaxTheme: this._syntaxTheme });
      return;
    }

    if (this._transformCache) {
      codeBlock.setContent(this._transformCache, lang, { syntaxTheme: this._syntaxTheme });
      if (this._transformStatsText) this.$.statsText = this._transformStatsText;
      return;
    }
    if (!this._transformSource || this._loadingTransform) return;

    this._loadingTransform = true;
    codeBlock.setContent(this._isReadable ? "// Compressing..." : "// Expanding...", lang, { syntaxTheme: this._syntaxTheme });
    try {
      const result = await this._transformSource({
        path: this._currentPath,
        lang,
        isReadable: this._isReadable,
        source: this._fileData.raw,
      });
      this._transformCache = result?.code || (this._isReadable ? "// Compression unavailable" : "// Expand unavailable");
      this._transformStatsText = result?.statsText || "";
      if (this._transformStatsText) this.$.statsText = this._transformStatsText;
      codeBlock.setContent(this._transformCache, lang, { syntaxTheme: this._syntaxTheme });
    } catch {
      codeBlock.setContent(this._isReadable ? "// Compression failed" : "// Expand failed", lang, { syntaxTheme: this._syntaxTheme });
    } finally {
      this._loadingTransform = false;
    }
  }

  _showPlain(path, text, label) {
    this._resetForPath(path);
    const codeBlock = this.getCodeBlock();
    if (codeBlock) {
      codeBlock.$.lang = "plain";
      codeBlock.$.code = text;
    }
    this.$.viewMode = "source";
    this.$.modeLabel = label;
    this.$.showToggle = false;
    this.$.hasFile = true;
  }

  _resetForPath(path) {
    this.$.filename = path || "Select a file";
    this.$.hasFile = false;
    this.$.statsText = "";
    this._baseStatsText = "";
    this._transformStatsText = "";
    this._transformCache = null;
    this._loadingTransform = false;
    this._currentPath = path;
    this._fileData = null;
    this.setSaveAction(null);
    this.setSyntaxTheme(null);
    this.getCodeBlock()?.clearDiagnostics?.();
    this.getCodeBlock()?.clearContentSlots?.();
  }

  renderContentSlots(composer) {
    return this.getCodeBlock()?.renderContentSlots?.(composer);
  }

  clearContentSlots() {
    this.getCodeBlock()?.clearContentSlots?.();
  }

  scrollToTop(options = {}) {
    this.getCodeBlock()?.scrollToTop?.(options);
  }

  scrollToFragment(id, options = {}) {
    this.getCodeBlock()?.scrollToFragment?.(id, options);
  }

  scrollToLine(line) {
    this.getCodeBlock()?.scrollToLine?.(line);
  }

  setDiagnostics(messages) {
    this.getCodeBlock()?.setDiagnostics?.(messages);
  }

  clearDiagnostics() {
    this.getCodeBlock()?.clearDiagnostics?.();
  }
}

SourceViewer.template = template;
SourceViewer.rootStyles = css;
SourceViewer.reg("source-viewer");
