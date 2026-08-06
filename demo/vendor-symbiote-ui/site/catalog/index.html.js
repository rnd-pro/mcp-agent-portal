export default /*html*/ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Symbiote UI — Component Catalog</title>
<link rel="stylesheet" href="./css/index.css">
<script type="module" src="./js/index.js"></script>
</head>
<body>
<a href="#workspace-content" class="sn-skip-link">Skip to main content</a>
<layout-shell-menu
  id="catalog-shell"
  title="Symbiote UI"
  title-icon="hub"
  path-label="Component Catalog"
  path-icon="widgets">

  <a class="catalog-site-link" slot="actions" href="../">Docs</a>
  <cascade-theme-widget
    slot="actions"
    storage-key="symbiote-ui:catalog-theme"
    target-selector=":root">
  </cascade-theme-widget>

  <layout-sidebar slot="sidebar"></layout-sidebar>

  <main id="workspace-content" aria-live="polite">
    <div id="components-view"></div>
    <div id="demos-view" hidden></div>
  </main>

</layout-shell-menu>
</body>
</html>`;
