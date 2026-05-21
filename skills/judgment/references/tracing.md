# Judgment Tracing

Instrument LLM and agent applications with Judgment tracing, following best
practices and tailored to the user's codebase.

## Scope

**Primary coverage:** Python and TypeScript.

**Out of scope — Java:** Java SDK guidance is **not covered** by this skill. The
auditing heuristics below still apply in principle, but the Python/TS-specific
APIs, env vars, and integration tables do not map 1:1 to Java. When working in a
Java codebase, **flag this to the user explicitly** ("the tracing skill targets
Python/TS — Java coverage is limited; falling back to general OTel reasoning")
and point them at the Judgment Java SDK docs at https://docs.judgmentlabs.ai
rather than relying on the tables in this skill.

## When to Use

- Setting up Judgment tracing in a new project
- Auditing existing Judgment tracing
- Adding observability to LLM calls, tools, agents, or workflows
- Debugging missing traces, flat traces, or malformed span hierarchies

## Workflow

### 1. Assess Current State

Check the project:

- Is `judgeval` installed?
- What language and runtime are used? Python, TypeScript, serverless, worker,
  CLI, web server, or multi-service app?
- What LLM frameworks or providers are used? OpenAI SDK, Anthropic, OpenRouter,
  LangGraph, OpenAI Agents SDK, Claude Agent SDK, Google ADK, Vercel AI SDK,
  LiveKit, OpenTelemetry, OpenLit, OpenInference, etc.
- Is there existing tracing or OpenTelemetry instrumentation?
- Where is the real execution path? Find the route, job, CLI command, queue
  consumer, or agent entrypoint that users actually run.

Useful search:

```bash
rg -n "judgeval|Judgment|Tracer|wrap\\(|OpenAI|Anthropic|LangChain|LangGraph|Vercel|ai\\(|responses\\.create|chat\\.completions" .
```

**No integration yet:** Set up Judgment using a framework or provider
integration if available. Integrations capture more context automatically and
require less code than manual instrumentation.

**Integration exists:** Audit against the best practices below.

**No matching integration:** Initialize tracing once, then manually observe the
root request or agent function plus high-signal tool, retrieval, and LLM calls.

### 2. Confirm Orchestration and Plan

Before writing any tracing code, gather the project's instrumentation shape and confirm a plan with the user. Do not skip this gate — even when the user is terse.

#### Ask what code inspection can't tell you

If any of these are not obvious from Step 1, ask. If they are obvious, state your inference back to the user for confirmation in one line.

- **Orchestration structure**: single function, sequential pipeline, hierarchical delegating sub-agents, or graph / state-machine?
- **Run shape**: one-shot, multi-turn conversation, or loop-until-completion?
- **Identity sources**: where do `session_id`, `customer_id`, and (optionally) `customer_user_id` come from?

#### Show the plan and wait for approval

Reply with this exact structure before any file edits:

```
Plan:
- Integration:    <Tracer.wrap | OTEL instrumentor name | framework integration>
- Entrypoint:     <file:line where Tracer.init will land>
- Span shape:     <functions to @observe + their span_type>
- Identity:       <where set_session_id / set_customer_id will be called>
- Sub-agents:     <which calls use fork=True, or "none">
- I/O capture:    <any record_input=False / record_output=False, with reason>
```

Then ask: **"Approve this plan, or tell me what to change?"** and wait.

---

#### SDK Guardrails

These are SDK-level behaviors the agent must respect when writing code. They're not workflow choices — they're correctness rules.

- **`Tracer.wrap()` provider coverage.**
  - Python: OpenAI, Anthropic, Together AI, Google GenAI.
  - TypeScript: OpenAI only. For any other TS provider, use `Tracer.registerOTELInstrumentation(<instrumentor>)` instead.

- **`Tracer.wrap()` owns these attributes.** Do not set `gen_ai.prompt`, `gen_ai.completion`, `judgment.llm.model`, or any `judgment.usage.*` key by hand when the call is wrapped — the wrapper already populates them.

- **For custom LLM calls (in-house models, raw HTTP, providers not covered by `wrap()` or a framework integration), call `Tracer.recordLLMMetadata({...})` inside the span.** Both Python and TypeScript take an object with **snake_case** keys: `provider`, `model`, `non_cached_input_tokens`, `output_tokens`, `total_cost_usd`. This populates `judgment.llm.*` and `judgment.usage.*` so cost analytics work.

- **Identity helpers vs. `set_attribute`.** `Tracer.set_session_id` / `set_customer_id` / `set_customer_user_id` (camelCase in TS) write to OpenTelemetry baggage, so descendant spans inherit the value — including spans inside `fork=True` linked traces. Writing `judgment.session_id` / `judgment.customer_id` via `set_attribute(s)` only stamps the current span and breaks propagation. Always use the helpers.

- **`fork=True` (Python) / `{ fork: true }` (TS) on `observe`** runs the function in a fresh linked trace. The SDK auto-emits `judgment.link.source_trace_id`, `target_trace_id`, `source_span_id`, `target_span_id` — do **not** set these manually. Identity baggage still propagates across the link.

- **Python generators behave specially under `@Tracer.observe`.** When the wrapped function uses `yield`, the SDK overrides the wrapper's `span_type` to `"generator"` and emits a `"generator_item"` child span per yield. For hot streams (e.g., streaming LLM token output) where per-yield visibility is noise, pass `disable_generator_yield_span=True` to collapse to a single span. TypeScript's `observe` wraps Promise-returning async functions, not generators — there is no equivalent option in `ObserveOptions`.

---

### 3. Audit Existing Setup

When tracing already exists in the project, run this audit pass **before**
reaching for the best-practices table. The most common breakages in real
codebases are not "missing best practices" — they are **imported-and-forgotten,
typo'd, or silently-discarded** setup.

**1. Smoke-test imports.** For every tracing-related import (`judgeval`,
`logfire`, `langfuse`, `langsmith`, OTel auto-instrumentors, OpenLit,
OpenInference, Raindrop, etc.), verify the module path actually exists. Typos
like `raindrop.analytic` (should be `analytics`) cause silent `ImportError`s
that broad `try/except` blocks swallow.

**2. Verify activation.** Every imported `Instrumentor`, `Tracer`, integration
helper, or middleware must have a matching activation call:

- OTel auto-instrumentors → `.instrument()` or `.instrument_app(app)`
- Judgeval tracer → constructed once via `Tracer(project_name=...)`
- Vendor integrations (OpenLit, OpenInference, Langfuse client, etc.) → check
  the vendor's documented activation method (e.g. `Openlit.initialize()`,
  `OpenAIAgentsInstrumentor().instrument()`)

