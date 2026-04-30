// @ctx .context/web/panels/EventItem/EventItem.ctx
import { Symbiote } from "@symbiotejs/symbiote";
import css from "./EventItem.css.js";
import tpl from "./EventItem.tpl.js";

export class EventItem extends Symbiote {
  init$ = {
    ts: 0,
    type: "",
    tool: "",
    args: null,
    duration_ms: 0,
    success: true,
    result_keys: [],
    expanded: false,
    icon: "arrow_right",
    detailsText: "",
    statusClass: "",
    durationText: "",
    _projectName: "",
  };

  renderCallback() {
    this.sub("ts", (val) => {
      this.ref.time.textContent = val
        ? new Date(val).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : "";
    });

    this.sub("type", (val) => {
      if (val === "tool_call") {
        this.$.icon = "call_made";
        this.$.statusClass = "call";
      } else if (val === "crash") {
        this.$.icon = "error";
        this.$.statusClass = "error";
      } else {
        this.$.icon = "call_received";
        this.$.statusClass = this.$.success ? "success" : "error";
      }
    });

    this.sub("statusClass", (val) => {
      if (this.ref.typeLabel) {
        this.ref.typeLabel.className = "event-type" + (val ? " " + val : "");
      }
    });

    this.sub("duration_ms", (val) => {
      this.$.durationText = val ? `${val}ms` : "";
    });

    this.sub("args", (val) => {
      if (val && typeof val === "object" && Object.keys(val).length > 0) {
        this.$.detailsText = JSON.stringify(val, null, 2);
      } else {
        this.$.detailsText = "";
      }
    });

    this.onclick = () => {
      if (this.$.detailsText || this.$.result_keys?.length) {
        this.$.expanded = !this.$.expanded;
        if (this.$.expanded) {
          this.setAttribute("expanded", "");
        } else {
          this.removeAttribute("expanded");
        }
      }
    };
  }
}

EventItem.template = tpl;
EventItem.shadowStyles = css;
EventItem.reg("pg-event-item");