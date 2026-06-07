// @ctx .context/web/panels/live-monitor.ctx
import Symbiote from "@symbiotejs/symbiote";
import "symbiote-ui/ui";
import { events as globalEvents } from "../../app.js";
import { toToolEventFeedItems } from "../../common/tool-event-feed-adapter.js";
import template from "./OpsPanel.tpl.js";
import css from "./OpsPanel.css.js";

export class OpsPanel extends Symbiote {
  _events = [];

  initCallback() {
    globalEvents.addEventListener("tool-event", (e) => this._addEvent(e.detail));
  }

  _addEvent(event) {
    this._events.unshift(event);
    if (this._events.length > 100) {
      this._events.pop();
    }
    this.ref.eventFeed?.setEvents(toToolEventFeedItems(this._events), { maxItems: 100 });
  }
}

OpsPanel.template = template;
OpsPanel.rootStyles = css;

OpsPanel.reg("pg-ops-panel");
