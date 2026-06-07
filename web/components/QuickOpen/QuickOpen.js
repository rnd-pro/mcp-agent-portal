// @ctx .context/web/components/quick-open.ctx
import {
  QuickOpen as BaseQuickOpen,
  buildHash,
  collectQuickOpenFilesFromSkeleton,
  getRoute,
  parseQuery,
} from 'symbiote-ui/ui';
import { state, events, emit } from '../../app.js';

export class QuickOpen extends BaseQuickOpen {
  _portalQuickOpenInitialized = false;

  renderCallback() {
    super.renderCallback();

    if (this._portalQuickOpenInitialized) return;
    this._portalQuickOpenInitialized = true;

    events.addEventListener('skeleton-loaded', (event) => this._collectFiles(event.detail));
    this.addEventListener('quick-open-select', (event) => this._openSelection(event.detail));

    if (state.skeleton) {
      this._collectFiles(state.skeleton);
    }
  }

  _collectFiles(skeleton) {
    this.setFiles(collectQuickOpenFilesFromSkeleton(skeleton));
  }

  _openSelection(item) {
    let file = item.value;
    if (!file) return;

    state.activeFile = file;
    emit('file-selected', { path: file });

    let route = getRoute();
    let params = parseQuery(route.query || '');
    let nextHash = buildHash('explorer', file, params);
    if (location.hash.startsWith('#explorer')) {
      history.replaceState(null, '', `#${nextHash}`);
    } else {
      location.hash = nextHash;
    }
  }
}

QuickOpen.reg('pg-quick-open');
