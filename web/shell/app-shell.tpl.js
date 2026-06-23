export default /* html */ `
<header class="app-topbar">
  <div class="topbar-left">
    <span class="material-symbols-outlined app-title-icon">hub</span>
    <span class="app-title">Agent Portal</span>
  </div>
  <div class="topbar-center">
    <span class="material-symbols-outlined topbar-project-icon">folder_open</span>
    <span id="active-project-path">Workspace not selected</span>
  </div>
  <div class="topbar-right">
    <cascade-theme-widget></cascade-theme-widget>
  </div>
</header>
<project-tabs></project-tabs>
<div id="main-layout" class="app-workspace" data-workspace-host></div>
`;
