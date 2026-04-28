// @ctx TopologyPanel.ctx
import { Symbiote } from '@symbiotejs/symbiote';
import template from './TopologyPanel.tpl.js';
import cssLocal from './TopologyPanel.css.js';
import cssShared from '../../common/ui-shared.css.js';

export class TopologyPanel extends Symbiote {
  init$ = {
    instances: [],
  };

  async initCallback() {
    this.refreshInterval = setInterval(() => this.fetchTopology(), 2000);
    this.fetchTopology();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.refreshInterval);
  }

  async fetchTopology() {
    try {
      let res = await fetch('/api/instances');
      if (res.ok) {
        let instances = await res.json();
        this.renderTable(instances);
      }
    } catch (err) {
      console.warn('Failed to fetch topology:', err);
    }
  }

  renderTable(instances) {
    let html = '';
    
    // Add the Master (self) node
    html += `
      <tr>
        <td><span class="node-color" style="background-color: #8A2BE2;"></span> portal-master</td>
        <td><span class="ui-badge info" style="background: hsla(280, 55%, 45%, 0.2); border-color: transparent; color: var(--sn-cat-server, hsl(280, 55%, 45%));">Master</span></td>
        <td>localhost</td>
        <td>-</td>
        <td><span style="color: var(--sn-success-color)">● Active</span></td>
      </tr>
    `;

    for (let inst of instances) {
      let isRemote = inst.command === 'remote-client';
      let typeBadge = isRemote 
        ? '<span class="ui-badge info">Remote</span>'
        : '<span class="ui-badge success">Local</span>';
      
      let location = isRemote ? inst.args[0] : 'localhost';

      html += `
        <tr>
          <td><span class="node-color" style="background-color: ${inst.color};"></span> ${inst.name}</td>
          <td>${typeBadge}</td>
          <td>${location}</td>
          <td>${inst.agents || 0}</td>
          <td><span style="color: var(--sn-success-color)">● Connected</span></td>
        </tr>
      `;
    }

    this.ref.tableBody.innerHTML = html;
  }
}

TopologyPanel.template = template;
TopologyPanel.rootStyles = cssShared + cssLocal;
TopologyPanel.reg('topology-panel');
