export default `
<sn-list-detail-shell
  has-detail
  sidebar-title="Peer Review"
  sidebar-icon="forum"
  detail-title="Peer Feedback"
  detail-icon="psychology"
>
  <div slot="list" class="pr-input-stack">
    <sn-card>
      <h3 slot="title">Initiate Consultation</h3>

      <sn-field>
        <label>Context</label>
        <textarea id="pr-context" placeholder="Paste relevant code, logs, or context here..."></textarea>
      </sn-field>

      <sn-field>
        <label>Proposal</label>
        <textarea id="pr-proposal" placeholder="I propose we build a UI using Symbiote.js because..."></textarea>
      </sn-field>

      <sn-button variant="primary" id="consult-btn"><span class="material-symbols-outlined">psychology</span> Request Peer Review</sn-button>
    </sn-card>

    <sn-card>
      <h3 slot="title">Iteration History (Previous Rounds)</h3>
      <sn-field class="pr-history">
        <textarea id="pr-history" placeholder="Any previous feedback you want the peer to consider..."></textarea>
      </sn-field>
    </sn-card>
  </div>

  <sn-button slot="detail-actions" variant="icon" ref="refreshBtn" title="Refresh task status"><span class="material-symbols-outlined">refresh</span></sn-button>

  <sn-card slot="detail" class="pr-card-full">
    <sn-banner id="pr-status-banner" hidden></sn-banner>

    <div id="pr-feedback" class="pr-feedback-body">
      <sn-empty-state>Submit a proposal to start peer review</sn-empty-state>
    </div>
  </sn-card>
</sn-list-detail-shell>
`;