**Imported-but-uncalled is the single most common breakage.** If a symbol is
imported and never referenced past the import, that is almost certainly the
bug.

**3. Cross-check env var names and config keys.** Compare what the code reads
(`os.environ.get(...)`) against:

- the provider's documented env vars,
- the file's own error messages and docstrings,
- the project's `.env.example` or README.

Code/message divergence — e.g. code reads `LOGFIRE_API_TOKEN` but the error
message says `LOGFIRE_READ_TOKEN must be set` — is a strong smoking gun.

**4. Cross-check vendor-specific attribute keys.** Vendor OTel attributes
(`langfuse.session.id`, Arize attribute keys, etc.) must follow the vendor's
casing exactly. Writing to the wrong key is silently discarded — no error. If
a group of constants follows a clear pattern (all dotted notation) and one
diverges (`langfuse.sessionId`), that is the bug.

**5. Compare similar blocks within and across files.** If a file has multiple
tool functions, agent classes, or instrumented blocks, build a quick mental
table: which providers / context managers / span names does each one have? The
broken one is often the one that diverges from a pattern the others repeat.
Same for sibling files — `anthropic_agent.py` and `openai_agent.py` should
match in shape even when their LLM provider differs. Watch for:

- Dangling `var = None` initializers — signal a wrapper was removed
- Dead `.update(...)` calls on variables that never get populated
- Async/sync variants of the same helper with different push/pop bodies

**6. Audit each provider independently in multi-provider shims.** When a file
fans out to multiple tracing backends (Judgment + Langfuse + Logfire + ...),
each provider's setup is independent. A bug in one provider's init silently
disables that provider for the entire app while the others keep working — the
symptom is "traces appear in some dashboards, not others."

**Audit each provider to completion** — finding a bug in one provider does
not mean the others are clean. Multi-provider files commonly contain multiple
independent bugs. Before declaring the audit done, tick through each provider
yourself:

- [ ] Provider A: env vars, init function call, context-manager signature, async/sync parity
- [ ] Provider B: env vars, init function call, context-manager signature, async/sync parity
- [ ] Provider C: env vars, init function call, context-manager signature, async/sync parity
- [ ] ...one row per provider in the file

