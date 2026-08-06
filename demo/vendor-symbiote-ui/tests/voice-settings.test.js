import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_VOICE_SETTINGS,
  normalizeVoiceLanguageMode,
  normalizeVoiceCommandSettings,
  loadVoiceSettings,
  saveVoiceSettings,
  mergeServerVoiceSettings,
} from '../chat/voice-settings.js';

class MockStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return key in this.store ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

class ThrowingStorage {
  getItem() {
    throw new Error('storage unavailable');
  }
  setItem() {
    throw new Error('storage unavailable');
  }
}

test('DEFAULT_VOICE_SETTINGS contains basic defaults', () => {
  assert.equal(DEFAULT_VOICE_SETTINGS.commandMode, false);
  assert.equal(DEFAULT_VOICE_SETTINGS.responseEnabled, false);
  assert.equal(DEFAULT_VOICE_SETTINGS.languageMode, 'en');
});

test('normalizeVoiceLanguageMode normalizes languages correctly', () => {
  assert.equal(normalizeVoiceLanguageMode('RU'), 'ru');
  assert.equal(normalizeVoiceLanguageMode('es'), 'es');
  assert.equal(normalizeVoiceLanguageMode('EN '), 'en');
  assert.equal(normalizeVoiceLanguageMode('auto', 'ru'), 'ru');
  assert.equal(normalizeVoiceLanguageMode(null, 'es'), 'es');
  assert.equal(normalizeVoiceLanguageMode(undefined, 'en'), 'en');
  assert.equal(normalizeVoiceLanguageMode('invalid', 'es'), 'es');
});

test('loadVoiceSettings loads defaults when storage is empty', () => {
  const storage = new MockStorage();
  const settings = loadVoiceSettings(storage, 'ru');

  assert.equal(settings.commandMode, false);
  assert.equal(settings.responseEnabled, false);
  assert.equal(settings.languageMode, 'ru');
});

test('loadVoiceSettings loads values when storage is populated', () => {
  const storage = new MockStorage();
  storage.setItem('symbiote_voice_command_mode', 'true');
  storage.setItem('symbiote_voice_response_enabled', 'true');
  storage.setItem('symbiote_voice_language_mode', 'es');

  const settings = loadVoiceSettings(storage, 'ru');
  assert.equal(settings.commandMode, true);
  assert.equal(settings.responseEnabled, true);
  assert.equal(settings.languageMode, 'es');
});

test('saveVoiceSettings saves values correctly', () => {
  const storage = new MockStorage();
  const success = saveVoiceSettings({
    commandMode: true,
    responseEnabled: false,
    languageMode: 'ru',
  }, storage);

  assert.ok(success);
  assert.equal(storage.getItem('symbiote_voice_command_mode'), 'true');
  assert.equal(storage.getItem('symbiote_voice_response_enabled'), 'false');
  assert.equal(storage.getItem('symbiote_voice_language_mode'), 'ru');
});

test('voice settings tolerate unavailable storage', () => {
  const storage = new ThrowingStorage();
  assert.deepEqual(loadVoiceSettings(storage, 'es'), {
    commandMode: false,
    responseEnabled: false,
    languageMode: 'es',
  });
  assert.equal(saveVoiceSettings({ commandMode: true }, storage), false);
});

test('mergeServerVoiceSettings merges server settings without clobbering undefined/empty fields', () => {
  const local = {
    commandMode: true,
    responseEnabled: false,
    languageMode: 'ru',
  };

  // 1. empty/undefined server settings should not clobber
  const merged1 = mergeServerVoiceSettings(local, undefined, 'en');
  assert.deepEqual(merged1, local);

  const merged2 = mergeServerVoiceSettings(local, {}, 'en');
  assert.deepEqual(merged2, local);

  // 2. partially populated server settings should only override present keys
  const merged3 = mergeServerVoiceSettings(local, { sendByCommandEnabled: false }, 'en');
  assert.equal(merged3.commandMode, false);
  assert.equal(merged3.responseEnabled, false); // preserved
  assert.equal(merged3.languageMode, 'ru'); // preserved

  // 3. fully populated server settings should overwrite all
  const merged4 = mergeServerVoiceSettings(local, {
    sendByCommandEnabled: false,
    voiceResponseEnabled: true,
    languageMode: 'es',
  }, 'en');
  assert.equal(merged4.commandMode, false);
  assert.equal(merged4.responseEnabled, true);
  assert.equal(merged4.languageMode, 'es');
});

test('normalizeVoiceCommandSettings returns full command defaults', () => {
  const settings = normalizeVoiceCommandSettings();

  assert.deepEqual(settings.sendCommands, {
    en: 'send',
    ru: 'отправить',
    es: 'enviar',
  });
  assert.deepEqual(settings.wakeCommands, {
    en: 'Okay Agent',
    ru: "О'кей Агент",
    es: 'Okey Agente',
  });
  assert.deepEqual(settings.actionCommands.cancel.ru, ['отмена', 'стоп']);
  assert.deepEqual(settings.actionCommands.delete.en, ['delete', 'clear']);
  assert.deepEqual(settings.actionCommands.off.es, ['apagar']);
});

test('normalizeVoiceCommandSettings normalizes saved and legacy command settings', () => {
  const settings = normalizeVoiceCommandSettings({
    sendCommand: 'ship',
    sendCommands: {
      ru: 'пуск',
    },
    wakeCommands: {
      ru: 'голосовой ввод',
      es: 'oye agente',
    },
    actionCommands: {
      cancel: {
        en: 'abort; stop now',
      },
      delete: {
        ru: 'стереть, очистить',
      },
      off: {
        es: ['silencio', 'apaga'],
      },
    },
  });

  assert.equal(settings.sendCommands.en, 'ship');
  assert.equal(settings.sendCommands.ru, 'пуск');
  assert.equal(settings.sendCommands.es, 'enviar');
  assert.equal(settings.wakeCommands.ru, "О'кей Агент");
  assert.equal(settings.wakeCommands.es, 'oye agente');
  assert.deepEqual(settings.actionCommands.cancel.en, ['abort', 'stop now']);
  assert.deepEqual(settings.actionCommands.cancel.ru, ['отмена', 'стоп']);
  assert.deepEqual(settings.actionCommands.delete.ru, ['стереть', 'очистить']);
  assert.deepEqual(settings.actionCommands.off.es, ['silencio', 'apaga']);
});
