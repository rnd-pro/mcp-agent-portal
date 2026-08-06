const LAYER_ORDER = [
  'accessibility',
  'host-policy',
  'register',
  'component-family',
  'recipe',
  'brand-context',
  'user-tweak',
];

const LAYER_PRIORITY = new Map(LAYER_ORDER.map((layer, index) => [layer, index + 1]));

const PARAMETER_RANGES = {
  brightness: { min: 0, max: 20 },
  chroma: { min: 0, max: 100 },
  contrast: { min: 40, max: 90 },
  dataPalette: { min: 0, max: 100 },
  density: { min: 60, max: 140 },
  heading: { min: 70, max: 130 },
  hue: { min: 0, max: 360 },
  motion: { min: 0, max: 200 },
  outline: { min: 0, max: 100 },
  pattern: { min: 0, max: 100 },
  radius: { min: 0, max: 100 },
  type: { min: 70, max: 130 },
};

const ENUM_PARAMETERS = {
  mode: ['dark', 'light'],
};

const THEME_METADATA_KEYS = new Set([
  'brand',
  'overrides',
  'policy',
  'recipe',
  'relations',
  'subtrees',
]);

const RECIPE_RULES = {
  'agent-console': [
    rangeRule('recipe.agent-console.density', 'recipe', 'soft', 'density', { min: 70, max: 102 }, 'Agent consoles stay dense enough for repeated status scanning.'),
    rangeRule('recipe.agent-console.motion', 'recipe', 'soft', 'motion', { min: 40, max: 120 }, 'Agent status motion should remain utilitarian.'),
    rangeRule('recipe.agent-console.outline', 'recipe', 'soft', 'outline', { min: 32 }, 'Agent consoles need visible separators for nested tool output.'),
  ],
  'ops-dashboard': [
    rangeRule('recipe.ops-dashboard.contrast', 'recipe', 'soft', 'contrast', { min: 58 }, 'Operations dashboards need readable status surfaces.'),
    rangeRule('recipe.ops-dashboard.data-palette', 'recipe', 'soft', 'dataPalette', { min: 68 }, 'Operations dashboards need distinct status and chart colors.'),
    rangeRule('recipe.ops-dashboard.density', 'recipe', 'soft', 'density', { min: 72, max: 108 }, 'Operations dashboards favor dense monitoring panels.'),
  ],
  'editor-pro': [
    rangeRule('recipe.editor-pro.density', 'recipe', 'soft', 'density', { min: 70, max: 100 }, 'Editor surfaces should preserve high-density controls.'),
    rangeRule('recipe.editor-pro.chroma', 'recipe', 'soft', 'chroma', { max: 72 }, 'Editor surfaces keep chroma below distraction levels.'),
    rangeRule('recipe.editor-pro.type', 'recipe', 'soft', 'type', { min: 86 }, 'Editor text must stay readable at working distance.'),
  ],
  'data-lab': [
    rangeRule('recipe.data-lab.data-palette', 'recipe', 'soft', 'dataPalette', { min: 72 }, 'Data labs need broad visual separation for charts and clusters.'),
    rangeRule('recipe.data-lab.chroma', 'recipe', 'soft', 'chroma', { min: 18, max: 80 }, 'Data labs need enough chroma for encodings without overpowering dense tables.'),
  ],
  'media-studio': [
    rangeRule('recipe.media-studio.motion', 'recipe', 'soft', 'motion', { max: 150 }, 'Media studios can use expressive transitions while staying responsive.'),
    rangeRule('recipe.media-studio.chroma', 'recipe', 'soft', 'chroma', { min: 18, max: 88 }, 'Media workspaces allow more expressive brand color.'),
  ],
  'presentation-clean': [
    rangeRule('recipe.presentation-clean.density', 'recipe', 'soft', 'density', { min: 96, max: 132 }, 'Presentation surfaces need more breathing room.'),
    rangeRule('recipe.presentation-clean.type', 'recipe', 'soft', 'type', { min: 100 }, 'Presentation surfaces should not use compact text.'),
    rangeRule('recipe.presentation-clean.radius', 'recipe', 'soft', 'radius', { min: 18, max: 72 }, 'Presentation surfaces tolerate moderate rounding.'),
  ],
  'brand-demo': [
    rangeRule('recipe.brand-demo.chroma', 'recipe', 'soft', 'chroma', { min: 24, max: 92 }, 'Brand demos can carry stronger color direction.'),
    rangeRule('recipe.brand-demo.radius', 'recipe', 'soft', 'radius', { min: 12 }, 'Brand demos should preserve a visible design signature.'),
  ],
  'ebook-light': [
    rangeRule('recipe.ebook-light.motion', 'recipe', 'soft', 'motion', { max: 90 }, 'Reading surfaces should avoid distracting motion.'),
    rangeRule('recipe.ebook-light.chroma', 'recipe', 'soft', 'chroma', { max: 42 }, 'Reading surfaces keep chroma restrained.'),
    rangeRule('recipe.ebook-light.type', 'recipe', 'soft', 'type', { min: 96 }, 'Reading surfaces need comfortable body text.'),
  ],
};

