import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetLocalization } from 'symbiote-ui/locale';
import {
  configurePortalLocalization,
  getPortalLocaleOptions,
  localizePortalTree,
  resolvePortalLocaleMode,
  setPortalLocaleMode,
  tPortal,
} from '../../web/common/localization.js';
import { PORTAL_LOCALE_MESSAGES } from '../../web/common/portal-locales.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('portal localization bootstrap', () => {
  beforeEach(() => {
    resetLocalization();
  });

  it('resolves manual locale mode from URL, settings, local storage, or public prefix', () => {
    let storage = new Map([['agentPortal.localeMode', 'es']]);
    let storageApi = {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    };

    assert.equal(resolvePortalLocaleMode({
      location: { pathname: '/demos/agent-portal-vr/', search: '' },
      storage: storageApi,
    }), 'es');
    assert.equal(resolvePortalLocaleMode({
      location: { pathname: '/demos/agent-portal-vr/', search: '' },
      settings: { localization: { mode: 'ru' } },
      storage: storageApi,
    }), 'ru');
    assert.equal(resolvePortalLocaleMode({
      location: { pathname: '/ru/demos/agent-portal-vr/', search: '' },
    }), 'ru');
    assert.equal(resolvePortalLocaleMode({
      location: { pathname: '/demos/agent-portal-vr/', search: '?locale=ru-RU' },
    }), 'ru');
    assert.equal(resolvePortalLocaleMode({
      location: { pathname: '/demos/agent-portal-vr/', search: '?lang=es-AR' },
    }), 'es');
  });

  it('configures symbiote localization and reflects document metadata', () => {
    let documentElement = {
      dataset: {},
      lang: '',
      dir: '',
    };

    let localization = configurePortalLocalization({
      location: { pathname: '/demos/agent-portal-vr/', search: '' },
      navigator: { languages: ['fr-FR', 'es-AR'] },
      document: { documentElement },
    });

    assert.equal(localization.mode, 'auto');
    assert.equal(localization.locale, 'es');
    assert.equal(localization.explicit, false);
    assert.equal(localization.t('portal.topbar.workspaceNotSelected'), 'Espacio de trabajo no seleccionado');
    assert.equal(documentElement.lang, 'es');
    assert.equal(documentElement.dir, 'ltr');
    assert.equal(documentElement.dataset.locale, 'es');
    assert.equal(documentElement.dataset.localeMode, 'auto');
  });

  it('stores manual locale mode and exposes localized options for settings', () => {
    let storage = new Map();
    let storageApi = {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    };
    let documentElement = {
      dataset: {},
      lang: '',
      dir: '',
    };

    let localization = setPortalLocaleMode('ru-RU', {
      storage: storageApi,
      document: { documentElement },
    });

    assert.equal(localization.mode, 'ru');
    assert.equal(localization.locale, 'ru');
    assert.equal(storage.get('agentPortal.localeMode'), 'ru');
    assert.equal(tPortal('settings.language.title'), 'Язык интерфейса');
    assert.equal(tPortal('settings.voice.title'), 'Голосовой ввод');
    assert.equal(tPortal('settings.voice.commandRuLabel'), 'Команда на русском');
    assert.equal(tPortal('settings.voice.wakeRuLabel'), 'Команда старта на русском');
    assert.equal(tPortal('settings.voice.cancelGroup'), 'Остановка голосового ввода');
    assert.equal(tPortal('settings.voice.commandListDescription'), 'Разделяйте альтернативные команды запятыми.');
    assert.equal(tPortal('settings.voice.speakResponse'), 'Озвучивать новые ответы агента');
    assert.equal(tPortal('settings.voice.sayCommand', { command: "О'кей Агент" }), "Скажи: О'кей Агент");
    assert.equal(
      tPortal('settings.voice.refreshAfterPermission'),
      'Доступ к микрофону разрешен. Если голосовой ввод не запустился, обновите страницу один раз и попробуйте снова.',
    );
    assert.equal(
      tPortal('settings.voice.transcriptionNote'),
      '[Примечание: следующее сообщение получено через голосовую транскрибацию. В нем возможны ошибки распознавания; учитывай контекст и уточняй, если смысл неоднозначен.]',
    );
    assert.deepEqual(
      getPortalLocaleOptions().map((option) => option.value),
      ['auto', 'en', 'ru', 'es'],
    );
  });

  it('localizes static portal DOM text and attributes from product catalogs', () => {
    configurePortalLocalization({
      location: { pathname: '/demos/agent-portal-vr/', search: '?locale=ru' },
      document: { documentElement: { dataset: {}, lang: '', dir: '' } },
    });

    let textNode = { nodeType: 3, nodeValue: 'Voice Input', parentElement: null };
    let input = {
      getAttribute: (name) => name === 'placeholder' ? 'Ask anything, @ to mention, / for workflows' : null,
      setAttribute(name, value) {
        this[name] = value;
      },
    };
    let root = {
      nodeType: 1,
      matches: () => false,
      querySelectorAll: () => [input],
      ownerDocument: {
        createTreeWalker: () => ({
          nextNode() {
            if (this.done) return null;
            this.done = true;
            return textNode;
          },
        }),
      },
    };

    localizePortalTree(root);

    assert.equal(textNode.nodeValue, 'Голосовой ввод');
    assert.equal(input.placeholder, 'Спросите что-нибудь, @ для упоминаний, / для workflows');
  });

  it('localizes open shadow roots and provider tree attributes', () => {
    configurePortalLocalization({
      location: { pathname: '/demos/agent-portal-vr/', search: '?locale=es' },
      document: { documentElement: { dataset: {}, lang: '', dir: '' } },
    });

    let shadowText = { nodeType: 3, nodeValue: 'Loading files...', parentElement: null };
    let shadowInput = {
      getAttribute: (name) => name === 'filter-placeholder' ? 'Filter public items...' : null,
      setAttribute(name, value) {
        this[name] = value;
      },
      matches: () => false,
    };
    let shadowRoot = {
      nodeType: 11,
      querySelectorAll: () => [shadowInput],
      ownerDocument: {
        createTreeWalker: () => ({
          nextNode() {
            if (this.done) return null;
            this.done = true;
            return shadowText;
          },
        }),
      },
    };
    let host = {
      shadowRoot,
      matches: () => false,
      getAttribute: () => null,
    };
    let root = {
      nodeType: 1,
      matches: () => false,
      getAttribute: () => null,
      querySelectorAll: () => [host],
      ownerDocument: {
        createTreeWalker: () => ({
          nextNode: () => null,
        }),
      },
    };

    localizePortalTree(root);

    assert.equal(shadowText.nodeValue, 'Cargando archivos...');
    assert.equal(shadowInput['filter-placeholder'], 'Filtrar elementos públicos...');
  });

  it('keeps portal locale catalogs aligned across supported languages', () => {
    let englishKeys = Object.keys(PORTAL_LOCALE_MESSAGES.en).sort();
    assert.deepEqual(Object.keys(PORTAL_LOCALE_MESSAGES.ru).sort(), englishKeys);
    assert.deepEqual(Object.keys(PORTAL_LOCALE_MESSAGES.es).sort(), englishKeys);
  });

  it('loads localization before symbiote UI and exposes the locale import map', () => {
    let app = fs.readFileSync(path.join(ROOT, 'web/app.js'), 'utf8');
    let index = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');

    assert.ok(
      app.indexOf('from "./common/localization.js";') < app.indexOf('from "symbiote-ui/ui"'),
      'portal localization must run before symbiote-ui/ui auto-detection',
    );
    assert.ok(index.includes('"symbiote-ui/locale": "/packages/symbiote-ui/locale/index.js"'));
  });
});
