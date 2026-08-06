import Symbiote from "@symbiotejs/symbiote";
import template from "./CodeBlock.tpl.js";
import css from "./CodeBlock.css.js";
import {
  highlight as highlightJS,
  renderMarkdown,
  highlightSQL,
  highlightJSON,
  highlightCSS,
  highlightHTML,
  highlightYAML,
  highlightShell,
  highlightINI,
  highlightLang,
  highlightPlain,
} from "../highlight.js";
import {
  applySourceSyntaxTheme,
  normalizeSourceSyntaxTheme,
  normalizeSourceTokenMap,
} from "../source-contract.js";
import { translate } from "../../locale/index.js";

export class CodeBlock extends Symbiote {
  static observedAttributes = ["copyable", "language-label", "line-numbers", "frameless"];

  init$ = {
    code: "",
    lang: "js",
    highlighted: "",
    lineNums: "",
    isMarkdown: false,
    isImage: false,
    imageSrc: "",
    imageApiBase: "",
    squiggles: [],
    copyable: false,
    languageLabel: "",
    lineNumbers: "show",
    frameless: false,
    copyBtnText: translate("codeBlock.copy"),
    toolbarVisible: false,
  };

  _slotComposer = null;
  _slotObserver = null;
  _slotRoot = null;

  renderCallback() {
    this.sub("code", (code) => {
      if (!code) {
        this.$.highlighted = "";
        this.$.lineNums = "";
        return;
      }

      const lang = this.$.lang;

      if (lang === "image") {
        this.$.isMarkdown = false;
        this.$.isImage = true;
        this.$.imageSrc = this._resolveImageSrc(code);
        this.$.highlighted = "";
        this.$.lineNums = "";
        return;
      }

      this.$.isImage = false;

      if (lang === "md" || lang === "markdown") {
        this.$.isMarkdown = true;
        this.$.highlighted = renderMarkdown(code, { basePath: this._basePath || "" });
        this.$.lineNums = "";
      } else {
        this.$.isMarkdown = false;

        let highlighted;

        if (lang === "sql") {
          highlighted = highlightSQL(code);
        } else if (lang === "json") {
          try {
            highlighted = highlightJSON(JSON.stringify(JSON.parse(code), null, 2));
          } catch {
            highlighted = highlightJSON(code);
          }
        } else if (lang === "css") {
          highlighted = highlightCSS(code);
        } else if (lang === "html" || lang === "htm" || lang === "xml") {
          highlighted = highlightHTML(code);
        } else if (lang === "yaml" || lang === "yml") {
          highlighted = highlightYAML(code);
        } else if (lang === "sh" || lang === "bash") {
          highlighted = highlightShell(code);
        } else if (lang === "env" || lang === "ini" || lang === "conf" || lang === "cfg" || lang === "toml") {
          highlighted = highlightINI(code);
        } else if (
          lang === "python" ||
          lang === "ruby" ||
          lang === "go" ||
          lang === "rust" ||
          lang === "java" ||
          lang === "kotlin" ||
          lang === "swift" ||
          lang === "c" ||
          lang === "cpp" ||
          lang === "csharp" ||
          lang === "php" ||
          lang === "dart" ||
          lang === "lua" ||
          lang === "dockerfile"
        ) {
          highlighted = highlightLang(code, lang);
        } else if (lang === "typescript" || lang === "graphql" || lang === "prisma") {
          highlighted = highlightJS(code);
        } else if (lang === "plain" || lang === "txt" || lang === "csv") {
          highlighted = highlightPlain(code);
        } else {
          highlighted = highlightJS(code);
        }

        this.$.highlighted = highlighted;

        const lineCount = code.split("\n").length;
        const lineNums = [];

        for (let line = 1; line <= lineCount; line++) {
          lineNums.push(line);
        }

        this.$.lineNums = lineNums.join("\n");
      }
    });

    this.sub("isMarkdown", (value) => {
      this.toggleAttribute("mode-markdown", value);
    });

    this.sub("isImage", (value) => {
      this.toggleAttribute("mode-image", value);
    });

    this.sub("copyable", (val) => {
      this.toggleAttribute("copyable", !!val);
      this.$.toolbarVisible = !!val || !!this.$.languageLabel;
    });

    this.sub("languageLabel", (val) => {
      if (val) {
        this.setAttribute("language-label", val);
      } else {
        this.removeAttribute("language-label");
      }
      this.$.toolbarVisible = !!this.$.copyable || !!val;
    });

    this.sub("lineNumbers", (val) => {
      if (val === "hide") {
        this.setAttribute("line-numbers", "hide");
      } else {
        this.removeAttribute("line-numbers");
      }
    });

    this.sub("frameless", (val) => {
      this.toggleAttribute("frameless", !!val);
    });
  }

