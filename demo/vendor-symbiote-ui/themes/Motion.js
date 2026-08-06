/**
 * Motion — motion and animation design tokens
 *
 * Contains properties related to transition scales, durations, and easings.
 * Separated from color (Palette) and geometry (Skin) for independent composition.
 *
 * @module symbiote-ui/themes/Motion
 */

/**
 * @typedef {Object} MotionDefinition
 * @property {string} name - Preset name
 * @property {Object<string, string>} motion - Transition CSS variables
 */

/** @type {MotionDefinition} */
export let DEFAULT_MOTION = {
  name: 'default',
  motion: {
    '--sn-theme-motion-scale': '1.00',
    '--sn-motion-enabled': '1',
    '--sn-animation-play-state': 'running',
    '--sn-animation-duration-scale': '1.00',
    '--sn-animation-duration-fast': '600ms',
    '--sn-animation-duration-normal': '1000ms',
    '--sn-animation-duration-slow': '1500ms',
    '--sn-animation-duration-slower': '2000ms',
    '--sn-transition-fast': '120ms',
    '--sn-transition-normal': '240ms',
    '--sn-transition-slow': '400ms',
    '--sn-transition-easing': 'ease',
  },
};

/** @type {MotionDefinition} */
export let SMOOTH_MOTION = {
  name: 'smooth',
  motion: {
    '--sn-theme-motion-scale': '1.20',
    '--sn-motion-enabled': '1',
    '--sn-animation-play-state': 'running',
    '--sn-animation-duration-scale': '1.20',
    '--sn-animation-duration-fast': '720ms',
    '--sn-animation-duration-normal': '1200ms',
    '--sn-animation-duration-slow': '1800ms',
    '--sn-animation-duration-slower': '2400ms',
    '--sn-transition-fast': '150ms',
    '--sn-transition-normal': '300ms',
    '--sn-transition-slow': '500ms',
    '--sn-transition-easing': 'cubic-bezier(0.25, 1, 0.5, 1)',
  },
};

/** @type {MotionDefinition} */
export let FAST_MOTION = {
  name: 'fast',
  motion: {
    '--sn-theme-motion-scale': '0.60',
    '--sn-motion-enabled': '1',
    '--sn-animation-play-state': 'running',
    '--sn-animation-duration-scale': '0.60',
    '--sn-animation-duration-fast': '360ms',
    '--sn-animation-duration-normal': '600ms',
    '--sn-animation-duration-slow': '900ms',
    '--sn-animation-duration-slower': '1200ms',
    '--sn-transition-fast': '70ms',
    '--sn-transition-normal': '140ms',
    '--sn-transition-slow': '240ms',
    '--sn-transition-easing': 'ease',
  },
};

/** @type {MotionDefinition} */
export let DISABLED_MOTION = {
  name: 'disabled',
  motion: {
    '--sn-theme-motion-scale': '0.00',
    '--sn-motion-enabled': '0',
    '--sn-animation-play-state': 'paused',
    '--sn-animation-duration-scale': '0.00',
    '--sn-animation-duration-fast': '0ms',
    '--sn-animation-duration-normal': '0ms',
    '--sn-animation-duration-slow': '0ms',
    '--sn-animation-duration-slower': '0ms',
    '--sn-transition-fast': '0ms',
    '--sn-transition-normal': '0ms',
    '--sn-transition-slow': '0ms',
    '--sn-transition-easing': 'linear',
  },
};

export const MOTION_PRESET_DEFINITIONS = Object.freeze({
  default: DEFAULT_MOTION,
  smooth: SMOOTH_MOTION,
  fast: FAST_MOTION,
  disabled: DISABLED_MOTION,
});

export function getMotionPresetOptions(name = 'default') {
  let definition = MOTION_PRESET_DEFINITIONS[name] || MOTION_PRESET_DEFINITIONS.default;
  let scale = Number.parseFloat(definition.motion['--sn-theme-motion-scale']);
  return { motion: Number.isFinite(scale) ? Math.round(scale * 100) : 100 };
}

/**
 * Apply motion preset to element
 * @param {HTMLElement} element
 * @param {MotionDefinition} motionDef
 */
export function applyMotion(element, motionDef) {
  for (const [key, value] of Object.entries(motionDef.motion)) {
    element.style.setProperty(key, value);
  }
}

/**
 * Scoped animation manager to track and cleanly cancel animations.
 */
export class ScopedAnimationScope {
  /**
   * @param {HTMLElement} [container]
   */
  constructor(container) {
    this.container = container || null;
    this.activeAnimations = new Set();
  }

  /**
   * Run a scoped WAAPI animation
   * @param {HTMLElement} element
   * @param {Keyframe[]|PropertyIndexedKeyframes} keyframes
   * @param {number|KeyframeAnimationOptions} options
   * @returns {Animation}
   */
  animate(element, keyframes, options) {
    const animation = element.animate(keyframes, options);
    this.activeAnimations.add(animation);
    const cleanup = () => {
      this.activeAnimations.delete(animation);
    };
    animation.addEventListener('finish', cleanup);
    animation.addEventListener('cancel', cleanup);
    return animation;
  }

  /**
   * Cancel all registered active animations in this scope
   */
  cancelAll() {
    for (const anim of this.activeAnimations) {
      anim.cancel();
    }
    this.activeAnimations.clear();
  }
}

