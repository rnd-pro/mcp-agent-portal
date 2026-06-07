import { FocusController } from 'symbiote-ui/ui';
import { tPortal } from './common/localization.js';

class FollowController extends FocusController {
  constructor() {
    super({
      heavyDebounce: 800,
      panelMountDelay: 300,
      defaultPanel: 'graph',
      classify: (tool, args, isCall, isResult, raw) => {
        if (!isCall) return null;

        // === Graph navigation ===
        if (tool === 'navigate') {
          if (args.action === 'expand' && args.symbol) {
            return { focus: { type: 'graph', target: args.symbol, action: 'focus' }, debounce: 800 };
          }
          if (args.action === 'deps' && args.symbol) {
            return { focus: { type: 'graph', target: args.symbol, action: 'deps' }, debounce: 800 };
          }
          if (args.action === 'usages' && args.symbol) {
            return { focus: { type: 'graph', target: args.symbol, action: 'deps' }, debounce: 800 };
          }
          if (args.action === 'call_chain' && args.from && args.to) {
            return { focus: { type: 'graph', target: { from: args.from, to: args.to }, action: 'chain' }, immediate: true };
          }
          if (args.action === 'sub_projects') {
            return { focus: { type: 'graph', action: 'fit' }, immediate: true };
          }
        }

        // === Skeleton / Overview ===
        if (tool === 'get_skeleton' || tool === 'get_ai_context') {
          return { focus: { type: 'graph', action: 'fit' }, immediate: true };
        }

        // === Code compaction (compact_file action has a file path) ===
        if (tool === 'compact' && args.path) {
          return { focus: { type: 'file', target: args.path }, debounce: 800 };
        }

        // === Documentation ===
        if (tool === 'docs' && (args.file || args.path)) {
          return { focus: { type: 'file', target: args.file || args.path }, debounce: 800 };
        }

        // === Analysis ===
        if (tool === 'analyze') {
          return { focus: { type: 'graph', action: 'fit' }, immediate: true };
        }

        // === JSDoc ===
        if (tool === 'jsdoc' && args.path) {
          return { focus: { type: 'file', target: args.path }, debounce: 800 };
        }

        // === Focus zone ===
        if (tool === 'get_focus_zone') {
          return { focus: { type: 'graph', action: 'fit' }, immediate: true };
        }

        return null;
      },
      buildStatusText: (tool, args) => {
        const file = args.path || '';
        const short = file ? file.split('/').slice(-2).join('/') : '';

        switch (tool) {
          case 'navigate': {
            if (args.action === 'expand') return `🔍 Expanding ${args.symbol}`;
            if (args.action === 'deps') return `🔗 Tracing deps of ${args.symbol}`;
            if (args.action === 'usages') return `📡 Finding usages of ${args.symbol}`;
            if (args.action === 'call_chain') return `Tracing ${args.from} → ${args.to}`;
            if (args.action === 'sub_projects') return `Scanning sub-projects`;
            return `Navigating graph`;
          }
          case 'get_skeleton': return `Scanning project structure`;
          case 'get_ai_context': return tPortal('text.loadingAiContext');
          case 'get_focus_zone': return `Analyzing recent changes`;
          case 'compact': return `Reading ${short}`;
          case 'analyze': return `Analyzing: ${args.action || ''}`;
          case 'docs': return `Documentation: ${args.action || ''}`;
          case 'jsdoc': return `JSDoc: ${args.action || ''}`;
          case 'db': return `Database: ${args.action || ''}`;
          case 'testing': return `Tests: ${args.action || ''}`;
          case 'filters': return tPortal('text.filters', { action: args.action || '' });
          default: return tool ? `${tool}` : '';
        }
      },
      panelToHash: (panel) => {
        return 'follow';
      }
    });
  }
}

export const followController = new FollowController();
