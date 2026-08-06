/**
 * Localized, randomized phrase bank for spoken notification narration.
 *
 * Pure, Node-safe template selection: given an event type, parameters, locale
 * and depth, pick one of several phrasings and interpolate `{param}` slots.
 * Randomness is injectable so selection is deterministic under test.
 */

import { interpolateLocaleMessage, normalizeLocale, DEFAULT_LOCALE } from '../locale/index.js';

export const NOTIFICATION_EVENT_TYPES = Object.freeze([
  'task.created',
  'task.moved',
  'task.started',
  'task.completed',
  'task.failed',
  'task.blocked',
  'approval.required',
  'agent.message',
  'generic',
]);

export const NARRATION_DEPTHS = Object.freeze(['terse', 'chatty']);
export const DEFAULT_NARRATION_DEPTH = 'terse';
export const DEFAULT_NARRATION_EVENT = 'generic';

/**
 * Phrase bank: locale -> event type -> depth -> variant templates.
 * Templates use the locale `{slot}` interpolation syntax.
 */
const PHRASE_BANK = Object.freeze({
  en: {
    'task.created': {
      terse: ['New task {title}', '{title} added'],
      chatty: ['A new task, {title}, just landed.', 'Heads up — task {title} was created.'],
    },
    'task.moved': {
      terse: ['{title} → {stage}', '{title} now in {stage}', '{title} moved to {stage}'],
      chatty: [
        'Task {title} has moved to {stage}.',
        'Heads up: {title} is now in {stage}.',
        '{title} just advanced to {stage}.',
      ],
    },
    'task.started': {
      terse: ['{title} started', 'Running {title}'],
      chatty: ['Task {title} is now running.', 'Work has started on {title}.'],
    },
    'task.completed': {
      terse: ['{title} done', '{title} completed'],
      chatty: ['Task {title} is complete.', 'All done — {title} finished successfully.'],
    },
    'task.failed': {
      terse: ['{title} failed', '{title} errored'],
      chatty: ['Task {title} has failed.', 'Heads up — {title} ran into an error.'],
    },
    'task.blocked': {
      terse: ['{title} blocked', '{title} needs help'],
      chatty: ['Task {title} is blocked and needs attention.', '{title} is stuck — it needs a hand.'],
    },
    'approval.required': {
      terse: ['Approve {title}?', '{title} needs approval'],
      chatty: ['Task {title} is waiting for your approval.', '{title} needs you to approve it before it continues.'],
    },
    'agent.message': {
      terse: ['New reply', 'Agent replied'],
      chatty: ['The agent has a new reply for you.', 'There is a fresh message from the agent.'],
    },
    generic: {
      terse: ['{message}'],
      chatty: ['{message}'],
    },
  },
  ru: {
    'task.created': {
      terse: ['Новая задача {title}', '{title} добавлена'],
      chatty: ['Появилась новая задача — {title}.', 'Создана задача {title}.'],
    },
    'task.moved': {
      terse: ['{title} → {stage}', '{title} теперь в {stage}', '{title} перемещена в {stage}'],
      chatty: [
        'Задача {title} перемещена в {stage}.',
        'Внимание: {title} теперь в этапе {stage}.',
        '{title} перешла на этап {stage}.',
      ],
    },
    'task.started': {
      terse: ['{title} запущена', 'Выполняется {title}'],
      chatty: ['Задача {title} запущена.', 'Началась работа над {title}.'],
    },
    'task.completed': {
      terse: ['{title} готова', '{title} завершена'],
      chatty: ['Задача {title} завершена.', 'Готово — {title} успешно выполнена.'],
    },
    'task.failed': {
      terse: ['{title} провалена', 'Ошибка в {title}'],
      chatty: ['Задача {title} завершилась с ошибкой.', 'Внимание — {title} столкнулась с ошибкой.'],
    },
    'task.blocked': {
      terse: ['{title} заблокирована', '{title} нужна помощь'],
      chatty: ['Задача {title} заблокирована и требует внимания.', '{title} застряла — нужна помощь.'],
    },
    'approval.required': {
      terse: ['Подтвердить {title}?', '{title} ждёт подтверждения'],
      chatty: ['Задача {title} ждёт вашего подтверждения.', '{title} нужно подтвердить, чтобы продолжить.'],
    },
    'agent.message': {
      terse: ['Новый ответ', 'Агент ответил'],
      chatty: ['У агента есть новый ответ для вас.', 'Пришло свежее сообщение от агента.'],
    },
    generic: {
      terse: ['{message}'],
      chatty: ['{message}'],
    },
  },
  es: {
    'task.created': {
      terse: ['Nueva tarea {title}', '{title} añadida'],
      chatty: ['Acaba de llegar una nueva tarea, {title}.', 'Se ha creado la tarea {title}.'],
    },
    'task.moved': {
      terse: ['{title} → {stage}', '{title} ahora en {stage}', '{title} movida a {stage}'],
      chatty: [
        'La tarea {title} se ha movido a {stage}.',
        'Atención: {title} está ahora en {stage}.',
        '{title} avanzó a {stage}.',
      ],
    },
    'task.started': {
      terse: ['{title} iniciada', 'Ejecutando {title}'],
      chatty: ['La tarea {title} está en marcha.', 'Ha comenzado el trabajo en {title}.'],
    },
    'task.completed': {
      terse: ['{title} lista', '{title} completada'],
      chatty: ['La tarea {title} está completada.', 'Listo — {title} terminó correctamente.'],
    },
    'task.failed': {
      terse: ['{title} falló', 'Error en {title}'],
      chatty: ['La tarea {title} ha fallado.', 'Atención — {title} encontró un error.'],
    },
    'task.blocked': {
      terse: ['{title} bloqueada', '{title} necesita ayuda'],
      chatty: ['La tarea {title} está bloqueada y necesita atención.', '{title} está atascada — necesita ayuda.'],
    },
    'approval.required': {
      terse: ['¿Aprobar {title}?', '{title} necesita aprobación'],
      chatty: ['La tarea {title} espera tu aprobación.', '{title} necesita tu aprobación para continuar.'],
    },
    'agent.message': {
      terse: ['Nueva respuesta', 'El agente respondió'],
      chatty: ['El agente tiene una nueva respuesta para ti.', 'Hay un mensaje nuevo del agente.'],
    },
    generic: {
      terse: ['{message}'],
      chatty: ['{message}'],
    },
  },
});

