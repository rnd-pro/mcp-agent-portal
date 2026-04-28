// @ctx .context/web/dashboard-state.ctx
export const state = {
  projects: [],           // running instances (from /api/instances)
  events: [],             // tool events
  projectHistory: [],     // all known projects (from config)
  activeProjectId: null,  // currently focused project tab
  openProjectIds: [],     // open tabs
  chats: [],              // chat list metadata
  activeChatId: null,     // currently open chat
  globalCli: {},          // global adapter settings
};
export const events = new EventTarget;
export function emit(t, e = {}) { events.dispatchEvent(new CustomEvent(t, { detail: e })); }