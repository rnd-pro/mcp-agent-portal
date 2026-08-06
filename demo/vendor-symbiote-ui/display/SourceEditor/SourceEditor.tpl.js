import { html } from '@symbiotejs/symbiote';

export default html`
  <textarea ref="editor"
    spellcheck="false"
    autocomplete="off"
    autocapitalize="off"
    bind="placeholder: placeholder; disabled: disabled; readOnly: readonly; ariaLabel: ariaLabel"
    ${{ oninput: 'onInput', onkeydown: 'onKeyDown' }}></textarea>
`;