function normalizeEventType(type) {
  return NOTIFICATION_EVENT_TYPES.includes(type) ? type : DEFAULT_NARRATION_EVENT;
}

function normalizeDepth(depth) {
  return NARRATION_DEPTHS.includes(depth) ? depth : DEFAULT_NARRATION_DEPTH;
}

function resolveVariants(locale, type, depth) {
  let localeBank = PHRASE_BANK[locale] || PHRASE_BANK[DEFAULT_LOCALE];
  let eventBank = localeBank[type] || PHRASE_BANK[DEFAULT_LOCALE][type] || PHRASE_BANK[DEFAULT_LOCALE][DEFAULT_NARRATION_EVENT];
  let variants = eventBank[depth] || eventBank[DEFAULT_NARRATION_DEPTH];
  return variants && variants.length > 0 ? variants : PHRASE_BANK[DEFAULT_LOCALE].generic[DEFAULT_NARRATION_DEPTH];
}

function pickIndex(length, random) {
  let value = typeof random === 'function' ? random() : Math.random();
  if (!Number.isFinite(value)) value = 0;
  let index = Math.floor(value * length);
  if (index < 0) index = 0;
  if (index >= length) index = length - 1;
  return index;
}

/**
 * List all phrase variants for a given event/locale/depth (without interpolation).
 * Useful for snapshotting and tests.
 */
export function listNarrationVariants({ type, locale, depth } = {}) {
  return [...resolveVariants(normalizeLocale(locale), normalizeEventType(type), normalizeDepth(depth))];
}

/**
 * Select and render one randomized narration phrase.
 *
 * @param {object} options
 * @param {string} options.type - notification event type.
 * @param {object} [options.params] - interpolation values, e.g. { title, stage }.
 * @param {string} [options.locale] - target locale (falls back to default).
 * @param {string} [options.depth] - 'terse' | 'chatty'.
 * @param {() => number} [options.random] - injectable RNG returning [0, 1).
 * @param {string[]} [options.variants] - explicit phrase variants (e.g. a user's
 *   edited phrase bank); falls back to the built-in bank when empty/omitted.
 * @returns {{ text: string, type: string, locale: string, depth: string, variantIndex: number, template: string }}
 */
export function composeNarration({ type, params = {}, locale, depth, random, variants } = {}) {
  let resolvedType = normalizeEventType(type);
  let resolvedLocale = normalizeLocale(locale);
  let resolvedDepth = normalizeDepth(depth);
  let resolved = Array.isArray(variants) && variants.length > 0
    ? variants
    : resolveVariants(resolvedLocale, resolvedType, resolvedDepth);
  let variantIndex = pickIndex(resolved.length, random);
  let template = resolved[variantIndex];
  return {
    text: interpolateLocaleMessage(template, params),
    type: resolvedType,
    locale: resolvedLocale,
    depth: resolvedDepth,
    variantIndex,
    template,
  };
}

/** Convenience: return only the rendered narration string. */
export function selectNarrationPhrase(options = {}) {
  return composeNarration(options).text;
}
