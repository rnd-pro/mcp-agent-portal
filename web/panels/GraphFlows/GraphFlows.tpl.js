export default `
<div class="flows-shell">
  <header class="flows-header">
    <div class="flows-title">
      <span class="material-symbols-outlined">movie</span>
      Flows
    </div>
    <sn-button variant="icon" ref="refreshBtn" title="Reload flows" aria-label="Reload flows">
      <span class="material-symbols-outlined">refresh</span>
    </sn-button>
  </header>
  <div class="flows-list" ref="storyList"></div>
  <section class="flows-beat" ref="beatPanel" hidden>
    <div class="flows-beat-kicker" ref="beatKicker"></div>
    <h3 ref="beatTitle"></h3>
    <p ref="beatNarrative"></p>
    <div class="flows-tags" ref="beatTags"></div>
    <footer>
      <sn-button ref="prevBtn" title="Previous beat">
        <span class="material-symbols-outlined">chevron_left</span>
        Prev
      </sn-button>
      <sn-button variant="primary" ref="attachBtn" title="Attach beat to chat">
        <span class="material-symbols-outlined">add_comment</span>
        Attach
      </sn-button>
      <sn-button ref="nextBtn" title="Next beat">
        Next
        <span class="material-symbols-outlined">chevron_right</span>
      </sn-button>
    </footer>
  </section>
</div>
`;
