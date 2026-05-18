export default `
<div class="flows-shell">
  <header class="flows-header">
    <div class="flows-title">
      <span class="material-symbols-outlined">movie</span>
      Flows
    </div>
    <button class="flows-icon-btn" ref="refreshBtn" title="Reload flows" aria-label="Reload flows">
      <span class="material-symbols-outlined">refresh</span>
    </button>
  </header>
  <div class="flows-list" ref="storyList"></div>
  <section class="flows-beat" ref="beatPanel" hidden>
    <div class="flows-beat-kicker" ref="beatKicker"></div>
    <h3 ref="beatTitle"></h3>
    <p ref="beatNarrative"></p>
    <div class="flows-tags" ref="beatTags"></div>
    <footer>
      <button class="flows-btn" ref="prevBtn" title="Previous beat">
        <span class="material-symbols-outlined">chevron_left</span>
        Prev
      </button>
      <button class="flows-btn primary" ref="attachBtn" title="Attach beat to chat">
        <span class="material-symbols-outlined">add_comment</span>
        Attach
      </button>
      <button class="flows-btn" ref="nextBtn" title="Next beat">
        Next
        <span class="material-symbols-outlined">chevron_right</span>
      </button>
    </footer>
  </section>
</div>
`;
