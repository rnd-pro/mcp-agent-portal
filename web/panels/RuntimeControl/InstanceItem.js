import { Symbiote, html } from '@symbiotejs/symbiote';
import cssShared from '../../common/ui-shared.css.js';
import css from './RuntimeControl.css.js';

export class InstanceItem extends Symbiote {
  init$ = {
    name: 'unknown',
    status: 'Active',
    pid: '-',
    port: '-',
    agents: '0',
    uptime: '-',
    project: '-',
    command: '-',
    prefix: '-',
    location: '-',
  };
}

InstanceItem.template = html`
<div class="rtc-instance">
  <div class="rtc-instance-head">
    <div class="rtc-instance-name" ${{ textContent: 'name', title: 'name' }}></div>
    <div class="rtc-status"><span class="rtc-status-dot"></span><span ${{ textContent: 'status' }}></span></div>
  </div>
  <div class="rtc-metrics">
    <div class="rtc-metric">
      <div class="rtc-metric-label">PID</div>
      <div class="rtc-metric-value" ${{ textContent: 'pid', title: 'pid' }}></div>
    </div>
    <div class="rtc-metric">
      <div class="rtc-metric-label">Port</div>
      <div class="rtc-metric-value" ${{ textContent: 'port', title: 'port' }}></div>
    </div>
    <div class="rtc-metric">
      <div class="rtc-metric-label">Agents</div>
      <div class="rtc-metric-value" ${{ textContent: 'agents', title: 'agents' }}></div>
    </div>
    <div class="rtc-metric">
      <div class="rtc-metric-label">Uptime</div>
      <div class="rtc-metric-value" ${{ textContent: 'uptime', title: 'uptime' }}></div>
    </div>
    <div class="rtc-metric">
      <div class="rtc-metric-label">Project</div>
      <div class="rtc-metric-value" ${{ textContent: 'project', title: 'project' }}></div>
    </div>
    <div class="rtc-metric">
      <div class="rtc-metric-label">Command</div>
      <div class="rtc-metric-value" ${{ textContent: 'command', title: 'command' }}></div>
    </div>
    <div class="rtc-metric">
      <div class="rtc-metric-label">Prefix</div>
      <div class="rtc-metric-value" ${{ textContent: 'prefix', title: 'prefix' }}></div>
    </div>
    <div class="rtc-metric">
      <div class="rtc-metric-label">Location</div>
      <div class="rtc-metric-value" ${{ textContent: 'location', title: 'location' }}></div>
    </div>
  </div>
</div>
`;

InstanceItem.rootStyles = cssShared + css;
InstanceItem.reg('rc-instance-item');

export default InstanceItem;