export function deriveDesignConstraints(config = {}, context = {}) {
  let params = readThemeParams(config);
  let rules = buildRuleStack(config, context, params).sort(compareRules);
  let parameters = {};

  for (let [parameter, baseRange] of Object.entries(PARAMETER_RANGES)) {
    let parameterRules = rules.filter((rule) => rule.parameter === parameter);
    let hardRules = parameterRules.filter((rule) => rule.severity === 'hard');
    let softRules = parameterRules.filter((rule) => rule.severity === 'soft');
    let hardRange = intersectRanges(baseRange, hardRules.map((rule) => rule.range));
    let softRanges = softRules.map((rule) => ({
      ruleId: rule.id,
      layer: rule.layer,
      severity: rule.severity,
      range: normalizeRange(rule.range, baseRange),
      reason: rule.reason,
    }));
    let conflicts = [];

    if (hardRange.conflict) {
      conflicts.push({
        status: 'blocked',
        severity: 'hard',
        parameter,
        reason: `Hard design rules for ${parameter} have no overlapping range.`,
        rules: hardRules.map(describeRule),
      });
    }

    parameters[parameter] = {
      baseRange: normalizeRange(baseRange),
      derivedRange: hardRange.range,
      status: conflicts.length ? 'blocked' : 'pass',
      hardRules: hardRules.map(describeRule),
      softRanges,
      conflicts,
    };
  }

  let conflicts = Object.values(parameters).flatMap((parameter) => parameter.conflicts);

  return {
    version: 'design-policy-v1',
    status: conflicts.some((conflict) => conflict.status === 'blocked') ? 'blocked' : 'pass',
    ruleStack: LAYER_ORDER.map((layer) => ({
      layer,
      priority: LAYER_PRIORITY.get(layer),
      rules: rules.filter((rule) => rule.layer === layer).map(describeRule),
    })),
    parameters,
    conflicts,
    activeContext: {
      register: readRegister(config, context),
      recipe: readRecipe(config),
      mode: readMode(config, context),
      componentFamilies: readComponentFamilies(config, context),
      deviceMode: readDeviceMode(config, context),
    },
  };
}

