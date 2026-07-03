const DECISION_COLUMN_ID = 'needs-decision';

function text(value, fallback = '') {
  let out = String(value ?? '').trim();
  return out || fallback;
}

function escalationState(card) {
  let state = card?.metadata?.escalation ?? card?.raw?.metadata?.escalation;
  return state && typeof state === 'object' ? state : null;
}

function needsHumanEscalation(card) {
  let state = escalationState(card);
  if (!state) return null;
  let kind = state.kind || state.lastEscalation?.kind;
  if (String(kind) !== 'needs_human' || state.humanEscalated) return null;
  return state;
}

function optionModel(option = {}) {
  let id = text(option.id);
  if (!id) return null;
  return { id, label: text(option.label, id) };
}

export function createInspectorDecisionModel(card = {}) {
  let state = needsHumanEscalation(card);
  let inLane = (card.columnId || card.raw?.columnId) === DECISION_COLUMN_ID;
  if (!state && !inLane) {
    return {
      visible: false,
      inLane,
      question: '',
      options: [],
      signature: '',
    };
  }
  let options = (Array.isArray(state?.lastEscalation?.options) ? state.lastEscalation.options : [])
    .map(optionModel)
    .filter(Boolean);
  let question = text(state?.detail || state?.lastEscalation?.detail);
  return {
    visible: true,
    inLane,
    question,
    options,
    signature: JSON.stringify({
      inLane,
      detail: question,
      options: options.map(option => [option.id, option.label]),
    }),
  };
}
