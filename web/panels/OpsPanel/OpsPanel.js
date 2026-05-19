// @ctx .context/web/panels/live-monitor.ctx
import Symbiote from "@symbiotejs/symbiote";
import { events as globalEvents } from "../../app.js";
import template from "./OpsPanel.tpl.js";
import css from "./OpsPanel.css.js";

import "../../components/event-feed/CodeWidget.js";
import "../../components/event-feed/MiniGraphWidget.js";
import "../../components/event-feed/ListWidget.js";
import "../../components/event-feed/EventWidget.js";

export class OpsPanel extends Symbiote {
  init$ = {
    eventCount: "0",
    eventsList: []
  };

  _events = [];

  initCallback() {
    globalEvents.addEventListener("tool-event", (e) => this._addEvent(e.detail));
  }

  _addEvent(event) {
    this._events.unshift(event);
    if (this._events.length > 100) {
      this._events.pop(); // Keep max 100 for performance
    }
    
    this.$.eventCount = String(this._events.length);
    
    // Update the itemize list reactively
    this.$.eventsList = this._events.map(ev => ({
      eventData: JSON.stringify(ev)
    }));
  }
}

OpsPanel.template = template;
OpsPanel.rootStyles = css;

OpsPanel.reg("pg-ops-panel");
