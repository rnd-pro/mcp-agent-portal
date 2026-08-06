import {
  BEATS,
  DURATION_MS,
  PHASES,
  clampTime,
  formatAccessibleTime,
  getStateAtTime,
  wrapTime,
} from './timeline.js';

const PLAY_ICON = 'M8 5v14l11-7z';
const PAUSE_ICON = 'M6 19h4V5H6v14zm8-14v14h4V5h-4z';

const REQUIRED_IDS = [
  'scene-container',
  'btn-play-pause',
  'play-pause-icon',
  'txt-play-pause',
  'btn-replay',
  'timeline-seek',
  'time-display',
  'status-label',
  'status-explanation',
  'caption-pill',
  'val-kpi-status',
  'val-kpi-metric',
  'polite-announcer',
];

/**
 * @param {Document} root
 * @param {string} id
 * @returns {HTMLElement | SVGElement}
 */
function requireElement(root, id) {
  let element = root.getElementById(id);
  if (!element) {
    throw new Error(`Symbiote UI animation is missing required element "#${id}".`);
  }
  return element;
}

/**
 * @param {Document} root
 * @returns {Record<string, HTMLElement | SVGElement>}
 */
function collectElements(root) {
  return Object.fromEntries(REQUIRED_IDS.map((id) => [id, requireElement(root, id)]));
}

/**
 * @param {Document} root
 * @returns {{destroy: Function, pause: Function, play: Function, seek: Function}}
 */
