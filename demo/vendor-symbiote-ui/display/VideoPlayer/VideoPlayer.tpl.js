import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-video-container">
    <video ref="video" class="sn-video-element" playsinline></video>
    
    <div class="sn-video-controls">
      <input ref="scrubBar" type="range" class="sn-video-scrub-bar" min="0" max="100" value="0">
      
      <div class="sn-video-controls-row">
        <div class="sn-video-controls-group">
          <button ref="playBtn" type="button" class="sn-video-btn" aria-label="Play">
            <span ref="playIcon" class="material-symbols-outlined">play_arrow</span>
          </button>
          
          <button ref="muteBtn" type="button" class="sn-video-btn" aria-label="Mute">
            <span ref="volumeIcon" class="material-symbols-outlined">volume_up</span>
          </button>
          <input ref="volumeSlider" type="range" class="sn-video-volume-slider" min="0" max="1" step="0.1" value="1">
          
          <span ref="timeDisplay" class="sn-video-time">0:00 / 0:00</span>
        </div>
        
        <div class="sn-video-controls-group">
          <button ref="fullscreenBtn" type="button" class="sn-video-btn" aria-label="Fullscreen">
            <span class="material-symbols-outlined">fullscreen</span>
          </button>
        </div>
      </div>
    </div>
  </div>
`;
