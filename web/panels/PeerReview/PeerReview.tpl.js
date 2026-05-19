export default `
<div class="ui-container">
  <div class="ui-header">
    <div class="ui-title-large"><span class="material-symbols-outlined">forum</span> Peer Review & Consensus</div>
  </div>
  
  <div class="ui-split-container pr-split">
    <div class="pr-col">
      <div class="ui-card">
        <h3 class="ui-card-title">Initiate Consultation</h3>
        
        <div class="ui-field">
          <label>Context</label>
          <textarea id="pr-context" placeholder="Paste relevant code, logs, or context here..."></textarea>
        </div>
        
        <div class="ui-field">
          <label>Proposal</label>
          <textarea id="pr-proposal" placeholder="I propose we build a UI using Symbiote.js because..."></textarea>
        </div>
        
        <button class="ui-btn primary" id="consult-btn"><span class="material-symbols-outlined">psychology</span> Request Peer Review</button>
      </div>
      
      <div class="ui-card">
        <h3 class="ui-card-title">Iteration History (Previous Rounds)</h3>
        <textarea id="pr-history" class="ui-field pr-history" placeholder="Any previous feedback you want the peer to consider..."></textarea>
      </div>
    </div>
    
    <div class="pr-col-right">
      <div class="ui-card pr-card-full">
        <div class="pr-feedback-header">
          <h3 class="ui-card-title">Peer Feedback</h3>
          <button class="ui-btn-icon" ref="refreshBtn" title="Refresh task status"><span class="material-symbols-outlined">refresh</span></button>
        </div>
        
        <div id="pr-status-banner" class="ui-banner" hidden></div>
        
        <div id="pr-feedback" class="pr-feedback-body">
          <div class="ui-empty-state">Submit a proposal to start peer review</div>
        </div>
      </div>
    </div>
  </div>
</div>
`;
