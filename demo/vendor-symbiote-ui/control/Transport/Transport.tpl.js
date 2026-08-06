import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-transport-buttons">
    <button ref="skipStartBtn" type="button" class="sn-transport-btn" aria-label="Skip to start">
      <svg class="sn-transport-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"></path>
      </svg>
    </button>
    <button ref="stepBackBtn" type="button" class="sn-transport-btn" aria-label="Step back">
      <svg class="sn-transport-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6h2v12H6zm12 0v12l-8-6z"></path>
      </svg>
    </button>
    <button ref="playBtn" type="button" class="sn-transport-btn sn-transport-btn-play" aria-label="Play">
      <svg ref="playIcon" class="sn-transport-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5v14l11-7z"></path>
      </svg>
      <svg ref="pauseIcon" class="sn-transport-icon" viewBox="0 0 24 24" aria-hidden="true" hidden>
        <path d="M6 5h4v14H6zm8 0h4v14h-4z"></path>
      </svg>
    </button>
    <button ref="stopBtn" type="button" class="sn-transport-btn" aria-label="Stop">
      <svg class="sn-transport-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6h12v12H6z"></path>
      </svg>
    </button>
    <button ref="stepForwardBtn" type="button" class="sn-transport-btn" aria-label="Step forward">
      <svg class="sn-transport-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 6h2v12h-2zM6 6v12l8-6z"></path>
      </svg>
    </button>
    <button ref="skipEndBtn" type="button" class="sn-transport-btn" aria-label="Skip to end">
      <svg class="sn-transport-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 6h2v12h-2zM6 6v12l8.5-6z"></path>
      </svg>
    </button>
  </div>

  <span ref="time" class="sn-transport-time">0:00 / 0:00</span>

  <input ref="scrub" type="range" class="sn-transport-scrub" min="0" max="0" value="0" aria-label="Seek" hidden>
`;
