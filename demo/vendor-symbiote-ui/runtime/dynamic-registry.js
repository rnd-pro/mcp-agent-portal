export const DEFAULT_BLOCKED_COMPONENT_CODE_PATTERNS = Object.freeze([
  'document.cookie',
  'document.write',
  'localStorage',
  'sessionStorage',
  'IndexedDB',
  'eval(',
  'new Function(',
  'process.env',
  'process.exit',
  'require(',
]);

/**
 * Validate JavaScript code for dynamic component registration against security policies.
 * @param {string} code - JavaScript code string
 * @param {Object} [options={}] - Validation options
 * @returns {boolean} True if code passes validation
 */
export function validateComponentCode(code, options = {}) {
  if (typeof code !== 'string') {
    throw new Error('Component code must be a string.');
  }

  let blocked = [
    ...DEFAULT_BLOCKED_COMPONENT_CODE_PATTERNS,
    ...(Array.isArray(options.blockedKeywords) ? options.blockedKeywords : []),
  ];

  for (let keyword of blocked) {
    if (code.includes(keyword)) {
      throw new Error(`Security violation: Code contains blocked keyword/expression "${keyword}"`);
    }
  }

  if (typeof options.validate === 'function') {
    let ok = options.validate(code);
    if (!ok) {
      throw new Error('Security violation: Custom validation failed.');
    }
  }

  return true;
}

/**
 * Create a registry manager for dynamically loading and registering Web Components.
 * @param {Object} [options={}]
 * @param {Object} [options.customElements] - CustomElementsRegistry provider override
 * @param {function} [options.validate] - Global code validation function
 * @param {string[]} [options.blockedKeywords] - Global list of blocked keywords
 * @param {function} [options.importModule] - Dynamic import function override for testing
 * @returns {Object} DynamicComponentRegistry controller instance
 */
export function createDynamicComponentRegistry(options = {}) {
  let customReg = options.customElements || (typeof globalThis !== 'undefined' ? globalThis.customElements : null);
  let definitions = new Map();
  let importFn = options.importModule || ((url) => import(url));

  return {
    definitions,

    has(tagName) {
      let norm = String(tagName).toLowerCase();
      return definitions.has(norm) || (customReg && typeof customReg.get === 'function' && Boolean(customReg.get(norm)));
    },

    get(tagName) {
      let norm = String(tagName).toLowerCase();
      let local = definitions.get(norm);
      if (local) return local.classDefinition;
      if (customReg && typeof customReg.get === 'function') {
        return customReg.get(norm);
      }
      return undefined;
    },

    list() {
      return [...definitions.entries()].map(([tagName, meta]) => ({
        tagName,
        ...meta,
      }));
    },

    async register(tagName, codeOrClass, registerOptions = {}) {
      let norm = String(tagName).toLowerCase();

      if (!norm.includes('-')) {
        throw new Error(`Invalid custom element name "${tagName}". Tag name must contain a hyphen.`);
      }

      if (customReg && typeof customReg.get === 'function') {
        let existing = customReg.get(norm);
        if (existing) {
          let local = definitions.get(norm);
          let isSame = false;
          if (typeof codeOrClass === 'function' && existing === codeOrClass) {
            isSame = true;
          } else if (local && typeof codeOrClass === 'string' && local.code === codeOrClass) {
            isSame = true;
          }

          if (isSame) {
            return existing;
          }

          if (registerOptions.allowOverride !== true) {
            throw new Error(`Custom element "${tagName}" is already defined in the global customElements registry.`);
          }
          return existing;
        }
      }

      let ClassDef = null;
      let sourceCode = null;

      if (typeof codeOrClass === 'string') {
        sourceCode = codeOrClass;
        let valOpts = {
          blockedKeywords: registerOptions.blockedKeywords || options.blockedKeywords,
          validate: registerOptions.validate || options.validate,
        };
        validateComponentCode(sourceCode, valOpts);

        let url;
        if (typeof globalThis.Blob !== 'undefined' && typeof globalThis.URL?.createObjectURL === 'function') {
          let blob = new Blob([sourceCode], { type: 'application/javascript' });
          url = URL.createObjectURL(blob);
        } else {
          // Fallback if URL.createObjectURL is not available (some strict environments or testing)
          url = 'data:text/javascript;base64,' + Buffer.from(sourceCode).toString('base64');
        }

        try {
          let module = await importFn(url);
          ClassDef = module.default || module[registerOptions.exportName || 'default'];
          if (!ClassDef) {
            let exportsList = Object.keys(module);
            if (exportsList.length === 1) {
              ClassDef = module[exportsList[0]];
            }
          }
        } finally {
          if (url.startsWith('blob:') && typeof globalThis.URL?.revokeObjectURL === 'function') {
            URL.revokeObjectURL(url);
          }
        }

        if (typeof ClassDef !== 'function') {
          throw new Error(`Failed to extract a valid class constructor from dynamic module for tag "${tagName}".`);
        }
      } else if (typeof codeOrClass === 'function') {
        ClassDef = codeOrClass;
      } else {
        throw new Error('Component definition must be a code string or a class constructor.');
      }

      if (customReg && typeof customReg.define === 'function') {
        customReg.define(norm, ClassDef);
      }

      definitions.set(norm, {
        classDefinition: ClassDef,
        code: sourceCode,
        registeredAt: Date.now(),
      });

      return ClassDef;
    }
  };
}
