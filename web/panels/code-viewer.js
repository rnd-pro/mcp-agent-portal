// @ctx .context/web/panels/code-viewer.ctx
import e from"@symbiotejs/symbiote";import{api as n,events as t,state as o,formatStats,resolveProjectPath}from"../app.js";import"../components/code-block.js";

const _extLang={'.md':'md','.markdown':'md','.sql':'sql','.json':'json','.css':'css','.html':'html','.htm':'html','.xml':'xml','.yaml':'yaml','.yml':'yaml','.toml':'toml','.sh':'sh','.bash':'bash','.env':'env','.ini':'ini','.conf':'conf','.cfg':'cfg','.txt':'plain','.csv':'csv','.gitignore':'plain','.dockerignore':'plain','.editorconfig':'plain','.py':'python','.pyw':'python','.pyi':'python','.rb':'ruby','.rake':'ruby','.gemspec':'ruby','.go':'go','.rs':'rust','.java':'java','.kt':'kotlin','.kts':'kotlin','.swift':'swift','.c':'c','.h':'c','.cpp':'c','.hpp':'c','.cc':'c','.cxx':'c','.hh':'c','.cs':'csharp','.php':'php','.phtml':'php','.dart':'dart','.lua':'lua','.ts':'typescript','.tsx':'typescript','.graphql':'graphql','.gql':'graphql','.prisma':'prisma','.dockerfile':'dockerfile','.r':'plain','.R':'plain','.scala':'java','.groovy':'java','.gradle':'java','.png':'image','.jpg':'image','.jpeg':'image','.gif':'image','.svg':'image','.webp':'image','.bmp':'image','.ico':'image','.pdf':'binary','.zip':'binary','.tar':'binary','.gz':'binary','.woff':'binary','.woff2':'binary','.ttf':'binary','.eot':'binary','.mp3':'binary','.mp4':'binary','.wav':'binary','.avi':'binary','.mov':'binary'};
function _getLang(path){if(!path)return'js';const base=path.split('/').pop()||'';const i=path.lastIndexOf('.');if(i>=0){const ext=_extLang[path.substring(i).toLowerCase()];if(ext)return ext}if(['Dockerfile'].includes(base))return'dockerfile';if(['Makefile','Procfile','LICENSE','README','CHANGELOG'].some(n=>base.startsWith(n)))return'plain';return i<0?'plain':'js'}

// Two operational modes for JS files:
//
// MODE A — Readable source (normal projects like 1sim_local):
//   Source file is human-written, readable code.
//   Toggle button label: "COMPACT" — shows Terser-compressed view.
//   _isReadable = true (compression saves >15% tokens)
//
// MODE B — Compact source (compact projects like project-graph-mcp):
//   Source file is already minified/compressed on disk.
//   Toggle button label: "EXPAND" — beautifies via Terser + injects JSDoc from .ctx.
//   _isReadable = false (compression saves <15% — already compact)

