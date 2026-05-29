import { Symbiote } from "@symbiotejs/symbiote";
import { state, events } from "../../dashboard-state.js";
import { sharedUiStyles as cssShared } from "symbiote-node/ui";
import { toToolEventFeedItems } from "../../common/tool-event-feed-adapter.js";
import template from "./ActionBoard.tpl.js";
import cssLocal from "./ActionBoard.css.js";

const EMPTY_ACTIVITY_TEXT = 'No tool activity in this demo session yet';

function formatEventTime(event) {
  let value = event?.timestamp || event?.time || event?.createdAt || event?.updatedAt;
  if (!value) return 'Waiting for activity';
  let date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Activity received';
  return `Last event ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export class ActionBoard extends Symbiote {
  init$ = { 
    eventsItems: [],
    fwTotal: 'Loading',
    fwDuration: 'Loading',
    fwSkills: 'Loading',
    eventsCount: '0',
    feedSummary: 'No events',
    lastUpdatedText: 'Waiting for activity',
    runtimeStatus: 'Loading',
    statusText: 'Loading operational summary',
  };
  
  initCallback() {
    this._onGlobalToolEvent = () => {
      this._renderEvents();
    };
    events.addEventListener("global-tool-event", this._onGlobalToolEvent);
    this._renderEvents();
    this._loadFlywheelStats();
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    events.removeEventListener("global-tool-event", this._onGlobalToolEvent);
  }

  _renderEvents() {
    let rawEvents = [...state.events].reverse();
    let feedItems = toToolEventFeedItems(rawEvents);
    this.ref.eventFeed?.set$?.({ emptyText: EMPTY_ACTIVITY_TEXT });
    this.ref.eventFeed?.setEvents(feedItems, { maxItems: 100 });
    let count = feedItems.length;
    this.$.eventsCount = String(count);
    this.$.feedSummary = count ? `${count} recent` : 'No events';
    this.$.lastUpdatedText = formatEventTime(rawEvents[0]);
    if (this.ref.feedEmpty) {
      this.ref.feedEmpty.hidden = true;
    }
  }
  
  async _loadFlywheelStats() {
    try {
      const res = await fetch('/api/flywheel/stats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.$.fwTotal = String(data.total_calls ?? 0);
      this.$.fwDuration = String(data.avg_duration_ms ?? 0);
      this.$.fwSkills = String(data.skills_created ?? 0);
      if (this.ref.durationUnit) this.ref.durationUnit.hidden = false;
      this.$.runtimeStatus = 'Demo runtime';
      this.$.statusText = 'Operational summary is current';
      if (data.last_updated) {
        this.$.lastUpdatedText = formatEventTime({ timestamp: data.last_updated });
      }
      this._setStatusBanner('');
    } catch(e) {
      this.$.fwTotal = '--';
      this.$.fwDuration = '--';
      this.$.fwSkills = '--';
      if (this.ref.durationUnit) this.ref.durationUnit.hidden = true;
      this.$.runtimeStatus = 'Stats unavailable';
      this.$.statusText = 'Activity feed remains available';
      this._setStatusBanner('Operational stats are unavailable. Activity feed remains available.');
      console.warn('[ActionBoard] Could not load flywheel stats', e);
    }
  }

  _setStatusBanner(message) {
    if (!this.ref.statusBanner) return;
    this.ref.statusBanner.textContent = message;
    this.ref.statusBanner.hidden = !message;
  }
}

ActionBoard.template = template;
ActionBoard.rootStyles = cssShared + cssLocal;
ActionBoard.reg("pg-action-board");
