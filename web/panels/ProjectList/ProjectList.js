import { Symbiote } from "@symbiotejs/symbiote";
import { state, events } from "../../dashboard-state.js";
import cssShared from "../../common/ui-shared.css.js";
import template from "./ProjectList.tpl.js";
import "../ProjectItem/ProjectItem.js";

export class ProjectList extends Symbiote {
  init$ = { projects: [], hasProjects: false };

  initCallback() {
    events.addEventListener("projects-updated", (evt) => {
      this.$.projects = evt.detail;
      this.$.hasProjects = evt.detail.length > 0;
    });
    this.$.projects = state.projects;
    this.$.hasProjects = state.projects.length > 0;
  }

  renderCallback() {
    this.sub("hasProjects", (has) => {
      this.ref.emptyMsg.hidden = has;
    });
  }
}

ProjectList.template = template;
ProjectList.rootStyles = cssShared;
ProjectList.reg("pg-project-list");