Each provider's audit must reach a verified conclusion ("found bug X" or
"verified clean") before you stop. Do not anchor on the first bug found.

#### Auditor's discipline

- **Don't invent improvements.** If you cannot point to a specific failing
  behavior in a block, do not change it. Stylistic preferences for `span_type`
  values, function decomposition, or attribute richness are not "fixes" — they
  are scope creep that risks regressing the project's deliberate choices.
- **High confidence requires evidence.** A smoking gun in the code (typo,
  missing call, code/message divergence), a divergence from a sibling pattern,
  or a verified trace from Judgment. Plausibility alone is not evidence.
- **The bug is usually in the boring place.** If you find yourself reaching
  for a sophisticated diagnosis in complex code while ignoring a simple-looking
  neighboring block, stop and re-read the simple block. A one-character typo
  or a missing one-line call is the most common shape of real-world tracing
  breakage.
- **Verify before you dismiss.** Discipline means not editing without evidence
  — it does **not** mean refusing to gather evidence. When you spot a
  suspicious method name, attribute access, env-var name, or import path that
  *could* be a typo, **verify it before deciding it's not a bug**:
  - WebFetch the provider's docs to confirm the canonical API
  - Or run `python -c "import X; print(hasattr(X, 'Y'))"` / `print(dir(X))` to
    introspect the installed SDK
  - For env vars, grep the rest of the repo (`.env.example`, README, helper
    files) for canonical usage

  A 10-second verification call is the difference between "left a working
  method alone" and "missed a real typo." If you find yourself writing
  "plausible but lacks a smoking gun" about a divergence you noticed — that
  is exactly the moment to go verify, not skip. Suspicious-looking method
  names and env-var names in third-party APIs are usually verifiable with a
  single `hasattr` / `dir` call or one doc lookup.

#### Before declaring confidence "high"

- Did you verify imports actually import? (no typos)
- Did you confirm the call chain — every imported helper is invoked, and every
  invoked helper is imported?
- Did you compare each block against its sibling(s)?
- Did you trace one example execution end-to-end in your head?
- Did you (or will you) verify with a real trace in Judgment or via MCP
  `search_traces`?

If you can't answer yes to at least three of these, your confidence is
"medium" or "low".

### 4. Apply Tracing Best Practices

Use these best practices to decide what to implement and which docs to fetch.

#### Baseline Best Practices

| Best practice               | When it applies                                                  | Docs                                                                                         | Why                                                                   |
| --------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Tracer init                 | Always                                                           | https://docs.judgmentlabs.ai/documentation/performance/tracing                               | Prevents missing spans, duplicate setup, and auth bugs                |
| LLMs tracked properly       | App calls LLMs                                                   | https://docs.judgmentlabs.ai/documentation/integrations/introduction#model-providers         | Makes model behavior, cost, latency, and failures debuggable          |
| Tool calls tracked properly | App has tools, retrieval, data access, or side-effectful helpers | https://docs.judgmentlabs.ai/documentation/performance/tracing                               | Shows what the agent actually did before responding                   |
| Simple span types           | Always                                                           | https://docs.judgmentlabs.ai/sdk-reference/python/trace/tracer                               | Keeps traces easy to scan and filter                                  |
| Session context             | App has conversations or multi-turn workflows                    | https://docs.judgmentlabs.ai/documentation/performance/tracing#grouping-traces-into-sessions | Groups related traces into sessions for conversation-level debugging  |
| Customer context            | App has customers, tenants, workspaces, or customer users        | https://docs.judgmentlabs.ai/sdk-reference/python/trace/tracer#set_customer_id               | Attributes traces to affected customers for customer-level debugging  |
| Setting your own attributes | Always                                                           | https://docs.judgmentlabs.ai/documentation/performance/tracing#manual-attribute-setting      | Makes traces readable in the UI                                       |
| Export lifecycle            | Scripts, CLIs, jobs, tests, and servers                          | https://docs.judgmentlabs.ai/sdk-reference/typescript/tracer                                 | Prevents missing traces in short-lived runs and broken server tracing |

Framework and provider integrations handle model name, token usage, and span
types automatically when supported. Prefer integrations over manual
instrumentation.

Customer context syntax:

- Python: `Tracer.set_customer_id(customer_id)` and
  `Tracer.set_customer_user_id(customer_user_id)`