export function validateThemePatch(patch = {}, constraints = deriveDesignConstraints()) {
  let paramEntries = extractThemeParamEntries(patch);
  let violations = [];
  let suggestedPatches = [];

  for (let { path, parameter, value } of paramEntries) {
    let parameterConstraints = constraints.parameters?.[parameter];

    if (ENUM_PARAMETERS[parameter]) {
      if (!ENUM_PARAMETERS[parameter].includes(value)) {
        violations.push({
          status: 'blocked',
          severity: 'hard',
          parameter,
          path,
          value,
          reason: `Theme parameter "${parameter}" must be one of: ${ENUM_PARAMETERS[parameter].join(', ')}.`,
          rules: [describeRule(makeRule({
            id: `theme.${parameter}.enum`,
            layer: 'host-policy',
            severity: 'hard',
            parameter,
            reason: `Allowed ${parameter} values: ${ENUM_PARAMETERS[parameter].join(', ')}`,
          }))],
        });
        suggestedPatches.push({
          op: 'replace',
          path,
          value: ENUM_PARAMETERS[parameter].includes(constraints.activeContext?.[parameter])
            ? constraints.activeContext[parameter]
            : ENUM_PARAMETERS[parameter][0],
          reason: `Use a supported ${parameter} value.`,
        });
      }
      continue;
    }

    if (!parameterConstraints) {
      violations.push({
        status: 'warn',
        severity: 'soft',
        parameter,
        path,
        value,
        reason: `Unknown theme parameter "${parameter}" is not covered by the design policy.`,
        rules: [],
      });
      continue;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      violations.push({
        status: 'blocked',
        severity: 'hard',
        parameter,
        path,
        value,
        reason: `Theme parameter "${parameter}" must be a finite number.`,
        rules: parameterConstraints.hardRules,
      });
      suggestedPatches.push({ op: 'remove', path, reason: `Remove non-numeric ${parameter}; validators do not coerce values.` });
      continue;
    }

    if (parameterConstraints.status === 'blocked') {
      violations.push({
        status: 'blocked',
        severity: 'hard',
        parameter,
        path,
        value,
        reason: `No legal value exists for "${parameter}" until hard rule conflicts are resolved.`,
        rules: parameterConstraints.hardRules,
      });
      continue;
    }

    let hardRange = parameterConstraints.derivedRange;
    if (!isWithinRange(value, hardRange)) {
      violations.push({
        status: 'blocked',
        severity: 'hard',
        parameter,
        path,
        value,
        derivedRange: hardRange,
        reason: `Theme parameter "${parameter}" is outside the hard derived range.`,
        rules: parameterConstraints.hardRules,
      });
      suggestedPatches.push({
        op: 'replace',
        path,
        value: nearestValue(value, hardRange),
        reason: `Use the nearest legal ${parameter} value from the hard derived range.`,
      });
    }

    for (let softRange of parameterConstraints.softRanges) {
      if (!isWithinRange(value, softRange.range)) {
        violations.push({
          status: 'warn',
          severity: 'soft',
          parameter,
          path,
          value,
          derivedRange: softRange.range,
          reason: softRange.reason,
          rules: [softRange],
        });
        suggestedPatches.push({
          op: 'replace',
          path,
          value: nearestValue(value, softRange.range),
          reason: `Preferred ${parameter} range from ${softRange.ruleId}.`,
          ruleId: softRange.ruleId,
        });
      }
    }
  }

  violations.push(...validateOverrides(patch));
  suggestedPatches.push(...suggestOverridePatches(patch));

  return buildValidationResult('theme', constraints, violations, suggestedPatches);
}

export function validateDesignPatch(patch = {}, config = {}, context = {}) {
  let constraints = deriveDesignConstraints(config, context);
  let themePatch = patch.theme ?? (patch.params || patch.overrides ? patch : {});
  let themeResult = validateThemePatch(themePatch, constraints);
  let violations = [...constraints.conflicts, ...themeResult.violations];
  let suggestedPatches = [...themeResult.suggestedPatches];

  if (patch.design?.register && Array.isArray(context.hostPolicy?.allowedRegisters)) {
    let allowed = context.hostPolicy.allowedRegisters;
    if (!allowed.includes(patch.design.register)) {
      violations.push({
        status: 'blocked',
        severity: 'hard',
        parameter: 'design.register',
        path: '/design/register',
        value: patch.design.register,
        reason: `Host policy does not allow register "${patch.design.register}".`,
        rules: [describeRule(makeRule({
          id: 'host.allowed-registers',
          layer: 'host-policy',
          severity: 'hard',
          reason: `Allowed registers: ${allowed.join(', ')}`,
        }))],
      });
      suggestedPatches.push({
        op: 'replace',
        path: '/design/register',
        value: allowed[0],
        reason: 'Use a host-approved design register.',
      });
    }
  }

  return buildValidationResult('design', constraints, violations, suggestedPatches);
}

export function buildRuleStack(config = {}, context = {}, params = readThemeParams(config)) {
  return [
    ...accessibilityRules(config, context, params),
    ...hostPolicyRules(config, context),
    ...registerRules(config, context),
    ...componentFamilyRules(config, context),
    ...recipeRules(config),
    ...brandContextRules(config, context),
    ...userTweakRules(config, context),
  ];
}

