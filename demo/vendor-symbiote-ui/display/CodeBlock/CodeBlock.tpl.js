import { html } from '@symbiotejs/symbiote';

export default html`
  <div class="cb-toolbar" bind="class.cb-toolbar-visible: toolbarVisible">
    <span class="cb-lang-label" bind="textContent: languageLabel; class.cb-lang-hidden: !languageLabel"></span>
    <button class="cb-copy-btn" aria-live="polite" bind="textContent: copyBtnText; class.cb-copy-hidden: !copyable" @click="copyContent"></button>
  </div>
  <div class="cb-scroll">
    <pre class="cb-gutter" bind="textContent: lineNums"></pre>
    <pre class="cb-pre"><code bind="innerHTML: highlighted"></code></pre>
    <div class="cb-flow">
      <div class="cb-md" bind="innerHTML: highlighted"></div>
    </div>
    <div class="cb-img-wrap"><img class="cb-img" bind="src: imageSrc"></div>
    <div class="cb-squiggle-layer" ${{ itemize: 'squiggles', 'item-tag': 'cb-squiggle' }}></div>
  </div>
`;
