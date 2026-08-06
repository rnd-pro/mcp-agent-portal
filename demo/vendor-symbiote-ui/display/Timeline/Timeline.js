import Symbiote from '@symbiotejs/symbiote';
import { timelineTemplate, timelineItemTemplate } from './Timeline.tpl.js';
import css from './Timeline.css.js';

export class Timeline extends Symbiote {
  connectedCallback() {
    super.connectedCallback?.();
  }
}

Timeline.template = timelineTemplate;
Timeline.rootStyles = css;
Timeline.reg('sn-timeline');

export class TimelineItem extends Symbiote {
  static observedAttributes = ['title', 'time', 'variant'];

  init$ = {
    title: '',
    time: '',
    variant: 'neutral',
  };

  connectedCallback() {
    super.connectedCallback?.();
    // Hydrate $ from pre-set attributes
    if (this.hasAttribute('title')) {
      this.$.title = this.getAttribute('title');
    }
    if (this.hasAttribute('time')) {
      this.$.time = this.getAttribute('time');
    }
    if (this.hasAttribute('variant')) {
      this.$.variant = this.getAttribute('variant');
    }
    this.#syncState();
  }

  get title() {
    return this.getAttribute('title') || '';
  }

  set title(val) {
    this.setAttribute('title', val);
  }

  get time() {
    return this.getAttribute('time') || '';
  }

  set time(val) {
    this.setAttribute('time', val);
  }

  get variant() {
    return this.getAttribute('variant') || 'neutral';
  }

  set variant(val) {
    this.setAttribute('variant', val);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'title') {
      this.$.title = newValue || '';
    } else if (name === 'time') {
      this.$.time = newValue || '';
    } else if (name === 'variant') {
      this.#syncState();
    } else {
      super.attributeChangedCallback?.(name, oldValue, newValue);
    }
  }

  // Reflect a valid variant onto the attribute that drives the [variant=...] styles.
  // The attribute is the source of truth for parsed/innerHTML markup, where
  // attributeChangedCallback can run before init$ has populated $ — so resolve from
  // it first and never write back a missing value as the literal "null" string.
  // title/time live only in $ (read by the template, not reflected), so they don't
  // need this guard.
  #syncState() {
    let variant = this.getAttribute('variant') || this.$.variant || 'neutral';
    if (variant === 'null' || variant === 'undefined') {
      variant = 'neutral';
    }
    if (this.$.variant !== variant) {
      this.$.variant = variant;
    }
    if (this.getAttribute('variant') !== variant) {
      this.setAttribute('variant', variant);
    }
  }
}

TimelineItem.template = timelineItemTemplate;
TimelineItem.reg('sn-timeline-item');

export default Timeline;