export function createSymbioteAnimation(root) {
  if (!root?.defaultView) {
    throw new Error('Symbiote UI animation requires a browser Document.');
  }

  let view = root.defaultView;
  let elements = collectElements(root);

  let phaseButtons = Array.from(root.querySelectorAll('[data-seek-time]'));
  if (phaseButtons.length !== BEATS.length) {
    throw new Error(`Symbiote UI animation requires ${BEATS.length} phase controls.`);
  }

  phaseButtons.forEach((button, index) => {
    if (
      button.dataset.phase !== BEATS[index].phase ||
      Number(button.dataset.seekTime) !== BEATS[index].startMs
    ) {
      throw new Error(`Phase control ${index + 1} does not match its timeline beat.`);
    }
  });

  let abortController = new AbortController();
  let mediaQuery = view.matchMedia('(prefers-reduced-motion: reduce)');

  let clockTarget = root.createElement('span');
  let timeline = root.timeline || null;
  let clock = null;

  let startTimestamp = null;
  let clockCurrentTime = 0;

  if (timeline) {
    let effect = new view.KeyframeEffect(
      clockTarget,
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: DURATION_MS, iterations: Infinity, easing: 'linear' },
    );
    clock = new view.Animation(effect, timeline);
  }

  let frameId = null;
  let destroyed = false;
  let playing = false;
  let userPaused = false;
  let visibilityPaused = root.hidden;
  let reducedMotion = mediaQuery.matches;
  let lastPhase = null;
  let lastRenderBucket = -1;
  let observer = null;
  let intersectionPaused = false;

  let getClockTime = () => {
    if (clock) {
      return Number(clock.currentTime ?? 0);
    }
    if (playing && startTimestamp !== null) {
      let now = view.performance.now();
      let elapsed = now - startTimestamp + clockCurrentTime;
      return elapsed;
    }
    return clockCurrentTime;
  };

  let setClockTime = (timeMs) => {
    let clamped = clampTime(timeMs);
    if (clock) {
      clock.currentTime = clamped;
    } else {
      clockCurrentTime = clamped;
      if (playing) {
        startTimestamp = view.performance.now();
      }
    }
  };

  let alignVisualAnimations = (timeMs) => {
    let state = getStateAtTime(timeMs);
    let svg = root.getElementById('animation-svg');
    if (svg) {
      let core = svg.querySelector('.svg-core-ring');
      if (core && !reducedMotion) {
        let deg = (timeMs / DURATION_MS) * 360 * 3;
        core.setAttribute('transform', `rotate(${deg} 400 225)`);
      }

      BEATS.forEach((beat) => {
        let group = root.getElementById(`group-${beat.phase}`);
        if (group) {
          if (beat.phase === state.phase) {
            group.setAttribute('opacity', '1');
            group.style.display = '';
          } else {
            group.setAttribute('opacity', '0.15');
          }
        }
      });

      let progress = state.phaseProgress;
      let hydBar = root.getElementById('hydration-bar-fill');
      if (hydBar) {
        if (state.phase === PHASES.HYDRATE) {
          hydBar.setAttribute('width', `${progress * 120}`);
        } else if (state.phase === PHASES.READY) {
          hydBar.setAttribute('width', '120');
        } else {
          hydBar.setAttribute('width', '0');
        }
      }
      if (state.phase === PHASES.DISCOVER) {
        let discRay = root.getElementById('discovery-ray');
        if (discRay && !reducedMotion) {
          let scale = 0.8 + Math.sin(timeMs / 100) * 0.2;
          discRay.setAttribute('transform', `scale(${scale}) translate(${(1 - scale) * 400} 0)`);
        }
      }
    }
  };

  let playVisualAnimations = (timeMs) => {
    alignVisualAnimations(timeMs);
  };

  let pauseVisualAnimations = (timeMs) => {
    alignVisualAnimations(timeMs);
  };

  let renderPhase = (state) => {
    elements['scene-container'].dataset.phase = state.phase;
    elements['status-label'].textContent = state.label;
    elements['status-explanation'].textContent = state.explanation;
    elements['caption-pill'].textContent = state.caption;

    for (let button of phaseButtons) {
      let active = button.dataset.phase === state.phase;
      if (active) {
        button.setAttribute('aria-current', 'step');
        button.classList.add('active');
      } else {
        button.removeAttribute('aria-current');
        button.classList.remove('active');
      }
    }
  };

  let render = (timeMs, options = {}) => {
    let force = options.force ?? false;
    let state = getStateAtTime(timeMs);
    let phaseChanged = state.phase !== lastPhase;
    let renderBucket = Math.floor(timeMs / 50);
    if (!force && !phaseChanged && renderBucket === lastRenderBucket) {
      return;
    }
    lastRenderBucket = renderBucket;

    if (phaseChanged) {
      lastPhase = state.phase;
      renderPhase(state);
    }

    elements['val-kpi-status'].textContent = state.statusText;
    elements['val-kpi-metric'].textContent = state.metric;

    alignVisualAnimations(timeMs);

    if (root.activeElement !== elements['timeline-seek'] || force) {
      elements['timeline-seek'].value = Math.round(timeMs).toString();
    }

    elements['timeline-seek'].setAttribute('aria-valuetext', formatAccessibleTime(timeMs));
    elements['time-display'].textContent =
      `${(timeMs / 1000).toFixed(2)}s / ${(DURATION_MS / 1000).toFixed(2)}s`;
  };

  let cancelFrame = () => {
    if (frameId !== null) {
      view.cancelAnimationFrame(frameId);
      frameId = null;
    }
  };

  let tick = () => {
    frameId = null;
    if (!playing || destroyed) {
      return;
    }
    let rawTime = getClockTime();
    if (rawTime >= DURATION_MS) {
      setClockTime(0);
      rawTime = 0;
    }
    let visualTime = wrapTime(rawTime);
    render(visualTime);
    frameId = view.requestAnimationFrame(tick);
  };

  let updatePlaybackButton = () => {
    let button = elements['btn-play-pause'];
    let label = elements['txt-play-pause'];
    let icon = elements['play-pause-icon'];
    button.disabled = reducedMotion;

    if (reducedMotion) {
      label.textContent = 'Motion reduced';
      button.setAttribute('aria-label', 'Animation disabled by reduced motion preference');
      icon.setAttribute('d', PLAY_ICON);
    } else if (playing) {
      label.textContent = 'Pause';
      button.setAttribute('aria-label', 'Pause animation');
      icon.setAttribute('d', PAUSE_ICON);
    } else {
      label.textContent = 'Play';
      button.setAttribute('aria-label', 'Play animation');
      icon.setAttribute('d', PLAY_ICON);
    }
  };

  let pauseClock = () => {
    let visualTime = wrapTime(getClockTime());
    playing = false;
    if (clock) {
      clock.pause();
    }
    setClockTime(visualTime);
    pauseVisualAnimations(visualTime);
    cancelFrame();
    render(visualTime, { force: true });
  };

  let syncPlayback = () => {
    if (destroyed) {
      return;
    }
    let shouldPlay = !userPaused && !visibilityPaused && !reducedMotion && !destroyed && !intersectionPaused;
    let scene = elements['scene-container'];
    if (shouldPlay && !playing) {
      let visualTime = wrapTime(getClockTime());
      if (visualTime >= DURATION_MS) {
        visualTime = 0;
      }
      playing = true;
      if (clock) {
        clock.play();
      }
      setClockTime(visualTime);
      playVisualAnimations(visualTime);
      scene.classList.remove('is-paused');
      frameId = view.requestAnimationFrame(tick);
    } else if (!shouldPlay && playing) {
      pauseClock();
    }

    if (!playing) {
      scene.classList.add('is-paused');
    }
    updatePlaybackButton();
  };

  let seek = (timeMs) => {
    if (destroyed) {
      return;
    }
    let clampedTime = clampTime(timeMs);
    userPaused = true;
    syncPlayback();
    setClockTime(clampedTime);
    pauseVisualAnimations(clampedTime);
    render(clampedTime, { force: true });
    updatePlaybackButton();
  };

  let play = () => {
    if (destroyed || reducedMotion) {
      return;
    }
    userPaused = false;
    syncPlayback();
  };

  let pause = () => {
    if (destroyed) {
      return;
    }
    userPaused = true;
    syncPlayback();
  };

  let destroy = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    playing = false;
    userPaused = true;
    elements['scene-container'].classList.add('is-destroyed', 'is-paused');
    let container = elements['scene-container'].parentElement || elements['scene-container'];
    container.classList.remove('js-enhanced');
    abortController.abort();
    cancelFrame();
    if (clock) {
      clock.cancel();
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    updatePlaybackButton();
  };

  let announce = (message) => {
    elements['polite-announcer'].textContent = message;
  };

  elements['btn-play-pause'].addEventListener('click', () => {
    if (playing) {
      pause();
      announce('Animation paused');
    } else {
      play();
      announce('Animation started');
    }
  }, { signal: abortController.signal });

  elements['btn-replay'].addEventListener('click', () => {
    userPaused = false;
    setClockTime(0);
    alignVisualAnimations(0);
    render(0, { force: true });
    syncPlayback();
    announce('Animation replayed');
  }, { signal: abortController.signal });

  elements['timeline-seek'].addEventListener('input', () => {
    let seekVal = Number(elements['timeline-seek'].value);
    seek(seekVal);
    let state = getStateAtTime(seekVal);
    announce(`Seeked to ${(seekVal / 1000).toFixed(1)}s, Phase: ${state.label}`);
  }, { signal: abortController.signal });

  elements['timeline-seek'].addEventListener('focus', pause, {
    signal: abortController.signal,
  });

  for (let button of phaseButtons) {
    button.addEventListener('click', () => {
      let seekVal = Number(button.dataset.seekTime);
      seek(seekVal);
      let state = getStateAtTime(seekVal);
      announce(`Selected Phase: ${state.label}`);
    }, { signal: abortController.signal });
  }

  mediaQuery.addEventListener('change', (event) => {
    let visualTime = wrapTime(getClockTime());
    reducedMotion = event.matches;
    syncPlayback();
    if (playing) {
      playVisualAnimations(visualTime);
    } else {
      pauseVisualAnimations(visualTime);
    }
    render(visualTime, { force: true });
  }, { signal: abortController.signal });

  root.addEventListener('visibilitychange', () => {
    visibilityPaused = root.hidden;
    syncPlayback();
  }, { signal: abortController.signal });

  let handlePagehide = (event) => {
    if (event.persisted) {
      visibilityPaused = true;
      syncPlayback();
    } else {
      destroy();
    }
  };

  let handlePageshow = (event) => {
    if (event.persisted) {
      visibilityPaused = root.hidden;
      syncPlayback();
    }
  };

  view.addEventListener('pagehide', handlePagehide, { signal: abortController.signal });
  view.addEventListener('pageshow', handlePageshow, { signal: abortController.signal });

  if (typeof view.IntersectionObserver !== 'undefined') {
    observer = new view.IntersectionObserver((entries) => {
      let isIntersecting = entries.some((entry) => entry.isIntersecting);
      intersectionPaused = !isIntersecting;
      syncPlayback();
    }, {
      root: null,
      threshold: 0,
    });
    observer.observe(elements['scene-container']);
  }

  setClockTime(0);
  alignVisualAnimations(0);
  syncPlayback();
  render(0, { force: true });

  let container = elements['scene-container'].parentElement || elements['scene-container'];
  container.classList.add('js-enhanced');

  return Object.freeze({
    destroy,
    pause,
    play,
    seek,
  });
}

export const animationController = typeof document === 'undefined'
  ? null
  : createSymbioteAnimation(document);
