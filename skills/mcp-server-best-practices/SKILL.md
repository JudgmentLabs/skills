---
name: mcp-server-best-practices
description: Best practices for using the Judgment MCP server effectively. Covers when to use MCP vs other tools, how to query traces with sql_query, and general usage patterns.
license: MIT
metadata:
  author: judgment
  version: "3.0.0"
---

# Judgment MCP Server Best Practices

## Default to MCP

**Always use MCP tools first** when the user asks about anything related to Judgment data — traces, labels, sessions, projects, automations, judges, prompts, datasets, tests, documentation, agent memory, agent threads, or organizations. Do not fall back to reading code or asking for IDs if an MCP tool can fetch the data directly.

## Query traces with sql_query

Trace, span, session, and score reads go through `sql_query`, a read-only SQL `SELECT` over a virtual catalog scoped to one project. **Call `discover_schema` first.** It returns every table, its columns and their meanings, example queries, and the row and size limits.

The main trace tables are `telemetry.traces` (one row per trace, with `trace_id`, `session_id`, `started_at`, `duration_ms`, `status`, `error_message`, `customer_id`), `telemetry.spans` (one row per span, with cost and token usage), and `telemetry.scores` (judge results).

### One query instead of many calls

A single `sql_query` can combine several conditions with `OR`, aggregate, or join tables. Prefer one well-shaped query over a series of narrow ones.

### Example: "Find traces where something went wrong"

```sql
SELECT trace_id, trace_name, started_at, duration_ms, status, error_message
FROM telemetry.traces
WHERE started_at >= now() - INTERVAL 7 DAY
  AND (status = 'error' OR duration_ms >= 10000)
ORDER BY started_at DESC
LIMIT 50
```

### Example: "Show me the spans in one trace"

```sql
SELECT span_id, parent_span_id, span_name, span_kind, started_at,
       duration_ms, status, model, cost_usd
FROM telemetry.spans
WHERE trace_id = 'trace-id'
ORDER BY started_at, span_id
LIMIT 100
```

For content searches (for example "traces about billing"), use the text-search tables and examples that `discover_schema` lists rather than scanning full inputs and outputs.

## General Rules

- **Discover before querying**: call `discover_schema` once per task before writing SQL
- **Bound every query**: filter on a time window or an ID, and always add `LIMIT`
- Always deduplicate on `trace_id` before summarizing
- **Result count**: try to find and present 5–10 traces unless the user asks for more. When presenting more than a handful of traces, use a **tabular format** (markdown table) for readability
- **Read large attributes in windows**: select `substringUTF8(...)` slices of large span attributes instead of whole values
- **Memory search before fetch**: use `search_memory_files` to find relevant memory entries before calling `read_memory_files` with specific IDs/paths
- **Poll test progress**: call `get_test_run` for a run's status and `get_test_run_items` for per-example results while the run is in progress