  get copyable() {
    return this.connectedOnce ? this.$.copyable : this.init$.copyable;
  }

  set copyable(val) {
    const boolVal = !!val;
    if (this.connectedOnce) {
      this.$.copyable = boolVal;
    } else {
      this.init$.copyable = boolVal;
    }
  }

  get languageLabel() {
    return this.connectedOnce ? this.$.languageLabel : this.init$.languageLabel;
  }

  set languageLabel(val) {
    const strVal = val || "";
    if (this.connectedOnce) {
      this.$.languageLabel = strVal;
    } else {
      this.init$.languageLabel = strVal;
    }
  }

  get lineNumbers() {
    const val = this.connectedOnce ? this.$.lineNumbers : this.init$.lineNumbers;
    return val === "hide" ? "hide" : "show";
  }

  set lineNumbers(val) {
    const norm = val === "hide" ? "hide" : "show";
    if (this.connectedOnce) {
      this.$.lineNumbers = norm;
    } else {
      this.init$.lineNumbers = norm;
    }
  }

  get frameless() {
    return this.connectedOnce ? this.$.frameless : this.init$.frameless;
  }

  set frameless(val) {
    const boolVal = !!val;
    if (this.connectedOnce) {
      this.$.frameless = boolVal;
    } else {
      this.init$.frameless = boolVal;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === "copyable") {
      this.copyable = newValue !== null;
    } else if (name === "language-label") {
      this.languageLabel = newValue;
    } else if (name === "line-numbers") {
      this.lineNumbers = newValue;
    } else if (name === "frameless") {
      this.frameless = newValue !== null;
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  setBasePath(path) {
    this._basePath = path;
  }

  setImageApiBase(base) {
    this.$.imageApiBase = base || "";
  }

  setContent(code, lang = "plain", options = {}) {
    if (options.basePath !== undefined) this.setBasePath(options.basePath);
    if (options.imageApiBase !== undefined) this.setImageApiBase(options.imageApiBase);
    if (options.syntaxTheme !== undefined || options.syntaxTokens !== undefined) {
      this.setSyntaxTheme(options.syntaxTheme || { tokens: options.syntaxTokens });
    }
    this.$.lang = lang || "plain";
    this.$.code = "";
    this.$.code = code || "";
  }

  setSyntaxTokens(tokens = {}) {
    this._syntaxTheme = normalizeSourceSyntaxTheme({ tokens: normalizeSourceTokenMap(tokens) });
    applySourceSyntaxTheme(this, this._syntaxTheme);
    return this._syntaxTheme;
  }

  setSyntaxTheme(theme = null) {
    this._syntaxTheme = normalizeSourceSyntaxTheme(theme);
    applySourceSyntaxTheme(this, this._syntaxTheme);
    return this._syntaxTheme;
  }

  _resolveImageSrc(src) {
    if (!src) return "";
    if (/^(https?:|data:|blob:|file:)/.test(src)) return src;
    let base = this.$.imageApiBase || this.getAttribute("image-api-base") || "";
    return base ? `${base}${encodeURIComponent(src)}` : src;
  }

  renderContentSlots(composer) {
    this._slotComposer = typeof composer === "function" ? composer : null;
    this._ensureSlotObserver();
    return this._composeSlots();
  }

  clearContentSlots() {
    this._slotComposer = null;
    this._slotObserver?.disconnect();
    this._slotObserver = null;
  }

  _ensureSlotObserver() {
    let root = this.querySelector(".cb-md");
    if (!root) return;
    if (this._slotRoot === root && this._slotObserver) return;
    this._slotObserver?.disconnect();
    this._slotObserver = new MutationObserver(() => this._composeSlots());
    this._slotObserver.observe(root, { childList: true });
    this._slotRoot = root;
  }

  _composeSlots() {
    if (!this._slotComposer) return [];
    this._ensureSlotObserver();
    let scrollRoot = this.querySelector(".cb-scroll");
    let slots = [];
    for (const slot of this.querySelectorAll(".cb-md .cb-content-slot[data-content-slot]")) {
      slot.replaceChildren();
      this._slotComposer(slot, slot.getAttribute("data-content-slot"), { scrollRoot });
      slots.push(slot);
    }
    return slots;
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this._slotObserver?.disconnect();
    this._slotObserver = null;
    if (this._copyTimer) {
      clearTimeout(this._copyTimer);
      this._copyTimer = null;
    }
  }

  setPresentation(options = {}) {
    if (options.copyable !== undefined) {
      this.copyable = options.copyable;
    }
    if (options.languageLabel !== undefined) {
      this.languageLabel = options.languageLabel;
    }
    if (options.lineNumbers !== undefined) {
      this.lineNumbers = options.lineNumbers;
    }
    if (options.frameless !== undefined) {
      this.frameless = options.frameless;
    }
  }

  async copyContent() {
    if (this._copyTimer) {
      clearTimeout(this._copyTimer);
      this._copyTimer = null;
    }
    const textToCopy = this.$.code;
    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard API not available');
      }
      await navigator.clipboard.writeText(textToCopy);
      this.$.copyBtnText = translate('codeBlock.copied');
      this._copyTimer = setTimeout(() => {
        this.$.copyBtnText = translate('codeBlock.copy');
      }, 2000);
      this.dispatchEvent(new CustomEvent('code-block-copy', {
        bubbles: true,
        composed: true,
        detail: {
          success: true,
          content: textToCopy,
        }
      }));
      return true;
    } catch (err) {
      this.$.copyBtnText = translate('codeBlock.copyFailed');
      this._copyTimer = setTimeout(() => {
        this.$.copyBtnText = translate('codeBlock.copy');
      }, 2000);
      this.dispatchEvent(new CustomEvent('code-block-copy', {
        bubbles: true,
        composed: true,
        detail: {
          success: false,
          error: err,
          content: textToCopy,
        }
      }));
      return false;
    }
  }

