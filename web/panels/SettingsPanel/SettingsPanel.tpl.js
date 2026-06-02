export default`
<sn-card>
  <span slot="title">Actions</span>
  <div class="stg-actions">
    <sn-button ref="refreshBtn"><span class="material-symbols-outlined">refresh</span>Refresh</sn-button>
    <sn-button variant="danger" ref="restartBtn"><span class="material-symbols-outlined">restart_alt</span>Restart</sn-button>
    <sn-button variant="danger" ref="stopBtn"><span class="material-symbols-outlined">stop</span>Stop</sn-button>
  </div>
</sn-card>
<div ref="restartStatus" class="stg-status"></div>

<sn-card class="pg-language-settings" ref="languageCard">
  <span slot="title">Interface Language</span>
  <sn-field variant="compact">
    <span slot="label">Language Mode</span>
    <select ref="localeModeInput"></select>
  </sn-field>
  <div class="pg-language-note" ref="languageNote">Choose automatic browser language or pin the demo UI to one language.</div>
  <div class="pg-language-status" ref="languageStatus"></div>
</sn-card>

<sn-card class="pg-voice-settings" ref="voiceCard">
  <span slot="title">Voice Input</span>
  <div class="pg-voice-group-title">Send recognized text</div>
  <div class="pg-voice-grid">
    <sn-field variant="compact">
      <span slot="label">English Command</span>
      <input type="text" ref="voiceSendCommandEnInput" placeholder="send">
    </sn-field>
    <sn-field variant="compact">
      <span slot="label">Russian Command</span>
      <input type="text" ref="voiceSendCommandRuInput" placeholder="отправить">
    </sn-field>
    <sn-field variant="compact">
      <span slot="label">Spanish Command</span>
      <input type="text" ref="voiceSendCommandEsInput" placeholder="enviar">
    </sn-field>
  </div>
  <div class="pg-voice-group-title">Start voice input</div>
  <div class="pg-voice-grid">
    <sn-field variant="compact">
      <span slot="label">English Start Command</span>
      <input type="text" ref="voiceWakeCommandEnInput" placeholder="Okay Agent">
    </sn-field>
    <sn-field variant="compact">
      <span slot="label">Russian Start Command</span>
      <input type="text" ref="voiceWakeCommandRuInput" placeholder="О'кей Агент">
    </sn-field>
    <sn-field variant="compact">
      <span slot="label">Spanish Start Command</span>
      <input type="text" ref="voiceWakeCommandEsInput" placeholder="Okey Agente">
    </sn-field>
  </div>
  <div class="pg-voice-group-title">Stop voice input</div>
  <div class="pg-voice-grid">
    <sn-field variant="compact">
      <span slot="label">English Command</span>
      <input type="text" ref="voiceCancelCommandEnInput" placeholder="cancel, stop">
    </sn-field>
    <sn-field variant="compact">
      <span slot="label">Russian Command</span>
      <input type="text" ref="voiceCancelCommandRuInput" placeholder="отмена, стоп">
    </sn-field>
    <sn-field variant="compact">
      <span slot="label">Spanish Command</span>
      <input type="text" ref="voiceCancelCommandEsInput" placeholder="cancelar, detener">
    </sn-field>
  </div>
  <div class="pg-voice-group-title">Clear recognized text</div>
  <div class="pg-voice-grid">
    <sn-field variant="compact">
      <span slot="label">English Command</span>
      <input type="text" ref="voiceDeleteCommandEnInput" placeholder="delete, clear">
    </sn-field>
    <sn-field variant="compact">
      <span slot="label">Russian Command</span>
      <input type="text" ref="voiceDeleteCommandRuInput" placeholder="удали">
    </sn-field>
    <sn-field variant="compact">
      <span slot="label">Spanish Command</span>
      <input type="text" ref="voiceDeleteCommandEsInput" placeholder="borra, eliminar">
    </sn-field>
  </div>
  <div class="pg-voice-group-title">Turn off listening</div>
  <div class="pg-voice-grid">
    <sn-field variant="compact">
      <span slot="label">English Command</span>
      <input type="text" ref="voiceOffCommandEnInput" placeholder="turn off">
    </sn-field>
    <sn-field variant="compact">
      <span slot="label">Russian Command</span>
      <input type="text" ref="voiceOffCommandRuInput" placeholder="выключи">
    </sn-field>
    <sn-field variant="compact">
      <span slot="label">Spanish Command</span>
      <input type="text" ref="voiceOffCommandEsInput" placeholder="apagar">
    </sn-field>
  </div>
  <div class="pg-voice-note">Separate alternative commands with commas.</div>
  <div class="pg-voice-note">In Auto language mode, the recording panel uses commands for the detected interface language.</div>
</sn-card>

<sn-card>
  <span slot="title">Backend</span>
  <div ref="backendCard"></div>
</sn-card>

<sn-card class="pg-network-settings" ref="networkCard">
  <span slot="title">Network Access</span>
  <label class="pg-settings-toggle">
    <input type="checkbox" ref="lanAccessInput">
    <span>Expose Agent Portal on the local network</span>
  </label>
  <div class="pg-network-status" ref="networkStatus">Restart is required after changing LAN access.</div>
  <div class="pg-network-links" ref="networkLinks"></div>
  <div class="pg-network-approvals" ref="networkApprovals"></div>
</sn-card>

<sn-card variant="flat" class="stg-instance-section">
  <span slot="title">Active Instances</span>
  <div ref="instanceList"></div>
</sn-card>

<sn-card ref="lifecycleCard">
  <span slot="title">Server Lifecycle</span>
  <sn-metric ref="shutdownMetric"><span slot="label">Auto-shutdown</span><span slot="value" ref="shutdownTimer">—</span></sn-metric>
  <sn-metric><span slot="label">Uptime</span><span slot="value" ref="uptimeVal">—</span></sn-metric>
</sn-card>

<sn-card class="stg-integrations" ref="integrationsCard">
  <span slot="title">Integrations</span>
  <sn-field variant="compact">
    <span slot="label">Telegram Token</span>
    <input type="password" ref="telegramTokenInput" placeholder="123456:ABC-DEF...">
  </sn-field>
  <sn-field variant="compact">
    <span slot="label">Authorized Chat ID</span>
    <input type="text" ref="telegramChatIdInput" placeholder="-100123456789">
  </sn-field>
  <sn-button variant="primary" class="stg-save-btn" ref="saveSettingsBtn">Save</sn-button>
</sn-card>

<sn-card class="pg-library-settings" ref="agentPortalCard">
  <span slot="title">Agent Portal Libraries</span>
  <sn-field variant="compact">
    <span slot="label">Open Library Path</span>
    <input type="text" ref="openLibraryPathInput" placeholder="/path/to/public-agent-portal-library">
  </sn-field>
  <sn-field variant="compact">
    <span slot="label">Team Library Repository</span>
    <input type="url" ref="teamLibraryRepoInput" placeholder="git@example.com:org/agent-portal-library.git">
  </sn-field>
  <sn-field variant="compact">
    <span slot="label">Team Library Branch</span>
    <input type="text" ref="teamLibraryBranchInput" placeholder="main">
  </sn-field>
  <div class="pg-library-note">Public items are installed into the private team library before project use. Secrets and runtime state stay outside .agent-portal.</div>
</sn-card>

<sn-card class="pg-gateway" ref="gatewayCard">
  <span slot="title">Claude Gateway</span>
  <div class="pg-gateway-head">
    <label class="pg-settings-toggle">
      <input type="checkbox" ref="gatewayEnabledInput">
      <span>Enable Gateway</span>
    </label>
    <sn-button ref="gatewayTestBtn">Test</sn-button>
  </div>
  <div class="pg-gateway-grid">
    <sn-field variant="compact">
      <span slot="label">Provider</span>
      <select ref="gatewayProviderInput">
        <option value="deepseek">DeepSeek</option>
      </select>
    </sn-field>
    <sn-field variant="compact">
      <span slot="label">Type</span>
      <select ref="gatewayProviderTypeInput">
        <option value="anthropic-compatible">Anthropic compatible</option>
        <option value="openai-compatible">OpenAI compatible</option>
      </select>
    </sn-field>
    <sn-field variant="compact">
      <span slot="label">Base URL</span>
      <input type="url" ref="gatewayBaseUrlInput" placeholder="https://api.deepseek.com/anthropic">
    </sn-field>
    <sn-field variant="compact">
      <span slot="label">API Key Env</span>
      <input type="text" ref="gatewayApiKeyEnvInput" placeholder="DEEPSEEK_API_KEY">
    </sn-field>
    <sn-field variant="compact">
      <span slot="label">Default Model</span>
      <input type="text" ref="gatewayDefaultModelInput" list="gatewayModelHints" placeholder="deepseek-v4-flash">
    </sn-field>
    <sn-field variant="compact">
      <span slot="label">Planner Model</span>
      <input type="text" ref="gatewayPlannerModelInput" list="gatewayModelHints" placeholder="deepseek-v4-pro">
    </sn-field>
    <sn-field variant="compact" class="pg-gateway-wide">
      <span slot="label">Auth Token</span>
      <input type="password" ref="gatewayAuthTokenInput" placeholder="Optional gateway bearer token">
    </sn-field>
  </div>
  <datalist id="gatewayModelHints">
    <option value="deepseek-v4-flash"></option>
    <option value="deepseek-v4-pro"></option>
  </datalist>
  <div class="pg-gateway-status" ref="gatewayStatus">Only the environment variable name is saved for provider API keys.</div>
</sn-card>

<sn-card ref="modelsCard">
  <span slot="title">Provider Models</span>
  <div class="pm-provider-tabs" ref="providerTabs"></div>
  <div class="pm-model-list" ref="modelList"></div>
  <div class="pm-actions">
    <sn-button ref="syncCliBtn"><span class="material-symbols-outlined">sync</span>Discover & Update</sn-button>
    <sn-button variant="primary" ref="saveModelsBtn">Save Favorites</sn-button>
    <span class="pm-status" ref="modelStatus"></span>
  </div>
  
  <div class="pm-directory" ref="directoryEl">
    <sn-field variant="compact" class="pm-search">
      <span class="material-symbols-outlined stg-search-icon">search</span>
      <input type="text" ref="searchInput" placeholder="Search models by name or ID...">
    </sn-field>
    <div class="pm-grid-header" ref="sortHeaders">
      <div></div>
      <div class="sortable" data-sort="name">Model <span class="s-icon"></span></div>
      <div class="sortable" data-sort="context_desc">Context <span class="s-icon"></span></div>
      <div class="sortable" data-sort="newest">Date <span class="s-icon"></span></div>
      <div class="sortable" data-sort="price_asc">Prompt / 1M <span class="s-icon"></span></div>
      <div class="sortable" data-sort="price_asc_out">Output / 1M <span class="s-icon"></span></div>
    </div>
    <div class="pm-grid-body" ref="directoryList"></div>
  </div>
</sn-card>
`;
