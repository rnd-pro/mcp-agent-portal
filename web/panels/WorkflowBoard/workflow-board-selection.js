const selectionEvents = new EventTarget();
let currentSelection = null;

export function setWorkflowBoardSelection(selection = null, options = {}) {
  if (!selection?.card && currentSelection?.card && options.preserveEmpty !== false) {
    return currentSelection;
  }
  currentSelection = selection;
  selectionEvents.dispatchEvent(new CustomEvent('workflow-board-selection-change', {
    detail: currentSelection,
  }));
  return currentSelection;
}

export function getWorkflowBoardSelection() {
  return currentSelection;
}

export { selectionEvents };
