// @ctx TopologyPanel.ctx
import { Symbiote } from '@symbiotejs/symbiote';
import template from './TopologyPanel.tpl.js';
import cssLocal from './TopologyPanel.css.js';
import { sharedUiStyles as cssShared } from 'symbiote-ui/ui';

const TOPOLOGY_COLUMNS = [
  { key: 'name', label: 'Node ID' },
  { key: 'type', label: 'Type' },
  { key: 'location', label: 'Location' },
  { key: 'agents', label: 'Agents', align: 'end' },
  { key: 'status', label: 'Status' },
];

function normalizeMarkerToken(value) {
  let token = String(value ?? '').trim();
  return /^var\(--sn-[a-z0-9-]+\)$/i.test(token) ? token : 'var(--sn-node-selected)';
}

export class TopologyPanel extends Symbiote {
  init$ = {
    instances: [],
  };

  async initCallback() {
    this.ref.dataTable.setColumns(TOPOLOGY_COLUMNS);
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
      color: 'var(--sn-node-selected)',
      typeText: 'Master',
      typeClass: 'info',
      location: 'localhost',
      agentsText: '-',
      statusText: 'Active',
    })];

    for (let inst of instances) {
      let isRemote = inst.command === 'remote-client';
      let location = isRemote ? inst.args?.[0] : 'localhost';
      rows.push(this.createTopologyRow({
        name: inst.name,
        color: inst.color,
        typeText: isRemote ? 'Remote' : 'Local',
        typeClass: isRemote ? 'info' : 'success',
        location,
        agentsText: inst.agents || 0,
        statusText: 'Connected',
      }));
    }

    this.ref.dataTable.setRows(rows);
  }

  createTopologyRow({ name, color, typeText, typeClass, location, agentsText, statusText }) {
    return {
      id: name,
      cells: {
        name: { text: name, marker: normalizeMarkerToken(color) },
        type: { badge: { label: typeText, variant: typeClass } },
        location: { text: location || 'localhost' },
        agents: { text: String(agentsText), align: 'end' },
        status: { badge: { label: statusText, variant: 'success' } },
      },
    };
  }
}

TopologyPanel.template = template;
TopologyPanel.rootStyles = cssShared + cssLocal;
TopologyPanel.reg('topology-panel');
