// @ctx .context/web/components/code-block.ctx
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
} from "../../highlight.js";
import { baseUrl } from "../../app.js";

export class CodeBlock extends Symbiote {
  init$ = {
    code: "",
    lang: "js",
    highlighted: "",
    lineNums: "",
    isMarkdown: false,
    isImage: false,
    imageSrc: "",
    squiggles: [],
  };

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
        this.$.imageSrc = `${baseUrl}api/image?path=${encodeURIComponent(code)}`;
        this.$.highlighted = "";
        this.$.lineNums = "";
        return;
      }

      this.$.isImage = false;

      if (lang === "md" || lang === "markdown") {
        this.$.isMarkdown = true;
        this.$.highlighted = renderMarkdown(code, this._basePath || "");
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
  }

  setBasePath(path) {
    this._basePath = path;
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
