/**
 * @fileoverview PanelMenu - Dropdown menu for panel type selection
 */

import Symbiote from '@symbiotejs/symbiote';
import { ensureMaterialSymbols } from '../../icons/MaterialSymbols.js';
import { bringOverlayToFront } from '../../ui/overlay-stack.js';
import { template } from './PanelMenu.tpl.js';
import { styles } from './PanelMenu.css.js';

export class PanelMenu extends Symbiote {
  static isoMode = true;

  init$ = {
    visible: false,
    panelId: '',
    items: [],
    currentType: '',

    onItemClick: (e) => {
      let type = e.target.closest('[data-type]')?.dataset.type;
      if (type) {
        this.dispatchEvent(
          new CustomEvent('panel-type-select', {
            bubbles: true,
            composed: true,
            detail: { panelId: this.$.panelId, type },
          })
        );
        this.hide();
      }
    },
  };

  /**
   * Show menu at position
   * @param {number} x
   * @param {number} y
   * @param {string} panelId
   * @param {string} currentType
   * @param {Array<{type: string, title: string, icon: string}>} items
   */
  show(x, y, panelId, currentType, items) {
    ensureMaterialSymbols(items.map((item) => item.icon || 'dashboard'));
    this.$.panelId = panelId;
    this.$.currentType = currentType;
    ensureMaterialSymbols(items.map((item) => item.icon || 'dashboard'));


    this.$.items = items.map((item) => ({
      ...item,
      icon: item.icon || 'dashboard',
      title: item.title || item.type,
      isActive: item.type === currentType,
    }));

    this.style.left = `${x}px`;
    this.style.top = `${y}px`;
    bringOverlayToFront(this);
    this.$.visible = true;


    if (typeof setTimeout !== 'undefined') {
      setTimeout(() => {
        if (typeof document !== 'undefined') {
          document.addEventListener('pointerdown', this._onOutsideClick);
        }
      }, 0);
    }
  }

  hide() {
    this.$.visible = false;
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', this._onOutsideClick);
    }
  }

  _onOutsideClick = (e) => {
    if (!this.contains(e.target)) {
      this.hide();
    }
  };

  disconnectedCallback() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', this._onOutsideClick);
    }
  }
}

PanelMenu.template = template;
PanelMenu.rootStyles = styles;

PanelMenu.reg('panel-menu');
