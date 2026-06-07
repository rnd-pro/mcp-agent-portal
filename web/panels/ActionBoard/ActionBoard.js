import { Symbiote } from "@symbiotejs/symbiote";
import { state, events } from "../../dashboard-state.js";
import { sharedUiStyles as cssShared } from "symbiote-ui/ui";
import { toToolEventFeedItems } from "../../common/tool-event-feed-adapter.js";
import { tPortal } from "../../common/localization.js";
import template from "./ActionBoard.tpl.js";
import cssLocal from "./ActionBoard.css.js";

const EMPTY_ACTIVITY_TEXT = tPortal('text.noToolActivity');

function formatEventTime(event) {
  let value = event?.timestamp || event?.time || event?.createdAt || event?.updatedAt;
  if (!value) return tPortal('text.waitingForActivity');
  let date = new Date(value);
  if (Number.isNaN(date.getTime())) return tPortal('text.activityReceived');
  return tPortal('text.lastEventAt', {
    time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });
}

export class ActionBoard extends Symbiote {
  init$ = { 
    eventsItems: [],
    fwTotal: tPortal('text.loadingPlain'),
    fwDuration: tPortal('text.loadingPlain'),
    fwSkills: tPortal('text.loadingPlain'),
    eventsCount: '0',
    feedSummary: tPortal('text.noEvents'),
    lastUpdatedText: tPortal('text.waitingForActivity'),
    runtimeStatus: tPortal('text.loadingPlain'),
    statusText: tPortal('text.loadingOperationalSummary'),
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
    this.$.feedSummary = count ? tPortal('text.recentCount', { count }) : tPortal('text.noEvents');
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
      this.$.runtimeStatus = tPortal('text.demoRuntime');
      this.$.statusText = tPortal('text.operationalSummaryCurrent');
      if (data.last_updated) {
        this.$.lastUpdatedText = formatEventTime({ timestamp: data.last_updated });
      }
      this._setStatusBanner('');
    } catch(e) {
      this.$.fwTotal = '--';
      this.$.fwDuration = '--';
      this.$.fwSkills = '--';
      if (this.ref.durationUnit) this.ref.durationUnit.hidden = true;
      this.$.runtimeStatus = tPortal('text.statsUnavailable');
      this.$.statusText = tPortal('text.activityFeedAvailable');
      this._setStatusBanner(tPortal('text.operationalStatsUnavailable'));
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
