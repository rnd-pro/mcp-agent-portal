import Symbiote from '@symbiotejs/symbiote';
import { emit as dashEmit } from '../../dashboard-state.js';
import { emit as appEmit, resolveProjectPath } from '../../app.js';
import { tPortal } from '../../common/localization.js';
import { normalizeProjectGraphMetadata } from 'symbiote-node/graph';
import template from './GraphFlows.tpl.js';
import css from './GraphFlows.css.js';

function makeMessage(className, message) {
  let node = document.createElement('sn-empty-state');
  node.className = className;
  node.textContent = message;
  return node;
}

function makeStoryButton(story, index, isActive) {
  let button = document.createElement('sn-list-item');
  button.className = 'flows-story';
  button.dataset.storyIndex = String(index);
  if (isActive) button.dataset.active = '';

  let title = document.createElement('span');
  title.className = 'flows-story-title';
  title.textContent = story.label;

  let desc = document.createElement('span');
  desc.className = 'flows-story-desc';
  desc.textContent = story.description;

  let count = document.createElement('span');
  count.className = 'flows-story-count';
  count.textContent = tPortal('text.beatsCount', { count: story.beats.length });

  button.replaceChildren(title, desc, count);
  return button;
}

function makeTag(tag) {
  let node = document.createElement('sn-badge');
  node.className = 'flows-tag';
  node.title = tag;
  node.textContent = tag;
  return node;
}

export class GraphFlows extends Symbiote {
  init$ = {
    stories: [],
  };

  initCallback() {
    this.ref.refreshBtn.onclick = () => this.loadStories();
    this.ref.prevBtn.onclick = () => this._moveBeat(-1);
    this.ref.nextBtn.onclick = () => this._moveBeat(1);
    this.ref.attachBtn.onclick = () => this._attachCurrentBeat();
    this.loadStories();
  }

  async loadStories() {
    try {
      this.ref.storyList.replaceChildren(makeMessage('flows-empty', tPortal('text.loadingFlows')));
      let url = `/api/project-graph-metadata?projectPath=${encodeURIComponent(resolveProjectPath('.'))}`;
      let res = await fetch(url);
      if (!res.ok) throw new Error(`metadata load failed: ${res.status}`);
      let data = await res.json();
      let metadata = normalizeProjectGraphMetadata(data.metadata || {});
      this._metadata = metadata;
      this.$.stories = metadata.stories;
      this._activeStoryIndex = metadata.stories.length > 0 ? 0 : -1;
      this._activeBeatIndex = 0;
      this._renderStories();
      this._renderBeat();
    } catch (err) {
      this.$.stories = [];
      this._metadata = normalizeProjectGraphMetadata();
      this._activeStoryIndex = -1;
      this._activeBeatIndex = 0;
      this.ref.storyList.replaceChildren(makeMessage('flows-error', err.message));
      this.ref.beatPanel.hidden = true;
    }
  }

  _renderStories() {
    let stories = this.$.stories || [];
    if (stories.length === 0) {
      this.ref.storyList.replaceChildren(
        makeMessage('flows-empty', tPortal('text.noGraphStories')),
      );
      this.ref.beatPanel.hidden = true;
      return;
    }

    let storyButtons = stories.map((story, index) => (
      makeStoryButton(story, index, index === this._activeStoryIndex)
    ));
    this.ref.storyList.replaceChildren(...storyButtons);

    this.ref.storyList.querySelectorAll('.flows-story').forEach((button) => {
      button.onclick = () => {
        this._activeStoryIndex = Number(button.dataset.storyIndex);
        this._activeBeatIndex = 0;
        this._renderStories();
        this._renderBeat();
        this._publishCurrentBeat();
      };
    });
  }

  _getCurrentStoryBeat() {
    let story = this.$.stories?.[this._activeStoryIndex] || null;
    if (!story) return { story: null, beat: null };
    let beat = story.beats[this._activeBeatIndex] || null;
    return { story, beat };
  }

  _renderBeat() {
    let { story, beat } = this._getCurrentStoryBeat();
    if (!story || !beat) {
      this.ref.beatPanel.hidden = true;
      return;
    }

    this.ref.beatPanel.hidden = false;
    this.ref.beatKicker.textContent = `${story.label} · ${this._activeBeatIndex + 1}/${story.beats.length}`;
    this.ref.beatTitle.textContent = beat.label;
    this.ref.beatNarrative.textContent = beat.narrative || story.description || '';

    let cluster = this._metadata?.clusters?.find((item) => item.id === beat.clusterId);
    let tags = [
      cluster ? tPortal('text.semanticValue', { value: cluster.label }) : '',
      beat.focusPath || '',
      ...beat.nodes,
    ].filter(Boolean);
    this.ref.beatTags.replaceChildren(...tags.map((tag) => makeTag(tag)));
  }

  _moveBeat(delta) {
    let story = this.$.stories?.[this._activeStoryIndex];
    if (!story) return;
    let next = this._activeBeatIndex + delta;
    if (next < 0) next = story.beats.length - 1;
    if (next >= story.beats.length) next = 0;
    this._activeBeatIndex = next;
    this._renderBeat();
    this._publishCurrentBeat();
  }

  _currentBeatPayload() {
    let { story, beat } = this._getCurrentStoryBeat();
    if (!story || !beat) return null;
    return {
      type: 'graph-story-beat',
      storyId: story.id,
      storyLabel: story.label,
      beatId: beat.id,
      beatLabel: beat.label,
      narrative: beat.narrative,
      nodes: beat.nodes,
      edges: beat.edges,
      clusterId: beat.clusterId,
      focusPath: beat.focusPath,
      source: 'graph-flows',
    };
  }

  _publishCurrentBeat() {
    let payload = this._currentBeatPayload();
    if (!payload) return;
    appEmit('graph-story-beat-selected', payload);
  }

  _attachCurrentBeat() {
    let payload = this._currentBeatPayload();
    if (!payload) return;
    dashEmit('graph-context-selected', payload);
  }
}

GraphFlows.template = template;
GraphFlows.rootStyles = css;
GraphFlows.reg('pg-graph-flows');

export default GraphFlows;
