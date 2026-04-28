export default `
<div class="ui-container">
  <div class="ui-header">
    <div class="ui-title-large"><span class="material-symbols-outlined">forum</span> Peer Review & Consensus</div>
  </div>
  
  <div class="ui-split-container" style="padding: 20px; gap: 20px;">
    <div style="flex: 1; display: flex; flex-direction: column; overflow-y: auto;">
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
        <textarea id="pr-history" class="ui-field" placeholder="Any previous feedback you want the peer to consider..." style="min-height: 100px; width: 100%; background: var(--sn-color-bg, #1a1a1a); border: 1px solid var(--sn-color-border, #404040); color: var(--sn-color-text, #e5e7eb); padding: 8px 12px; border-radius: 4px; font-family: inherit; font-size: 14px; resize: vertical;"></textarea>
      </div>
    </div>
    
    <div style="flex: 1; display: flex; flex-direction: column;">
      <div class="ui-card" style="height: 100%; display: flex; flex-direction: column; margin-bottom: 0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
          <h3 class="ui-card-title" style="margin:0;">Peer Feedback</h3>
          <button class="ui-btn-icon" ref="refreshBtn" title="Refresh task status"><span class="material-symbols-outlined">refresh</span></button>
        </div>
        
        <div id="pr-status-banner" class="ui-banner" style="display:none;"></div>
        
        <div id="pr-feedback" style="flex:1; background: rgba(0,0,0,0.2); padding: 16px; border-radius: 6px; font-size: 14px; line-height: 1.6; border: 1px solid var(--sn-color-border, #404040); white-space: pre-wrap; overflow-y: auto;">
          <div class="ui-empty-state">Submit a proposal to start peer review</div>
        </div>
      </div>
    </div>
  </div>
</div>
`;
