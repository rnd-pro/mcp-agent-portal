/**
 * flow/if — Conditional branching node
 *
 * Routes data to 'true' or 'false' output based on condition.
 * Condition can be a boolean input or a simple expression string.
 *
 * @module symbiote-engine/packs/flow/if
 */

/**
 * Evaluate a simple condition expression
 * Supports: ==, !=, >, <, >=, <=, ===, !==
 * @param {*} value - Value to test
 * @param {string} expression - Expression string
 * @returns {boolean}
 */
function evaluateCondition(value, expression) {
  if (typeof expression === 'boolean') return expression;
  if (typeof expression === 'string') {
    let trimmed = expression.trim();


    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;


    if (trimmed === 'data != null' || trimmed === 'data !== null') return value != null;
    if (trimmed === 'data == null' || trimmed === 'data === null') return value == null;


    let match = trimmed.match(/^(.+?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/);
    if (match) {
      let [, left, op, right] = match;
      left = left.trim();
      right = right.trim();


      let leftVal = left === 'data' || left === 'value' ? value : parseValueLiteral(left);
      let rightVal = parseValueLiteral(right);

      let opMap = {
        '===': () => leftVal === rightVal,
        '!==': () => leftVal !== rightVal,
        '==': () => leftVal == rightVal,
        '!=': () => leftVal != rightVal,
        '>': () => leftVal > rightVal,
        '<': () => leftVal < rightVal,
        '>=': () => leftVal >= rightVal,
        '<=': () => leftVal <= rightVal,
      };

      if (opMap[op]) {
        return opMap[op]();
      }
    }
  }


  return !!value;
}

/**
 * Parse a literal value from condition string
 * @param {string} str
 * @returns {*}
 */
function parseValueLiteral(str) {
  if (str === 'null') return null;
  if (str === 'undefined') return undefined;
  if (str === 'true') return true;
  if (str === 'false') return false;
  if (str.startsWith("'") && str.endsWith("'")) return str.slice(1, -1);
  if (str.startsWith('"') && str.endsWith('"')) return str.slice(1, -1);
  let num = Number(str);
  if (!isNaN(num)) return num;
  return str;
}

export default {
  type: 'flow/if',
  category: 'flow',
  icon: 'call_split',

  driver: {
    description: 'Conditional branch — routes data by condition',
    inputs: [
      { name: 'condition', type: 'any' },
      { name: 'data', type: 'any' },
    ],
    outputs: [
      { name: 'true', type: 'any' },
      { name: 'false', type: 'any' },
    ],
    params: {
      expression: {
        type: 'string',
        default: '',
        description: 'Condition expression (optional, overrides condition input)',
      },
    },
  },

  lifecycle: {
    validate: (inputs) => inputs.data !== undefined,
    execute: (inputs, params) => {
      let condValue = params.expression
        ? evaluateCondition(inputs.data, params.expression)
        : !!inputs.condition;

      return condValue ? { true: inputs.data, false: null } : { true: null, false: inputs.data };
    },
  },
};
