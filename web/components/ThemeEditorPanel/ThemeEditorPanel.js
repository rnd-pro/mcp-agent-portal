import { Symbiote } from '@symbiotejs/symbiote';
import 'symbiote-ui/ui';
import tpl from './ThemeEditorPanel.tpl.js';
import css from './ThemeEditorPanel.css.js';

export class ThemeEditorPanel extends Symbiote {}

ThemeEditorPanel.template = tpl;
ThemeEditorPanel.rootStyles = css;
ThemeEditorPanel.reg('pg-theme-editor-panel');
