import { Symbiote, html } from '@symbiotejs/symbiote';
import { sharedUiStyles as cssShared } from 'symbiote-ui/ui';
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
<sn-card class="rtc-instance">
  <div class="rtc-instance-head">
    <div class="rtc-instance-name" ${{ textContent: 'name', title: 'name' }}></div>
    <div class="rtc-status"><span class="rtc-status-dot"></span><span ${{ textContent: 'status' }}></span></div>
  </div>
  <div class="rtc-metrics">
    <sn-metric variant="stacked"><span slot="label">PID</span><span slot="value" ${{ textContent: 'pid', title: 'pid' }}></span></sn-metric>
    <sn-metric variant="stacked"><span slot="label">Port</span><span slot="value" ${{ textContent: 'port', title: 'port' }}></span></sn-metric>
    <sn-metric variant="stacked"><span slot="label">Agents</span><span slot="value" ${{ textContent: 'agents', title: 'agents' }}></span></sn-metric>
    <sn-metric variant="stacked"><span slot="label">Uptime</span><span slot="value" ${{ textContent: 'uptime', title: 'uptime' }}></span></sn-metric>
    <sn-metric variant="stacked"><span slot="label">Project</span><span slot="value" ${{ textContent: 'project', title: 'project' }}></span></sn-metric>
    <sn-metric variant="stacked"><span slot="label">Command</span><span slot="value" ${{ textContent: 'command', title: 'command' }}></span></sn-metric>
    <sn-metric variant="stacked"><span slot="label">Prefix</span><span slot="value" ${{ textContent: 'prefix', title: 'prefix' }}></span></sn-metric>
    <sn-metric variant="stacked"><span slot="label">Location</span><span slot="value" ${{ textContent: 'location', title: 'location' }}></span></sn-metric>
  </div>
</sn-card>
`;

InstanceItem.rootStyles = cssShared + css;
InstanceItem.reg('rc-instance-item');

export default InstanceItem;
