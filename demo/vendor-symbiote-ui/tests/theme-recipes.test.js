import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cmdDiscover } from '../discover.js';
import {
  listCascadeThemeRecipes as listRootCascadeThemeRecipes,
  resolveCascadeThemeRecipe as resolveRootCascadeThemeRecipe,
} from '../index.js';
import {
  createCascadeTheme,
  getCascadeThemeRecipeDescriptor,
  isBoundedThemeOverride,
  listCascadeThemeRecipes,
  listCascadeThemeRelations,
  resolveCascadeThemeRecipe,
} from '../themes/cascade-theme.js';
import {
  getThemeRecipeModel,
  listThemeRecipes,
  listThemeRelations,
} from '../manifest/index.js';

const EXPECTED_RECIPE_NAMES = [
  'agent-console',
  'ops-dashboard',
  'editor-pro',
  'data-lab',
  'media-studio',
  'presentation-clean',
  'brand-demo',
  'ebook-light',
];

const EXPECTED_RELATION_NAMES = [
  'surfaceLadder',
  'stateLayers',
  'radiusCurve',
  'elevation',
  'typographyCurve',
  'spacingCurve',
  'motionCurve',
  'semanticHues',
  'graphDataPalette',
  'materialTexture',
];

test('theme recipe catalog exposes the initial relative directions', () => {
  let recipes = listCascadeThemeRecipes();
  let names = recipes.map((recipe) => recipe.name);

  assert.deepEqual(names, EXPECTED_RECIPE_NAMES);
  assert.deepEqual(listRootCascadeThemeRecipes().map((recipe) => recipe.name), EXPECTED_RECIPE_NAMES);
  assert.equal(resolveRootCascadeThemeRecipe({ recipe: 'agent-console' }).recipe, 'agent-console');
  for (let recipe of recipes) {
    assert.equal(recipe.version, 'theme-recipe-v1');
    assert.equal(recipe.base, 'default-provider');
    assert.ok(Object.keys(recipe.params).length > 0);
    assert.ok(Object.keys(recipe.relations).length > 0);
    assert.ok(!JSON.stringify(recipe).includes('linear-gradient('));
  }
});

test('theme relation catalog formalizes relation modifier names', () => {
  let relations = listCascadeThemeRelations();
  assert.deepEqual(relations.map((relation) => relation.name), EXPECTED_RELATION_NAMES);
  assert.ok(relations.every((relation) => relation.parameters.length > 0));
  assert.ok(relations.every((relation) => relation.affects.length > 0));
});

test('material texture relation only adjusts animated cell dots', () => {
  let relation = listCascadeThemeRelations().find((item) => item.name === 'materialTexture');
  let base = createCascadeTheme({ mode: 'dark' });
  let textured = createCascadeTheme({
    mode: 'dark',
    relations: {
      materialTexture: { grain: 1.4, glare: 2 },
    },
  });

  assert.deepEqual(relation.parameters.map((parameter) => parameter.name), ['grain']);
  assert.notEqual(textured.tokens['--sn-cell-base-alpha'], base.tokens['--sn-cell-base-alpha']);
  assert.equal(textured.tokens['--sn-cell-glare'], base.tokens['--sn-cell-glare']);
  assert.equal(textured.tokens['--sn-cell-vignette-mid'], base.tokens['--sn-cell-vignette-mid']);
  assert.equal(textured.tokens['--sn-cell-vignette-edge'], base.tokens['--sn-cell-vignette-edge']);
  assert.equal(textured.tokens['--sn-cell-noise'], base.tokens['--sn-cell-noise']);
});

