# Judgment MCP Server Best Practices

Use this reference when working with the Judgment MCP server to query and manage traces, behaviors, sessions, projects, automations, judges, prompts, documentation, agent memory, and agent threads.

## Default to MCP

**Always use MCP tools first** when the user asks about anything related to:

- Organizations (which organizations are available and which organization to use)
- Projects (project list, project stats, creating projects, favorites)
- Traces (finding traces, inspecting spans, scores, costs, latency, tagging, triggering evaluations)
- Sessions (user sessions, session traces, session behaviors)
- Behaviors (what behaviors exist, behavior stats, scorer config, creating/updating/deleting behaviors)
- Judges (listing judges, judge config, creating/updating judges, version tagging, available models)
- Prompts (listing prompts, reading versions, committing versions, tagging versions)
- Automations / rules (what automations are configured, creating/updating/deleting rules)
- Agent Memory (listing memory entries, fetching memory files, writing durable context)
- Agent Threads (listing thread conversations, reading thread transcripts)
- Documentation (searching docs, reading full doc pages)
- Judgment data in general (anything about what happened in production)

Do not fall back to reading code or asking for IDs if an MCP tool can fetch the data directly.

## Available Tools

The MCP server provides 51 tools organized into eleven categories. Every tool except `list_organizations` takes an `organization_id` argument that selects the organization the call operates on.

### Organizations

- `list_organizations` - List the organizations the authenticated user is a member of. Use the returned `organization_id` as input to all other MCP tools.

### Projects

#### Read

- `list_projects` - List all projects in your organization with summary stats (datasets, experiment runs, traces, behaviors).

#### Write

- `create_project` - Create a new project in your organization. Requires the developer role.
- `add_project_favorite` - Mark a project as a favorite so it appears pinned in the UI.
- `remove_project_favorite` - Remove a project from your favorites.

### Traces

#### Read

- `search_traces` - **Batch search** - accepts up to 10 queries in a single call, each with its own filters, sort order, time range, and pagination (max 200 per page). Filter by duration, error, span name, customer ID, session ID, tags, LLM cost, behaviors, scores, or full-text search. Sort by `created_at` (default desc), `span_name`, `duration`, or `llm_cost`; any sort other than `created_at` desc requires `time_range.start_time` and a window of at most 7 days. Use `created_at` desc for broader ranges. Always batch multiple queries into one call instead of making separate tool calls.
- `get_trace_detail` - Get duration, cost, and session info for a single trace.
- `get_trace_spans` - Get all spans for a trace.
- `get_trace_span` - **Batch get** - accepts up to 20 trace/span pairs in one call. Returns detailed span information including scores and annotations. Always batch multiple span lookups into one call.
- `get_trace_tags` - Get tags for a trace.
- `get_trace_behaviors` - Get behavior results (binary/categorical scores) for a trace.

#### Write

- `add_trace_tags` - Attach one or more string tags to an existing trace. Tags are additive; existing tags are preserved. Requires the developer role.
- `evaluate_traces` - Trigger online evaluation for specific traces (up to 100). Optionally restrict to named judges. Requires the developer role.
- `evaluate_all_traces` - Trigger online evaluation for all recent traces (up to a configurable limit, default 1000). Optionally restrict to named judges. Requires the developer role.

### Sessions

- `search_sessions` - Search and filter sessions by session ID, trace count, latency, total cost, or behaviors. Supports time ranges, sorting, and pagination.
- `get_session_detail` - Get session timestamps, trace count, latency, cost, and token usage.
- `get_session_trace_ids` - Get all trace IDs in a session.
- `get_session_trace_behaviors` - Get behaviors detected across traces in a session, grouped by behavior.

### Behaviors

#### Read

- `list_behaviors` - List all behaviors for the project with stats.
- `get_behavior_detail` - Get full details for a behavior including scorer prompt, configuration, and stats.

#### Write