function accessibilityRules(config, context, params) {
  let mode = readMode(config, context);
  let componentFamilies = readComponentFamilies(config, context);
  let minContrast = 54;

  if (mode === 'dark') minContrast += 4;
  if (context.accessibility?.contrast === 'more' || context.accessibility?.forcedColors) minContrast = Math.max(minContrast, 72);
  if ((context.accessibility?.textScale ?? 1) >= 1.15) minContrast += 3;
  if (componentFamilies.some((family) => ['table', 'chart', 'graph', 'code-editor'].includes(family))) minContrast += 4;

  let rules = [
    rangeRule('a11y.contrast.minimum', 'accessibility', 'hard', 'contrast', { min: minContrast }, 'Readable foreground/background separation is required for the selected mode and modules.'),
    rangeRule('a11y.type.minimum', 'accessibility', 'hard', 'type', { min: context.accessibility?.largeText ? 96 : 82 }, 'Text scale must stay readable.'),
  ];

  if (context.accessibility?.reducedMotion === true) {
    rules.push(rangeRule('a11y.motion.reduced', 'accessibility', 'hard', 'motion', { min: 0, max: 0 }, 'Reduced-motion preference blocks animation scale above zero.'));
  } else {
    rules.push(rangeRule('a11y.motion.maximum', 'accessibility', 'soft', 'motion', { max: 160 }, 'Motion should stay below decorative levels.'));
  }

  if (params.contrast < 58 || context.accessibility?.contrast === 'more') {
    rules.push(rangeRule('a11y.outline.minimum', 'accessibility', 'hard', 'outline', { min: 36 }, 'Lower contrast contexts require visible focus and selection outlines.'));
  }

  if (componentFamilies.some((family) => ['chart', 'graph'].includes(family)) || context.dataPalette?.colorBlindSafe === true) {
    rules.push(rangeRule('a11y.data-palette.minimum', 'accessibility', 'hard', 'dataPalette', { min: 64 }, 'Charts and graphs require distinguishable data encodings.'));
  }

  return rules;
}

function hostPolicyRules(config, context) {
  let policy = {
    ...config.theme?.policy,
    ...config.design?.policy,
    ...context.hostPolicy,
  };
  let rules = [];

  for (let [parameter, range] of Object.entries(policy.parameterRanges ?? {})) {
    if (PARAMETER_RANGES[parameter]) {
      rules.push(rangeRule(`host.${parameter}.range`, 'host-policy', 'hard', parameter, range, `Host policy restricts ${parameter}.`));
    }
  }

  for (let parameter of policy.lockedParams ?? policy.blockedParams ?? []) {
    let currentValue = readThemeParams(config)[parameter];
    if (PARAMETER_RANGES[parameter] && typeof currentValue === 'number') {
      rules.push(rangeRule(`host.${parameter}.locked`, 'host-policy', 'hard', parameter, { min: currentValue, max: currentValue }, `Host policy locks ${parameter} at ${currentValue}.`));
    }
  }

  return rules;
}

function registerRules(config, context) {
  let register = readRegister(config, context);
  let rules = [];

  if (['tool', 'admin', 'editor', 'agent-workspace'].includes(register)) {
    rules.push(rangeRule(`register.${register}.density`, 'register', 'hard', 'density', { min: 68, max: 112 }, `${register} workspaces require dense but readable controls.`));
    rules.push(rangeRule(`register.${register}.motion`, 'register', 'soft', 'motion', { max: 130 }, `${register} workspaces should use utility motion.`));
    rules.push(rangeRule(`register.${register}.chroma`, 'register', 'soft', 'chroma', { max: 82 }, `${register} workspaces should avoid overpowering color.`));
  }

  if (register === 'presentation') {
    rules.push(rangeRule('register.presentation.density', 'register', 'hard', 'density', { min: 88, max: 140 }, 'Presentation registers require larger spacing.'));
    rules.push(rangeRule('register.presentation.type', 'register', 'hard', 'type', { min: 96 }, 'Presentation registers require larger text.'));
  }

  if (register === 'media-studio') {
    rules.push(rangeRule('register.media-studio.chroma', 'register', 'soft', 'chroma', { min: 12, max: 90 }, 'Media studio registers allow stronger expressive color.'));
  }

  return rules;
}