- TypeScript: `Tracer.setCustomerId(customerId)` and
  `Tracer.setCustomerUserId(customerUserId)`

#### Advanced Best Practices

Only apply these when the project architecture calls for them:

| Best practice                       | When it applies                                                                | Docs                                                                               | Why                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Tracer across project semantics     | Tracing spans multiple files or modules                                        | https://docs.judgmentlabs.ai/sdk-reference/python/trace/tracer                     | Preserves one coherent trace across the codebase                          |
| Active tracers with project names   | Multiple Judgment projects are needed                                          | https://docs.judgmentlabs.ai/documentation/performance/tracing#project-routing     | Keeps staging, prod, or customer traces in the right place                |
| Distributed tracing                 | Requests cross stateless service, worker, queue, serverless, or RPC boundaries | https://docs.judgmentlabs.ai/documentation/performance/tracing#distributed-tracing | Keeps downstream spans connected when in-memory context cannot carry over |
| Agent subtracing with linked traces | Agents delegate to subagent                                     | https://docs.judgmentlabs.ai/documentation/performance/tracing#subagent-tracing    | Splits subagents into their own traces for independent evaluation        |

### 5. Explore Traces First

Once baseline instrumentation is working, encourage the user to explore their
traces in the Judgment UI before adding more context:

"Your traces are now appearing in Judgment. Take a look at a few of them. See
what data is being captured, what's useful, and what's missing. This will help
us decide what additional context to add."

This helps the user:

- Understand what they're already getting
- See whether the trace tree matches the real workflow
- Form opinions about what's missing
- Ask better questions about what they need

Code inspection can find likely setup, but real verification requires a fresh
trace and evidence from Judgment. Encourage the user to configure MCP or the CLI
so the agent can check traces directly, then use the UI for human review.

**Preferred: MCP verification**

- Use `list_projects` if the project ID or name is unclear.
- Use `search_traces` to find the newest trace, or search by the test input,
  session ID, customer ID, tag, route, or feature.
- Use `get_trace_detail` to check project, session, duration, cost, and basic
  trace metadata.
- Use `get_trace_spans` to inspect the root span, `llm` spans, `tool` spans,
  inputs, outputs, model metadata, token usage, errors, attributes, and nesting.
- Use `search_sessions`, `get_session_detail`, or `get_session_trace_ids` to
  verify `session_id` grouping.

**Fallback: CLI verification**

```bash
judgment traces search <PROJECT_ID> --pagination '{"limit":25,"cursorSortValue":null,"cursorItemId":null}'
judgment traces get <PROJECT_ID> <TRACE_ID>
judgment traces spans <PROJECT_ID> <TRACE_ID>
judgment sessions trace-ids <PROJECT_ID> <SESSION_ID>
```

**Also guide UI review**

Ask the user to open Monitoring > Traces or Monitoring > Sessions and inspect
the same evidence. UI review is useful even when MCP/CLI verification succeeds
because it helps the user decide what context is useful or missing.

Inspect:

- Does the root span correspond to the user-facing request or agent run?
- Do tool, retrieval, and LLM spans appear as children instead of unrelated flat
  traces?
- Are model name, token usage, latency, cost, and errors visible where expected?
- Does the trace input/output explain behavior without exposing secrets?
- If this is a conversation, does the session page group the expected turns?

### 6. Discover Additional Context Needs

Determine what additional instrumentation would be valuable. Infer from code
when possible, only ask when unclear.

**Infer from code:**

| If you see in code...                                                        | Infer                      | Suggest                                      |
| ---------------------------------------------------------------------------- | -------------------------- | -------------------------------------------- |
| Conversation history, chat endpoints, message arrays                         | Multi-turn app             | `session_id`                                 |
| User authentication, `user_id` variables                                     | User-aware app             | `user_id` or stable internal user identifier |
| Customer, org, workspace, or tenant identifiers                              | Multi-tenant app           | `customer_id`, `tenant_id`, or plan tier     |
| Multiple routes, tools, agents, or product features                          | Multi-feature app          | `feature`, `route`, or agent name attribute  |
| A/B tests, model routing, prompt variants                                    | Experimented app           | experiment, prompt, or model-family tag      |
| Feedback collection, ratings, thumbs up/down                                 | Has user feedback          | capture as scores or behavior signals        |
| Stateless HTTP handlers, workers, queues, serverless functions, or RPC calls | Distributed app            | distributed tracing with `service.name`      |
| Environment-specific projects                                                | Needs project routing      | active tracers with project names            |
| Traced functions spread across modules                                       | Cross-file instrumentation | one tracer init, observed functions          |
| Agent delegation, subagents, or subsystems                                   | Multi-agent app            | agent spans or linked subtraces              |