test('recipe resolution preserves cascade order and bounded overrides', () => {
  let resolved = resolveCascadeThemeRecipe({
    recipe: 'editor-pro',
    relations: {
      surfaceLadder: { depth: 2 },
      elevation: { scale: 1.4 },
    },
    params: {
      density: 101,
      hue: 120,
      radius: 24,
    },
    overrides: {
      '--sn-theme-elevation-scale': '1.2',
      '--bad-token': 'ignored',
      '--sn-leak': 'url(image.png)',
    },
  });

  assert.equal(resolved.recipe, 'editor-pro');
  assert.equal(resolved.base, 'default-provider');
  assert.equal(resolved.params.density, 101);
  assert.equal(resolved.params.hue, 120);
  assert.equal(resolved.params.radius, 24);
  assert.equal(resolved.overrides['--sn-theme-elevation-scale'], '1.2');
  assert.equal(resolved.overrides['--bad-token'], undefined);
  assert.equal(resolved.overrides['--sn-leak'], undefined);
  assert.ok(resolved.relations.surfaceLadder);
  assert.ok(resolved.relations.elevation);
});

test('recipe semantic hue overrides resolve against user-final params', () => {
  let resolved = resolveCascadeThemeRecipe({
    recipe: 'agent-console',
    params: { hue: 0 },
  });
  let theme = createCascadeTheme({
    recipe: 'agent-console',
    params: { hue: 0 },
  });

  assert.equal(resolved.params.hue, 0);
  assert.equal(resolved.overrides['--sn-hue-success'], '260');
  assert.equal(resolved.overrides['--sn-hue-warning'], '182');
  assert.equal(theme.tokens['--sn-hue-accent'], '0');
  assert.equal(theme.tokens['--sn-hue-success'], '260');
});

test('bounded theme overrides reject non-token names and unsafe values', () => {
  assert.equal(isBoundedThemeOverride('--sn-data-table-radius', 'calc(8px * var(--sn-theme-density))'), true);
  assert.equal(isBoundedThemeOverride('--x-data-table-radius', '8px'), false);
  assert.equal(isBoundedThemeOverride('--sn-data-table-radius', 'url(image.png)'), false);
  assert.equal(isBoundedThemeOverride('--sn-data-table-radius', '8px; color: red'), false);
});

test('createCascadeTheme resolves recipes without breaking raw params', () => {
  let raw = createCascadeTheme({ mode: 'light', hue: 33, density: 110 });
  assert.equal(raw.recipe, null);
  assert.equal(raw.state.mode, 'light');
  assert.equal(raw.state.hue, 33);
  assert.equal(raw.state.density, 110);
  assert.equal(raw.state.radius, 0);
  assert.equal(raw.tokens['--sn-theme-radius-scale'], '0.00');

  let themed = createCascadeTheme({
    recipe: 'ops-dashboard',
    params: { density: 100, radius: 30 },
  });
  assert.equal(themed.recipe, 'ops-dashboard');
  assert.equal(themed.state.density, 100);
  assert.equal(themed.state.radius, 30);
  assert.equal(themed.tokens['--sn-theme-radius-scale'], '1.76');
  assert.match(themed.tokens['--sn-data-table-radius'], /var\(--sn-theme-radius-scale\)/);
  assert.equal(themed.tokens['--sn-theme-elevation-scale'], '1.1');
  assert.ok(themed.descriptor.recipeModel.recipeNames.includes('ops-dashboard'));
});

test('manifest and discover expose theme recipes and relations', async () => {
  assert.deepEqual(getThemeRecipeModel().recipeNames, EXPECTED_RECIPE_NAMES);
  assert.deepEqual(listThemeRecipes().map((recipe) => recipe.name), EXPECTED_RECIPE_NAMES);
  assert.deepEqual(listThemeRelations().map((relation) => relation.name), EXPECTED_RELATION_NAMES);

  let data = await cmdDiscover({});
  assert.deepEqual(data.manifest.themeRecipeModel.recipeNames, EXPECTED_RECIPE_NAMES);
  assert.deepEqual(data.manifest.themeRelations.map((relation) => relation.name), EXPECTED_RELATION_NAMES);
  for (let name of EXPECTED_RECIPE_NAMES) {
    assert.ok(data.manifest.themeRecipes.some((recipe) => recipe.name === name), `missing recipe ${name}`);
  }
  assert.ok(data.manifest.schemas.some((schema) => schema.version === 'theme-recipe-v1'));
});