function componentFamilyRules(config, context) {
  let families = readComponentFamilies(config, context);
  let rules = [];

  if (families.includes('table')) {
    rules.push(rangeRule('family.table.density', 'component-family', 'hard', 'density', { min: 66, max: 104 }, 'Tables need compact rows without collapsing touch and scan targets.'));
    rules.push(rangeRule('family.table.type', 'component-family', 'hard', 'type', { min: 84 }, 'Table text must remain readable.'));
  }

  if (families.includes('code-editor')) {
    rules.push(rangeRule('family.code-editor.density', 'component-family', 'hard', 'density', { min: 64, max: 98 }, 'Code editors require compact working density.'));
    rules.push(rangeRule('family.code-editor.type', 'component-family', 'hard', 'type', { min: 86 }, 'Code editor text must not drop below legible scale.'));
    rules.push(rangeRule('family.code-editor.chroma', 'component-family', 'soft', 'chroma', { max: 74 }, 'Code editors should not use highly saturated surfaces.'));
  }

  if (families.includes('graph')) {
    rules.push(rangeRule('family.graph.outline', 'component-family', 'hard', 'outline', { min: 42 }, 'Graph sockets and selected nodes need visible outlines.'));
    rules.push(rangeRule('family.graph.data-palette', 'component-family', 'hard', 'dataPalette', { min: 70 }, 'Graph clusters need distinguishable colors.'));
  }

  if (families.includes('chat')) {
    rules.push(rangeRule('family.chat.type', 'component-family', 'soft', 'type', { min: 90 }, 'Chat surfaces benefit from slightly larger text.'));
  }

  return rules;
}

function recipeRules(config) {
  return [...(RECIPE_RULES[readRecipe(config)] ?? [])];
}

function brandContextRules(config, context) {
  let brand = {
    ...config.design?.brand,
    ...config.theme?.brand,
    ...context.brand,
  };
  let rules = [];

  if (brand.context === 'regulated' || brand.tone === 'enterprise') {
    rules.push(rangeRule('brand.regulated.chroma', 'brand-context', 'soft', 'chroma', { max: 64 }, 'Regulated and enterprise contexts should keep chroma restrained.'));
    rules.push(rangeRule('brand.regulated.motion', 'brand-context', 'soft', 'motion', { max: 110 }, 'Regulated and enterprise contexts should avoid expressive motion.'));
  }

  if (brand.expression === 'high') {
    rules.push(rangeRule('brand.expression.chroma', 'brand-context', 'soft', 'chroma', { min: 24 }, 'High-expression brand contexts should preserve a visible color signature.'));
  }

  return rules;
}

function userTweakRules(config, context) {
  let policy = {
    ...config.design?.userTweakPolicy,
    ...context.userTweakPolicy,
  };
  let rules = [];

  for (let [parameter, range] of Object.entries(policy.parameterRanges ?? {})) {
    if (PARAMETER_RANGES[parameter]) {
      rules.push(rangeRule(`user.${parameter}.preferred-range`, 'user-tweak', 'soft', parameter, range, `User tweak policy prefers ${parameter} in this range.`));
    }
  }

  return rules;
}

function rangeRule(id, layer, severity, parameter, range, reason) {
  return makeRule({ id, layer, severity, parameter, range, reason });
}

function makeRule(rule) {
  return {
    priority: LAYER_PRIORITY.get(rule.layer) ?? LAYER_ORDER.length + 1,
    ...rule,
  };
}

function compareRules(a, b) {
  return a.priority - b.priority || a.id.localeCompare(b.id);
}

function describeRule(rule) {
  let fallbackRange = PARAMETER_RANGES[rule.parameter];
  return {
    id: rule.id,
    layer: rule.layer,
    priority: rule.priority,
    severity: rule.severity,
    parameter: rule.parameter,
    range: rule.range ? normalizeRange(rule.range, fallbackRange) : undefined,
    reason: rule.reason,
  };
}

function intersectRanges(baseRange, ranges) {
  let range = normalizeRange(baseRange);
  let hasConflict = false;

  for (let next of ranges) {
    let normalized = normalizeRange(next);
    range = {
      min: Math.max(range.min, normalized.min),
      max: Math.min(range.max, normalized.max),
    };
    if (range.min > range.max) hasConflict = true;
  }

  return { range, conflict: hasConflict };
}

