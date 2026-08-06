import Symbiote from '@symbiotejs/symbiote'
import template from './StatusRibbon.tpl.js'
import css from './StatusRibbon.css.js'

export class StatusRibbon extends Symbiote {
  init$ = {
    statusText: '',
    visible: false,
    statusEvent: 'follow-status-changed',
    stateEvent: 'follow-state-changed',
    fadeTimeout: 4000
  }

  _fadeTimer = null
  _eventTarget = null

  initCallback() {
    this._eventTarget = window
  }

  renderCallback() {
    this.sub('visible', (v) => {
      this.toggleAttribute('visible', v)
    })

    const statusHandler = (e) => {
      const text = e.detail?.text || ''
      if (!text) {
        this.$.visible = false
        return
      }
      this.$.statusText = text
      this.$.visible = true

      if (this._fadeTimer) clearTimeout(this._fadeTimer)
      this._fadeTimer = setTimeout(() => {
        this.$.visible = false
      }, this.$.fadeTimeout)
    }

    const stateHandler = (e) => {
      if (!e.detail?.enabled) {
        this.$.visible = false
        this.$.statusText = ''
        if (this._fadeTimer) {
          clearTimeout(this._fadeTimer)
          this._fadeTimer = null
        }
      }
    }

    this.sub('statusEvent', (evtName) => {
      if (this._statusCleanup) this._statusCleanup()
      const target = this.eventTarget || window
      target.addEventListener(evtName, statusHandler)
      this._statusCleanup = () => target.removeEventListener(evtName, statusHandler)
    })

    this.sub('stateEvent', (evtName) => {
      if (this._stateCleanup) this._stateCleanup()
      const target = this.eventTarget || window
      target.addEventListener(evtName, stateHandler)
      this._stateCleanup = () => target.removeEventListener(evtName, stateHandler)
    })
  }

  set eventTarget(target) {
    this._eventTarget = target
    this.$.statusEvent = this.$.statusEvent
    this.$.stateEvent = this.$.stateEvent
  }

  get eventTarget() {
    return this._eventTarget
  }

  destroyCallback() {
    if (this._statusCleanup) this._statusCleanup()
    if (this._stateCleanup) this._stateCleanup()
    if (this._fadeTimer) clearTimeout(this._fadeTimer)
  }
}

StatusRibbon.template = template
StatusRibbon.rootStyles = css

StatusRibbon.reg('sn-status-ribbon')
