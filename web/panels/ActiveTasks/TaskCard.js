import { Symbiote, html } from '@symbiotejs/symbiote';
import { sharedUiStyles as cssShared } from 'symbiote-node/ui';

export class TaskCard extends Symbiote {
  init$ = {
    id: '',
    shortId: '',
    status: '',
    badgeClass: 'info',
    slug: '',
    description: '',
    fullDescription: '',
    duration: '0s',
    chatName: '',
    pid: '',
    events: '',
    trackedChildren: '',
    hidePid: true,
    hideEvents: true,
    hideTracked: true,
    hideCancel: true,
    hideFinish: false,
  };
}

TaskCard.template = html`
<div class="ui-card">
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
    <div style="font-family:monospace; color:#9ca3af;" ${{ textContent: 'shortId', title: 'id' }}></div>
    <div ${{ textContent: 'status', className: 'badgeClass' }}></div>
  </div>
  <div>
    <div style="margin-bottom:12px; line-height:1.4;" ${{ textContent: 'description', title: 'fullDescription' }}></div>
    <div style="display:flex; gap:16px; font-size:12px; color:#9ca3af; flex-wrap:wrap;">
      <span><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;margin-right:2px">timer</span> <span ${{ textContent: 'duration' }}></span></span>
      <span ${{ hidden: 'hidePid' }}><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;margin-right:2px">settings</span> PID: <span ${{ textContent: 'pid' }}></span></span>
      <span ${{ hidden: 'hideTracked' }}><span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;margin-right:2px">account_tree</span> <span ${{ textContent: 'trackedChildren' }}></span> tracked</span>
      <span ${{ hidden: 'hideEvents' }}><span ${{ textContent: 'events' }}></span> events</span>
    </div>
  </div>
  <div style="margin-top:16px; border-top:1px solid #404040; padding-top:16px; display:flex; gap:8px; flex-wrap:wrap;">
    <button class="ui-btn danger" ${{ hidden: 'hideCancel', '@data-task-id': 'id', onclick: '^onCancelTask' }}>Cancel</button>
    <button class="ui-btn" ${{ hidden: 'hideFinish', '@data-task-id': 'id', onclick: '^onFinishTask' }}>Finish</button>
  </div>
</div>
`;

TaskCard.rootStyles = cssShared;
TaskCard.reg('at-task-card');

export default TaskCard;
