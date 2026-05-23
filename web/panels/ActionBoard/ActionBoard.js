import { Symbiote } from "@symbiotejs/symbiote";
import { state, events } from "../../dashboard-state.js";
import { sharedUiStyles as cssShared } from "symbiote-node/ui";
import { toToolEventFeedItems } from "../../common/tool-event-feed-adapter.js";
import template from "./ActionBoard.tpl.js";

export class ActionBoard extends Symbiote {
  init$ = { 
    eventsItems: [],
    fwTotal: '--',
    fwDuration: '--',
    fwSkills: '--'
  };
  
  initCallback() {
    events.addEventListener("global-tool-event", () => {
      this._renderEvents();
    });
    this._renderEvents();
    this._loadFlywheelStats();
  }

  _renderEvents() {
    this.ref.eventFeed?.setEvents(toToolEventFeedItems([...state.events].reverse()), { maxItems: 100 });
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
