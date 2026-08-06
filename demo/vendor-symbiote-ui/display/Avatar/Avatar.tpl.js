import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="sn-avatar-container">
    <img class="sn-avatar-img" ${{ '@hidden': '!src', '@src': 'src', onerror: 'onImgError' }} alt="Avatar image">
    <span class="sn-avatar-initials" ${{ '@hidden': 'src', textContent: 'initials' }}></span>
  </div>
  <div class="sn-avatar-status"></div>
`;
