import { StatusRibbon } from 'symbiote-node/ui';
import { events } from '../../app.js';
import css from './FollowRibbon.css.js';

export class FollowRibbon extends StatusRibbon {
  initCallback() {
    super.initCallback();
    this.eventTarget = events;
  }
}

FollowRibbon.rootStyles = css;
FollowRibbon.reg('follow-ribbon');