/**
 * Lightweight spring physics helper using requestAnimationFrame
 * @param {HTMLElement} element
 * @param {object} options
 * @param {string} options.key - CSS property name or CSS variable name
 * @param {number} options.from - Start value
 * @param {number} options.to - Target value
 * @param {number} [options.stiffness=100]
 * @param {number} [options.damping=10]
 * @param {number} [options.mass=1]
 * @param {number} [options.velocity=0]
 * @param {function} [options.onUpdate]
 * @returns {{ cancel: function }}
 */
export function animateSpring(element, options = {}) {
  const {
    key,
    from,
    to,
    stiffness = 100,
    damping = 10,
    mass = 1,
    velocity = 0,
    onUpdate,
  } = options;

  let current = from;
  let vel = velocity;
  let active = true;
  let lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const step = (now) => {
    if (!active) return;
    const dt = Math.min((now - lastTime) / 1000, 0.1); // cap dt at 100ms
    lastTime = now;

    const fSpring = -stiffness * (current - to);
    const fDamp = -damping * vel;
    const a = (fSpring + fDamp) / mass;
    vel += a * dt;
    current += vel * dt;

    if (element && key) {
      if (key.startsWith('--')) {
        element.style.setProperty(key, String(current));
      } else {
        element.style[key] = typeof current === 'number' && !['opacity', 'zIndex', 'fontWeight'].includes(key) ? `${current}px` : String(current);
      }
    }
    if (onUpdate) onUpdate(current);

    if (Math.abs(vel) < 0.001 && Math.abs(current - to) < 0.001) {
      current = to;
      if (element && key) {
        if (key.startsWith('--')) {
          element.style.setProperty(key, String(to));
        } else {
          element.style[key] = typeof to === 'number' && !['opacity', 'zIndex', 'fontWeight'].includes(key) ? `${to}px` : String(to);
        }
      }
      if (onUpdate) onUpdate(to);
      active = false;
      return;
    }
    requestAnimationFrame(step);
  };

  requestAnimationFrame((time) => {
    lastTime = time;
    step(time);
  });

  return {
    cancel: () => {
      active = false;
    },
  };
}

/**
 * Stagger animations across a list of elements
 * @param {HTMLElement[]|NodeList} elements
 * @param {Keyframe[]|PropertyIndexedKeyframes} keyframes
 * @param {object} options
 * @param {number} [options.delay=50] - delay between each element in ms
 * @param {number} [options.duration=300]
 * @param {string} [options.easing='ease']
 * @param {number} [options.delayStart=0]
 * @returns {Animation[]}
 */
export function stagger(elements, keyframes, options = {}) {
  const { delay = 50, duration = 300, easing = 'ease', delayStart = 0, ...rest } = options;
  return Array.from(elements).map((el, index) => {
    return el.animate(keyframes, {
      duration,
      easing,
      delay: delayStart + index * delay,
      fill: 'both',
      ...rest,
    });
  });
}

/**
 * PointerEvent-based drag and drop affordance helper
 * @param {HTMLElement} element
 * @param {object} options
 * @param {function} [options.onStart]
 * @param {function} [options.onMove]
 * @param {function} [options.onEnd]
 * @returns {{ destroy: function }}
 */
export function makeDraggable(element, options = {}) {
  const { onStart, onMove, onEnd } = options;
  let startX = 0, startY = 0;
  let initialX = 0, initialY = 0;

  const handlePointerDown = (e) => {
    if (e.button !== 0) return; // only left click
    if (typeof element.setPointerCapture === 'function') {
      element.setPointerCapture(e.pointerId);
    }
    startX = e.clientX;
    startY = e.clientY;

    const transform = typeof window !== 'undefined' ? window.getComputedStyle(element).transform : '';
    if (transform && transform !== 'none') {
      try {
        const matrix = new DOMMatrix(transform);
        initialX = matrix.e;
        initialY = matrix.f;
      } catch (err) {
        initialX = 0;
        initialY = 0;
      }
    } else {
      initialX = 0;
      initialY = 0;
    }

    if (onStart) onStart({ x: initialX, y: initialY, event: e });

    element.addEventListener('pointermove', handlePointerMove);
    element.addEventListener('pointerup', handlePointerUp);
    element.addEventListener('pointercancel', handlePointerUp);
  };

  const handlePointerMove = (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const currentX = initialX + dx;
    const currentY = initialY + dy;

    element.style.transform = `translate(${currentX}px, ${currentY}px)`;
    if (onMove) onMove({ x: currentX, y: currentY, event: e });
  };

  const handlePointerUp = (e) => {
    if (typeof element.releasePointerCapture === 'function') {
      element.releasePointerCapture(e.pointerId);
    }
    element.removeEventListener('pointermove', handlePointerMove);
    element.removeEventListener('pointerup', handlePointerUp);
    element.removeEventListener('pointercancel', handlePointerUp);

    const transform = typeof window !== 'undefined' ? window.getComputedStyle(element).transform : '';
    let finalX = initialX;
    let finalY = initialY;
    if (transform && transform !== 'none') {
      try {
        const matrix = new DOMMatrix(transform);
        finalX = matrix.e;
        finalY = matrix.f;
      } catch (err) {
        // use current fallback
      }
    }
    if (onEnd) onEnd({ x: finalX, y: finalY, event: e });
  };

  element.addEventListener('pointerdown', handlePointerDown);

  return {
    destroy: () => {
      element.removeEventListener('pointerdown', handlePointerDown);
      element.removeEventListener('pointermove', handlePointerMove);
      element.removeEventListener('pointerup', handlePointerUp);
      element.removeEventListener('pointercancel', handlePointerUp);
    },
  };
}
