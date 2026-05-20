import { CanvasGraph as BaseCanvasGraph } from 'symbiote-node/ui';
import css from './CanvasGraph.css.js';

export class CanvasGraph extends BaseCanvasGraph {}

CanvasGraph.rootStyleSheets = [...(BaseCanvasGraph.rootStyleSheets || [])];
CanvasGraph.addRootStyles(css);
CanvasGraph.reg('pg-canvas-graph');
