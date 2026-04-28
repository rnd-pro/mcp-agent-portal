// @ctx .context/web/app.ctx
import{Layout as e,LayoutTree as t,applyTheme as n,CARBON as o,registerGlobalParam,setDefaultPanel,updateParams,getRoute,parseQuery,buildHash}from"symbiote-node";
import{panelTypes,getSections,getLayout,hasSection}from"./router-registry.js";
import{followController}from"./follow-controller.js";
import"./components/follow-ribbon.js";
import{state as a,subscribe as s,onEvent as i,call as r,connect as c}from"./state.js";
import"./panels/file-tree.js";
import"./panels/code-viewer.js";
import"./panels/ctx-panel.js";
import"./panels/dep-graph.js";
import"./panels/health-panel.js";
import"./panels/live-monitor.js";
import"./components/quick-open.js";
import"./components/canvas-graph.js";

// Dashboard panels
import"./panels/ProjectList/ProjectList.js?v=2";
import"./panels/ActionBoard/ActionBoard.js?v=2";
import"./panels/SettingsPanel/SettingsPanel.js?v=2";
import"./panels/AgentChat/AgentChat.js?v=4";
import"./panels/Marketplace/Marketplace.js?v=1";
import"./panels/Topology/TopologyPanel.js";
import"./panels/ToolExplorer/ToolExplorer.js";
import"./panels/ActiveTasks/ActiveTasks.js";
import"./panels/PipelineManager/PipelineManager.js";
import"./panels/GroupManager/GroupManager.js";
import"./panels/SkillManager/SkillManager.js";
import"./panels/PeerReview/PeerReview.js";
import"./components/ProjectTabs/ProjectTabs.js";
import{state as dashState, events as dashEvents, emit as dashEmit}from"./dashboard-state.js?v=3";

export const state={skeleton:null,activeFile:null,ws:null,monitorEvents:[]};
export{formatStats}from"./stats-format.js";
export const baseUrl=new URL(".",import.meta.url).href;const l=baseUrl;