function normalizeRange(range = {}, fallback = { min: -Infinity, max: Infinity }) {
  return {
    min: Number.isFinite(range.min) ? range.min : fallback.min,
    max: Number.isFinite(range.max) ? range.max : fallback.max,
  };
}

function isWithinRange(value, range) {
  return value >= range.min && value <= range.max;
}

function nearestValue(value, range) {
  if (value < range.min) return range.min;
  if (value > range.max) return range.max;
  return value;
}

function readThemeParams(config) {
  return {
    brightness: 0,
    chroma: 70,
    contrast: 58,
    dataPalette: 60,
    density: 100,
    heading: 100,
    hue: 218,
    mode: 'dark',
    motion: 100,
    outline: 38,
    pattern: 60,
    radius: 20,
    type: 100,
    ...(config.theme?.params ?? {}),
  };
}

function readRegister(config, context) {
  return config.design?.register ?? context.register ?? 'tool';
}

function readRecipe(config) {
  return config.theme?.recipe ?? 'agent-console';
}

function readMode(config, context) {
  return config.theme?.params?.mode ?? context.mode ?? 'dark';
}

function readDeviceMode(config, context) {
  return config.design?.deviceMode ?? context.deviceMode ?? 'desktop';
}

function readComponentFamilies(config, context) {
  let families = [
    ...(config.design?.componentFamilies ?? []),
    ...(context.componentFamilies ?? []),
    ...(context.modules ?? []),
  ];
  return [...new Set(families.filter(Boolean))];
}

function extractThemeParamEntries(patch) {
  let params = patch.params ?? patch.theme?.params ?? patch;
  if (!params || typeof params !== 'object' || Array.isArray(params)) return [];

  return Object.entries(params)
    .filter(([parameter]) => !THEME_METADATA_KEYS.has(parameter))
    .map(([parameter, value]) => ({
      parameter,
      value,
      path: patch.params || patch.theme?.params ? `/params/${escapeJsonPointer(parameter)}` : `/${escapeJsonPointer(parameter)}`,
    }));
}

function validateOverrides(patch) {
  let overrides = patch.overrides ?? patch.theme?.overrides;
  if (!overrides || typeof overrides !== 'object') return [];

  let violations = [];
  for (let [token, value] of Object.entries(overrides)) {
    let path = `/overrides/${escapeJsonPointer(token)}`;
    if (!token.startsWith('--sn-')) {
      violations.push({
        status: 'blocked',
        severity: 'hard',
        parameter: 'theme.overrides',
        path,
        value,
        reason: 'Theme overrides may only target Symbiote --sn-* tokens.',
        rules: [describeRule(makeRule({
          id: 'override.symbiote-token-only',
          layer: 'host-policy',
          severity: 'hard',
          reason: 'Concrete overrides stay inside the public Symbiote token namespace.',
        }))],
      });
    } else {
      violations.push({
        status: 'warn',
        severity: 'soft',
        parameter: 'theme.overrides',
        path,
        value,
        reason: 'Concrete token overrides are a bounded escape hatch; prefer params and relations when possible.',
        rules: [describeRule(makeRule({
          id: 'override.prefer-params',
          layer: 'user-tweak',
          severity: 'soft',
          reason: 'Overrides should remain sparse and intentional.',
        }))],
      });
    }
  }
  return violations;
}

function suggestOverridePatches(patch) {
  let overrides = patch.overrides ?? patch.theme?.overrides;
  if (!overrides || typeof overrides !== 'object') return [];

  return Object.keys(overrides)
    .filter((token) => !token.startsWith('--sn-'))
    .map((token) => ({
      op: 'remove',
      path: `/overrides/${escapeJsonPointer(token)}`,
      reason: 'Remove non-Symbiote token override.',
    }));
}

function buildValidationResult(kind, constraints, violations, suggestedPatches) {
  let status = 'pass';
  if (violations.some((violation) => violation.status === 'blocked')) {
    status = 'blocked';
  } else if (violations.some((violation) => violation.status === 'warn')) {
    status = 'warn';
  }

  return {
    version: 'design-policy-v1',
    kind,
    status,
    constraints,
    violations,
    suggestedPatches,
  };
}

function escapeJsonPointer(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}
