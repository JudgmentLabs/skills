# Judgeval JQL for TypeScript

This reference matches `judgeval@1.3.0`.

## Install and configure

```bash
npm install judgeval
# or: yarn add judgeval
# or: pnpm add judgeval
# or: bun add judgeval
```

Set `JUDGMENT_API_KEY` and `JUDGMENT_ORG_ID` in the environment, then select the project through the client:

```typescript
import { Judgeval } from "judgeval";

const client = await Judgeval.create({ projectName: "my-project" });
```

Do not add organization or project identifiers to query JSON.

## First query

```typescript
import { Judgeval } from "judgeval";
import { eq, traces } from "judgeval/jql";

const client = await Judgeval.create({ projectName: "my-project" });
const query = traces().where(eq("session", "session-123")).ids();
const result = await client.query(query);
```

`query.toJSON()` returns this canonical JSON:

```json
{"op":"query","source":"traces","filter":{"op":"eq","field":"session","value":"session-123"},"select":{"op":"ids"}}
```

## Query roots and time bounds

<!-- jql:generated:roots -->
| source | builder | canonical JSON source |
|---|---|---|
| traces | `traces(options?)` | `traces` |
| spans | `spans(options?)` | `spans` |
| sessions | `sessions(options?)` | `sessions` |
<!-- /jql:generated:roots -->

Add `.last("7d")`, `.since("2026-01-01T00:00:00Z")`, or `.between(start, end)` before a terminal or `.pipe()`.

## Filters and expressions

Import builders from `judgeval/jql`. Method names are camelCase where the canonical JSON operation uses snake_case, such as `citedBy`, `aggExpr`, and `anySpan`.

<!-- jql:generated:operations -->
| builder | JSON `op` | purpose | signature |
|---|---|---|---|
| `status` | `status` | trace/span status | `status(value)` |
| `name` | `name` | span name — span grain | `name(value)` |
| `model` | `model` | LLM model name — span grain | `model(value)` |
| `cost` | `cost` | span cost — span grain | `cost({ gt?, gte?, lt?, lte? })` |
| `duration` | `duration` | duration in nanoseconds | `duration({ gt?, gte?, lt?, lte? })` |
| `judge` | `judge` | judge scores attached to traces or spans | `judge(judgeName, value?)` |
| `judged` | `judged` | configured judge results | `judged(options)` |
| `attr` | `attr` | structured attributes | `attr(key, value?, selector?)` |
| `grep` | `grep` | substring search | `grep(field, value)` |
| `rg` | `rg` | regex search | `rg(field, pattern, { ignoreCase? }?)` |
| `tokens` | `tokens` | fast whole-word content search | `tokens(field, words)` |
| `eq` | `eq` | compare any valid grain field with a literal | `eq(field, value)` |
| `ne` | `ne` | compare any valid grain field with a literal | `ne(field, value)` |
| `gt` | `gt` | compare any valid grain field with a literal | `gt(field, value)` |
| `gte` | `gte` | compare any valid grain field with a literal | `gte(field, value)` |
| `lt` | `lt` | compare any valid grain field with a literal | `lt(field, value)` |
| `lte` | `lte` | compare any valid grain field with a literal | `lte(field, value)` |
| `citedBy` | `cited_by` | spans cited as evidence by a judge | `citedBy(judgeName, value?)` |
| `all` | `all` | every filter matches (AND) | `all(first, ...rest)` |
| `any` | `any` | at least one filter matches (OR) | `any(first, ...rest)` |
| `not` | `not` | the filter does not match (NOT) | `not(filter)` |
| `anySpan` | `any_span` | at least one child span matches | `anySpan(filter)` |
| `everySpan` | `every_span` | every child span matches | `everySpan(filter)` |
| `noSpan` | `no_span` | no child span matches | `noSpan(filter)` |
| `anyTrace` | `any_trace` | at least one trace in the session matches | `anyTrace(filter)` |
| `everyTrace` | `every_trace` | every trace in the session matches | `everyTrace(filter)` |
| `noTrace` | `no_trace` | no trace in the session matches | `noTrace(filter)` |
| `descendantOf` | `descendant_of` | spans below a matching span in the trace tree | `descendantOf(filter, depth?)` |
| `ancestorOf` | `ancestor_of` | spans above a matching span in the trace tree | `ancestorOf(filter, depth?)` |
| `overSpans` | `over_spans` | an aggregate over a row's child spans meets a threshold | `overSpans(agg, cmp, value, where?)` |
| `overTraces` | `over_traces` | an aggregate over a session's traces meets a threshold | `overTraces(agg, cmp, value, where?)` |
| `overScores` | `over_scores` | an aggregate over a row's judge scores meets a threshold (no where) | `overScores(agg, cmp, value)` |
| `atLeast` | `at_least` | at least k related rows match — between any_ (k=1) and every_ | `atLeast(k, of, where?)` |
| `col` | `col` | a column reference operand | `col(name)` |
| `aggExpr` | `agg_expr` | an aggregate expression; `per` makes it a per-group window, `where` a conditional aggregate | `aggExpr(options)` |
| `arith` | `arith` | arithmetic over expressions | `arith(fn, left, right)` |
| `bucket` | `bucket` | time-bucket key for summarize (outputs column `bucket`) | `bucket(field, every)` |
<!-- /jql:generated:operations -->

## Select terminals

Call exactly one select terminal. `.rows()` accepts explicit fields and an optional per-query limit.

