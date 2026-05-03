import { Symbiote } from "@symbiotejs/symbiote";
import cssLocal from "./ProjectItem.css.js";
import cssShared from "../../common/ui-shared.css.js";
import template from "./ProjectItem.tpl.js";
import { uiConfirm } from '../../common/ui-dialogs.js';

export class ProjectItem extends Symbiote {
  init$ = { prefix: "", projectName: "", projectPath: "" };

  renderCallback() {
    this.sub("prefix", (e) => {
      this.ref.link.href = e ? `${e}/` : "#";
    });
    this.ref.deleteBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const prefix = this.$.prefix;
      if (!prefix || !(await uiConfirm(`Remove ${this.$.projectName}?`))) return;
      await fetch("/api/remove-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route: prefix }),
      });
      this.remove();
    });
  }
}

ProjectItem.template = template;
ProjectItem.rootStyles = cssShared + cssLocal;
ProjectItem.reg("pg-project-item");