# Judgment Ingest Optimization

Audit a customer's existing third-party tracing instrumentation (Braintrust,
Langfuse, LangSmith, Logfire) and make minimal additive changes so that when
Judgment's ingest pipeline backfills those traces, the resulting traces on the
Judgment platform are **eval-ready** — categorized by span kind, grouped by
session and customer, with token/cost data populated.

**Scope.** This skill audits third-party tracing instrumentation (Braintrust,
Langfuse, LangSmith, Logfire, raw OpenTelemetry, OpenInference) that Judgment
ingests via the data pipeline. The customer keeps their existing provider —
this skill does NOT migrate them to `judgeval`.

The presence of `judgeval` imports does NOT exempt other tracing
instrumentation from audit. Decide **per file**:

- **judgeval as native tracer** (`@judgment.observe`, `judgeval.tracer.Tracer(...)`, `wrap(client)`, JVM `JudgmentTracer.createDefault(...)`) → out of scope under this skill (the parent SKILL.md routes native-judgeval work to its own reference).
- **judgeval as OTLP relay** for OpenInference / OpenLIT / raw-OTel auto-instrumentors (anything imported from `judgeval.integrations.*`) → **in scope**. Treat as raw-OTel and apply the Logfire playbook, even if `judgeval` is imported elsewhere in the same file.
- **Mixed file** (native judgeval AND third-party SDK / OpenInference instrumentor in the same module) → audit the third-party half in place; flag any judgeval-side structural bugs under the "Customer follow-up required" callout in the audit report so the customer can escalate them.

**Out of scope.** Per-vendor analytics SDKs that don't feed the Judgment
ingest pipeline (Raindrop, Helicone direct, Portkey logger, and similar). If
you encounter one, leave it alone — fixing those is a customer-internal
concern, not an ingest-fidelity concern.

## When to Use

- Customer already emits traces to Braintrust, Langfuse, LangSmith, Logfire,
  or any OTel / OpenInference auto-instrumentor (including via a
  `judgeval.integrations.*` relay).
- Their Judgment workspace receives those traces via the ingest pipeline, but
  spans render flat, miss session/customer context, miss cost/token data, or
  are uncategorized (no `span_kind`).
- Goal: lift fidelity tier from "trace search works" to "evals, sessions, and
  cost rollups work" with the smallest possible diff.

If a file's spans are emitted exclusively by native `judgeval` instrumentation
(no OpenInference, no OpenLIT, no raw OTel auto-instrumentors, no third-party
tracing SDK), that file is out of scope under this skill. Note it in the
audit summary and continue auditing the rest of the repo — the parent
SKILL.md routes native-judgeval work to its own reference.

## What the Platform Reads

Judgment ingest produces OTLP spans keyed by this attribute vocabulary. Each
attribute unlocks specific platform features.

| Attribute | Unlocks |
| --- | --- |
| `judgment.span_kind` (`"llm"` / `"tool"` / `"embedding"` / `"span"`) | LLM-vs-tool analytics, span-kind filtering, cost rollups |
| `judgment.session_id` | Session view (multi-turn conversation grouping) |
| `judgment.customer_id` | Per-end-user analytics and rollups |
| `judgment.input` / `judgment.output` | Searchable I/O in the trace browser |
| `judgment.llm.model` | Model breakdowns |
| `judgment.llm.provider` | Provider breakdowns |
| `judgment.usage.non_cached_input_tokens` / `judgment.usage.output_tokens` | Token analytics |
| `judgment.usage.total_cost_usd` | Cost analytics |

Priority order when fixing customer code: `span_kind` → `session_id` →
`customer_id` → `llm.model` + `usage.*` → `provider`.

## Workflow

### 1. Identify the Source Provider

Run **both** the source-of-spans detection AND the judgeval scope-decision
grep on every file in scope. Per-file decisions matter — one repo can have
native judgeval files alongside relay or third-party-only files.

**(a) Source-of-spans detection** — what's emitting spans?

```bash
rg -n "from langfuse|@observe|langfuse\.|update_current_trace" .
rg -n "from langsmith|@traceable|langsmith\." .
rg -n "import braintrust|braintrust\.traced|braintrust\.init_logger" .
rg -n "import logfire|logfire\.configure|logfire\.span" .
rg -n "opentelemetry\.instrumentation|OpenInference|openinference" .
rg -n "from judgeval\.integrations" .
```

Also check `pyproject.toml`, `requirements.txt`, `package.json`, `pom.xml`,
and `build.gradle` for `langfuse`, `langsmith`, `braintrust-sdk`, `logfire`,
`opentelemetry-instrumentation-*`, and `openinference-instrumentation-*`.

**(b) judgeval scope-decision grep** — native vs. relay vs. mixed:

```bash
rg -n "@judgment\.observe|judgeval\.tracer\.Tracer|JudgmentTracer\.createDefault|wrap\(\s*(OpenAI|Anthropic|Together|genai)" .
rg -n "from judgeval\.integrations" .
```

For every hit, classify the **file**:

- Only **native** hits (first grep) → file is out of scope for this skill.
  Flag any judgeval-API-surface bugs noticed in passing (missing
  `set_customer_id` plumbing, wrong integration choice, missing `Tracer`
  init / flush / shutdown, non-canonical `span_type` values, `set_input`
  / `set_output` placement, decorator ordering, async-decorator
  compatibility, etc.) under the "Customer follow-up required" callout
  in the audit report. The customer escalates them to the Judgment team
  — the parent SKILL.md router will point them at the right reference.
- Only **relay** hits (second grep, `judgeval.integrations.*`) → file is in
  scope. Audit it using the Logfire playbook (the relay forwards OTel /
  OpenInference spans through the Judgment OTLP endpoint).
