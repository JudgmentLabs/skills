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

## Querying traces with sql_query

Trace, span, session, and score reads go through `sql_query`, a read-only SQL `SELECT` scoped to one project. **Call `discover_schema` first.** It lists the tables (such as `telemetry.traces` and `telemetry.spans`), their columns, example queries, and row limits.

### Searching trace content

If `discover_schema` lists a text-search table, use it for content searches. Otherwise, match the root span's `input` and `output` on `telemetry.traces` with `ILIKE`, inside a narrow time window and with a `LIMIT`.

## Batch Queries for Semantic/Fuzzy Searches

When answering a question that can't be answered with a single precise filter — e.g., "find traces where the user seemed confused", "show me failing traces from this week", "what are the most expensive traces?" — **combine the conditions with `OR` in a single `sql_query`** instead of making separate tool calls.

### Example: "Find traces where something went wrong"

```sql
SELECT trace_id, trace_name, started_at, duration_ms, status, error_message
FROM telemetry.traces
WHERE started_at >= now() - INTERVAL 7 DAY
  AND (status = 'error' OR duration_ms >= 10000)
ORDER BY started_at DESC
LIMIT 50
```

### Example: "Find traces about billing questions"

With no text-search table, one `sql_query` with keyword variants:

```sql
SELECT trace_id, trace_name, started_at
FROM telemetry.traces
WHERE started_at >= now() - INTERVAL 1 DAY
  AND (input ILIKE '%billing%' OR output ILIKE '%billing%'
    OR input ILIKE '%invoice%' OR output ILIKE '%invoice%'
    OR input ILIKE '%payment%' OR output ILIKE '%payment%')
ORDER BY started_at DESC
LIMIT 50
```

## General Rules

- **Text search when listed**: use the text-search table from `discover_schema` for content matching, or `ILIKE` on `telemetry.traces` input/output with a narrow time window and a `LIMIT`
- **Batch aggressively**: for semantic queries, generate 3–8 keyword variants and combine them with `OR` in one `sql_query`
- For multi-signal queries (slow AND expensive AND erroring): combine the conditions in one `WHERE` clause
- Always deduplicate on `trace_id` before summarizing
- **Result count**: try to find and present 5–10 traces unless the user asks for more. Use a `LIMIT` large enough to find them. When presenting more than a handful of traces, use a **tabular format** (markdown table) for readability
- **Batch span lookups**: query `telemetry.spans` with `trace_id IN (...)` to read spans for several traces in one call
- **Memory search before fetch**: use `search_memory_files` to find relevant memory entries before calling `read_memory_files` with specific IDs/paths
- **Poll test progress**: use `get_test_run` for a queued test run's status and `get_test_run_items` for per-example results
