import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-file-container">
    <div ref="dropzone" class="sn-file-dropzone" role="button" tabindex="0">
      <span class="material-symbols-outlined sn-file-dropzone-icon" aria-hidden="true">cloud_upload</span>
      <span class="sn-file-dropzone-text">{{placeholder}}</span>
    </div>
    <div ref="fileList" class="sn-file-list"></div>
    <div ref="liveRegion" class="sn-file-live" aria-live="polite" role="status"></div>
    <input ref="fileInput" type="file" class="sn-file-native-input" tabindex="-1" aria-hidden="true">
  </div>
`;
