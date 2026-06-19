import { Symbiote } from '@symbiotejs/symbiote';
import 'symbiote-ui/display/code-block';
import template from './WorkflowCardMarkdown.tpl.js';
import css from './WorkflowCardMarkdown.css.js';
import {
  getWorkflowBoardSelection,
  selectionEvents,
} from './workflow-board-selection.js';

function preserveText(value, fallback = '') {
  let text = String(value ?? '').trim();
  return text || fallback;
}

function titleForCard(card = null) {
  return preserveText(card?.metadata?.markdownPath || card?.title, 'Work item markdown');
}

function bodyForCard(card = null) {
  return preserveText(
    card?.body || card?.raw?.body || card?.summary,
    'Select a workflow card to view its markdown body.',
  );
}

export class WorkflowCardMarkdown extends Symbiote {
  initCallback() {
    this._selectionHandler = (event) => this.renderSelection(event.detail);
    selectionEvents.addEventListener('workflow-board-selection-change', this._selectionHandler);
    this.renderSelection(getWorkflowBoardSelection());
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    if (this._selectionHandler) {
      selectionEvents.removeEventListener('workflow-board-selection-change', this._selectionHandler);
      this._selectionHandler = null;
    }
  }

  renderSelection(selection = null) {
    let card = selection?.card || null;
    this.ref.title.textContent = titleForCard(card);
    this.ref.viewer?.setContent?.(bodyForCard(card), 'markdown');
  }
}

WorkflowCardMarkdown.template = template;
WorkflowCardMarkdown.rootStyles = css;
WorkflowCardMarkdown.reg('pg-workflow-card-markdown');

export default WorkflowCardMarkdown;
