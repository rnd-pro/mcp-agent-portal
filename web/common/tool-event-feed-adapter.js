import { createEventFeedAdapter } from 'symbiote-node/display/event-feed-adapter';

const CODE_TOOLS = [
  'default_api:view_file',
  'default_api:replace_file_content',
  'default_api:multi_replace_file_content',
  'default_api:write_to_file',
];

const GRAPH_TOOLS = [
  'default_api:mcp_project-graph_navigate',
  'default_api:mcp_project-graph_get_skeleton',
];

const LIST_TOOLS = [
  'default_api:list_dir',
  'default_api:grep_search',
];

const adapter = createEventFeedAdapter({
  codeTools: CODE_TOOLS,
  graphTools: GRAPH_TOOLS,
  listTools: LIST_TOOLS,
});

export const toToolEventFeedItem = adapter.toToolEventFeedItem;
export const toToolEventFeedItems = adapter.toToolEventFeedItems;

