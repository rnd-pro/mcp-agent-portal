/**
 * CommentShape — wide annotation banner node
 *
 * No sockets, no header, no controls.
 * Just text content with semi-transparent background.
 * Used for annotations and documentation on the canvas.
 *
 * @module symbiote-ui/shapes/CommentShape
 */

import { NodeShape } from './NodeShape.js';

export class CommentShape extends NodeShape {
  name = 'comment';

  getSocketPosition() {
    return { x: 0, y: 0, angle: 0 };
  }

  getBorderRadius() {
    return 'var(--sn-comment-radius, 6px)';
  }

  get hasHeader() {
    return false;
  }

  get hasControls() {
    return false;
  }

  getMinSize() {
    return { minWidth: 200, minHeight: 40 };
  }
}
