import { acquireCurrentTestFileLock } from './test-lock.js';
await acquireCurrentTestFileLock(import.meta.url);

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  deriveDesignConstraints,
  validateDesignPatch,
  validateThemePatch,
} from '../rules/design-policy.js';

test('design constraints derive dependent ranges from accessibility and component families', () => {
  let constraints = deriveDesignConstraints(
    {
      design: {
        register: 'agent-workspace',
        componentFamilies: ['table', 'graph'],
      },
      theme: {
        recipe: 'agent-console',
        params: {
          contrast: 55,
          mode: 'dark',
        },
      },
    },
    {
      accessibility: {
        contrast: 'more',
        textScale: 1.2,
      },
      dataPalette: {
        colorBlindSafe: true,
      },
    }
  );

  assert.equal(constraints.status, 'pass');
  assert.equal(constraints.parameters.contrast.derivedRange.min, 79);
  assert.equal(constraints.parameters.outline.derivedRange.min, 42);
  assert.equal(constraints.parameters.dataPalette.derivedRange.min, 70);
  assert.equal(constraints.ruleStack[0].layer, 'accessibility');
  assert.equal(constraints.ruleStack.at(-1).layer, 'user-tweak');
});

test('empty hard-rule intersections are reported as blocked conflicts', () => {
  let constraints = deriveDesignConstraints(
    {
      design: {
        register: 'presentation',
      },
      theme: {
        params: {
          density: 100,
        },
        policy: {
          parameterRanges: {
            density: {
              min: 60,
              max: 80,
            },
          },
        },
      },
    },
    {}
  );

  assert.equal(constraints.status, 'blocked');
  assert.equal(constraints.parameters.density.status, 'blocked');
  assert.equal(constraints.parameters.density.conflicts[0].status, 'blocked');
  assert.match(constraints.parameters.density.conflicts[0].reason, /no overlapping range/i);
});

test('hard host-policy overrides block user theme patches without silent clamping', () => {
  let config = {
    design: {
      register: 'tool',
    },
    theme: {
      recipe: 'agent-console',
      params: {
        contrast: 72,
      },
      policy: {
        lockedParams: ['contrast'],
      },
    },
  };
  let patch = {
    theme: {
      params: {
        contrast: 50,
      },
    },
  };

  let result = validateDesignPatch(patch, config, {});

  assert.equal(result.status, 'blocked');
  assert.equal(patch.theme.params.contrast, 50);
  assert.equal(result.violations.some((violation) => violation.parameter === 'contrast' && violation.status === 'blocked'), true);
  assert.deepEqual(
    result.suggestedPatches.find((suggestion) => suggestion.path === '/params/contrast'),
    {
      op: 'replace',
      path: '/params/contrast',
      value: 72,
      reason: 'Use the nearest legal contrast value from the hard derived range.',
    }
  );
});

test('soft recipe and brand violations warn with suggested patches', () => {
  let constraints = deriveDesignConstraints(
    {
      design: {
        register: 'editor',
        brand: {
          tone: 'enterprise',
        },
      },
      theme: {
        recipe: 'editor-pro',
      },
    },
    {}
  );
  let result = validateThemePatch(
    {
      params: {
        chroma: 92,
        density: 110,
      },
    },
    constraints
  );

  assert.equal(result.status, 'warn');
  assert.equal(result.violations.every((violation) => violation.status === 'warn'), true);
  assert.equal(result.suggestedPatches.some((patch) => patch.path === '/params/chroma' && patch.value === 72), true);
  assert.equal(result.suggestedPatches.some((patch) => patch.path === '/params/density' && patch.value === 100), true);
});

test('override validation blocks foreign tokens and warns on sparse Symbiote token escapes', () => {
  let result = validateThemePatch({
    params: {
      contrast: 70,
    },
    overrides: {
      '--sn-surface-bg': 'oklch(20% 0 0)',
      '--foreign-token': 'red',
    },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.violations.some((violation) => violation.path === '/overrides/--sn-surface-bg' && violation.status === 'warn'), true);
  assert.equal(result.violations.some((violation) => violation.path === '/overrides/--foreign-token' && violation.status === 'blocked'), true);
  assert.equal(result.suggestedPatches.some((patch) => patch.op === 'remove' && patch.path === '/overrides/--foreign-token'), true);
});

test('design-only patches validate register policy without theme warnings', () => {
  let result = validateDesignPatch(
    {
      design: {
        register: 'brand',
      },
    },
    {},
    {
      hostPolicy: {
        allowedRegisters: ['tool', 'admin'],
      },
    }
  );

  assert.equal(result.status, 'blocked');
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].parameter, 'design.register');
  assert.equal(result.suggestedPatches[0].value, 'tool');
});

test('theme policy accepts recipe params and blocks invalid enum values', () => {
  let valid = validateThemePatch({
    recipe: 'ops-dashboard',
    relations: {
      surfaceLadder: { depth: 1 },
    },
    params: {
      mode: 'light',
      hue: 220,
      pattern: 40,
    },
  });

  assert.equal(valid.status, 'pass');
  assert.deepEqual(valid.violations, []);

  let invalid = validateThemePatch({
    params: {
      mode: 'system',
    },
  });

  assert.equal(invalid.status, 'blocked');
  assert.equal(invalid.violations[0].parameter, 'mode');
  assert.equal(invalid.suggestedPatches[0].value, 'dark');
});
