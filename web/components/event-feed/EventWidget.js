import Symbiote from "@symbiotejs/symbiote";
import { OutputGraphPreview, OutputListPreview } from "symbiote-node/ui";

export class EventWidget extends Symbiote {
  init$ = {
    '@eventData': null,
    isCall: true,
    tool: '',
    argsJSON: '',
    timeStr: '',
    duration: '',
    success: true,
    mode: 'empty',
    errorText: '',
    rawOutput: '',
  };

  renderCallback() {
    this.sub('@eventData', (evStr) => {
      if (!evStr) return;
      let ev;
      try {
        ev = JSON.parse(evStr);
      } catch {
        return;
      }

      this.$.isCall = ev.type === 'tool_call';
      this.$.tool = ev.tool;
      this.$.timeStr = this._formatTime(ev.ts);
      
      if (this.$.isCall) {
        this.$.argsJSON = JSON.stringify(ev.args || {});
      } else {
        this.$.duration = `${ev.duration_ms}ms`;
        this.$.success = ev.success !== false;
      }

      this._renderWidget(ev);
    });
  }

  _renderWidget(ev) {
    if (ev.type === 'tool_call') {
      this.$.mode = 'empty';
      return;
    }

    const { tool, output, success } = ev;
    if (!success || !output) {
      this.set$({
        mode: 'error',
        errorText: output || 'Error',
      });
      return;
    }

    let data = this._parseOutput(output);

    if (tool === 'default_api:view_file' || tool === 'default_api:replace_file_content' || tool === 'default_api:multi_replace_file_content' || tool === 'default_api:write_to_file') {
      this.$.mode = 'code';
      this.ref.codeWidget?.setAttribute('source', output);
    } else if (tool === 'default_api:mcp_project-graph_navigate' || tool === 'default_api:mcp_project-graph_get_skeleton') {
      this.$.mode = 'graph';
      let preview = this.ref.graphPreview;
      if (preview instanceof OutputGraphPreview || preview?.setValue) {
        preview.$.title = 'Graph output';
        preview.setValue(this._toPreviewGraph(data));
      }
    } else if (tool === 'default_api:list_dir' || tool === 'default_api:grep_search') {
      this.$.mode = 'list';
      let preview = this.ref.listPreview;
      if (preview instanceof OutputListPreview || preview?.setValue) {
        preview.$.title = 'List output';
        preview.setValue(data);
      }
    } else {
      this.set$({
        mode: 'raw',
        rawOutput: `${output.substring(0, 500)}${output.length > 500 ? '...' : ''}`,
      });
    }
  }

  _parseOutput(output) {
    try {
      return JSON.parse(output);
    } catch {
      return output;
    }
  }

  _toPreviewGraph(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
    if (Array.isArray(data.nodes)) return data;

    let nodeMap = data.n && typeof data.n === 'object' ? data.n : {};
    let nodes = Object.entries(nodeMap).map(([id, node]) => ({
      id,
      label: node?.label || node?.name || node?.title || id,
      kind: node?.kind || node?.type || 'node',
      description: node?.description || node?.summary || '',
    }));

    let edges = Array.isArray(data.e) ? data.e.map((edge, index) => ({
      id: edge.id || `edge-${index + 1}`,
      source: edge.source || edge.from || edge.a || '',
      target: edge.target || edge.to || edge.b || '',
      label: edge.label || edge.name || '',
      kind: edge.kind || edge.type || 'edge',
    })) : [];

    return {
      nodes,
      edges,
    };
  }

  _formatTime(ts) {
    return ts ? new Date(ts).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  }
}

EventWidget.template = `
<div class="pg-mon-event" \${{ 'data-is-call': 'isCall' }}>
  <div class="event-header">
    <span class="pg-mon-arrow" \${{ textContent: 'isCall ? "→" : "←"' }}></span>
    <span class="pg-mon-tool" \${{ textContent: 'tool' }}></span>
    <span class="pg-mon-time" \${{ textContent: 'timeStr' }}></span>
    <span class="pg-mon-duration" \${{ textContent: 'duration' }}></span>
  </div>
  <div class="event-body" \${{ hidden: '!isCall' }}>
    <span class="pg-mon-args" \${{ textContent: 'argsJSON' }}></span>
  </div>
  <div class="event-body result-body" \${{ hidden: 'isCall' }}>
    <div class="error-msg" \${{ hidden: 'mode !== "error"', textContent: 'errorText' }}></div>
    <pg-code-widget ref="codeWidget" \${{ hidden: 'mode !== "code"' }}></pg-code-widget>
    <output-graph-preview ref="graphPreview" \${{ hidden: 'mode !== "graph"' }}></output-graph-preview>
    <output-list-preview ref="listPreview" \${{ hidden: 'mode !== "list"' }}></output-list-preview>
    <pre class="raw-output" \${{ hidden: 'mode !== "raw"', textContent: 'rawOutput' }}></pre>
  </div>
</div>
`;

EventWidget.reg('pg-event-widget');
