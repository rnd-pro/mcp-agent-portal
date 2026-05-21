// @ctx TopologyPanel.ctx
import { Symbiote } from '@symbiotejs/symbiote';
import template from './TopologyPanel.tpl.js';
import cssLocal from './TopologyPanel.css.js';
import { sharedUiStyles as cssShared } from 'symbiote-node/ui';

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
    let rows = [this.createTopologyRow({
      name: 'portal-master',
      color: '#8A2BE2',
      typeText: 'Master',
      typeClass: 'info',
      typeStyles: {
        background: 'hsla(280, 55%, 45%, 0.2)',
        borderColor: 'transparent',
        color: 'var(--sn-cat-server, hsl(280, 55%, 45%))',
      },
      location: 'localhost',
      agentsText: '-',
      statusText: '● Active',
    })];

    for (let inst of instances) {
      let isRemote = inst.command === 'remote-client';
      let location = isRemote ? inst.args[0] : 'localhost';
      rows.push(this.createTopologyRow({
        name: inst.name,
        color: inst.color,
        typeText: isRemote ? 'Remote' : 'Local',
        typeClass: isRemote ? 'info' : 'success',
        location,
        agentsText: inst.agents || 0,
        statusText: '● Connected',
      }));
    }

    this.ref.tableBody.replaceChildren(...rows);
  }

  createTopologyRow({ name, color, typeText, typeClass, typeStyles, location, agentsText, statusText }) {
    let row = document.createElement('tr');

    let nameCell = document.createElement('td');
    let colorDot = document.createElement('span');
    colorDot.className = 'node-color';
    colorDot.style.backgroundColor = color;
    nameCell.append(colorDot, document.createTextNode(` ${name}`));

    let typeCell = document.createElement('td');
    let typeBadge = document.createElement('span');
    typeBadge.className = `ui-badge ${typeClass}`;
    typeBadge.textContent = typeText;
    if (typeStyles) Object.assign(typeBadge.style, typeStyles);
    typeCell.append(typeBadge);

    let locationCell = document.createElement('td');
    locationCell.textContent = location;

    let agentsCell = document.createElement('td');
    agentsCell.textContent = String(agentsText);

    let statusCell = document.createElement('td');
    let status = document.createElement('span');
    status.style.color = 'var(--sn-success-color)';
    status.textContent = statusText;
    statusCell.append(status);

    row.append(nameCell, typeCell, locationCell, agentsCell, statusCell);
    return row;
  }
}

TopologyPanel.template = template;
TopologyPanel.rootStyles = cssShared + cssLocal;
TopologyPanel.reg('topology-panel');
