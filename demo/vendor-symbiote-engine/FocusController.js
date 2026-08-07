export class FocusController {
  enabled = false
  currentFocus = null
  statusText = ''
  _debounceTimer = null
  _previousHash = null
  _boundHandler = null
  _events = null
  _emit = null
  _activePanel = 'graph'

  constructor(options = {}) {
    this.classify = options.classify || (() => null)
    this.buildStatusText = options.buildStatusText || (() => '')
    this.panelToHash = options.panelToHash || ((panel) => panel)
    this.heavyDebounce = options.heavyDebounce || 800
    this.panelMountDelay = options.panelMountDelay || 300
    this.defaultPanel = options.defaultPanel || 'graph'
    this.statusEventName = options.statusEventName || 'follow-status-changed'
    this.stateEventName = options.stateEventName || 'follow-state-changed'
    this.focusEventName = options.focusEventName || 'follow-focus-changed'
  }

  init(events, emit) {
    this._events = events
    this._emit = emit
  }

  enable() {
    if (this.enabled) return
    this.enabled = true

    if (typeof location !== 'undefined') {
      this._previousHash = location.hash
    }
    this._activePanel = this.defaultPanel

    this._boundHandler = (e) => this._onToolEvent(e.detail)
    if (this._events) {
      this._events.addEventListener('tool-event', this._boundHandler)
    }

    this._emitState(true)
  }

  disable() {
    if (!this.enabled) return
    this.enabled = false

    if (this._boundHandler && this._events) {
      this._events.removeEventListener('tool-event', this._boundHandler)
      this._boundHandler = null
    }
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer)
      this._debounceTimer = null
    }

    this.currentFocus = null
    this._emitStatus('')
    this._emitState(false)
  }

  getPreviousHash() {
    return this._previousHash
  }

  _onToolEvent(event) {
    if (!this.enabled) return

    const toolName = event.tool || event.name || ''
    const args = event.args || {}
    const isCall = event.type === 'tool_call'
    const isResult = event.type === 'tool_result'

    const shortName = this._shortName(toolName)

    if (isCall) {
      const text = this.buildStatusText(shortName, args)
      if (text) this._emitStatus(text)
    }

    const action = this.classify(shortName, args, isCall, isResult, event)
    if (action) {
      this._routeAndFocus(action)
    }
  }

  _routeAndFocus(action) {
    const targetPanel = action.focus.type === 'file' ? 'code' : action.focus.type || this.defaultPanel

    const needsSwitch = this._activePanel !== targetPanel
    this._activePanel = targetPanel

    if (needsSwitch && typeof location !== 'undefined') {
      const hashSection = this.panelToHash(targetPanel)
      const newHash = `#${hashSection}`
      if (location.hash !== newHash) {
        location.hash = hashSection
      }
    }

    if (needsSwitch) {
      setTimeout(() => {
        this._emitFocusNow(action.focus)
      }, this.panelMountDelay)
    } else if (action.immediate) {
      this._emitFocusNow(action.focus)
    } else {
      this._emitFocusDebounced(action.focus, action.debounce || this.heavyDebounce)
    }
  }

  _shortName(full) {
    let name = full.replace(/^default_api:/, '')
    name = name.replace(/^mcp_project-graph_/, '')
    return name
  }

  _emitFocusNow(focus) {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer)
      this._debounceTimer = null
    }
    this.currentFocus = focus
    if (this._emit) {
      this._emit(this.focusEventName, focus)
    }
  }

  _emitFocusDebounced(focus, delay) {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer)
    }
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null
      this.currentFocus = focus
      if (this._emit) {
        this._emit(this.focusEventName, focus)
      }
    }, delay)
  }

  _emitStatus(text) {
    this.statusText = text
    if (this._emit) {
      this._emit(this.statusEventName, { text })
    }
  }

  _emitState(enabled) {
    if (this._emit) {
      this._emit(this.stateEventName, { enabled })
    }
  }
}