export class CodeViewer extends e{init$={filename:"Select a file",hasFile:!1,viewMode:"source",modeLabel:"source",statsText:"",showToggle:!1,toggleLabel:"",onShowInGraph:()=>{
  if(!this._currentPath)return;
  window.location.hash = `#graph?focus=${encodeURIComponent(this._currentPath)}`;
},onToggleMode:()=>{
  const lang=_getLang(this._currentPath);
  if(lang==='md'){
    this.$.viewMode=this.$.viewMode==="rendered"?"raw":"rendered";
    this._showCurrentMode();
    return;
  }
  // Toggle between source and the transformation
  this.$.viewMode=this.$.viewMode==="source"?"transformed":"source";
  this._showCurrentMode();
}};_fileData=null;_isReadable=!1;_transformCache=null;_loadingTransform=!1;_currentPath=null;initCallback(){t.addEventListener("file-selected",e=>this._loadFile(e.detail.path));t.addEventListener("follow-focus-changed",e=>{const d=e.detail;if(d.type==="file"&&d.target){this._loadFile(d.target);if(d.meta?.startLine){setTimeout(()=>{const c=this._getCodeBlock();if(c&&c.scrollToLine)c.scrollToLine(d.meta.startLine)},200)}}});if(o.activeFile)requestAnimationFrame(()=>this._loadFile(o.activeFile))}renderCallback(){this.sub("hasFile",e=>{this.toggleAttribute("has-file",e)}),this.sub("viewMode",e=>{
  const lang=_getLang(this._currentPath);
  this.toggleAttribute("mode-raw","source"!==e);
  if(lang==='md'){
    this.$.modeLabel=e==="rendered"?"rendered":"source";
  }else{
    this.$.modeLabel=e==="source"?"source":(this._isReadable?"compact":"expanded");
  }
})}_getCodeBlock(){return this.querySelector("code-block")}async _showCurrentMode(){if(!this._fileData)return;const e=this._getCodeBlock();if(!e)return;
const lang=_getLang(this._currentPath);
if(lang==='md'){
  if(this.$.viewMode==="rendered"){
    e.$.lang='md';
    e.setBasePath(this._currentPath);
    e.$.code=this._fileData.raw;
  }else{
    e.$.lang='plain';
    e.$.code=this._fileData.raw;
  }
  return;
}
e.$.lang=lang;
if("transformed"===this.$.viewMode){
  // Show cached transform if available
  if(this._transformCache){
    e.$.code=this._transformCache;
    if(this._transformStatsText) this.$.statsText=this._transformStatsText;
    return;
  }
  if(this._loadingTransform)return;
  this._loadingTransform=!0;
  e.$.code=this._isReadable?"// Compressing...":"// Expanding...";
  try{
      if(this._isReadable){
        // MODE A: readable source → compress
        const t=await n("/api/compact-file",{path:this._currentPath});
        this._transformCache=t?.code||"// Compression unavailable";
        this._transformStatsText=t?`Compressed: ${(t.compressed/1000).toFixed(1)}K chars (${t.savings})`:"";
      }else{
        // MODE B: compact source → expand (beautify + inject JSDoc from .ctx)
        const t=await n("/api/expand-file",{path:this._currentPath});
        this._transformCache=t?.code||"// Expand unavailable";
        this._transformStatsText=t?`Expanded: ${(t.decompiled/1000).toFixed(1)}K chars | JSDocs injected: ${t.injected||0}`:"";
      }
      if(this._transformStatsText)this.$.statsText=this._transformStatsText;
    e.$.code=this._transformCache;
  }catch{e.$.code=this._isReadable?"// Compression failed":"// Expand failed"}
  finally{this._loadingTransform=!1}
  return;
}
// Source mode — raw file as-is
this.$.statsText=this._baseStatsText;
e.$.code=this._fileData.raw;
}async _loadFile(e){this.$.filename=e,this.$.hasFile=!1,this._fileData=null,this.$.statsText="",this._baseStatsText="",this._transformStatsText="",this._transformCache=null,this._currentPath=e;
const lang=_getLang(e);
// Directory detection: no extension or ends with /
const isDir = e.endsWith('/') || (!e.includes('.') && !['Dockerfile','Makefile','Procfile','LICENSE','README','CHANGELOG','Gemfile','Rakefile','Vagrantfile'].some(n => e.split('/').pop()?.startsWith(n))) || this._isDirInSkeleton(e);
if(isDir){
  const i=this._getCodeBlock();
  if(i){i.$.lang='plain';i.$.code=this._buildDirInfo(e)}
  this.$.viewMode="source";
  this.$.modeLabel="directory";
  this.$.showToggle=!1;
  this.$.hasFile=!0;
  return;
}
if(lang==='image'){
  const i=this._getCodeBlock();
  if(i){i.$.lang='image';i.setBasePath(e);i.$.code=e}
  this.$.viewMode="rendered";
  this.$.modeLabel="image";
  this.$.showToggle=!1;
  this.$.hasFile=!0;
  return;
}
if(lang==='binary'){
  const i=this._getCodeBlock();
  if(i){i.$.lang='plain';i.$.code=`// Binary file: ${e}\n// Cannot display binary content`}
  this.$.viewMode="source";
  this.$.modeLabel="binary";
  this.$.showToggle=!1;
  this.$.hasFile=!0;
  return;
}
try{const[t,_raw]=await Promise.all([n("/api/file",{path:e}),n("/api/raw-file",{path:e}).catch(()=>null)]);const o="string"==typeof t.code?t.code:"string"==typeof t.compressed?t.compressed:t.content||JSON.stringify(t,null,2);
let s=t.raw||_raw?.content||o;
// Detect mode: if .ctx documentation exists (ctxTok > 0), source is compact → EXPAND available
// If no .ctx, source is readable → COMPACT available
const hasCtx=!!(t.ctxTok&&t.ctxTok>0);
this._isReadable=!hasCtx;
this._fileData={compact:o,raw:s,codeTok:t.codeTok||0,ctxTok:t.ctxTok||0,totalTok:t.totalTok||0,expanded:t.expanded||0,savings:t.savings||"0%"};
this._baseStatsText=t.codeTok&&t.expanded?formatStats(t):"";
this.$.statsText=this._baseStatsText;
const i=this._getCodeBlock();
if(lang==='md'){
  this.$.viewMode="rendered";
  this.$.modeLabel="rendered";
  this.$.showToggle=!0;
  this.$.toggleLabel="source";
  if(i){i.$.lang='md';i.setBasePath(e);i.$.code=s}
}else{
  i&&(i.$.lang=lang);
  // Always start in SOURCE mode
  this.$.viewMode="source";
  this.$.modeLabel="source";
  // Toggle: readable → COMPACT button, compact → EXPAND button
  this.$.showToggle=!0;
  this.$.toggleLabel=this._isReadable?"compact":"expand";
  i&&(i.$.code=s);
}
this.$.hasFile=!0;this._lintCurrentFile()}catch(e){const n=this._getCodeBlock();n&&(n.$.lang='plain',n.$.code=`// Error: ${e.message}`),this.$.showToggle=!1,this.$.hasFile=!0}}
_isDirInSkeleton(path) {
  const sk = o.skeleton;
  if (!sk) return false;
  const norm = path.replace(/\/$/, '');
  // Check if path is a directory key in skeleton.f (files by dir)
  if (sk.f) {
    for (const dir of Object.keys(sk.f)) {
      const d = dir === './' ? '' : dir.replace(/^\.\//, '').replace(/\/$/, '');
      if (d === norm) return true;
      // Also check if any file starts with this dir
      if (d.startsWith(norm + '/')) return true;
    }
  }
  // Check skeleton.a (asset dirs)
  if (sk.a) {
    for (const dir of Object.keys(sk.a)) {
      const d = dir === './' ? '' : dir.replace(/^\.\//, '').replace(/\/$/, '');
      if (d === norm) return true;
      if (d.startsWith(norm + '/')) return true;
    }
  }
  return false;
}
_buildDirInfo(path) {
  const sk = o.skeleton;
  const norm = path.replace(/\/$/, '');
  const lines = [];
  lines.push(`📁 Directory: ${norm || '.'}`);
  lines.push('─'.repeat(60));
  lines.push('');
  if (!sk) {
    lines.push('Skeleton not loaded — unable to display directory metadata.');
    return lines.join('\n');
  }
  // Collect all files under this directory
  const files = [];
  const subdirs = new Set();
  const prefix = norm ? norm + '/' : '';
  if (sk.f) {
    for (const [dir, items] of Object.entries(sk.f)) {
      const d = dir === './' ? '' : dir.replace(/^\.\//, '').replace(/\/$/, '');
      const fullDir = d ? d + '/' : '';
      if (!fullDir.startsWith(prefix) && d !== norm) continue;
      for (const item of items) {
        const fullPath = fullDir + item;
        if (fullPath.startsWith(prefix)) {
          files.push(fullPath.slice(prefix.length));
          // Track immediate subdirectories
          const rel = fullPath.slice(prefix.length);
          const slashIdx = rel.indexOf('/');
          if (slashIdx > 0) subdirs.add(rel.slice(0, slashIdx));
        }
      }
    }
  }
  if (sk.a) {
    for (const [dir, items] of Object.entries(sk.a)) {
      const d = dir === './' ? '' : dir.replace(/^\.\//, '').replace(/\/$/, '');
      const fullDir = d ? d + '/' : '';
      if (!fullDir.startsWith(prefix) && d !== norm) continue;
      for (const item of items) {
        const fullPath = fullDir + item;
        if (fullPath.startsWith(prefix)) {
          files.push(fullPath.slice(prefix.length));
          const rel = fullPath.slice(prefix.length);
          const slashIdx = rel.indexOf('/');
          if (slashIdx > 0) subdirs.add(rel.slice(0, slashIdx));
        }
      }
    }
  }
  // Stats by extension
  const extCounts = {};
  const directFiles = [];
  for (const f of files) {
    if (!f.includes('/')) directFiles.push(f);
    const dot = f.lastIndexOf('.');
    const ext = dot >= 0 ? f.slice(dot) : '(no ext)';
    extCounts[ext] = (extCounts[ext] || 0) + 1;
  }
  // Subdirectories
  if (subdirs.size > 0) {
    lines.push(`📂 Subdirectories (${subdirs.size}):`);
    for (const d of [...subdirs].sort()) {
      lines.push(`   └─ ${d}/`);
    }
    lines.push('');
  }
  // Direct files
  if (directFiles.length > 0) {
    lines.push(`📄 Files (${directFiles.length}):`);
    for (const f of directFiles.sort()) {
      lines.push(`   ├─ ${f}`);
    }
    lines.push('');
  }
  // Extension breakdown
  const sorted = Object.entries(extCounts).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) {
    lines.push('📊 File types:');
    for (const [ext, count] of sorted) {
      const bar = '█'.repeat(Math.min(count, 30));
      lines.push(`   ${ext.padEnd(12)} ${String(count).padStart(4)}  ${bar}`);
    }
    lines.push('');
  }
  // Summary
  lines.push('─'.repeat(60));
  lines.push(`Total: ${files.length} files across ${subdirs.size} subdirectories`);
  // Skeleton node info
  if (sk.n) {
    let nodeCount = 0;
    for (const [, node] of Object.entries(sk.n)) {
      if (node.f && node.f.startsWith(prefix)) nodeCount++;
    }
    if (nodeCount > 0) lines.push(`Symbols: ${nodeCount} exported nodes in this directory`);
  }
  return lines.join('\n');
}
async _lintCurrentFile(){if(!this._currentPath)return;const lang=_getLang(this._currentPath);if(lang!=='js'&&lang!=='mjs')return;const cb=this._getCodeBlock();if(!cb||!cb.setDiagnostics)return;try{const r=await fetch('/api/lint-file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filePath:resolveProjectPath(this._currentPath)})});const d=await r.json();if(Array.isArray(d)&&d[0]&&d[0].messages&&d[0].messages.length>0){cb.setDiagnostics(d[0].messages)}else{cb.clearDiagnostics()}}catch{cb.clearDiagnostics()}}}

CodeViewer.template=`
  <div class="pg-code-header">
    <span class="pg-code-filename" bind="textContent: filename"></span>
    <div class="pg-code-controls">
      <span class="pg-code-stats" bind="textContent: statsText"></span>
      <button class="pg-mode-toggle" bind="onclick: onShowInGraph" title="Show in Graph">
        <span class="material-symbols-outlined" style="font-size:14px">account_tree</span>
        <span class="pg-mode-label">graph</span>
      </button>
      <button class="pg-mode-toggle" bind="onclick: onToggleMode; hidden: !showToggle" title="Toggle view mode">
        <span class="material-symbols-outlined" style="font-size:14px">compress</span>
        <span class="pg-mode-label" bind="textContent: modeLabel"></span>
      </button>
    </div>
  </div>
  <code-block></code-block>
`;

CodeViewer.rootStyles="\n  pg-code-viewer {\n    display: flex;\n    flex-direction: column;\n    height: 100%;\n    overflow: hidden;\n  }\n  pg-code-viewer:not([has-file]) code-block {\n    display: none;\n  }\n  .pg-code-header {\n    display: flex;\n    align-items: center;\n    justify-content: space-between;\n    padding: 6px 12px;\n    font-family: 'SF Mono', 'Fira Code', monospace;\n    font-size: 11px;\n    color: var(--sn-text-dim, hsl(30, 10%, 45%));\n    border-bottom: 1px solid var(--sn-node-border, hsl(35, 18%, 80%));\n    background: var(--sn-node-header-bg, hsl(37, 25%, 93%));\n    gap: 8px;\n  }\n  .pg-code-filename {\n    white-space: nowrap;\n    overflow: hidden;\n    text-overflow: ellipsis;\n    min-width: 0;\n  }\n  .pg-code-controls {\n    display: flex;\n    align-items: center;\n    gap: 8px;\n    flex-shrink: 0;\n  }\n  .pg-code-stats {\n    font-size: 10px;\n    color: var(--sn-cat-server, hsl(210, 45%, 45%));\n    white-space: nowrap;\n  }\n  .pg-mode-toggle {\n    display: flex;\n    align-items: center;\n    gap: 3px;\n    padding: 2px 8px;\n    border: 1px solid var(--sn-node-border, hsl(35, 18%, 80%));\n    border-radius: 4px;\n    background: var(--sn-bg, hsl(37, 30%, 91%));\n    color: var(--sn-text-dim, hsl(30, 10%, 45%));\n    font-family: inherit;\n    font-size: 10px;\n    cursor: pointer;\n    text-transform: uppercase;\n    letter-spacing: 0.5px;\n    transition: all 120ms ease;\n  }\n  .pg-mode-toggle:hover {\n    background: var(--sn-node-hover, hsl(36, 22%, 88%));\n    color: var(--sn-text, hsl(30, 15%, 18%));\n  }\n  pg-code-viewer[mode-raw] .pg-mode-toggle {\n    background: hsla(210, 45%, 45%, 0.12);\n    border-color: var(--sn-cat-server, hsl(210, 45%, 45%));\n    color: var(--sn-cat-server, hsl(210, 45%, 45%));\n  }\n  .pg-mode-toggle[hidden] {\n    display: none;\n  }\n  code-block {\n    flex: 1;\n    min-height: 0;\n  }\n";
CodeViewer.reg("pg-code-viewer");