<!-- jql:generated:terminals -->
| JSON `op` | purpose | public SDK signature |
|---|---|---|
| `rows` | rows with optional explicit fields and limit | `.rows({ fields?, limit? }?)` |
| `ids` | matching IDs — cap with the request-level `limit` option | `.ids()` |
| `count` | a total or counts grouped by one field | `.count(by?)` |
| `recent` | the n most recent rows | `.recent(n)` |
| `top` | the n largest rows by a numeric field | `.top(n, by)` |
| `ranked` | positional rows globally or within a field | `.ranked({ by?, pick?, within? }?)` |
| `agg` | one scalar aggregate value; quantile also requires q | `.agg({ func, field, q? })` |
| `trend` | time buckets for count or rate | `.trend({ metric?, bucket? }?)` |
<!-- /jql:generated:terminals -->

Example:

```typescript
import { all, eq, spans, status } from "judgeval/jql";

const result = await client.query(
  spans()
    .where(all(status("error"), eq("model", "gpt-4.1")))
    .last("7d")
    .rows({
      fields: ["span_id", "span_name", "model", "cost"],
      limit: 100,
    }),
);
```

## Pipeline stages

Call `.pipe()` instead of a select terminal. Pipeline stages execute in call order.

<!-- jql:generated:stages -->
| JSON `op` | purpose | public SDK signature |
|---|---|---|
| `where` | keep rows passing a comparison (after summarize: HAVING) | `.where(filter)` |
| `pick` | keep the first/last n rows per group (adds rank column `_rn`) | `.pick({ by?, n?, per?, reverse? }?)` |
| `derive` | add computed columns to every row (rows unchanged) | `.derive(cols)` |
| `summarize` | collapse to one row per group with computed aggregates (grain change) | `.summarize(by, aggs) / .summarize(aggs)` |
| `sort` | order the rows | `.sort(by)` |
| `take` | keep the first n rows (after sort), optionally skipping offset rows | `.take(n, offset?)` |
<!-- /jql:generated:stages -->

```typescript
import { aggExpr, spans } from "judgeval/jql";

const query = spans()
  .last("7d")
  .pipe()
  .summarize("model", {
    total_cost: aggExpr({ func: "sum", field: "cost" }),
  })
  .sort("total_cost desc")
  .take(10);

const result = await client.query(query);
```

## Tables and charts

Presentation options use canonical snake-case JSON names and are executed with `client.present(...)`.

<!-- jql:generated:presentations -->
| JSON `op` | purpose | public SDK signature |
|---|---|---|
| `chart` | chart-ready rows with explicit axes and a bounded chart type | `.chart({ chart_type, title, x_axis, y_axis, series_by?, description? })` |
| `table` | table-ready rows projected to an explicit ordered column list | `.table({ title, columns, description? })` |
<!-- /jql:generated:presentations -->

```typescript
import { aggExpr, spans } from "judgeval/jql";

const summary = spans()
  .last("7d")
  .pipe()
  .summarize("model", {
    total_cost: aggExpr({ func: "sum", field: "cost" }),
  })
  .sort("total_cost desc")
  .take(10);

const tableResult = await client.present(
  summary.table({
    title: "Cost by model",
    columns: [{ key: "model" }, { key: "total_cost" }],
  }),
);

const chartResult = await client.present(
  summary.chart({
    chart_type: "bar",
    title: "Cost by model",
    x_axis: { key: "model" },
    y_axis: { key: "total_cost" },
  }),
);
```

## Discovery

Only use these generated `DiscoveryKind` values:

<!-- jql:generated:discovery -->
| kind | returns | options |
|---|---|---|
| `judges` | current judge names/config | `history`, `limit` |
| `behaviors` | behavior names/values | `history`, `limit` |
| `span_names` | span names seen in facts | `time`, `limit` |
| `models` | model names seen in facts | `time`, `limit` |
| `fields` | standard fields usable for filters, groups, and aggregates | `source` (required), `limit` |
| `citations` | spans cited by a judge decision | `judge`, `value`, `time`, `limit` |
| `rules` | rule configs | `limit` |
| `judge_prompts` | judge prompt configs | `limit` |
| `judge_config` | judge configuration | `limit` |
<!-- /jql:generated:discovery -->

```typescript
const fields = await client.discover("fields", { source: "traces" });
const models = await client.discover("models", {
  time: { last: "7d" },
  limit: 100,
});
const judges = await client.discover("judges", { limit: 100 });
```

## Responses and errors

`client.query(...)` and `client.discover(...)` return `JqlQueryResponse` with exactly:

- `query_id: string`
- `rows: Array<Record<string, unknown>> | null`
- `row_count: number | null`
- `elapsed_ms: number`

`client.present(...)` returns `JqlPresentationResponse` with exactly:

- `query_id: string`
- `presentation: unknown`
- `frame: unknown | null`
- `elapsed_ms: number`

Errors use `JudgevalAPIError` from `judgeval`. Its public structured properties include `status`, `code`, `hint`, and `retryAfterSeconds`.

```typescript
import { JudgevalAPIError } from "judgeval";

try {
  const result = await client.query(query);
} catch (error) {
  if (error instanceof JudgevalAPIError) {
    if (error.retryAfterSeconds !== undefined) {
      await new Promise((resolve) =>
        setTimeout(resolve, error.retryAfterSeconds! * 1000),
      );
      const result = await client.query(query);
    } else {
      throw new Error(
        `JQL request failed: code=${error.code}; hint=${error.hint}`,
        { cause: error },
      );
    }
  } else {
    throw error;
  }
}
```

Retry only when that behavior is appropriate for the application. Do not assume a retry-after value exists or match undocumented error-code strings.