export async function api(endpoint, params = {}) {
  const urlParams = new URLSearchParams(window.location.search);
  const serverName = urlParams.get('server') || "project-graph";

  const map = {
    "/api/skeleton": { name: "get_skeleton", args: p => ({ path: p.path || "." }) },
    "/api/file": { name: "compact", args: p => ({ action: "compact_file", path: p.path, beautify: true }) },
    "/api/compact-file": { name: "compact", args: p => ({ action: "compact_file", path: p.path, beautify: true }) },
    "/api/expand-file": { name: "compact", args: p => ({ action: "expand_file", path: p.path, beautify: true }) },
    "/api/raw-file": { name: "compact", args: p => ({ action: "compact_file", path: p.path, beautify: false }) },
    "/api/analysis": { name: "analyze", args: p => ({ action: "full_analysis", path: p.path || "." }) },
    "/api/analysis-summary": { name: "analyze", args: p => ({ action: "analysis_summary", path: p.path || "." }) },
    "/api/deps": { name: "navigate", args: p => ({ action: "deps", symbol: p.symbol }) },
    "/api/usages": { name: "navigate", args: p => ({ action: "usages", symbol: p.symbol }) },
    "/api/expand": { name: "navigate", args: p => ({ action: "expand", symbol: p.symbol }) },
    "/api/chain": { name: "navigate", args: p => ({ action: "call_chain", from: p.from, to: p.to }) },
    "/api/docs": { name: "docs", args: p => ({ action: "get", path: p.path || "." }) }
  };

  const tool = map[endpoint];
  if (tool) {
    const res = await fetch("/api/mcp-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serverName,
        method: "tools/call",
        params: {
          name: tool.name,
          arguments: tool.args(params)
        }
      })
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    if (data.isError) throw new Error(data.content?.[0]?.text || data.error || "Tool error");
    const resultText = data.content?.[0]?.text || data.text || data.response || JSON.stringify(data);
    try {
      return JSON.parse(resultText);
    } catch {
      return resultText;
    }
  }

  params.server = serverName;
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${endpoint}${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const events=new EventTarget;
export function emit(e,t={}){events.dispatchEvent(new CustomEvent(e,{detail:t}))}

// Panel types and sections are defined in router-registry.js
// They can be extended at runtime by marketplace plugins and MCP servers

async function fetchProjects(){
  const e=await fetch("/api/instances");
  if(!e.ok){
    const t=await e.text();
    throw console.error("[dashboard] fetch failed:",e.status,t),new Error(`Fetch failed: ${e.status}`);
  }
  return e.json();
}

function initDashboardWS(e){
  if(!e.length) return void console.warn("[dashboard] No projects to connect WebSockets for");
  const t="https:"===location.protocol?"wss://":"ws://",o=location.host;
  for(const r of e) connectDashboardWS(r,t,o)
}

function connectDashboardWS(e,t,o,_att=0){
  const r=`${t}${o}${e.prefix}/ws/monitor`, n=new WebSocket(r);
  n.onopen=()=>{
    _att=0;
    console.log("[dashboard] WS connected:",e.name||e.projectName);
  };
  n.onmessage=t=>{
    let o;try{o=JSON.parse(t.data)}catch{return}
    if("snapshot"===o.method&&o.params?.state){
      const t=o.params.state,r=dashState.projects.find(t=>t.prefix===e.prefix);
      return void(r&&t.project&&(Object.assign(r,{projectName:t.project.name,projectPath:t.project.path,color:t.project.color,agents:t.project.agents,pid:t.project.pid,connected:!0}),dashEmit("projects-updated",dashState.projects)))
    }
    if("patch"===o.method&&o.params){
      const t=dashState.projects.find(t=>t.prefix===e.prefix);
      return void(t&&"project.agents"===o.params.path&&(t.agents=o.params.value,dashEmit("projects-updated",dashState.projects)))
    }
    if("event"===o.method&&o.params){
      const t=o.params;
      t._projectPrefix=e.prefix;
      t._projectName=e.name||e.projectName;
      dashState.events.push(t);
      dashState.events.length>1e3&&dashState.events.shift();
      return void dashEmit("global-tool-event",t)
    }
    o.type&&(o._projectPrefix=e.prefix,o._projectName=e.name||e.projectName,dashState.events.push(o),dashState.events.length>1e3&&dashState.events.shift(),dashEmit("global-tool-event",o))
  };
  n.onerror=()=>{console.error("[dashboard] WS error:",e.name||e.projectName)};
  n.onclose=r=>{
    console.warn("[dashboard] WS closed:",e.name||e.projectName,r.code);
    const n=dashState.projects.find(t=>t.prefix===e.prefix);
    n&&(n.connected=!1,dashEmit("projects-updated",dashState.projects));
    setTimeout(()=>connectDashboardWS(e,t,o,_att+1),Math.min(500*Math.pow(2,_att),3e4));
  }
}

async function u(){
  n(document.documentElement,o);
  const e=document.querySelector(".app-workspace");
  let sb=e.querySelector("layout-sidebar");
  if(!sb){sb=document.createElement("layout-sidebar");e.prepend(sb);}
  const _c=e.querySelector(".app-content"),nLayout=document.createElement("panel-layout");
  nLayout.setAttribute("min-panel-size","150");
  nLayout.id="main-layout";
  _c.appendChild(nLayout);
  
  requestAnimationFrame(async ()=>{
    for(const[e,t]of Object.entries(panelTypes)) nLayout.registerPanelType(e,t);
    let lastSection="";

    // Register project & chat as global params — they persist across section switches
    registerGlobalParam('project', 'chat');

    function handleRoute(){
      let route = getRoute();
      let section = route.panel;
      let subPath = route.subpath;
      if(hasSection(section)&&section!==lastSection){
        lastSection=section;
        nLayout.$['@storage-key'] = `pg-layout-${section}`;
        let saved = localStorage.getItem(`pg-layout-${section}`);
        if(saved) {
          try {
            nLayout.setLayout(JSON.parse(saved));
          } catch(err) {
            let layout = getLayout(section);
            if(layout) nLayout.setLayout(layout);
          }
        } else {
          let layout = getLayout(section);
          if(layout) nLayout.setLayout(layout);
        }
      }
      // Explorer file routing (section-specific)
      if("explorer"===section&&subPath){
        requestAnimationFrame(()=>{state.activeFile=subPath,emit("file-selected",{path:subPath,fromRoute:!0})});
      }
    }

    sb.setSections(getSections());
    window.addEventListener("hashchange",handleRoute);
    
    events.addEventListener("file-selected",e=>{
      if(e.detail.fromRoute)return;
      if(e.detail.source==="canvas")return;
      let filePath=e.detail.path;
      let route=getRoute();
      if(filePath&&route.panel==="explorer"){
        let currentParams=parseQuery(route.query);
        history.replaceState(null,"","#"+buildHash('explorer',filePath,currentParams));
      }
    });
    
    localStorage.removeItem("pg-explorer-layout");
    localStorage.removeItem("pg-layout-v2");
    
    if(location.hash&&"#"!==location.hash) {
      handleRoute();
    } else {
      setDefaultPanel('dashboard');
    }
    
    // Initialize Dashboard data
    const list = await fetchProjects();
    dashState.projects = list.map(t=>({prefix:t.prefix,...t,connected:!1,agents:0}));
    dashEmit("projects-updated",dashState.projects);
    initDashboardWS(dashState.projects);

    try {
      const [histRes, cliRes, chatRes] = await Promise.all([
        fetch('/api/projects/history').then(r => r.json()),
        fetch('/api/cli/config').then(r => r.json()),
        fetch('/api/chats').then(r => r.json()),
      ]);
      dashState.projectHistory = histRes.projects || [];
      dashState.openProjectIds = histRes.activeIds || [];
      if (!dashState.activeProjectId) {
        dashState.activeProjectId = dashState.openProjectIds[0] || null;
      }
      dashState.globalCli = cliRes.global || {};
      dashState.chats = chatRes.chats || [];
      dashEmit('projects-history-updated', dashState.projectHistory);
      dashEmit('chats-updated');
      if (dashState.activeProjectId) dashEmit('active-project-changed', { id: dashState.activeProjectId });
    } catch (err) {
      console.warn('[app] project/chat init error:', err);
    }
  });
  
  // Also keep original Explorer websocket events alive conceptually
  s("project",e=>{e&&(document.title=`${e.name} — Project Graph`,document.getElementById("project-name").textContent=e.name,document.documentElement.style.setProperty("--project-accent",e.color),g(e.agents))});
  events.addEventListener("skeleton-loaded",e=>{
    const t=e.detail;if(!t)return;state.skeleton=t;const n=new Set;for(const e of Object.values(t.n||{}))e.f&&n.add(e.f);for(const e of Object.keys(t.X||{}))n.add(e);for(const[e,o]of Object.entries(t.f||{}))for(const t of o)n.add("./"===e?t:`${e}${t}`);for(const[e,o]of Object.entries(t.a||{}))for(const t of o)n.add("./"===e?t:`${e}${t}`);const o=document.getElementById("project-files");o&&(o.textContent=`${n.size} files`)
  });
  s("skeleton",e=>{if(!e)return;state.skeleton=e;emit("skeleton-loaded",e)});
  s("connected",e=>{const t=document.getElementById("status-indicator");t&&(t.className=e?"status connected":"status disconnected")});
  i(e=>{
    if("agent_connect"===e.type||"agent_disconnect"===e.type)return g(e.agents),void emit("agent-event",e);
    state.monitorEvents.push(e),state.monitorEvents.length>500&&state.monitorEvents.shift(),emit("tool-event",e)
  });
  // NOTE: In mcp-agent-portal context, state.js WS connect is disabled.
  // All API calls go through HTTP /api/mcp-call multiplexer.
  // c();
}

function g(e){let t=document.getElementById("agent-badge");if(!t){const e=document.querySelector(".app-topbar");if(!e)return;t=document.createElement("span"),t.id="agent-badge",t.className="agent-badge",e.appendChild(t)}t.textContent=e>0?`● ${e} agent${1!==e?"s":""}`:"",t.style.display=e>0?"":"none"}
function f(){document.querySelector("pg-quick-open")||document.body.appendChild(document.createElement("pg-quick-open"))}
function h(){const btn=document.getElementById("follow-btn");if(!btn)return;let active=false;btn.addEventListener("click",()=>{active=!active;if(active){btn.setAttribute("data-active","");btn.classList.add("active");followController.enable();location.hash="follow"}else{btn.removeAttribute("data-active");btn.classList.remove("active");const prev=followController.getPreviousHash();followController.disable();if(prev&&prev!=="#follow")location.hash=prev.replace(/^#/,"")}events.dispatchEvent(new CustomEvent("follow-mode-changed",{detail:{enabled:active}}))});events.addEventListener("follow-state-changed",e=>{const en=e.detail?.enabled;if(en&&!active){active=true;btn.setAttribute("data-active","");btn.classList.add("active")}else if(!en&&active){active=false;btn.removeAttribute("data-active");btn.classList.remove("active")}});window.addEventListener("hashchange",()=>{const sec=(location.hash.replace("#","").split("?")[0].split("/")[0])||"explorer";if(sec==="follow"&&!active){active=true;btn.setAttribute("data-active","");btn.classList.add("active");followController.enable()}else if(sec!=="follow"&&active){active=false;btn.removeAttribute("data-active");btn.classList.remove("active");followController.disable()}})}
function _initRibbon(){if(!document.querySelector("follow-ribbon"))document.body.appendChild(document.createElement("follow-ribbon"))}

if ("loading"===document.readyState) {
  document.addEventListener("DOMContentLoaded",()=>{u(),f(),followController.init(events,emit),h(),_initRibbon()});
} else {
  u(),f(),followController.init(events,emit),h(),_initRibbon();
}