- `create_binary_behavior` - Create a binary (yes/no) behavior. The judge LLM uses your prompt to decide true/false on each qualifying span. Requires the developer role.
- `create_classifier_behavior` - Create a classifier (multi-label) behavior. The judge LLM picks one of the supplied options for each qualifying span. Requires the developer role.
- `update_behavior` - Update a behavior's description. Requires the developer role.
- `delete_behavior` - Delete a behavior. Optionally also deletes the underlying scorer. Requires the admin role.

### Judges

#### Read

- `list_judges` - List every judge in a project, including prompt, code, and custom-uploaded judges with their current configuration and online-evaluation settings.
- `get_judge` - Get full detail for a single judge, including all versions, prompts, categories, and online-evaluation settings.
- `list_judge_models` - List the models available for use as the LLM backing a judge.
- `get_judge_settings` - Get advanced evaluation settings for a judge.

#### Write

- `create_judge` - Create a new prompt judge in a project. Specify a name, model, prompt, and score type (`binary`, `numeric`, or `categorical`). Requires the developer role.
- `update_judge` - Update a judge's model, prompt, description, score type, categories, score bounds, agent prompts, or version metadata. Pass `target_major_version`/`target_minor_version` to update a specific version; otherwise the latest version is updated. Requires the developer role.
- `set_judge_tag` - Add or remove a version tag (e.g. `prod`) on a specific version of a judge. Requires the developer role.
- `delete_judges` - Delete one or more judges by ID. Behaviors that reference these judges are also removed. Requires the developer role.
- `update_judge_settings` - Update how often and on which spans a judge runs online. Set `evaluation_mode: continuous` with a sampling rate for automatic evaluation, or `on_demand` for manual invocation. Requires the developer role.

### Prompts

#### Read

- `list_prompts` - List all prompts in a project with their version count and last updated timestamp.
- `get_prompt` - Get the content and metadata for a specific prompt version. Returns the latest version by default; optionally pass `commit_id` or `tag` to fetch a specific version.
- `get_prompt_versions` - List all committed versions of a prompt, ordered newest first, including tags and author info.

#### Write

- `commit_prompt` - Commit a new version of a prompt. Creates the prompt if it does not exist yet. Optionally apply tags (e.g. `prod`) to the new version. Requires the developer role.
- `tag_prompt` - Add one or more tags to a specific version (commit) of a prompt. Tags like `prod` or `staging` let you pin a version for retrieval. Requires the developer role.
- `untag_prompt` - Remove one or more tags from a prompt. The underlying versions are not deleted. Requires the developer role.

### Agent Threads

- `list_agent_threads` - List agent thread conversations for the authenticated user in a project, including title, type, message count, run status, and timestamps. Optionally filter by agent kind (`global_copilot`, `custom_agent`) and limit results (max 100).
- `get_agent_thread` - Get a single agent thread conversation including its full message transcript, metadata, active run status, and timestamps.

### Automations

#### Read

- `list_automations` - List all automations with their conditions, actions, and active status.
- `get_automation` - Get a single automation by ID.

#### Write

- `create_automation` - Create an automation that watches behavior/latency/cost metrics and fires actions when conditions match. Requires the developer role.
- `update_automation` - Update an existing automation. All fields other than the IDs are optional. Use `active: true/false` to enable or disable. Requires the developer role.
- `delete_automation` - Delete an automation. Requires the admin role.

### Agent Memory

- `list_agent_memory_entries` - List all Agent Memory entries (folders and files) for a project.
- `fetch_agent_memory_files` - Fetch Agent Memory files by ID and/or path. Folders are ignored and files are returned in request order. Accepts up to 200 IDs or paths per call.
- `write_memory` - Create or update an Agent Memory file by path. Use this when an agent learns durable project context that should be available in future sessions. Requires the developer role.

### Documentation

- `search_docs` - Hybrid semantic + keyword search over Judgment documentation. Returns matching doc sections with titles, headings, paths, and content snippets.
- `read_doc_page` - Read the full markdown content of a Judgment documentation page by path. Use after `search_docs` to get full context for a specific page.

## Using search_traces Effectively

### Prefer full-text search first