**Only ask when not obvious from code:**

- "What would you want to filter by in the Judgment UI?" -> Surfaces non-obvious
  tags
- "Are there different user or customer segments you'd want to compare?" ->
  Customer tiers, plans, regions, or tenants
- "Should staging and production traces live in separate Judgment projects?" ->
  Determines whether project routing is needed
- "Does one request cross a stateless HTTP, worker, queue, serverless, or RPC
  boundary?" -> Determines whether distributed tracing is needed
- "How do you know when a response is good vs bad?" -> Determines scoring or
  behavior-monitoring follow-up

**Additions and their value:**

| Addition                         | Why                                                                 | Docs                                                                                         |
| -------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `session_id`                     | Groups multi-turn conversations together                            | https://docs.judgmentlabs.ai/documentation/performance/tracing#grouping-traces-into-sessions |
| `user_id` or customer identifier | Enables user, customer, and tenant filtering                        | https://docs.judgmentlabs.ai/documentation/performance/tracing#manual-attribute-setting      |
| `feature` or route attribute     | Enables per-feature debugging and dashboards                        | https://docs.judgmentlabs.ai/documentation/performance/tracing#manual-attribute-setting      |
| Explicit input/output            | Makes traces readable and avoids dumping sensitive args             | https://docs.judgmentlabs.ai/documentation/performance/tracing#manual-attribute-setting      |
| Project routing                  | Routes staging, prod, or other environments intentionally           | https://docs.judgmentlabs.ai/documentation/performance/tracing#project-routing               |
| `service.name`                   | Separates services in OpenTelemetry and distributed flows           | https://docs.judgmentlabs.ai/documentation/performance/tracing#opentelemetry-integration     |
| Distributed trace propagation    | Connects stateless downstream service spans to the original request | https://docs.judgmentlabs.ai/documentation/performance/tracing#distributed-tracing           |
| Agent linked traces              | Links delegated agent/subsystem work back to the parent trace       | https://docs.judgmentlabs.ai/documentation/performance/tracing#subagent-tracing              |
| Behavior or score signals        | Enables quality filtering and production monitoring                 | https://docs.judgmentlabs.ai/documentation/performance/agent-behavior-monitoring             |

These are NOT baseline best practices. Only add what's relevant based on
inference or user input.

Implementation guidance:

- For `session_id`, set it on the root span of each trace in a conversation.
- For cross-file tracing, initialize `Tracer` once in startup/bootstrap code and
  observe functions where the real work lives.
- For project routing, switch the active project before a root span starts. Do
  not switch projects mid-trace.
- For distributed tracing, first confirm the trace crosses a process or service
  boundary where normal in-memory context will not propagate. Common cases are
  stateless HTTP services, serverless handlers, background workers, queue
  consumers, RPC calls, and separate containers. Use normal nested spans for
  functions/modules that run in the same process.
- When distributed tracing is needed, use SDK propagation helpers. Do not
  hand-roll trace headers unless the docs require it. **OTel auto-instrumentors
  must be `.instrument()`-ed once at startup — importing them is not enough.**
  Common library → instrumentor mappings (Python):

  | Library/framework | Activation                                  |
  | ----------------- | ------------------------------------------- |
  | `requests`        | `RequestsInstrumentor().instrument()`       |
  | `httpx`           | `HTTPXClientInstrumentor().instrument()`    |
  | `aiohttp`         | `AioHttpClientInstrumentor().instrument()`  |
  | `urllib3`         | `URLLib3Instrumentor().instrument()`        |
  | FastAPI           | `FastAPIInstrumentor.instrument_app(app)`   |
  | Flask             | `FlaskInstrumentor().instrument_app(app)`   |
  | Django            | `DjangoInstrumentor().instrument()`         |

  Server-side: if a framework instrumentor (e.g. `FastAPIInstrumentor`) is
  installed, header extraction is automatic. Otherwise, pass the actual
  incoming-headers mapping — `propagate.extract(request.headers)`, **not**
  `extract({})` — when extracting context in middleware.
