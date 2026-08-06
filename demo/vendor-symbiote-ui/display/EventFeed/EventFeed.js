import Symbiote from '@symbiotejs/symbiote';
import '../EmptyState/EmptyState.js';
import './EventFeedItem.js';
import template from './EventFeed.tpl.js';
import css from './EventFeed.css.js';
import { translate } from '../../locale/index.js';

function normalizeEvents(events) {
  return Array.isArray(events) ? events.filter((event) => event && typeof event === 'object') : [];
}

export class EventFeed extends Symbiote {
  init$ = {
    eventsList: [],
    eventCount: '0',
    hasEvents: false,
    emptyText: translate('eventFeed.empty'),
    title: translate('eventFeed.title'),
    showHeader: true,
  };

  #events = [];
  #maxItems = 100;

  setEvents(events = [], options = {}) {
    this.#maxItems = Number.isFinite(options.maxItems) ? Math.max(1, options.maxItems) : this.#maxItems;
    this.#events = normalizeEvents(events).slice(0, this.#maxItems);
    this.#render();
  }

  addEvent(event, options = {}) {
    this.#maxItems = Number.isFinite(options.maxItems) ? Math.max(1, options.maxItems) : this.#maxItems;
    this.#events.unshift(event);
    this.#events = normalizeEvents(this.#events).slice(0, this.#maxItems);
    this.#render();
  }

  clearEvents() {
    this.#events = [];
    this.#render();
  }

  getEvents() {
    return [...this.#events];
  }

  #render() {
    let count = this.#events.length;
    this.set$({
      eventCount: String(count),
      hasEvents: count > 0,
      eventsList: this.#events.map((event) => ({
        eventData: JSON.stringify(event),
      })),
    });
    this.toggleAttribute('empty', count === 0);
  }
}

EventFeed.template = template;
EventFeed.rootStyles = css;
EventFeed.reg('sn-event-feed');

export default EventFeed;
