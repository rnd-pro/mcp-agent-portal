// @ctx .context/web/components/quick-open.ctx
import Symbiote from "@symbiotejs/symbiote";
import template from "./QuickOpen.tpl.js";
import css from "./QuickOpen.css.js";
import { state, events, emit } from "../../app.js";

export class QuickOpen extends Symbiote {
  init$ = {
    visible: false,
    query: "",
    resultsHTML: "",
    selectedIdx: 0,
  };

  _results = [];
  _allFiles = [];

  renderCallback() {
    events.addEventListener("skeleton-loaded", (e) => this._collectFiles(e.detail));

    if (state.skeleton) {
      this._collectFiles(state.skeleton);
    }

    this._overlay = this.querySelector(".qo-overlay");
    this._overlay.addEventListener("click", (e) => {
      if (e.target === this._overlay) {
        this._close();
      }
    });

    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        this._toggle();
      }

      if (e.key === "Escape" && this.$.visible) {
        e.preventDefault();
        this._close();
      }
    });

    this.sub("visible", (visible) => {
      if (!this._overlay) return;

      this._overlay.hidden = !visible;

      if (visible) {
        requestAnimationFrame(() => {
          const input = this.querySelector(".qo-input");

          if (input) {
            input.value = "";
            input.focus();
          }
        });
      }
    });
  }

  _collectFiles(skeleton) {
    const files = new Set();

    for (const file of Object.keys(skeleton.X || {})) {
      files.add(file);
    }

    for (const node of Object.values(skeleton.n || {})) {
      if (node.f) {
        files.add(node.f);
      }
    }

    for (const [dir, entries] of Object.entries(skeleton.f || {})) {
      for (const file of entries) {
        files.add(dir === "./" ? file : `${dir}${file}`);
      }
    }

    for (const [dir, entries] of Object.entries(skeleton.a || {})) {
      for (const file of entries) {
        files.add(dir === "./" ? file : `${dir}${file}`);
      }
    }

    this._allFiles = [...files].sort();
  }

  _toggle() {
    this.$.visible = !this.$.visible;

    if (this.$.visible) {
      this.$.query = "";
      this.$.selectedIdx = 0;
      this._search("");
    }
  }

  _close() {
    this.$.visible = false;
  }

  _onInput(e) {
    this.$.query = e.target.value;
    this.$.selectedIdx = 0;
    this._search(this.$.query);
  }

  _onKeydown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.$.selectedIdx = Math.min(this.$.selectedIdx + 1, this._results.length - 1);
      this._renderResults();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.$.selectedIdx = Math.max(this.$.selectedIdx - 1, 0);
      this._renderResults();
    } else if (e.key === "Enter") {
      e.preventDefault();

      const result = this._results[this.$.selectedIdx];

      if (result) {
        this._close();
        state.activeFile = result.file;
        emit("file-selected", { path: result.file });

        if (location.hash.startsWith("#explorer")) {
          history.replaceState(null, "", `#explorer/${result.file}`);
        } else {
          location.hash = `explorer/${result.file}`;
        }
      }
    }
  }

  _search(query) {
    const normalizedQuery = query.toLowerCase().trim();

    if (normalizedQuery) {
      const results = [];

      for (const file of this._allFiles) {
        const score = QuickOpen._fuzzyScore(normalizedQuery, file.toLowerCase());

        if (score > 0) {
          results.push({ file, score });
        }
      }

      results.sort((a, b) => b.score - a.score);
      this._results = results.slice(0, 15);
    } else {
      this._results = this._allFiles.slice(0, 15).map((file) => ({ file, score: 0 }));
    }

    this._renderResults();
  }

  static _fuzzyScore(query, candidate) {
    if (candidate.includes(query)) {
      return 100 + (query.length / candidate.length) * 50;
    }

    let queryIdx = 0;
    let streak = 0;
    let score = 0;

    for (let i = 0; i < candidate.length && queryIdx < query.length; i++) {
      if (candidate[i] === query[queryIdx]) {
        queryIdx++;
        score += 10 + streak;
        streak += 5;

        if (i === 0 || candidate[i - 1] === "/" || candidate[i - 1] === "-" || candidate[i - 1] === ".") {
          score += 15;
        }
      } else {
        streak = 0;
      }
    }

    return queryIdx === query.length ? score : 0;
  }

  _renderResults() {
    if (this._results.length === 0) {
      this.$.resultsHTML = '<div class="qo-empty">No files found</div>';
      return;
    }

    const html = [];

    for (let i = 0; i < this._results.length; i++) {
      const { file } = this._results[i];
      const name = file.split("/").pop();
      const path = file.includes("/") ? file.substring(0, file.lastIndexOf("/")) : "";
      const selectedClass = i === this.$.selectedIdx ? " qo-selected" : "";

      html.push(`<div class="qo-item${selectedClass}" data-idx="${i}" data-file="${file}">
        <span class="qo-name">${name}</span>
        <span class="qo-path">${path}</span>
      </div>`);
    }

    this.$.resultsHTML = html.join("");
  }
}

QuickOpen.template = template;
QuickOpen.rootStyles = css;
QuickOpen.reg("pg-quick-open");
