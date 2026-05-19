// @ctx .context/web/components/follow-ribbon.ctx
/**
 * FollowRibbon — Floating status bar that shows current agent action.
 * Appears at the bottom of the screen during Follow Mode.
 * Auto-fades after 4 seconds of inactivity.
 */
import Symbiote from '@symbiotejs/symbiote';
import { events } from '../../app.js';
import template from './FollowRibbon.tpl.js';
import css from './FollowRibbon.css.js';

export class FollowRibbon extends Symbiote {
  init$ = {
    statusText: '',
    visible: false,
  };

  _fadeTimer = null;

  initCallback() {
    // Event subscriptions are in renderCallback (after template mount)
  }

  renderCallback() {
    this.sub('visible', (v) => {
      this.toggleAttribute('visible', v);
    });

    events.addEventListener('follow-status-changed', (e) => {
      const text = e.detail?.text || '';
      if (!text) {
        this.$.visible = false;
        return;
      }
      this.$.statusText = text;
      this.$.visible = true;

      // Auto-fade after 4 seconds
      if (this._fadeTimer) clearTimeout(this._fadeTimer);
      this._fadeTimer = setTimeout(() => {
        this.$.visible = false;
      }, 4000);
    });

    events.addEventListener('follow-state-changed', (e) => {
      if (!e.detail?.enabled) {
        this.$.visible = false;
        this.$.statusText = '';
        if (this._fadeTimer) {
          clearTimeout(this._fadeTimer);
          this._fadeTimer = null;
        }
      }
    });
  }
}

FollowRibbon.template = template;
FollowRibbon.rootStyles = css;

FollowRibbon.reg('follow-ribbon');
