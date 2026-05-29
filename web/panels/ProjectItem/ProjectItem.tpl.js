export default`
<sn-card interactive>
  <div class="project-title">
    <a ref="link">{{projectName}}</a>
    <sn-badge class="token-badge" ref="tokenBadge"></sn-badge>
    <sn-button class="project-remove" ref="deleteBtn" variant="icon" title="Remove project">
      <span class="material-symbols-outlined">close</span>
    </sn-button>
  </div>
  <div class="path">{{projectPath}}</div>
</sn-card>
`;