  scrollToTop(options = {}) {
    let scroll = this.querySelector('.cb-scroll');
    if (!scroll) return;

    scroll.scrollTo({
      top: 0,
      left: 0,
      behavior: this._resolveScrollBehavior(options),
    });
  }

  scrollToFragment(id, options = {}) {
    if (!id || typeof id !== "string") return;
    let scroll = this.querySelector(".cb-scroll");
    if (!scroll) return;

    let target = this._findRenderedElementById(scroll, id);
    if (!target) return;

    let scrollRect = scroll.getBoundingClientRect();
    let targetRect = target.getBoundingClientRect();
    let top = Math.max(0, (scroll.scrollTop || 0) + (targetRect.top - scrollRect.top));

    scroll.scrollTo({ top, behavior: this._resolveScrollBehavior(options) });
  }

  _findRenderedElementById(scroll, id) {
    for (const element of scroll.querySelectorAll("[id]")) {
      if (element.id === id) return element;
    }
    return null;
  }

  _resolveScrollBehavior(options) {
    if (options.behavior) return options.behavior;
    let reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return reduced ? "auto" : "smooth";
  }

  scrollToLine(line) {
    const pre = this.querySelector(".cb-pre");
    const scroll = this.querySelector(".cb-scroll");

    if (!pre || !scroll) return;

    const lineHeight = parseFloat(window.getComputedStyle(pre).lineHeight) || 19.2;

    scroll.scrollTo({
      top: Math.max(0, (line - 1) * lineHeight - scroll.clientHeight / 2 + lineHeight / 2),
      behavior: "smooth",
    });
  }

  setDiagnostics(messages) {
    this._diagnostics = messages;
    this._renderSquiggles();
  }

  clearDiagnostics() {
    this._diagnostics = [];
    this.$.squiggles = [];
  }

  _renderSquiggles() {
    const pre = this.querySelector(".cb-pre");
    const lineHeight = pre ? parseFloat(window.getComputedStyle(pre).lineHeight) || 19.2 : 19.2;
    const padTop = pre ? parseFloat(window.getComputedStyle(pre).paddingTop) || 12 : 12;
    const gutterW = this.querySelector(".cb-gutter")?.offsetWidth || 44;

    const squiggles = (this._diagnostics || []).map((diagnostic) => ({
      top: `${(diagnostic.line - 1) * lineHeight + padTop}px`,
      left: `${gutterW}px`,
      sevClass: `cb-sev-${diagnostic.severity}`,
      titleText: `${diagnostic.ruleId || "lint"}: ${diagnostic.message}`,
    }));

    this.$.squiggles = squiggles;
  }
}

CodeBlock.template = template;
CodeBlock.rootStyles = css;
CodeBlock.reg("code-block");

class CbSquiggle extends Symbiote {
  init$ = {
    top: "0px",
    left: "0px",
    sevClass: "",
    titleText: "",
  };

  renderCallback() {
    this.sub("sevClass", (className) => {
      this.className = `cb-squiggle ${className}`;
    });

    this.sub("top", (value) => {
      this.style.top = value;
    });

    this.sub("left", (value) => {
      this.style.left = value;
    });

    this.sub("titleText", (value) => {
      this.title = value;
    });
  }
}

CbSquiggle.reg("cb-squiggle");