When looking for traces by content, **always try `full_text_search` first** before resorting to `span_attributes_roots`. Full-text search covers input/output of all spans in the trace plus span names, making it the broadest first pass. Only fall back to `span_attributes_roots` if you need to match a specific structured attribute key that full-text search would not cover, such as `model_name` or `environment`.

### Batch queries: use `queries` array

`search_traces` accepts a `queries` array (1-10 queries per call). Each query has its own `filters`, `time_range`, `sort_by`, and `pagination`. All queries run concurrently server-side. **Always batch multiple searches into one `search_traces` call** instead of making separate tool calls.

### Filter reference

Each filter is an object with a `field` discriminator:

```json
// Duration (milliseconds)
{ "field": "duration", "op": ">=", "value": 5000 }

// Error message
{ "field": "error", "op": "contains", "value": "timeout" }

// Span name
{ "field": "span_name", "op": "=", "value": "my-span" }

// Customer ID
{ "field": "customer_id", "op": "=", "value": "user-123" }

// Session ID
{ "field": "session_id", "op": "=", "value": "sess-abc" }

// Tags (any of the listed values)
{ "field": "tags", "op": "any", "value": ["tag1", "tag2"] }

// LLM cost (USD)
{ "field": "llm_cost", "op": ">", "value": 0.10 }

// Behaviors
{ "field": "behaviors", "op": "any", "value": ["behavior-id"] }

// Root span attribute (use only when you need a specific structured key; try full_text_search first)
{ "field": "span_attributes_roots", "key": "my.attribute", "op": "contains", "value": "foo" }

// Full-text search (searches input and output of all spans in the trace, plus span names)
{ "field": "full_text_search", "op": "contains", "value": "user query text" }
```

String ops: `=`, `!=`, `contains`, `does_not_contain`, `exists`, `is_absent`
Numeric ops: `=`, `!=`, `<`, `<=`, `>`, `>=`

## Batch Queries for Semantic/Fuzzy Searches

When answering a question that cannot be answered with a single precise filter, such as "find traces where the user seemed confused", "show me failing traces from this week", or "what are the most expensive traces?", pack multiple queries into a single `search_traces` call using the `queries` array.

### Why batch queries

`search_traces` is a structured filter tool. For semantic or multi-faceted questions, a single filter can miss data. Batching multiple queries with different filters gives broader, more complete coverage without extra tool calls.

### Example: "Find traces where something went wrong"

One `search_traces` call with 5 queries:

```json
search_traces({ queries: [
  { filters: [{ field: "error", op: "exists", value: "" }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } },
  { filters: [{ field: "duration", op: ">=", value: 10000 }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } },
  { filters: [{ field: "llm_cost", op: ">", value: 0.5 }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } },
  { filters: [{ field: "full_text_search", op: "contains", value: "error" }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } },
  { filters: [{ field: "full_text_search", op: "contains", value: "failed" }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } }
] })
```

Then merge and deduplicate results by `trace_id` before presenting.

### Example: "Find traces about billing questions"

One `search_traces` call with keyword variants:

```json
search_traces({ queries: [
  { filters: [{ field: "full_text_search", op: "contains", value: "billing" }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } },
  { filters: [{ field: "full_text_search", op: "contains", value: "invoice" }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } },
  { filters: [{ field: "full_text_search", op: "contains", value: "payment" }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } },
  { filters: [{ field: "full_text_search", op: "contains", value: "subscription" }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } },
  { filters: [{ field: "full_text_search", op: "contains", value: "charge" }], pagination: { limit: 200, cursorCreatedAt: null, cursorItemId: null } }
] })
```

### General rules

- **Full-text search first**: always prefer `full_text_search` over `span_attributes_roots` for content matching.
- **Batch aggressively**: for semantic queries, generate 3-8 keyword variants and pack them all into one `search_traces` call (max 10 queries).
- For multi-signal queries (slow AND expensive AND erroring): batch each filter as a separate query, then intersect/union results.
- Always deduplicate on `trace_id` before summarizing.
- **Result count**: try to find and present 5-10 traces unless the user asks for more. Use `limit: 200` in queries to maximize your chances of finding enough results. When presenting more than a handful of traces, use a markdown table for readability.