- For agent subtracing, check current SDK support for `span_type="agent"`,
  `fork=True`, or linked trace helpers before implementation.
- Use stable internal IDs instead of raw emails or names.

### 7. Guide to UI

After adding context, point users to relevant UI features:

- Traces view: See individual requests, span hierarchy, latency, cost, inputs,
  outputs, and errors
- Sessions view: See grouped conversations if `session_id` is added
- Behaviors: Filter traces or sessions by monitored behavior
- Automations and alerts: Route failures, behaviors, or thresholds into
  follow-up workflows
- Judgment Agent search: Ask the in-product agent to search traces, cite spans,
  and investigate failures

Suggested Judgment Agent questions:

- "Why did this trace fail?"
- "Find recent failed traces for this feature and summarize the shared root
  cause."
- "Which tool call is slow?"
- "Find similar traces."
- "What changed across this session?"

## Framework Integrations

Prefer these over manual instrumentation:

| Framework or provider | Integration style                              | Docs                                                                                      |
| --------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| LangGraph             | Framework integration                          | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/langgraph        |
| OpenAI Agents SDK     | OpenInference-based framework integration      | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/openai-agents    |
| Claude Agent SDK      | Agent SDK integration                          | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/claude-agent-sdk |
| Google ADK            | OpenTelemetry framework integration            | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/google-adk       |
| Vercel AI SDK         | OpenTelemetry exporter/telemetry               | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/vercel-ai-sdk    |
| LiveKit               | Agent framework integration                    | https://docs.judgmentlabs.ai/documentation/integrations/agent-frameworks/livekit          |
| OpenAI                | Provider wrap or OpenTelemetry instrumentation | https://docs.judgmentlabs.ai/documentation/integrations/model-providers/openai            |
| Anthropic             | Provider wrap or OpenTelemetry instrumentation | https://docs.judgmentlabs.ai/documentation/integrations/model-providers/anthropic         |
| OpenRouter            | OpenAI-compatible provider tracing             | https://docs.judgmentlabs.ai/documentation/integrations/model-providers/openrouter        |
| OpenLit               | Existing tracing provider integration          | https://docs.judgmentlabs.ai/documentation/integrations/tracing-providers/openlit         |
| OpenInference         | Existing tracing provider integration          | https://docs.judgmentlabs.ai/documentation/integrations/tracing-providers/openinference   |
| OpenLLMetry           | Existing tracing provider integration          | https://docs.judgmentlabs.ai/documentation/integrations/tracing-providers/openllmetry     |

Full list: https://docs.judgmentlabs.ai/documentation/integrations/introduction

### Activation snippets

