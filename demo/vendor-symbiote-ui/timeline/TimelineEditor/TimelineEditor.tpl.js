import { html } from '@symbiotejs/symbiote';

export let timelineEditorTemplate = html`
  <div class="te-transport">
    <div class="te-transport-group te-transport-time">
      <span class="te-time" ${{ textContent: 'timeDisplay' }}></span>
    </div>
    <div class="te-transport-group te-transport-playback">
      <button data-action="skip-start" title="Skip to Start"><span class="material-symbols-outlined" aria-hidden="true">skip_previous</span></button>
      <button data-action="play" title="Play / Pause"><span class="material-symbols-outlined" aria-hidden="true" ${{ textContent: 'playIcon' }}></span></button>
      <button data-action="stop" title="Stop"><span class="material-symbols-outlined" aria-hidden="true">stop</span></button>
      <button data-action="skip-end" title="Skip to End"><span class="material-symbols-outlined" aria-hidden="true">skip_next</span></button>
    </div>
    <div class="te-transport-group te-transport-tools">
      <span class="te-zoom-label" ${{ textContent: 'zoomLabel' }}></span>
      <button data-action="zoom-out" title="Zoom Out"><span class="material-symbols-outlined" aria-hidden="true">remove</span></button>
      <button data-action="zoom-in" title="Zoom In"><span class="material-symbols-outlined" aria-hidden="true">add</span></button>
      <button data-action="fit" title="Fit to View"><span class="material-symbols-outlined" aria-hidden="true">fit_screen</span></button>
    </div>
  </div>
  <div class="te-body">
    <div class="te-headers" ${{ '@hidden': '!hasData' }}>
      <div class="te-headers-ruler-pad">Tracks</div>
      <div class="te-headers-scroll">
        <div class="te-headers-list" ref="headersList"></div>
      </div>
    </div>
    <div class="te-timeline-viewport" ref="timelineScroll" ${{ '@hidden': '!hasData', onscroll: 'timelineScroll' }}>
      <div class="te-timeline-content" ref="timelineContent" ${{ onclick: 'timelineClick' }}>
        <canvas class="te-ruler-canvas" ref="rulerCanvas"></canvas>
        <canvas class="te-tracks-canvas" ref="tracksCanvas"></canvas>
        <div class="te-playhead" ref="playhead"></div>
      </div>
    </div>
    <div class="te-empty" ${{ '@hidden': 'hasData' }}>
      No timeline data
    </div>
  </div>
`;
