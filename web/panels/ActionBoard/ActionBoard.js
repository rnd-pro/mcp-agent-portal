import { Symbiote } from "@symbiotejs/symbiote";
import { state, events } from "../../dashboard-state.js";
import cssShared from "../../common/ui-shared.css.js";
import template from "./ActionBoard.tpl.js";
import "../EventItem/EventItem.js";

export class ActionBoard extends Symbiote {
  init$ = { eventsItems: [] };
  
  initCallback() {
    events.addEventListener("global-tool-event", () => {
      this.$.eventsItems = [...state.events].reverse();
    });
    this.$.eventsItems = [...state.events].reverse();
  }
}

ActionBoard.template = template;
ActionBoard.rootStyles = cssShared;
ActionBoard.reg("pg-action-board");