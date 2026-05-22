export default `
<div class="ui-container">
  <div class="ui-header">
    <div class="ui-title-large"><span class="material-symbols-outlined">forum</span> Peer Review & Consensus</div>
  </div>
  
  <div class="ui-split-container pr-split">
    <div class="pr-col">
      <div class="ui-card">
        <h3 class="ui-card-title">Initiate Consultation</h3>
        
        <sn-field>
          <label>Context</label>
          <textarea id="pr-context" placeholder="Paste relevant code, logs, or context here..."></textarea>
        </sn-field>
        
        <sn-field>
          <label>Proposal</label>
          <textarea id="pr-proposal" placeholder="I propose we build a UI using Symbiote.js because..."></textarea>
        </sn-field>
        
        <sn-button variant="primary" id="consult-btn"><span class="material-symbols-outlined">psychology</span> Request Peer Review</sn-button>
      </div>
      
      <div class="ui-card">
        <h3 class="ui-card-title">Iteration History (Previous Rounds)</h3>
        <sn-field class="pr-history">
          <textarea id="pr-history" placeholder="Any previous feedback you want the peer to consider..."></textarea>
        </sn-field>
      </div>
    </div>
    
    <div class="pr-col-right">
      <div class="ui-card pr-card-full">
        <div class="pr-feedback-header">
          <h3 class="ui-card-title">Peer Feedback</h3>
          <sn-button variant="icon" ref="refreshBtn" title="Refresh task status"><span class="material-symbols-outlined">refresh</span></sn-button>
        </div>
        
        <div id="pr-status-banner" class="ui-banner" hidden></div>
        
        <div id="pr-feedback" class="pr-feedback-body">
          <sn-empty-state>Submit a proposal to start peer review</sn-empty-state>
        </div>
      </div>
    </div>
  </div>
</div>
`;
