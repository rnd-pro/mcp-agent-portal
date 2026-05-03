import { Symbiote } from "@symbiotejs/symbiote";
import { state, events } from "../../dashboard-state.js";
import cssShared from "../../common/ui-shared.css.js";
import template from "./ActionBoard.tpl.js";
import "../EventItem/EventItem.js";

export class ActionBoard extends Symbiote {
  init$ = { 
    eventsItems: [],
    fwTotal: '--',
    fwDuration: '--',
    fwSkills: '--'
  };
  
  initCallback() {
    events.addEventListener("global-tool-event", () => {
      this.$.eventsItems = [...state.events].reverse();
    });
    this.$.eventsItems = [...state.events].reverse();
    this._loadFlywheelStats();
  }
  
  async _loadFlywheelStats() {
    try {
      const res = await fetch('/api/flywheel/stats');
      const data = await res.json();
      this.$.fwTotal = data.total_calls ?? '--';
      this.$.fwDuration = data.avg_duration_ms ?? '--';
      this.$.fwSkills = data.skills_created ?? '--';
    } catch(e) {
      console.warn('[ActionBoard] Could not load flywheel stats', e);
    }
  }
}

ActionBoard.template = template;
ActionBoard.rootStyles = cssShared;
ActionBoard.reg("pg-action-board");