Constructing an integration object is not the same as activating it. Use these
canonical activation calls (verify against the linked docs for the version
you're on):

| Integration                | Canonical activation                                                       |
| -------------------------- | -------------------------------------------------------------------------- |
| OpenAI (provider wrap)     | `client = wrap(OpenAI())`                                                  |
| Anthropic (provider wrap)  | `client = wrap(Anthropic())`                                               |
| OpenInference instrumentor | `OpenAIAgentsInstrumentor().instrument()` (or `CrewAIInstrumentor()...`)   |
| OpenLit (Judgment bridge)  | `Openlit.initialize()` after `Tracer(...)`                                 |
| OpenLLMetry                | Check the provider's docs — initialization style varies                    |
| Vercel AI SDK              | Configure the OTel exporter with `service.name`; no `.instrument()` call   |
| LangGraph / Claude Agent SDK / Google ADK | Framework-specific — check the linked docs                  |

If a project has the integration **imported but never invokes the activation
call**, that is the bug. The constructor or import alone is a no-op.

## Always Explain Why

When suggesting additions, explain the user benefit:

```text
"I recommend adding session_id to your traces.

Why: This groups messages from the same conversation together.
You'll be able to see full conversation flows in the Sessions view,
making it much easier to debug multi-turn behavior.

Learn more:
https://docs.judgmentlabs.ai/documentation/performance/tracing#grouping-traces-into-sessions"
```

```text
"I recommend using distributed tracing for this request path.

Why: The request crosses the API service and worker, so without propagation
Judgment will show two unrelated traces. Propagating trace context keeps the
full request flow in one trace tree.

Learn more:
https://docs.judgmentlabs.ai/documentation/performance/tracing#distributed-tracing"
```

## Common Mistakes

| Mistake                                        | Problem                                          | Fix                                                                   |
| ---------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| No flush/shutdown in short-lived scripts       | Traces may never be sent                         | Call the documented flush/shutdown method before exit                 |
| Shutting down inside a server handler          | Later requests may stop tracing                  | Shutdown only on process teardown                                     |
| Flat traces                                    | Can't see which step failed                      | Use one root span with nested spans for tools, retrieval, and LLMs    |
| Generic span/trace/project names               | Hard to filter; trace UI shows opaque rows; multiple traces collapse into one bucket | **Treat as a fix-worthy bug, not polish.** Anti-examples: `generation`, `tool`, `run`, `step`, `chain`, `default`. Good patterns: `{agent_name}/{operation}`, `{feature}-{action}`, `tool/{function_name}`. If sibling functions/files use descriptive names and one is generic, the generic one is the bug. Same rule applies to `project_name`, `session_id`, customer identifiers, and any other field used for downstream filtering. **Also a hard authoring rule:** when you add or restore a span/wrapper, never name it `generation`, `tool`, `run`, etc. Use the descriptive pattern from the moment you write it — e.g. `f"{self.name}/messages-create"`, `tool/web_search`. Generic names are bugs whether they were there before you arrived or you just introduced them. |
| Logging sensitive data                         | Data leakage risk                                | Mask or omit PII, secrets, auth headers, and unnecessary raw payloads |
| Not explicitly setting input/output            | Trace input may be noisy or sensitive            | Set only relevant input/output for the root span                      |
| Manual instrumentation when integration exists | More code, less context                          | Use the matching framework or provider integration                    |
| Double-instrumenting the same model call       | Duplicate spans and confusing costs              | Use one instrumentation path per model call                           |
| Setting `gen_ai.*` / `judgment.usage.*` manually when `wrap()` is in use | Double-writing causes conflicting values         | Let `wrap()` populate; only use `recordLLMMetadata` for un-wrapped calls |
| Initializing tracing in every module/request   | Duplicate setup and export issues                | Initialize once in startup/bootstrap code                             |
| Missing `session_id` for chat apps             | Conversations do not group in Sessions           | Set `session_id` on each root trace in the conversation               |
| Stamping `judgment.session_id` / `judgment.customer_id` via `set_attribute(s)` | Descendant spans don't inherit the value — sessions/customer filtering breaks | Use `set_session_id` / `set_customer_id` helpers, which write to baggage |
| Switching projects mid-trace                   | Spans may route incorrectly or fail to switch    | Route before the root span starts                                     |
| Missing distributed propagation                | Downstream service appears as an unrelated trace | Inject and continue trace context across service boundaries           |
| Guessing SDK APIs from memory                  | Outdated code or mixed SDK generations           | Fetch docs and match the installed SDK version                        |
| Imported but uncalled instrumentor/integration | Setup looks present; no spans emit               | Activate per the provider's documented call (`.instrument()`, `.instrument_app(app)`, `.initialize()`, etc.). The single most common breakage. |
| Wrong env var name (esp. third-party providers)| Init branch never taken; silent fallback to disabled | Cross-check against provider docs **and** the file's own error messages, docstrings, `.env.example` |
| Wrong vendor-specific attribute key            | Vendor silently ignores; sessions/traces don't group as intended | Look up the exact key (`langfuse.session.id`, not `langfuse.sessionId`); compare against sibling constants in the same file |
| Provider parity broken in fan-out              | One block fans out to N providers, another to N-1; some dashboards show partial traces | In multi-provider files, every traced block should wrap with the same set of providers; restore the missing wrapper |
| Dangling `var = None` or dead `.update(...)`   | A wrapper was removed but its variable references remained | Treat as a "wrapper deletion" smell; restore the wrapper to match siblings |
| Async/sync helper drift                        | Sync helper pushes a context stack, async sibling doesn't (or vice versa) — async traces become flat | Diff the two; sync and async variants should have identical push/pop bodies |
| `extract()` / propagation with empty carrier   | Code looks instrumented; carrier is empty; silent disconnect from upstream trace | Pass the actual incoming-headers mapping (`request.headers`), **not** `{}`, to the propagator |
| Code/error-message divergence                  | `os.environ.get("X")` while error says `"Y must be set"`; docstring claims one thing, code does another | Whichever string is documented elsewhere (`.env.example`, README, provider docs) wins. Fix the code to match. |
