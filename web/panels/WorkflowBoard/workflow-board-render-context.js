function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function dependencyCardId(dep) {
  if (typeof dep === 'string') return normalizeText(dep);
  return normalizeText(dep?.cardId ?? dep?.card_id);
}

function dependencySignature(dep) {
  if (typeof dep === 'string') return { cardId: normalizeText(dep) };
  let source = asObject(dep);
  return {
    cardId: dependencyCardId(source),
    releaseWhen: normalizeText(source.releaseWhen ?? source.release_when),
    onUpstreamFailure: normalizeText(source.onUpstreamFailure ?? source.on_upstream_failure),
    mode: normalizeText(source.mode),
  };
}

function queueSignature(queue = {}) {
  let source = asObject(queue);
  return {
    enqueuedAt: source.enqueuedAt ?? null,
    queueEpoch: source.queueEpoch ?? null,
    admissionId: source.admissionId ?? null,
    priority: source.priority ?? null,
    position: source.position ?? null,
  };
}

function buildCardIndex(cards) {
  let index = new Map();
  for (let card of cards) {
    let id = normalizeText(card?.id);
    if (id) index.set(id, card);
  }
  return index;
}

function buildDownstreamDependencyCounts(columns) {
  let counts = new Map();
  for (let column of columns) {
    for (let card of asArray(column.cards)) {
      for (let dep of asArray(card.raw?.dependsOn ?? card.dependsOn)) {
        let upstreamId = dependencyCardId(dep);
        if (upstreamId) counts.set(upstreamId, (counts.get(upstreamId) ?? 0) + 1);
      }
    }
  }
  return counts;
}

export function workflowBoardRenderScopeKey(scope = {}) {
  return JSON.stringify({
    scope: normalizeText(scope.scope),
    projectId: normalizeText(scope.projectId),
    boardId: normalizeText(scope.boardId),
    mode: normalizeText(scope.mode),
    goalId: normalizeText(scope.goalId),
    chatId: normalizeText(scope.chatId),
  });
}

export function createWorkflowBoardRenderContext(board = null, scope = {}) {
  let cards = asArray(board?.cards);
  let cardsById = buildCardIndex(cards);
  let goalId = normalizeText(scope.goalId);
  let chatId = normalizeText(scope.chatId);
  let visibleCards = cards
    .filter(card => !goalId || card.entityRefs?.goalId === goalId)
    .filter(card => !chatId || card.entityRefs?.chatId === chatId);
  let visibleCardById = buildCardIndex(visibleCards);
  let columns = asArray(board?.columns).map(column => ({
    ...column,
    cards: asArray(column.cards).filter(card => visibleCardById.has(normalizeText(card?.id))),
  }));
  let columnById = new Map(columns
    .map(column => [normalizeText(column?.id), column])
    .filter(([id]) => Boolean(id)));

  return {
    board,
    scope,
    cards,
    cardsById,
    visibleCards,
    visibleCardById,
    columns,
    columnById,
    downstreamDependencyCounts: buildDownstreamDependencyCounts(columns),
  };
}

export function buildWorkflowBoardProjectionFromContext(context = {}) {
  let board = context.board;
  let columns = asArray(context.columns);
  let cards = asArray(context.visibleCards);
  let projectionCards = cards.map((card) => {
    let raw = asObject(card.raw);
    return {
      id: card.id,
      columnId: card.columnId,
      title: card.title,
      priority: card.priority,
      status: card.status,
      lifecycle: raw.lifecycle ?? card.lifecycle ?? 'idle',
      dependsOn: raw.dependsOn ?? raw.depends_on ?? card.dependsOn ?? [],
      queue: raw.queue ?? card.queue ?? {},
    };
  });
  return {
    schema: 'workflow-board-projection/v2',
    boardId: board?.boardId || board?.id || '',
    board: {
      id: board?.boardId || board?.id || '',
      columns: columns.map(column => ({
        id: column.id,
        title: column.title,
        description: column.description || '',
        gate: column.gate || '',
        automation: column.automation || {},
      })),
      transitions: asArray(board?.transitions),
    },
    columns: columns.map(column => ({
      id: column.id,
      title: column.title,
      description: column.description || '',
      gate: column.gate || '',
      automation: column.automation || {},
      cards: asArray(column.cards)
        .map(card => projectionCards.find(item => item.id === card.id))
        .filter(Boolean),
    })),
    cards: projectionCards,
    version: board?.version ?? null,
  };
}

export function workflowBoardGraphTopologySignature(context = {}) {
  let board = context.board;
  let columns = asArray(context.columns);
  let cards = asArray(context.visibleCards);
  return JSON.stringify({
    boardId: normalizeText(board?.boardId || board?.id),
    scope: workflowBoardRenderScopeKey(context.scope),
    columns: columns.map(column => ({
      id: normalizeText(column.id),
      title: normalizeText(column.title),
      gate: normalizeText(column.gate),
      automation: asObject(column.automation),
      cardIds: asArray(column.cards).map(card => normalizeText(card?.id)).filter(Boolean),
    })),
    transitions: asArray(board?.transitions).map(transition => ({
      from: normalizeText(transition?.from),
      to: normalizeText(transition?.to),
      gate: normalizeText(transition?.gate),
      gates: asArray(transition?.gates).map(normalizeText).filter(Boolean),
    })),
    cards: cards.map((card) => {
      let raw = asObject(card.raw);
      return {
        id: normalizeText(card.id),
        title: normalizeText(card.title),
        columnId: normalizeText(card.columnId),
        priority: normalizeText(card.priority),
        lifecycle: normalizeText(raw.lifecycle ?? card.lifecycle ?? 'idle'),
        dependsOn: asArray(raw.dependsOn ?? raw.depends_on ?? card.dependsOn).map(dependencySignature),
        queue: queueSignature(raw.queue ?? card.queue),
      };
    }),
  });
}
