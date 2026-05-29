import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetLocalization } from 'symbiote-node/locale';
import {
  configurePortalLocalization,
  resolvePortalLocale,
} from '../../web/common/localization.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('portal localization bootstrap', () => {
  beforeEach(() => {
    resetLocalization();
  });

  it('resolves locale from public URL prefix or explicit query', () => {
    assert.equal(resolvePortalLocale({ pathname: '/demos/agent-portal-vr/', search: '' }), 'en');
    assert.equal(resolvePortalLocale({ pathname: '/ru/demos/agent-portal-vr/', search: '' }), 'ru');
    assert.equal(resolvePortalLocale({ pathname: '/demos/agent-portal-vr/', search: '?locale=ru-RU' }), 'ru');
    assert.equal(resolvePortalLocale({ pathname: '/demos/agent-portal-vr/', search: '?lang=es-AR' }), 'es');
  });

  it('configures symbiote localization and reflects document metadata', () => {
    let documentElement = {
      dataset: {},
      lang: '',
      dir: '',
    };

    let localization = configurePortalLocalization({
      location: { pathname: '/ru/demos/agent-portal-vr/', search: '' },
      document: { documentElement },
    });

    assert.equal(localization.locale, 'ru');
    assert.equal(localization.explicit, true);
    assert.equal(localization.t('chat.sidebar.title'), 'Чаты');
    assert.equal(documentElement.lang, 'ru');
    assert.equal(documentElement.dir, 'ltr');
    assert.equal(documentElement.dataset.locale, 'ru');
  });

  it('loads localization before symbiote UI and exposes the locale import map', () => {
    let app = fs.readFileSync(path.join(ROOT, 'web/app.js'), 'utf8');
    let index = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');

    assert.ok(
      app.indexOf('import "./common/localization.js";') < app.indexOf('from "symbiote-node/ui"'),
      'portal localization must run before symbiote-node/ui auto-detection',
    );
    assert.ok(index.includes('"symbiote-node/locale": "/packages/symbiote-node/locale/index.js"'));
  });
});
