import { Symbiote } from '@symbiotejs/symbiote';
import 'symbiote-ui/ui';
import tpl from './NotificationEditorPanel.tpl.js';
import css from './NotificationEditorPanel.css.js';

/**
 * Workspace-panel host for the full notification settings editor — the
 * counterpart the compact <notification-widget> hands off to via its open-full
 * action, exactly as the theme widget opens the cascade theme editor panel.
 */
export class NotificationEditorPanel extends Symbiote {
  renderCallback() {
    // Follow the portal's active interface locale so the editor's labels and
    // phrase bank match the UI language rather than the browser default.
    let locale = typeof document !== 'undefined' ? document.documentElement?.lang : '';
    if (locale && this.ref?.editor) this.ref.editor.setAttribute('locale', locale);
  }
}

NotificationEditorPanel.template = tpl;
NotificationEditorPanel.rootStyles = css;
NotificationEditorPanel.reg('pg-notification-editor-panel');
