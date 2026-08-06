import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hasComponent } from '../manifest/component-registry.js';
import {
  listComponentRecipes,
  getComponentRecipesDescriptor,
  recipeForIntent,
} from '../manifest/component-recipes.js';

test('listComponentRecipes returns a meaningful, well-formed index', () => {
  let recipes = listComponentRecipes();
  assert.ok(recipes.length >= 15, `expected >= 15 recipes, got ${recipes.length}`);
  for (let recipe of recipes) {
    assert.equal(typeof recipe.intent, 'string');
    assert.ok(recipe.intent.length > 0, 'intent must be non-empty');
    assert.equal(typeof recipe.component, 'string');
    assert.equal(typeof recipe.when, 'string');
    assert.ok(recipe.when.length > 0, 'when must be non-empty');
    assert.equal(typeof recipe.antipattern, 'string');
    assert.ok(recipe.antipattern.length > 0, 'antipattern must be non-empty');
  }
});

test('every recipe is grounded in a real component', () => {
  for (let recipe of listComponentRecipes()) {
    assert.ok(
      hasComponent(recipe.component),
      `recipe for "${recipe.intent}" points at missing component "${recipe.component}"`,
    );
  }
});

test('intents are unique', () => {
  let intents = listComponentRecipes().map((recipe) => recipe.intent.toLowerCase());
  assert.equal(new Set(intents).size, intents.length, 'recipe intents must be unique');
});

test('core mappings are present', () => {
  let recipes = listComponentRecipes();
  let tableRecipe = recipes.find((recipe) => /tabular|table/i.test(recipe.intent));
  assert.ok(tableRecipe, 'a tabular/table intent must exist');
  assert.equal(tableRecipe.component, 'sn-data-table');

  let dialogRecipe = recipes.find((recipe) => /dialog|modal/i.test(recipe.intent));
  assert.ok(dialogRecipe, 'a dialog/modal intent must exist');
  assert.equal(dialogRecipe.component, 'sn-dialog');
});

test('recipeForIntent matches by case-insensitive substring', () => {
  let tooltip = recipeForIntent('tooltip');
  assert.ok(tooltip, 'tooltip intent must resolve');
  assert.equal(tooltip.component, 'sn-tooltip');

  let table = recipeForIntent('TABULAR');
  assert.ok(table, 'case-insensitive match must resolve');
  assert.equal(table.component, 'sn-data-table');
});

test('recipeForIntent returns null for empty or unknown queries', () => {
  assert.equal(recipeForIntent(''), null);
  assert.equal(recipeForIntent('   '), null);
  assert.equal(recipeForIntent(undefined), null);
  assert.equal(recipeForIntent('zzz-no-such-intent-zzz'), null);
});

test('getComponentRecipesDescriptor wraps the grounded index', () => {
  let descriptor = getComponentRecipesDescriptor();
  assert.equal(descriptor.version, 'component-recipes-v1');
  assert.equal(descriptor.count, descriptor.recipes.length);
  assert.equal(descriptor.count, listComponentRecipes().length);
  assert.ok(descriptor.count >= 15, 'descriptor must reflect a meaningful count');
});
