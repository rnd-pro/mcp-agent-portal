/**
 * Shape registry — maps shape names to implementations
 * @module symbiote-ui/shapes/index
 */

import { NodeShape } from './NodeShape.js';
import { RectShape } from './RectShape.js';
import { PillShape } from './PillShape.js';
import { CircleShape } from './CircleShape.js';
import { DiamondShape } from './DiamondShape.js';
import { CommentShape } from './CommentShape.js';
import { SVGShape, createSVGShape, SVG_PRESETS } from './SVGShape.js';

/** @type {Map<string, NodeShape>} */
let registry = new Map();


const RECT = new RectShape();
const PILL = new PillShape();
const CIRCLE = new CircleShape();
const DIAMOND = new DiamondShape();
const COMMENT = new CommentShape();

registry.set('rect', RECT);
registry.set('pill', PILL);
registry.set('circle', CIRCLE);
registry.set('diamond', DIAMOND);
registry.set('comment', COMMENT);


for (const [name, pathData] of Object.entries(SVG_PRESETS)) {
  registry.set(name, createSVGShape(name, pathData));
}

/**
 * Get shape by name
 * @param {string} name
 * @returns {NodeShape}
 */
export function getShape(name) {
  return registry.get(name) || RECT;
}

/**
 * Register custom shape
 * @param {string} name
 * @param {NodeShape} shape
 */
export function registerShape(name, shape) {
  registry.set(name, shape);
}

export {
  NodeShape,
  RectShape,
  PillShape,
  CircleShape,
  DiamondShape,
  CommentShape,
  SVGShape,
  createSVGShape,
  SVG_PRESETS,
};