- **Both** native and relay/third-party hits in the same file → audit only
  the third-party / relay portion in place; for native-judgeval bugs in
  the same file, flag them under "Customer follow-up required" in the
  audit report.

**Propagation primitives are always in scope** — they override the
classification above. If a file contains any of these, audit it under this
skill regardless of whether the file itself emits spans:

- `extract(...)` / `inject(...)` / `TraceContextTextMapPropagator` / `set_global_textmap`
- `*Instrumentor().instrument()` / `*Instrumentor.instrument_app(...)` / `*Instrumentor.uninstrument()`
- Framework propagation middleware (FastAPI/Flask/Django/Express OTel
  middleware, gRPC interceptors)

Propagation code moves trace context across process boundaries; broken
propagation fragments traces in Judgment even when every span is emitted
correctly. A file that's "native judgeval" by source-of-spans but contains a
missing `extract(dict(request.headers))` is in scope for the propagation
fix — diagnose and fix per the Logfire playbook's
[Cross-service trace continuity](#logfire) subsection. Native-judgeval bugs
in the same file get flagged under "Customer follow-up required" in the
audit report (out of scope under this skill).

**Fallback.** If §(a)'s SDK greps return nothing but its OTel/OpenInference
grep hits, treat as raw-OTel and apply the Logfire playbook.

### 2. Confirm Audit Scope and Plan

Before changing any tracing code, gather the project's instrumentation shape
and confirm a plan with the user. Do not skip this gate — even when the user
is terse.

#### Ask what code inspection can't tell you

If any of these are not obvious from Step 1, ask. If they are obvious, state
your inference back to the user for confirmation in one line.

- **Session boundary**: how does the customer define a "session" / conversation
  (per HTTP request, per chat thread, per user-day)? Where in the code is that
  ID established?
- **Customer identity**: what's the end-user, tenant, or workspace identifier
  the customer wants attributed to traces? Where in the code is it available?
- **Pre-existing Judgment-aware fields**: has anyone already added
  `metadata.judgment_span_kind`, `judgment.span_kind`, or other Judgment-
  specific keys? Preserve them.
- **Acceptable gaps**: confirm the customer accepts the ingest-pipeline gaps
  for their provider (see [What Ingest Does NOT Carry](#what-ingest-does-not-carry)
  below). If they need a missing attribute, flag that the only fix paths are a
  transformer change in `judgment-data-pipelines` or migration to native
  judgeval (out of scope under this skill — escalate via the audit report's
  "Customer follow-up required" callout) — do not invent workarounds.

#### Show the plan and the expected trace tree, then wait

Reply with both artifacts below before any file edits.

**(1) Plan block, exact structure:**

```
Plan:
- Provider:        <braintrust | langfuse | langsmith | logfire | raw-otel>
- Files to change: <file:line list of LLM-call sites, tool-call sites, and trace roots>
- Span kinds:      <which spans get which kind, via which native field>
- Identity:        <native field for session_id ; native field for customer_id, or "not supported by this provider's transformer">
- LLM metadata:    <where model, token usage, and cost come from on LLM spans>
- Known gaps:      <attributes ingest will not carry for this provider, even after the audit>
```

**(2) Three trace tree views, all drawn from the customer's actual code.**

Pick the most representative code path you found in Step 1 — usually the top-
level request handler, chat handler, or agent loop. Render **three** ASCII
trees rooted at the same function:

- **Tree A — Current (in `<provider>`).** What the customer's provider emits
  today. Use the provider's native field vocabulary (LangSmith: `run_type`,
  `inputs`, `outputs`, `metadata.*`, `prompt_tokens`; Langfuse: `type`,
  `input`, `output`, `metadata.*`, `usage_details`, `calculatedTotalCost`;
  Braintrust: `span_attributes.type`, `input`, `output`, `metadata.*`,
  `metrics.*`; Logfire: span name + `gen_ai.*` / `tool.name` /
  `session.id` / `user.id` attributes). Mark broken or missing fields with `❌`
  and untraced call sites with `❌ <call> at <file:line> — no span emitted`.
- **Tree B — Proposed (in `<provider>`).** What the customer's provider will
  emit after the audit. Same native vocabulary as Tree A. Mark deltas:
  - `[NEW span]` — a span that didn't exist in Tree A, with `file:line` of the
    new decorator / instrumentation site.
  - `[CHANGED: was <previous value>]` — a field that existed but had the wrong
    value (e.g., `run_type` retyped from `llm` to `agent`).
  - `[ADD: <native field>, <file:line>]` — a new field on an existing span.
- **Tree C — Translated (in Judgment).** What the ingest transformer produces
  from Tree B. Use Judgment attribute names (`judgment.*`). Annotate each
  attribute with its source under that provider's transformer:
  - `[from <native field>]` — attribute populated by the customer's code via
    the ingest pipeline.
  - `[from <native field>, override]` — populated via the Langfuse/Logfire
    universal `judgment.span_kind` override (only those two providers).
  - `[gap: <reason>]` — attribute NOT populated; ingest does not carry it for
    this provider (Braintrust `customer_id`, Braintrust/Logfire cost,
    Anthropic cache-token splits, etc.).
  - `[TBD: <what info you still need>]` — must be resolved before approval.

The three trees let the user verify in sequence: (1) you correctly understood
their broken state, (2) the proposed changes make sense in the tool they
already use, (3) the resulting Judgment trace is actually eval-ready.

Rules common to all three:

- Real function names and `file:line` citations from the customer's repo —
  no placeholder names like `chat_handler` unless the function is literally
  named that.
- Do not fabricate `trace_id` / `span_id` values — use `<trace_id>` /
  `<span_id>` placeholders if you need to reference them.
- Empty is better than wrong. Do not invent attributes that don't have a
  source in the customer's code.
- If the codebase has more than one distinct trace shape (e.g., chat handler
  AND embedding job), render one set of three trees per shape, max two
  shapes — list the others by name only.

Format example (Braintrust audit on a chat handler; adapt per provider):

**Tree A — Current (Braintrust):**

```
chat_handler                                   span_attributes.type=—       ❌ not set
│   input                       = {user_id, message}                        [chat.py:11]
│   output                      = reply text                                [chat.py:14]
│   metadata                    = {}                                        ❌ no session, provider, or model
│   metrics                     = {}                                        ❌ no tokens, no cost
│
└── (no child spans — LLM call inline, tool calls live in model output text)
    ❌ openai.chat.completions.create at chat.py:30 — no span emitted
    ❌ search_documents          at chat.py:40 — no span emitted
```

**Tree B — Proposed (Braintrust):**

```
chat_handler                                   span_attributes.type=function   [CHANGED: was —]
│   metadata.chat_conversation_id = conv_id    [ADD: metadata.chat_conversation_id, chat.py:12 (threaded from server.py:42)]
│
└── call_openai                                span_attributes.type=llm        [NEW span: split from chat_handler, chat.py:25]
        input                   = messages history                              [ADD: input, chat.py:30]
        output                  = response.choices[0].message.content           [ADD: output, chat.py:31]
        metadata.provider       = "openai"                                      [ADD: metadata.provider, chat.py:33]
        metadata.model          = "gpt-4o-mini"                                 [ADD: metadata.model, chat.py:34]
        metrics.prompt_tokens   = response.usage.prompt_tokens                  [ADD: metrics.prompt_tokens, chat.py:37]
        metrics.completion_tokens = response.usage.completion_tokens            [ADD: metrics.completion_tokens, chat.py:38]
        metrics.start, metrics.end                                              [ADD]
```

**Tree C — Translated (Judgment):**

```
chat_handler                                   judgment.span_kind=function   [from span_attributes.type]
│   judgment.input              = {user_id, message}                          [from input]
│   judgment.output             = reply text                                  [from output]
│   judgment.session_id         = conv_id                                     [from metadata.chat_conversation_id]
│   judgment.customer_id        = —                                           [gap: braintrust transformer does not carry customer_id]
│
└── call_openai                                judgment.span_kind=llm        [from span_attributes.type]
        judgment.input          = messages history                            [from input]
        judgment.output         = response content                            [from output]
        judgment.llm.provider   = "openai"                                    [from metadata.provider]
        judgment.llm.model      = "gpt-4o-mini"                               [from metadata.model]
        judgment.usage.non_cached_input_tokens                                [from metrics.prompt_tokens]
        judgment.usage.output_tokens                                          [from metrics.completion_tokens]
        judgment.usage.total_cost_usd                                         [gap: braintrust transformer does not write cost]
```

Then ask: **"Approve this plan and the three trace trees, or tell me what to
change?"** and wait.

#### Non-interactive mode

When you have no channel to ask (batched audit, agentic loop, no human
in the chat), you cannot pause. Do this instead:

- Produce the plan and the three trace trees in your written report
  exactly as you would if a human were going to review them.
- For each item you would have asked about, write your best inference
  inline AND act on it. Empty fields ("session boundary: per HTTP
  request") are better than a "please confirm" list no one reads.
- If a config string, attribute key, or value differs from sibling
  files in the same repo WITHOUT a comment or docstring justifying the
  difference, treat it as a regression candidate and fix it. Do not
  defer to "ambiguities" — that's where real bugs go to die.
- Empty (no value plumbed through the code) is still better than
  invented. If `user_id` doesn't exist anywhere in scope, leave
  `judgment.customer_id` as a documented gap. Don't fabricate values
  to fill the field.

This subsection is a **fallback**, not a license to skip the plan
gate when a human is available. If interactive, still ask.

---

#### Audit Guardrails

These are ingest-pipeline behaviors the agent must respect when editing
customer code. They're not workflow choices — they're correctness rules.

- **One native field per attribute, exact name.** Each transformer reads one
  specific key. `session_id` ≠ `chat_conversation_id` ≠ `session.id`. Setting
  a near-miss key silently drops the value at ingest. Use the exact key listed
  in the provider playbook below.
- **Do not write attributes the transformer doesn't read.** Setting
  `judgment.usage.cache_creation_input_tokens`, `judgment.usage.metadata`,
  `judgment.link.*`, or `judgment.pending_trace_eval` in any source provider
  is wasted work — no transformer carries them through.
- **Span-kind override is provider-specific.** Langfuse honors
  `metadata.attributes["judgment.span_kind"]` and Logfire honors the bare span
  attribute `judgment.span_kind`. Braintrust and LangSmith do not — set their
  native typing field (`span_attributes.type`, `run_type`) directly.
- **Type LLM spans correctly or lose cost data.** Each transformer gates
  cost/token emission on the span being typed as an LLM span (Langfuse:
  `type=="GENERATION"`; LangSmith: `run_type=="llm"`; Braintrust:
  `span_attributes.type=="llm"`; Logfire: `gen_ai.system` present). A typo
  here costs the customer their cost analytics.
- **Set identity at the trace root, not on every span.** Each provider has
  trace-level metadata (`update_current_trace` in Langfuse, top-level
  `metadata` in LangSmith, root-span `metadata` in Braintrust, root-span
  attributes in Logfire). The transformer reads from the root.
- **Do not touch span hierarchy.** Splitting an LLM call out of an
  orchestration function is fine and often needed (so the LLM call can be
  typed). Restructuring parent/child relationships in code that already works
  is not — it can break the customer's existing monitoring on the source
  provider.
- **Verify the instrumentor is activated, not just imported.** A common
  failure mode is importing an instrumentor without ever calling its
  bootstrap method, so no spans exist at all. After detecting an instrumentor
  in Step 1, confirm a paired activation call exists at module load time.
  Common missing-activation symptoms:
  - `FastAPIInstrumentor.instrument_app(app)` absent → inbound HTTP requests
    don't start root server spans tied to incoming W3C tracecontext.
  - `RequestsInstrumentor().instrument()` / `HTTPXInstrumentor().instrument()`
    absent → outbound HTTP calls don't propagate tracecontext (children
    appear as roots after orphan-reparenting).
  - `<Framework>Instrumentor().instrument()` (CrewAI, OpenAIAgents,
    LangChain, etc.) absent → framework-internal spans never emitted.
  - `Openlit.initialize()` / `<Relay>.initialize()` on the
    `judgeval.integrations.*` shim absent → no relayed spans reach Judgment.
  Grep pattern: for every `Instrumentor(` / `Openlit(` import, search the
  same module — or a known bootstrap module like `main.py` / `app.py` —
  for the paired `.instrument(` / `.instrument_app(` / `.initialize(`
  call. No paired call → bug. (JVM bootstrap is out of scope — see "Java /
  JVM — Out of Scope" below.)
- **Verify init succeeded, not just attempted.** Bootstrap calls
  wrapped in broad exception handlers can silently swallow
  misspellings — the call site looks right but the SDK is never
  initialized. Common silent-init-failure shapes:
  - **Misspelled env var gates init.** `os.environ.get("LANGFUSE_PRIVATE_KEY")`
    when the SDK reads `LANGFUSE_SECRET_KEY`; `os.environ.get("LOGFIRE_API_KEY")`
    when it's `LOGFIRE_TOKEN`. The init branch is never taken; provider
    silently disabled. Check the env-var name in the code against the
    SDK's documented name.
  - **Misspelled SDK method swallowed by `try/except`.** `logfire.config(...)`
    instead of `logfire.configure(...)`; `Sentry.start()` instead of `init()`.
    The AttributeError is caught by a broad `except Exception: pass` and
    the call site appears successful. Read inside the `try:` block and
    verify the method name against the SDK's actual API, not its
    intuitive-sounding name.
  - **Constructed but not initialized.** `OpenAIAgentsInstrumentor()`
    or `Openlit()` constructed at module load but `.instrument()` /
    `.initialize()` never called. (This is the existing guardrail
    above; calling it out here for completeness.)
  Grep pattern: for every `*Instrumentor`, `Openlit`, `Sentry`, or
  `logfire.configure` call you find, also grep for the env var name
  and SDK method name in the SDK's own README or docstring before
  trusting that init succeeded.
- **Sibling-pattern check.** When a function, decorator, or instrumentation
  block should be uniform across multiple call sites — multiple tool
  functions, multiple LLM call sites, multiple HTTP handlers, multiple
  agent steps — diff each candidate against its siblings. A single sibling
  missing its decorator, span wrapper, or type field is one of the highest-
  yield bug shapes and is invisible to attribute-only audits. Always compare
  before assuming a function is "correctly" instrumented.

---

### 3. Apply the Provider Playbook

Each playbook below lists the exact native field that ingest reads for each
Judgment attribute. Only change code at LLM-call sites, tool-call sites, and
the request/agent root. Do not touch span hierarchy.

### 4. Verify

After changes ship and have run for one ingest cycle (15–30 min):

- Open one recently-ingested trace in the Judgment UI.
- Confirm `judgment.span_kind`, `judgment.session_id`, `judgment.customer_id`
  are present on the expected spans.
- Confirm an LLM span shows `judgment.llm.model` and `judgment.usage.*`.

Before that latency window, verify by inspecting the trace in the source
provider's own UI/API — every field below maps to a visible field in the
provider's native trace view.

## Provider Playbooks

### Braintrust

Ingest source: `dags/braintrust_ingest/lib/transform.py`.

| Judgment attribute | Set this in Braintrust |
| --- | --- |
| `judgment.span_kind` | `span_attributes.type` (verbatim — set `"llm"`, `"tool"`, `"embedding"`) |
| `judgment.session_id` | `metadata.chat_conversation_id` (**not** `session_id`) |
| `judgment.customer_id` | **Not supported by ingest.** |
| `judgment.input` / `judgment.output` | top-level `input` / `output` |
| `judgment.llm.provider` | `metadata.provider` |
| `judgment.llm.model` | `metadata.model` |
| `judgment.usage.non_cached_input_tokens` | `metrics.prompt_tokens` |
| `judgment.usage.output_tokens` | `metrics.completion_tokens` |
| `judgment.usage.total_cost_usd` | **Not written by ingest.** |
| span_kind universal override | **Not honored by Braintrust ingest.** |

```python
import braintrust, time

@braintrust.traced(type="llm")
def call_llm(messages, model):
    span = braintrust.current_span()
    response = client.chat.completions.create(model=model, messages=messages)
    span.log(
        input=messages,
        output=response.choices[0].message.content,
        metadata={
            "chat_conversation_id": session_id,
            "provider": "openai",
            "model": model,
        },
        metrics={
            "prompt_tokens": response.usage.prompt_tokens,
            "completion_tokens": response.usage.completion_tokens,
            "start": t0, "end": time.time(),
        },
    )
    return response

@braintrust.traced(type="tool")
def search_documents(query): ...
```

Notes:

- `span_attributes.type` must be a non-empty string. If absent, the ingested
  span has no `judgment.span_kind` and is excluded from LLM analytics.
- Per-project filters live in `dags/braintrust_ingest/tasks/fetch_braintrust.py`.
  If a customer's project has a special filter, only matching spans ingest —
  ask before changing instrumentation broadly.

### Langfuse

Ingest source: `dags/langfuse_ingest/lib/transform.py`.

| Judgment attribute | Set this in Langfuse |
| --- | --- |
| `judgment.span_kind="llm"` | observation `type == "GENERATION"` (use `@observe(as_type="generation")`) |
| `judgment.span_kind="tool"` | observation `name` starts with `"tool/"` **or** `metadata.span_type == "tool"` |
| `judgment.span_kind="embedding"` | `"embed"` substring in observation `name` (case-insensitive) |
| `judgment.span_kind` universal override | `metadata.attributes["judgment.span_kind"] = "<kind>"` |
| `judgment.session_id` | `trace.sessionId` (fallback `trace.metadata.session_id`) |
| `judgment.customer_id` | `trace.userId` |
| `judgment.input` / `judgment.output` | observation `input` / `output` |
| `judgment.llm.provider` | `observation.metadata.provider` (LLM observations only) |
| `judgment.llm.model` | observation `model` (LLM observations only) |
| `judgment.usage.non_cached_input_tokens` | `usageDetails.input_tokens` (first non-zero of: `usageDetails.input_tokens`, `usage.input`, `usage.promptTokens`) |
| `judgment.usage.output_tokens` | `usageDetails.output_tokens` (first non-zero of: `usageDetails.output_tokens`, `usage.output`, `usage.completionTokens`) |
| `judgment.usage.total_cost_usd` | `calculatedTotalCost` (LLM observations only, must be > 0) |

```python
from langfuse import observe, get_client

langfuse = get_client()

@observe(as_type="generation")
def call_llm(messages, model):
    langfuse.update_current_trace(
        session_id=session_id,
        user_id=user_id,
    )
    response = client.chat.completions.create(model=model, messages=messages)
    langfuse.update_current_observation(
        input=messages,
        output=response.choices[0].message.content,
        model=model,
        metadata={"provider": "openai"},
        usage_details={
            "input_tokens":  response.usage.prompt_tokens,
            "output_tokens": response.usage.completion_tokens,
        },
    )
    return response

@observe(name="tool/search_documents")
def search_documents(query): ...
```

Notes:

- The tool name heuristic is strict — `tool_call`, `tools.foo`, `foo_tool` do
  **not** match. Prefer the `tool/` prefix or set `metadata.span_type`.
- `costDetails` is ignored. Only `calculatedTotalCost` drives cost.
- Cost and `judgment.llm.*` only emit on `GENERATION` observations. Non-LLM
  observations lose these even if Langfuse has them.

### LangSmith

Ingest source: `dags/langsmith_ingest/lib/transform.py`.

| Judgment attribute | Set this in LangSmith |
| --- | --- |
| `judgment.span_kind` | `run_type` (verbatim, lowercased — `"llm"`, `"tool"`, `"chain"`, `"retriever"`, `"embedding"`, `"prompt"`, `"parser"`) |
| `judgment.session_id` | `metadata["session_id"]` (the SDK's `run.session_id` is LangSmith's project UUID, **not** a conversation ID — do not use it) |
| `judgment.customer_id` | **Not supported by ingest.** |
| `judgment.input` / `judgment.output` | run `inputs` / `outputs` |
| `judgment.llm.provider` | `metadata["ls_provider"]` |
| `judgment.llm.model` | `metadata["ls_model_name"]` |
| `judgment.usage.non_cached_input_tokens` | `run.prompt_tokens` |
| `judgment.usage.output_tokens` | `run.completion_tokens` |
| `judgment.usage.total_cost_usd` | `run.total_cost` (only emitted when `run_type == "llm"`) |
| span_kind universal override | **Not honored by LangSmith ingest.** |

```python
from langsmith import traceable

@traceable(
    run_type="llm",
    name="chat_completion",
    metadata={
        "session_id": session_id,
        "ls_provider": "openai",
        "ls_model_name": "gpt-4.1",
    },
)
def call_llm(messages): ...

@traceable(run_type="tool", name="search_documents")
def search_documents(query): ...
```

Notes:

- Cost is suppressed on non-LLM `run_type` to avoid double-counting parent
  rollups. Tag the actual LLM-emitting span with `run_type="llm"` or the cost
  will not appear in Judgment.
- LangChain/LangGraph emit `ls_provider` and `ls_model_name` automatically when
  the LangChain callback handler is active. Manual `traceable` decorators must
  set them explicitly.

### Logfire

Ingest source: `dags/logfire_ingest/lib/transform.py`. Also applies to raw
OpenTelemetry / OpenInference setups using GenAI semconv.

| Judgment attribute | Set this in Logfire / OTel |
| --- | --- |
| `judgment.span_kind="llm"` | attribute `gen_ai.system` (any truthy string) **or** `otel_scope_name` matching `^logfire\.(openai|anthropic|cohere|mistral|google|gemini|vertex|bedrock|litellm|llamaindex|langchain|huggingface)` |
| `judgment.span_kind="tool"` | attribute `tool.name` (any truthy string) |
| `judgment.span_kind` universal override | attribute `judgment.span_kind = "<kind>"` |
| `judgment.session_id` | attribute `session.id` (fallback `chat_conversation_id`) |
| `judgment.customer_id` | attribute `user.id` |
| `judgment.input` / `judgment.output` | attributes `gen_ai.prompt` / `gen_ai.completion` |
| `judgment.llm.provider` | attribute `gen_ai.system` (same value drives `span_kind="llm"`) |
| `judgment.llm.model` | first of `gen_ai.request.model`, `gen_ai.response.model` |
| `judgment.usage.non_cached_input_tokens` | first of `gen_ai.usage.input_tokens`, `gen_ai.usage.prompt_tokens` |
| `judgment.usage.output_tokens` | first of `gen_ai.usage.output_tokens`, `gen_ai.usage.completion_tokens` |
| `judgment.usage.total_cost_usd` | **Not written by ingest.** |

```python
import logfire, json

logfire.configure()

with logfire.span("chat_completion") as span:
    span.set_attribute("gen_ai.system",            "openai")
    span.set_attribute("gen_ai.request.model",     model)
    span.set_attribute("gen_ai.prompt",            json.dumps(messages))
    span.set_attribute("session.id",               session_id)
    span.set_attribute("user.id",                  user_id)
    response = client.chat.completions.create(model=model, messages=messages)
    span.set_attribute("gen_ai.completion",        response.choices[0].message.content)
    span.set_attribute("gen_ai.usage.input_tokens",  response.usage.prompt_tokens)
    span.set_attribute("gen_ai.usage.output_tokens", response.usage.completion_tokens)

with logfire.span("search_documents") as span:
    span.set_attribute("tool.name", "search_documents")
    span.set_attribute("input.value",  json.dumps({"query": q}))
    span.set_attribute("output.value", json.dumps(results))
```

**Cross-service trace continuity.** For multi-service customers, distributed
traces only stay connected if **both** sides of every HTTP boundary have
propagation wired in. The orphan-reparenting rule (below) is how ingest
*handles* a fragmented trace, not how to *prevent* one. Audit both sides:

- **Client side (outbound HTTP).** `RequestsInstrumentor().instrument()` for
  `requests`, `HTTPXInstrumentor().instrument()` for `httpx`. Without it,
  the outgoing call does not inject W3C `traceparent` headers and the
  server-side span has no parent.
- **Server side (inbound HTTP).** `FastAPIInstrumentor.instrument_app(app)`,
  `FlaskInstrumentor().instrument()`, or framework equivalent. Without it,
  the server doesn't read incoming `traceparent` headers, so the request
  becomes a new root span instead of continuing the trace.
- **Manual propagation.** If auto-instrumentors aren't an option, look for
  explicit propagation primitives. Client: `inject(headers)` before sending.
  Server: `ctx = extract(dict(request.headers))` then
  `token = otel_context.attach(ctx)`. `extract({})` (or any empty-carrier
  variant — `extract(None)`, `extract(dict())`, `extract({} or headers)`)
  silently disconnects the trace and is a **fix-in-place** bug: restore the
  real carrier (`dict(request.headers)` for FastAPI/Flask, the framework
  equivalent otherwise). This is in scope under [propagation primitives are
  always in scope](#1-identify-the-source-provider) — do not punt it to any
  of the after-the-audit callouts.

If either side is missing or uses an empty carrier, ingest sees disconnected
trace fragments and the orphan-reparenting rule promotes children to roots.
Verify both sides before trusting span hierarchy.

Notes:

- The `otel_scope_name` regex matches Logfire's auto-instrumentation scope
  prefix (`logfire.<provider>`). Vanilla `opentelemetry.instrumentation.*`
  scopes do **not** match — for those, set `gen_ai.system` explicitly.
- Orphan reparenting: if a child span's parent isn't in the same ingest batch,
  the transformer drops the `parentSpanId` and promotes the child to a root.
  Keep root spans short-lived to avoid fragmented trace trees. The root cause
  is usually a missing propagator on one side of an HTTP boundary — see
  "Cross-service trace continuity" above.
- Resource grouping uses the OTel `service.name` resource attribute when set.
  Multi-service customers should set distinct `service.name` per service.
- **Hybrid OTel ingest.** Some customers route the same OTel spans to
  Judgment AND another platform (Langfuse OTel, Honeycomb) via one
  exporter. Platform-mapping constants for the *other* ingester
  (`LANGFUSE_SESSION_ID = "langfuse.session.id"`, etc.) live alongside
  Judgment-relevant attributes in the same file. They don't affect
  Judgment ingest, but if a constant drifts from the other platform's
  documented key (`"langfuse.sessionId"` vs `"langfuse.session.id"`) it
  silently breaks the customer's side ingest. Flag drift under "Other
  findings" in the audit report; do not fix it (out of Judgment-ingest
  scope) but tell the customer it exists.
- **Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`).** When
  the customer enables `experimental_telemetry: { isEnabled: true }`
  on `generateText` / `streamText` / `generateObject` / `embed` /
  `embedMany`, the SDK auto-emits spans (`ai.generateText`,
  `ai.generateText.doGenerate`, `ai.toolCall`, `ai.embed`, etc.) with
  **both** the Vercel `ai.*` namespace and the OpenTelemetry GenAI
  semconv `gen_ai.*` namespace. The Judgment raw-OTel transformer
  reads only the `gen_ai.*` half — so half of what Vercel emits is
  picked up automatically and half isn't. Specifics:
  - **Auto-emitted, auto-mapped to Judgment:** `gen_ai.system`
    (drives `judgment.span_kind="llm"` and `judgment.llm.provider`),
    `gen_ai.request.model`, `gen_ai.response.model`,
    `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`.
  - **Auto-emitted by Vercel but NOT mapped by ingest:** `ai.prompt`,
    `ai.prompt.messages`, `ai.response.text`, `ai.response.toolCalls`,
    `ai.usage.promptTokens` / `completionTokens` (duplicates of the
    `gen_ai.*` versions; harmless). The ingest transformer ignores all
    `ai.*` attributes.
  - **Missing — customer must set manually on a parent span** (or
    `experimental_telemetry` does not emit them):
    - `gen_ai.prompt` / `gen_ai.completion` → `judgment.input` /
      `judgment.output`. Vercel uses `ai.prompt` / `ai.response.text`
      instead; ingest does not read those. Set `gen_ai.prompt` /
      `gen_ai.completion` on a wrapping manual span.
    - `tool.name` on tool spans → `judgment.span_kind="tool"`. Vercel
      uses `ai.toolCall.name` on its `ai.toolCall` spans; ingest does
      not read that. Either set `tool.name` manually on each tool
      dispatch site, or wrap each tool call in a manual OTel span
      that sets `tool.name`.
    - `session.id` / `user.id` → `judgment.session_id` /
      `judgment.customer_id`. Passing them via
      `experimental_telemetry.metadata` flattens to
      `ai.telemetry.metadata.session.id` / `.user.id` which ingest
      does not read. Set `session.id` and `user.id` as plain
      attributes on a parent OTel span instead.
  - **OTLP exporter bootstrap.** In Next.js, `trace.getTracer(...)`
    only ships spans if a `TracerProvider` + OTLP exporter is wired
    in `instrumentation.ts` / `register()` (or via `@vercel/otel`).
    This is the Next.js analog of the Python instrumentor-bootstrap
    guardrail — a constructed-but-not-initialized tracer emits
    nothing. Flag absence under "Other findings" if the customer's
    target file references `trace.getTracer` but the bootstrap is
    not in scope to verify.

## Java / JVM — Out of Scope

**Java and JVM code (including Kotlin) is out of scope for this skill.**
The playbook tables above are Python/TypeScript-only. If you encounter a
JVM file (raw OTel `spanBuilder` patterns, `JudgmentTracer.initialize()`,
Spring/Quarkus integrations, Kotlin coroutine-aware tracing, etc.),
**do not audit or fix in place.** Instead:

1. Flag the file in the audit report's "Customer follow-up required"
   callout with a one-line diagnosis if a bug shape is obvious from
   inspection (missing `.initialize()`, missing `spanBuilder` wrapper
   vs. siblings, decorator ordering with Spring, etc.).
2. Tell the customer to escalate to the Judgment team and consult the
   Judgment Java SDK docs at https://docs.judgmentlabs.ai — this skill
   does not cover JVM specifics.
3. Continue auditing the rest of the repo's Python/TS files.

The Python/TS playbook patterns in this skill (instrumentor-bootstrap
guardrail, silent-init-failure shapes, sibling-pattern check,
near-miss attribute keys, propagation primitives) are conceptually
applicable to JVM but the exact API surface, env-var conventions, and
canonical idioms differ — applying them without JVM-specific guidance
risks regressing the customer's setup. Defer.

## What Ingest Does NOT Carry

Setting these in the source provider is wasted work — the transformers drop
them:

- `judgment.usage.cache_creation_input_tokens` and
  `judgment.usage.cache_read_input_tokens`. All prompt-token signals collapse
  into `judgment.usage.non_cached_input_tokens`. Anthropic prompt-cache splits
  and OpenAI cached-prefix splits do not survive ingest.
- `judgment.usage.metadata` (raw provider blob). Each transformer instead
  splats source metadata keys onto the span as top-level attributes — they
  remain visible but there is no single `usage.metadata` field.
- `judgment.usage.total_cost_usd` from Braintrust or Logfire (not emitted at
  all). LangSmith emits only for `run_type="llm"`. Langfuse emits only for
  `GENERATION` observations with `calculatedTotalCost > 0`.
- `judgment.customer_id` from Braintrust or LangSmith (not emitted). Only
  Langfuse (`trace.userId`) and Logfire (`user.id`) carry it through.
- Forked sub-agent linking (`judgment.link.*`). This is a `judgeval`-only
  feature; ingest cannot reconstruct it from third-party providers.

## Common Symptoms and Fixes

In-place fixes for the most common ways a customer's existing provider
instrumentation produces non-eval-ready traces after ingest.

- **"My traces show as flat / no span_kind."** Customer is not setting the
  provider's type field. Apply the playbook's span_kind row first.
- **"Sessions don't group in Judgment."** Customer is setting `session_id`
  somewhere — but not in the field the transformer reads. Move it to the exact
  key in the playbook.
- **"Cost shows up in the source provider but not in Judgment."** Customer's
  LLM spans are not typed as LLM. Set `run_type="llm"` (LangSmith), `as_type=
  "generation"` (Langfuse), `type="llm"` (Braintrust), or ensure
  `gen_ai.system` is on the span (Logfire).
- **"Customer ID is missing."** Check provider — if Braintrust or LangSmith,
  ingest does not carry it regardless of what the customer sets. Flag this in
  the audit report; do not invent a workaround. The only fix paths are a
  transformer change in `judgment-data-pipelines` or native-judgeval adoption
  — both out of scope for this skill. Escalate via the audit report's
  "Customer follow-up required" callout.
- **"Tool calls only appear inside an LLM span's output text, not as their
  own spans."** Customer is letting the model emit tool invocations as part
  of its response text without wrapping the actual tool executions with
  traced functions. Wrap each tool dispatch site with the provider's tool
  decorator (`@traceable(run_type="tool")` for LangSmith, `@observe(name="tool/<n>")`
  for Langfuse, `@braintrust.traced(type="tool")` for Braintrust, a
  `tool.name` attribute for Logfire / raw OTel). Without this, judges can't
  ground their reasoning in tool I/O — exactly when hallucination detection
  needs it.
- **"Traces are completely missing for a service / framework that should be
  traced."** Instrumentor is imported but never activated. Check for the
  paired `.instrument()` / `.initialize()` / `.instrument_app(app)` call —
  see the [instrumentor-bootstrap guardrail](#audit-guardrails) in Step 2.
  This was the most common bug class in skill-validation testing.
- **"Distributed trace splits at HTTP boundaries — children appear as
  unrelated roots."** Missing propagator on one side of the boundary, or
  an empty carrier in manual propagation (`extract({})`). See the Logfire
  playbook's [Cross-service trace continuity](#logfire) subsection.
- **"Traces ingest but appear in the wrong project / dashboard, or
  span names lost agent context."** Compare config strings against
  sibling files in the same repo:
  - `PROJECT_NAME` / `project_name=` constants — if one driver script
    uses `"langfuse-trace-generation"` and a sibling uses `"default"`,
    suspect a regression in the outlier.
  - OTel `service.name` — multi-service deployments need distinct
    values; a sibling pinned to the same string as another service
    is a regression.
  - Span name templates — if a sibling driver / call site in the same
    repo uses a richer span name (e.g., `f"{self.name}/chat-completion"`,
    `f"{agent.name}/messages-create"`) and one site uses a bare value
    (`"generation"`, `"call"`), restore the richer name. The bare form
    ingests fine, but losing agent attribution at the trace browser
    breaks per-agent filtering and (for Langfuse) breaks the embedding-
    detection heuristic for spans containing `"embed"`. Treat this as a
    fix-now regression when the sibling-diff is one literal value — do
    not defer to "ambiguities".
  Config-string regressions don't crash the trace pipeline — they
  reroute traces to unintended projects or strip identifying detail.
  Sibling-driver comparison is the highest-yield check.

## After the Audit

Report what changed using this template. **The Plan block and all three
trace trees from Step 2 are part of the deliverable, not scratch work**
— inline each one in full, in this exact order. Do not write "see above"
or reference an earlier section; the customer reads this report
top-to-bottom as the single deliverable.

- **Plan block** — exact structure from Step 2 (Provider / Files to
  change / Span kinds / Identity / LLM metadata / Known gaps). Inline
  in full.
- **Tree A — Current (`<provider>`)** — full ASCII tree in the
  provider's native vocabulary. Mark broken or missing fields with `❌`
  and untraced call sites with `❌ <call> at <file:line> — no span
  emitted`. Inline in full.
- **Tree B — Proposed (`<provider>`)** — full ASCII tree in the
  provider's native vocabulary, with `[NEW span: <file:line>]`,
  `[CHANGED: was <previous value>]`, and `[ADD: <native field>,
  <file:line>]` annotations on every delta. Inline in full.
- **Tree C — Translated (Judgment)** — full ASCII tree in Judgment
  attribute vocabulary (`judgment.*`). Annotate every attribute with
  `[from <native field>]` or `[gap: <reason>]`. Inline in full.
- Provider detected: `<braintrust | langfuse | langsmith | logfire | raw-otel | openinference | judgeval-relay>`
- Files changed: `<file:line list>`
- Attributes now populated: `<list>`
- Attributes still missing (with reason): `<list>`
- **Customer follow-up required (escalate to Judgment team):**
  `<file:line>` — `<one-line diagnosis>`. Use this callout for real
  bugs the audit identifies but does not fix because they're outside
  this skill's scope — primarily native-judgeval-API-surface concerns
  (`@judgment.observe`, `judgeval.tracer.Tracer`, `wrap(client)`,
  `set_customer_id`, `set_input`/`set_output` placement, decorator
  ordering with web frameworks, async-decorator compatibility, non-
  canonical `span_type` values, any Java/JVM file) and
  attributes the ingest pipeline can't carry for the customer's
  provider (`judgment.customer_id` on Braintrust/LangSmith, etc.).
  List **every** such finding explicitly; do not bury in narrative.
  Examples:
  - `agents/browser-agent/main.py:265 — @judgment.observe decorators present but no judgment.set_customer_id() despite user_id in scope; native-judgeval concern outside this skill's scope`
  - `services/worker/handler.py:18 — Tracer initialized in handler instead of bootstrap; native-judgeval concern outside this skill's scope`
  - `agents/browser-agent/main.py:1053 — @judgment.observe(span_type="function"); "function" not in canonical vocab ("llm" / "tool" / "embedding" / "span"); confirm intended span_kind with Judgment team`
  - `agents/distributed-tracing/server.py:43 — @app.get + @judgment.observe stacked on health_check; decorator-ordering interaction with FastAPI not documented; confirm with Judgment team`
  - `agents/sql-agent-java/Instrumentation.java:164 — Javadoc param name mismatch with method signature; confirm intended judgeval-Java API contract with Judgment team`
  Each follow-up item should end with a one-line instruction the
  customer can act on, e.g., "share the file:line and observed
  behavior with the Judgment team — they can confirm the canonical
  approach or point you at the right tooling."
- **Other findings (customer-internal, not tracing-related):**
  `<file:line>` — `<one-line diagnosis>`. Security findings, broken
  third-party imports, dead code. Examples:
  - `agents/browser-agent/main.py:23 — leaked Raindrop write_key in plaintext literal; route to security workflow`
  - `agents/browser-agent/main.py:11 — broken raindrop.analytics import; customer-internal concern, not an ingest fidelity issue`
  These are surfaced because a thorough audit notices them; they're not
  this skill's job to fix.

Note: propagation bugs (`extract({})`, missing `*Instrumentor().instrument()`)
and silent-init failures (env-var typos, SDK-method typos in init) are
**in scope** — fix them in place per the Audit Guardrails. They do NOT
belong in any of the callouts above.
- Next ingest cycle: 15–30 min — verify in Judgment UI after that.
