import { Symbiote, html } from '@symbiotejs/symbiote';
import { sharedUiStyles as cssShared } from 'symbiote-ui/ui';

export class TaskCard extends Symbiote {
  init$ = {
    id: '',
    shortId: '',
    status: '',
    badgeVariant: 'info',
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
<sn-card>
  <div class="task-card-head">
    <div class="task-card-id" ${{ textContent: 'shortId', title: 'id' }}></div>
    <sn-badge ${{ textContent: 'status', '@variant': 'badgeVariant' }}></sn-badge>
  </div>
  <div>
    <div class="task-card-description" ${{ textContent: 'description', title: 'fullDescription' }}></div>
    <div class="task-card-meta">
      <span><span class="material-symbols-outlined task-card-icon">timer</span> <span ${{ textContent: 'duration' }}></span></span>
      <span ${{ hidden: 'hidePid' }}><span class="material-symbols-outlined task-card-icon">settings</span> PID: <span ${{ textContent: 'pid' }}></span></span>
      <span ${{ hidden: 'hideTracked' }}><span class="material-symbols-outlined task-card-icon">account_tree</span> <span ${{ textContent: 'trackedChildren' }}></span> tracked</span>
      <span ${{ hidden: 'hideEvents' }}><span ${{ textContent: 'events' }}></span> events</span>
    </div>
  </div>
  <div slot="footer" class="task-card-actions">
    <sn-button variant="danger" ${{ hidden: 'hideCancel', '@data-task-id': 'id', onclick: '^onCancelTask' }}>Cancel</sn-button>
    <sn-button ${{ hidden: 'hideFinish', '@data-task-id': 'id', onclick: '^onFinishTask' }}>Finish</sn-button>
  </div>
</sn-card>
`;

TaskCard.rootStyles = cssShared + `
.task-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.task-card-id {
  font-family: var(--sn-font-mono);
  color: var(--sn-text-dim);
}

.task-card-description {
  margin-bottom: 12px;
  line-height: 1.4;
}

.task-card-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--sn-text-dim);
  flex-wrap: wrap;
}

.task-card-icon {
  font-size: 12px;
  vertical-align: middle;
  margin-right: 2px;
}

.task-card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
`;
TaskCard.reg('at-task-card');

export default TaskCard;
