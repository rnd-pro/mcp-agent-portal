export default `
  <div class="cb-scroll">
    <pre class="cb-gutter" bind="textContent: lineNums"></pre>
    <pre class="cb-pre"><code bind="innerHTML: highlighted"></code></pre>
    <div class="cb-md" bind="innerHTML: highlighted"></div>
    <div class="cb-img-wrap"><img class="cb-img" bind="src: imageSrc"></div>
    <div class="cb-squiggle-layer" \${{itemize: "squiggles", "item-tag": "cb-squiggle"}}></div>
  </div>
`;
