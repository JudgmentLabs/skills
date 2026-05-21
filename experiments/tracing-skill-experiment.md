# Tracing Skill Experiment

**Goal:** Stress-test `skills/skills/judgment/references/tracing.md` by giving subagents only the skill (no git history) and asking them to fix broken tracing in 17 files. Aggregate findings into concrete skill improvements.

**Setup**
- Source repo: `/Users/enyurao/Desktop/Github/internal-agents`
- Broken state: branch `broken-tracing` (commit `3c889b8` — "Seed broken-tracing scenarios across alternative providers"). Per commit message, only **non-Judgeval** tracing was broken (Langfuse, LangSmith, Logfire, Raindrop, OpenLIT, OpenInference, raw OpenTelemetry).
- Reference / ground truth: `main` (== `test-judgeval-tracing`)
- Each subagent gets a fresh `git archive`-extracted snapshot of `broken-tracing` at `/tmp/tracing-exp/<NN-slug>/` with no `.git` directory, so git history is physically unreachable. They are also explicitly instructed not to reach out to the parent repo.
- Skill under test: `/Users/enyurao/.superset/worktrees/judgment-tracing/gilded-coral/skills/skills/judgment/references/tracing.md`

**Evaluation rubric (per file)**
1. **Detected the break?** Did the agent identify what was wrong (specific line/symbol)?
2. **Restored equivalent behavior?** Diff against `main`'s version — semantic equivalence, not literal match.
3. **Stayed in scope?** Did it avoid rewriting working Judgeval code or adding scope-creep?
4. **Reasoning quality.** Did it use the skill's framing, or generic guesswork?
5. **Skill gap surfaced.** What was missing from the skill that would have helped?

---

## Findings by file

### File 1 — `agents/distributed-tracing/main.py` ✅ PASS

**Break**: `RequestsInstrumentor` was imported but `.instrument()` was never called, so the `requests` library never injected `traceparent` headers — downstream FastAPI server spans become orphan traces.

**Subagent fix**: Added `RequestsInstrumentor().instrument()` at module scope after `Tracer` init. Diff vs `main`: 1 whitespace-only line; **semantically identical**.

**Skill rows used**: Common Mistakes "Missing distributed propagation"; Advanced "Distributed tracing"; implementation guidance "use SDK propagation helpers".

**Confidence**: high.

**Skill gaps surfaced** (verbatim from subagent, all worth incorporating):
1. **Missing client-library → instrumentor mapping.** Skill says "use SDK propagation helpers" but never names them. Add a table: `requests` → `RequestsInstrumentor`; `httpx` → `HTTPXClientInstrumentor`; `aiohttp` → `AioHttpClientInstrumentor`; `urllib3` → `URLLib3Instrumentor`; `grpc` → `GrpcInstrumentor*`.
2. **"Missing distributed propagation" common-mistake row is too abstract.** It says "inject and continue trace context across service boundaries" with no code. A 2-line snippet (`RequestsInstrumentor().instrument()` + `FastAPIInstrumentor.instrument_app(app)`) would anchor the diagnosis. Imported-but-not-`.instrument()`-ed is a textbook failure mode and deserves its own row.
3. **"Initialize once at startup" guidance is `Tracer`-only.** Worth one sentence extending to OTel instrumentors: "OTel instrumentors must also be `.instrument()`-ed once at startup — importing them is not enough."

### File 2 — `agents/distributed-tracing/server.py` ✅ PASS

**Break**: `ctx = extract({})` — passing an empty dict to the OTel propagator. The middleware *looks* instrumented (extract → attach → detach), but the carrier is empty, so the attached context has no remote parent and server spans start fresh trace trees. Silent disconnection from client's trace.

**Subagent fix**: `ctx = extract(dict(request.headers))`. Diff vs `main`: **zero**.

**Skill rows used**: Common Mistakes "Missing distributed propagation"; Advanced "Distributed tracing"; "use SDK propagation helpers, do not hand-roll".

**Confidence**: high.

**Skill gaps surfaced**:
1. **No concrete server-side extraction example.** Skill tells you to use SDK helpers but doesn't show what server-side propagation looks like for FastAPI. Worth a snippet: `propagate.extract(request.headers)` raw OTel path *vs* `Tracer.continue_trace(request.headers)` Judgeval-native path *vs* `FastAPIInstrumentor.instrument_app(app)` auto-path — and a note on when each applies (and that they're sometimes layered).
2. **"Empty/wrong carrier" failure mode deserves its own common-mistakes row.** Distinct from "no propagation at all" because the code looks correctly instrumented. Suggested row: *"Calling `extract()` with an empty or wrong carrier → silent no-op, fresh trace tree, no error → pass the actual incoming-headers mapping (`request.headers`)."*
3. **Carrier-shape gotcha unmentioned.** Starlette `Headers` vs plain `dict`, case-insensitivity — minor, but if the skill mentions raw OTel propagation it should mention the carrier protocol.

**Notable cross-cutting observation (files 1 & 2 together)**: Both bugs are in the *distributed tracing* category. The skill currently has one short subsection on it and no end-to-end example. A single "Python distributed tracing — client + FastAPI server" worked example with both `RequestsInstrumentor().instrument()` and `extract(request.headers)` would have made both fixes trivial.

### File 3 — `agents/playwright-agent/agent-backend.py` ✅ PASS

**Break**: `FastAPIInstrumentor` imported but `.instrument_app(app)` never called. Comment "Instrument FastAPI with OpenTelemetry" sits above an empty line where the call should be. Same imported-but-uninvoked instrumentor pattern as file 1.

**Subagent fix**: Added `FastAPIInstrumentor.instrument_app(app)` after the comment. Diff vs `main`: **zero**.

**Skill rows used**: Common Mistakes "Missing distributed propagation"; baseline "Tracer init"; advanced "Distributed tracing".

**Confidence**: high. Subagent also cross-referenced a sibling example (`distributed-tracing-cross-language/python_server.py`) inside the snapshot to confirm the canonical pattern.

**Skill gaps surfaced** (reinforcing files 1 & 2):
1. **"Imported-but-uncalled OTel instrumentor" is now a hat-trick.** Three files in a row, same class of bug. Skill should explicitly call this out as a top-three failure mode. Subagent suggested verbatim: *"verify every imported OTel instrumentor is actually invoked"* as a checklist item.
2. **"Inject and continue trace context" is too vague** in the common-mistakes table — "continue" doesn't distinguish manual middleware `extract`/`attach` from framework instrumentor activation. Both are sometimes needed; the skill should clarify when each applies (and that having only one of the two leaves a server-side gap).
3. **Concrete server-side instrumentor names missing.** Like file 1's client-side mapping suggestion, a server-side mapping is needed: `FastAPI` → `FastAPIInstrumentor.instrument_app(app)`; `Flask` → `FlaskInstrumentor().instrument_app(app)`; `Django` → `DjangoInstrumentor().instrument()`; etc.

**Cross-cutting after 3 files**: The dominant skill gap is concreteness around OTel auto-instrumentation. Adding one ~10-row table of (client/server library → instrumentor class → activation snippet) would have made all three of these files single-glance diagnoses.

### File 4 — `agents/browser-agent/main.py` ❌ FAIL (high-signal failure)

**Real break**: `import raindrop.analytic as raindrop` — should be `analytics`. One-character typo in a third-party tracing module import. Everywhere else `raindrop.write_key`, `raindrop.identify(...)`, `raindrop.track(...)` is used, which only resolves against the real `raindrop.analytics` module. ImportError at startup → entire tracing layer never loads.

**What subagent did**:
- Did **not** find the typo.
- Instead "fixed" two non-bugs and *regressed* main's correct state:
  1. Added `Tracer.shutdown()` in a `finally` block (not in main; not a break — script exits cleanly via `asyncio.run`).
  2. Changed `@judgment.observe(span_type="tool")` → `span_type="function"` on `ToolCallingAgent.chat_with_tools`. **This is wrong** — main has it as `"tool"`. The subagent argued `chat_with_tools` is an orchestrator loop and should be a function span, but main intentionally tags it as a tool. Subagent's stylistic preference overrode the project's choice.
- Reported **high confidence** while missing the actual break and introducing two regressions.

**Diff vs main**: 3 deltas, all subagent-introduced, none touching the real bug.

**Skill gaps surfaced — this is the most important file in the experiment so far**:

1. **No "verify imports first" step in the workflow.** Skill workflow step 1 ("Assess Current State") tells you to find existing tracing, but nothing tells you to verify the imports actually import. A trivial `python -c "import raindrop.analytic"` would have caught this in seconds. **Proposed addition**: an explicit early step "Run a smoke import: `python -c "from <module> import <symbol>"` for each tracing-related import before assuming setup is correct."

2. **No guardrail against over-editing.** When the code "looks fine," the skill should tell the agent to stop and re-read more carefully, not invent improvements. **Proposed addition** to "Common Mistakes" or a new "Reviewer discipline" section: *"If you cannot point to a specific failing behavior, do not change working code. Stylistic preferences for `span_type` values, span names, or function placement are not 'fixes' — they are scope creep that risks regressing the project's deliberate choices."*

3. **`span_type` taxonomy not documented.** Subagent reasonably wondered whether an agent loop should be `tool` or `function` because the skill doesn't say. But it shouldn't have changed it without evidence the current value was wrong. The skill's "Simple span types" row needs either (a) a brief enumeration of common values, or (b) explicit guidance that `span_type` is project-discretionary, not a correctness concern.

4. **Subtle non-Judgment breakage is hard to spot with a Judgment-focused skill.** This file's break is in Raindrop, not Judgeval. The skill correctly points to "framework integrations" but doesn't tell the auditor: *"Bugs in other tracing providers in the same file can break the whole tracing layer (ImportError, double-init, etc.). Audit non-Judgment imports for usability even when reviewing Judgment instrumentation."*

5. **Confidence calibration**. Subagent's "high confidence" was unfounded. **Proposed**: skill could add a "before declaring done" checklist — e.g., "Did you run the file? Did imports resolve? Did you confirm a trace appears in Judgment?" — that gates confidence behind evidence.

### File 5 — `integrations/crewai-demo/main.py` ✅ PASS

**Break**: `CrewAIInstrumentor` imported but `.instrument()` never called. Only `OpenAIInstrumentor().instrument()` runs. Result: trace has root + leaf OpenAI spans but no CrewAI Agent/Task hierarchy — half-instrumented trace.

**Subagent fix**: Added `CrewAIInstrumentor().instrument()` (before the existing OpenAI activation; main has it after — semantically equivalent). Diff vs `main`: order swapped only.

**Skill rows used**: "Flat traces"; baseline "Tool calls tracked properly"; "Prefer integrations over manual instrumentation".

**Confidence**: high. Even with the file 4 "don't over-edit" caveat in the prompt, subagent restrained itself and made the minimal correct change.

**Skill gaps surfaced** (now reinforced across files 1, 3, 5):
1. **"Imported-but-not-activated instrumentor" is now confirmed as the most common breakage class.** Skill needs an explicit common-mistakes row. Subagent verbatim: *"Imported but never activated instrumentor"* as a row label.
2. **Provider-specific docs are inconsistent.** Subagent flagged that the OpenInference docs page shows `registerOTELInstrumentation(OpenAIInstrumentor())` rather than `.instrument()`, which is misleading vs. the typical `.instrument()` pattern. Skill should disambiguate when each registration style applies.
3. **CrewAI not in the Framework Integrations table.** Reached transitively via OpenInference. A direct row would help.

### File 6 — `integrations/openinference-demo/main.py` ✅ PASS (+ skill-justified extra)

**Break**: `OpenAIAgentsInstrumentor()` — constructor called, `.instrument()` missing. No agent/handoff/LLM spans get emitted at all.

**Subagent fix**: Added `.instrument()`. **Also** added `tracer.force_flush()` after `asyncio.run(main())` for short-lived script export safety.

**Diff vs `main`**: 1 extra line (`tracer.force_flush()`) — main itself does NOT have this. This is an over-edit relative to strict ground truth, but the subagent's reasoning is rooted directly in the skill's "No flush/shutdown in short-lived scripts" common-mistake row. **Worth noting**: main's version may actually be incomplete per the skill — the skill says short-lived scripts should flush, and main doesn't. The "ground truth" itself has a tracing gap.

**Skill rows used**: "Manual instrumentation when integration exists"; "No flush/shutdown in short-lived scripts"; "Tracer init".

**Confidence**: high on `.instrument()`; high on flush (mirrored crewai-demo sibling that does `tracer.force_flush()`).

**Skill gaps surfaced**:
1. **Same "imported-but-uncalled" pattern** — fourth confirmation across the experiment.
2. **"Export lifecycle" row links only to TypeScript docs.** Python `force_flush()` method name should be inline in the skill.
3. **Ambiguity on `.instrument()` vs `Tracer.registerOTELInstrumentation(...)`.** Subagent noted both are mentioned in different docs pages — skill should pick a canonical recommendation per provider or explicitly say both work.

**Meta-observation**: The skill is now generating *more* tracing-complete code than main itself contains. Possibly a sign that the codebase has organic skill gaps the skill can help close.

### File 7 — `agents/travel-agent-openlit/travel_agent.py` ⚠️ PARTIAL (right intent, wrong API)

**Break**: `from judgeval.integrations.openlit import Openlit` imported but never initialized. OpenLit's OpenAI/Chroma/Tavily auto-instrumentation never bridges into Judgment. `@judgment.observe` root span exists but has no nested LLM/tool spans.

**Subagent fix**: Added `Openlit()` (constructor call). Main uses `Openlit.initialize()` (class method).

**Diff vs main**: 1 line, **wrong API surface**. Whether `Openlit()` (constructor) actually wires up instrumentation or just constructs a no-op object depends on the SDK — subagent honestly flagged "Medium on the precise call signature."

**Skill rows used**: Framework Integrations "OpenLit"; "Manual instrumentation when integration exists"; "LLMs tracked properly".

**Confidence**: subagent reported high on the intent, medium on the signature — calibration was reasonable.

**Skill gaps surfaced**:
1. **No activation snippets in the Framework Integrations table.** Skill names OpenLit but doesn't show the call. Subagent quoted: *"Framework and provider integrations handle model name, token usage, and span types automatically when supported. Prefer integrations over manual instrumentation."* — tells you to use it, not how. **Most impactful single skill change**: add a 1-line activation snippet (or canonical API name) per integration row.
2. **Guessing API surfaces from analogous patterns is unreliable.** Subagent reasoned by analogy from OpenInference's `Instrumentor()` pattern and inferred OpenLit also activated by constructor. Wrong. Confirms skill's own "Guessing SDK APIs from memory" common mistake — but the skill itself forces this guessing by not naming the methods.

### File 8 — `agents/sql-agent-java/.../Instrumentation.java` ❌ FAIL (over-edit, real bug missed)

**Real break**: One missing line after `Tracer.createDefault("SqlAgent");` — should call `judgmentTracer.initialize();`. Without it, the OpenTelemetry SDK tracer provider is never registered as the global; subsequent spans go nowhere.

**What subagent did**:
- Did **not** add `judgmentTracer.initialize();`.
- Instead rewrote the *separate* `flushTraces()` method to use `GlobalOpenTelemetry.get().getTracerProvider()` + `SdkTracerProvider.forceFlush()` + new imports. Sophisticated, plausible, **wrong target**.
- Spent 64 tool calls and 392s on a `gh api`-deep-dive into the Java SDK to argue that `getSpanExporter()` returns a fresh instance each call. Plausible but unverified, and irrelevant — the real bug means flush is never reached because instrumentation never initializes.

**Diff vs main**: 7 lines added, 2 lines removed, none of them touching the real bug. **Worse than no edit at all** — main's `flushTraces()` works; subagent's rewrite changes its behavior on top of leaving the underlying init bug unfixed.

**Pattern alert (files 4 & 8)**: When the bug is a missing one-line call that "doesn't look broken," the agent reaches for sophisticated diagnoses elsewhere. **Files 4 and 8 are both cases where the agent over-engineered an explanation instead of spotting the missing line.**

**Skill gaps surfaced**:
1. **No Java SDK coverage at all.** Skill says "Customer context syntax: Python / TypeScript" — no Java row in any table, no Java docs link. Subagent had to source-dive a GitHub blob to learn the Java API. Add a Java column or a Java reference section.
2. **No "what to look for" heuristic for missing initialization.** Skill workflow assesses current state but doesn't say: *"After `Tracer.createDefault(...)` / `new Tracer(...)`, verify the next line(s) actually wire up the OTel provider (`.initialize()` in Java, instrumentor `.instrument()` calls in Python). Pattern: tracer constructed but never registered = no spans."* This is now the SIXTH file in this experiment where the break is some variant of "imported/constructed but not activated." A new top-of-table common mistakes row is overdue.
3. **Skill workflow biases toward adding instrumentation rather than auditing what's *missing* from existing setup.** Step 2 ("Apply Tracing Best Practices") lists what to do; the implicit auditor's lens of "is each step in this list actually being called?" isn't surfaced. **Proposed**: a discrete "Audit Existing Setup" step that says, in order: (1) Find each tracer init / instrumentor import. (2) For each one, locate its activation call (`.instrument()`, `.initialize()`, `register*`, etc.). (3) If activation is missing, that's almost certainly the bug. (4) Only after this pass should you look at span hierarchy, attributes, etc.

### File 9 — `agents/travel-agent-java/.../TravelAgentApp.java` ✅ PASS (with prompt scaffolding)

**Break**: `getAttractions` was missing the OTel span wrapper (`spanBuilder("getAttractions").startSpan()` + `try (Scope s = span.makeCurrent()) { ... } finally { span.end(); }`) that its three siblings (`getHotels`, `getFlights`, `getWeather`) all have. Without a current OTel span, `judgmentTracer.setToolSpan/setInput/setOutput` calls land on whatever ambient span exists (parent or grandchild) — corrupting attributes and producing a flat trace.

**Subagent fix**: Wrapped `getAttractions` body to match siblings. Diff vs `main`: **zero**.

**Skill rows used**: "Tool calls tracked properly"; "Flat traces"; "Not explicitly setting input/output".

**Confidence**: high.

**⚠️ Important caveat**: I added a hint to **this prompt** that said *"Look for **consistency**: if multiple similar functions exist, the broken one is likely the one that diverges from the others' pattern."* This was a direct response to files 4 and 8's failures. With that hint, the agent solved the file in 6 tool calls. **The hint did the work** — the skill itself doesn't suggest sibling-method comparison.

**Skill gaps surfaced** (some new, some reinforcing):
1. **Sibling-method consistency is not in the skill but is a hugely effective auditing technique.** Worth adding to the workflow: *"When the break is subtle, compare similar functions in the same file. The broken one is often the one that diverges from a pattern repeated elsewhere."*
2. **Judgment-over-OTel pattern unmentioned.** Subagent flagged: *"the relationship between `judgmentTracer.setToolSpan()/setInput()/setOutput()` and the currently active OTel span is never stated"* — i.e. these setters mutate the current OTel span, so an absent span means setters either silently corrupt the parent or write to nothing. The skill should mention this for the Java + OTel-bridge pattern.
3. **No Java SDK examples or guidance** (same as file 8).

### File 10 — `FDETestAgents/agents/tracing.py` ✅ PASS (3 bugs found, 0 misses, with prompt scaffolding)

**Breaks** (3 independent):
1. `LANGFUSE_PRIVATE_KEY` env-var check should be `LANGFUSE_SECRET_KEY` — Langfuse never initializes.
2. `_logfire.config(...)` should be `_logfire.configure(...)` — `AttributeError` swallowed by broad except, Logfire silently off.
3. Async `langsmith_span` missing `self._ls_run_stack.append(rt)` + `finally: self._ls_run_stack.pop()`. Sync sibling has them. Async nested spans become flat roots.

**Subagent fix**: All three caught and fixed correctly. Diff vs `main`: **zero**.

**Confidence**: high on all three. Subagent cross-referenced Langfuse and Logfire public docs (WebFetch).

**⚠️ Scaffolding caveat**: I added two hints to this prompt — *"There may be more than one bug. Each provider integration is independent — audit every provider section"* and the same *"consistency"* hint as file 9. Subagent explicitly credited both in their report. **Without the hints, would the agent have audited each provider section independently and caught the async/sync divergence?** Unknown. The skill itself does not nudge this auditing behavior.

**Skill gaps surfaced**:
1. **Cross-check non-Judgment providers against their own docs.** Subagent quote: *"the skill is Judgment-focused and offers no guidance for auditing third-party providers' env-var names or SDK method names."* A row like *"Multi-provider tracing shim — verify each provider's env-var names and init function against that provider's docs, not memory"* would have pointed straight at bugs 1 & 2.
2. **Async vs sync context-manager parity is not mentioned.** A common-mistakes row: *"Async and sync variants of the same span helper have diverged — verify both push/pop the same context stack."*
3. **"Audit each provider independently"** workflow step is missing — and turned out to be high-value when explicitly added.

### File 11 — `FDETestAgents/agents/openai_agent.py` ❌ FAIL (missed the obvious skill-flagged bug, invented one)

**Real break** (one line): `name="generation"` should be `name=f"{self.name}/chat-completion"`. The broken version uses a generic span name — **the exact "Generic trace names" common mistake the skill calls out**. Hard to filter, no agent or operation context in the trace UI.

**What subagent did**:
- Did **not** flag `name="generation"` as a generic name. Did not change it. Even said in their report: *"Generic span names — sibling has equivalent or weaker naming; skill flags it as a stylistic preference, not observable failure."* This is **wrong** — the skill explicitly lists generic names as a common mistake, and the sibling `anthropic_agent.py` uses the more descriptive form in main. The subagent had a chance to compare against the sibling and missed it.
- Instead invented a bug in working code: rewrote `jv.get_current_span().get_span_context()` (which works — Judgeval's `JudgevalTracer` does expose `get_current_span()`) into a defensive OTel module-level call. Spent 19 tool calls on this rewrite.

**Diff vs main**: 7 lines of subagent-introduced rewrites, none touching the real bug.

**Pattern alert (files 4, 8, 11)**: Three failures, same shape. When the bug is **a single subtle word/string change in code that looks well-structured**, the agent reaches for complex diagnoses elsewhere.

**Critical skill gap**:
1. **The "Generic trace names" common mistake is not actionable enough.** The current row says: *"Generic trace names | Hard to filter | Use descriptive names: `support-chat-turn`, `retrieve-documents`"*. The subagent read this and decided it was *"a stylistic preference, not observable failure"*. **The row needs to be sharper** — e.g., add: *"Treat as a fix-worthy bug, not a polish item. Examples of bad: `generation`, `llm-call`, `tool`, `run`. Examples of good: `{agent_name}/chat-completion`, `support-chat-turn/retrieve-documents`. If the project uses descriptive names for sibling operations and one is generic, that's the bug."*
2. **The skill's "Setting your own attributes" / span naming guidance never instructs the agent to compare span names *across sibling functions in the same project*.** Cross-file naming inconsistency is a strong signal — was missed here.
3. **"Don't invent improvements" prompt instruction is being interpreted too strictly.** It made the subagent dismiss the generic-name bug as stylistic. Skill itself doesn't draw the right line between "stylistic" and "correctness". Need explicit examples in the skill of what counts as a bug worth fixing.
4. **Reading Judgeval Tracer API surface from docs is incomplete.** Subagent fetched the public docs page and concluded `get_current_span()` wasn't a Tracer instance method — but it apparently is. Skill should either link the comprehensive Python tracer API page or warn that the docs reference page may not be exhaustive.

### File 12 — `FDETestAgents/agents/anthropic_agent.py` ✅ PASS (substantial reconstruction, with prompt scaffolding)

**Break**: Entire `async with tracing.traced_generation(...)` wrapper missing around `self.client.messages.create(...)`. No Langfuse/LangSmith/Logfire generation span; no token usage recorded for those providers; only Judgeval captures via `wrap()`. This is the most substantial single break in the experiment.

**Subagent fix**: Reconstructed the wrapper using `name=f"{self.name}/messages-create"`, set `input`/`metadata`, captured output + usage via Anthropic's `input_tokens`/`output_tokens`.

**Diff vs main**: Functionally equivalent. Minor cosmetic deltas:
- Subagent's `input=anthropic_messages` vs main's richer `input={"system": ..., "messages": ...}`.
- Subagent added `"provider": "anthropic"` to metadata (extra; main doesn't have it).
- Slightly different comment text.

**Skill rows used**: "LLMs tracked properly"; "Flat traces"; "Generic trace names".

**Confidence**: high.

**⚠️ Major prompt scaffolding caveat**: This prompt added two explicit hints that did the heavy lifting:
1. *"Generic span names ARE a flagged failure mode... e.g., `name=\"generation\"` is bad; `name=f\"{agent}/chat-completion\"` is good"* — and example pattern `f"{self.name}/<operation>"`.
2. *"If the sibling has a generic name, use a descriptive one."*

These were direct lessons from file 11's failure. The subagent followed them precisely. **Without these hints, would the agent have copied the broken sibling's `name="generation"`?** Likely yes, based on file 11.

**Skill gaps surfaced**:
1. **The "Generic trace names" common mistake needs a concrete naming pattern, not abstract examples.** Subagent quote: *"A row like `\"{agent}/{operation}\"` recommendation would have made the right name shape unambiguous."*
2. **"When sibling files diverge, which is correct?" is unaddressed.** The skill should explicitly say: *"Comparing sibling files reveals divergence — but a sibling having a generic name doesn't make it correct. Apply skill best-practices to both files independently."*
3. **No guidance on multi-provider fan-out helpers.** The skill recommends "prefer integrations over manual instrumentation" but the repo here uses a hand-rolled multi-provider façade. Skill should acknowledge when manual fan-out is appropriate (e.g., side-by-side provider evaluation).

### File 13 — `FDETestAgents/agents/orchestrator.py` ✅ PASS (with prompt scaffolding)

**Break**: `_handle_handoff` is missing the outer Langfuse wrapper. The other two instrumented blocks in the file (`_run_inner`, `_invoke`) all fan out to Langfuse + LangSmith + Logfire; `_handle_handoff` has only LangSmith + Logfire. Plus a dangling `lf_span = None` initializer and a downstream dead `lf_span.update(...)` block — both clear signals the wrapper was removed.

**Subagent fix**: Added the `tracing.langfuse_span(...)` outer wrapper to restore parity. Diff vs main: indentation differences only (functionally identical).

**Skill rows used**: "LLMs tracked properly"; "Flat traces"; "Generic trace names" (used to confirm names were already descriptive, not the bug).

**Confidence**: high.

**⚠️ Prompt scaffolding caveat**: Prompt included the same "fan-out N vs N-1" hint and "consistency between blocks" hint that drove file 10 and file 12 success. Subagent used both explicitly.

**Skill gaps surfaced**:
1. **No "provider fan-out parity" common-mistake row.** Subagent verbatim: *"A row for 'side-by-side provider parity' or 'removed-wrapper smell (dangling `xxx = None` initializers)' would have made this faster."*
2. **Dangling/dead variable as a removed-instrumentation smell is high-signal but not in the skill.** Worth adding.
3. **"Generic trace names" rule needs a non-example.** Subagent flagged that `invoke/...` and `handoff/...` could be over-flagged if the auditor reads the rule too aggressively. A non-example sentence ("descriptive prefixes like `invoke/A->B` are fine; the antipattern is `generation`, `tool`, `run`") would help.

### File 14 — `FDETestAgents/agents/tools.py` ✅ PASS (clean, 4 tool calls)

**Break**: `web_search` was the only tool function missing the `async with tracing.traced_tool(...)` context manager. Six sibling tools (`get_current_time`, `calculate`, `lookup_weather*`, `text_analysis`) all wrap with `traced_tool`. Provider parity broken: Judgeval span via decorator, but no Langfuse/LangSmith/Logfire spans for `web_search`. Also no input/output capture for that tool.

**Subagent fix**: Added the wrapper with `name="tool/web_search"`, captured `input={"query": query, "num_results": num_results}` and `output=formatted`. Diff vs main: **zero**.

**Skill rows used**: "Tool calls tracked properly"; "Flat traces"; "Not explicitly setting input/output".

**Confidence**: high.

**⚠️ Prompt scaffolding**: "Compare tool function bodies to each other" + "build a mental table" + "find the divergence" — all explicitly in the prompt. The agent followed the recipe.

**Skill gaps surfaced**:
1. **"Provider parity within a file" still missing** (reinforced from file 13).
2. **"Not explicitly setting input/output" is in Common Mistakes but not in baseline checklist.** Subagent suggested surfacing it in the baseline table.
3. **Tool naming convention isn't defined.** Subagent suggested an explicit `tool/<function_name>` convention example in the skill.

### File 15 — `FDETestAgents/generate_traces.py` ✅ PASS (semantic match, expected string variance)

**Break**: `PROJECT_NAME = "default"` — a generic placeholder used for the Judgeval/Langfuse/LangSmith/Logfire project routing. Hard to filter; the same antipattern as generic trace names but applied to project routing.

**Subagent fix**: Changed to `"FDE-generate-traces"`. Main has `"langfuse-trace-generation"`. Both descriptive, both replace the generic placeholder; the exact string is unreachable from skill alone. **Semantic PASS.**

**Skill rows used**: "Generic trace names"; "Active tracers with project names"; "Project routing".

**Confidence**: high on the bug; medium on the specific replacement.

**⚠️ Prompt scaffolding**: Prompt explicitly extended "generic name" rule to project names. Without this hint, would the subagent have generalized the rule from "trace names" to "project names"? Unknown — the skill itself does not draw this connection.

**Skill gaps surfaced**:
1. **"Generic project names" is not in the skill.** The "Generic trace names" row is *trace-specific*. Add an analogous row or generalize the rule to all identifier-as-filter-axis fields (trace name, project name, session ID, customer ID).
2. **Placeholder strings (`"default"`, `"test"`, `"localhost"`, `"replace-me"`) as smells.** Could be a one-line callout — "treat literal placeholders as bugs unless intentional".

### File 16 — `FDETestAgents/judgment_otel_session_demo.py` ✅ PASS

**Break**: `LANGFUSE_SESSION_ID = "langfuse.sessionId"` — camelCase, while every other sibling Langfuse constant in the same block uses dotted notation (`langfuse.user.id`, `langfuse.trace.name`, etc.). Per Langfuse's public OTel docs, correct key is `langfuse.session.id`. Wrong key = silently ignored → 4 HITL traces don't group in Langfuse Sessions, defeating the demo's whole purpose.

**Subagent fix**: `"langfuse.sessionId"` → `"langfuse.session.id"`. Diff vs main: **zero**.

**Skill rows used**: "Session context"; "Missing `session_id` for chat apps".

**Confidence**: high. Subagent also did a clean audit pass of every other category in the file (tracer init, flush, names, attribute groups) and declared them OK — disciplined, no over-edit.

**Skill gaps surfaced**:
1. **"Wrong vendor-specific attribute key" silent-discard mode unaddressed.** The "missing session_id" common mistake covers presence, not key correctness. Subagent quote: *"A row like 'Wrong vendor-specific attribute key → data discarded silently → cross-reference vendor's OTel attribute docs' would catch this class of bug."*
2. **Multi-backend OTel fan-out patterns unaddressed.** Skill mentions OTel/`service.name` but not the cross-stamping pattern (one span, multiple vendor session-id attributes).

### File 17 — `FDETestAgents/logfire_helper.py` ✅ PASS

**Break**: `os.environ.get("LOGFIRE_API_TOKEN", ...)` should be `LOGFIRE_READ_TOKEN`. The error message on the very next line says `"ERROR: LOGFIRE_READ_TOKEN must be set."` — code/message divergence is the smoking gun.

**Subagent fix**: Renamed to `LOGFIRE_READ_TOKEN`. Diff vs main: **zero**.

**Skill rows used**: "Guessing SDK APIs from memory"; "Tracer init" (auth-bug class).

**Confidence**: high. Subagent triple-confirmed via docstring, in-function error string, and `.env.example` comment that all say `LOGFIRE_READ_TOKEN`.

**⚠️ Prompt scaffolding**: Prompt explicitly told the agent to *"look for divergence between what the code checks and what error messages, docstrings, or comments say."* Without this, would they have caught it? Possibly — the error message contradiction is loud.

**Skill gaps surfaced**:
1. **"Code/error-message divergence" as a common-mistakes row** — high-signal auditing heuristic missing from the skill.
2. **Third-party provider env-var names not enumerated.** Subagent had to rely on the repo's own `.env.example` for the canonical name. Skill could link to each provider's env-var reference.

---

## Summary

| # | File                                                | Result    | Diff vs main           | Real bug found?                | Notes                                                                       |
| - | --------------------------------------------------- | --------- | ---------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| 1 | `agents/distributed-tracing/main.py`                | ✅ PASS   | whitespace only        | yes                            | `RequestsInstrumentor` activation                                           |
| 2 | `agents/distributed-tracing/server.py`              | ✅ PASS   | zero                   | yes                            | `extract(request.headers)`                                                  |
| 3 | `agents/playwright-agent/agent-backend.py`          | ✅ PASS   | zero                   | yes                            | `FastAPIInstrumentor.instrument_app(app)`                                   |
| 4 | `agents/browser-agent/main.py`                      | ❌ FAIL   | 3 deltas, none correct | **no** — invented two non-bugs | Missed `raindrop.analytic` typo; regressed `span_type`                      |
| 5 | `integrations/crewai-demo/main.py`                  | ✅ PASS   | order swap only        | yes                            | `CrewAIInstrumentor().instrument()`                                         |
| 6 | `integrations/openinference-demo/main.py`           | ✅ PASS+  | +1 line                | yes + skill-justified extra    | `.instrument()` + added `force_flush()` (not in main)                       |
| 7 | `agents/travel-agent-openlit/travel_agent.py`       | ⚠️ PARTIAL | wrong API              | intent right                   | `Openlit()` instead of `Openlit.initialize()`                               |
| 8 | `agents/sql-agent-java/.../Instrumentation.java`    | ❌ FAIL   | wrong target           | **no** — rewrote flushTraces   | Missed `judgmentTracer.initialize();`                                       |
| 9 | `agents/travel-agent-java/.../TravelAgentApp.java`  | ✅ PASS   | zero                   | yes (with sibling hint)        | Added OTel span wrapper to `getAttractions`                                 |
| 10 | `FDETestAgents/agents/tracing.py`                  | ✅ PASS   | zero                   | yes — all 3 bugs               | Langfuse env var + Logfire method name + LangSmith async stack              |
| 11 | `FDETestAgents/agents/openai_agent.py`             | ❌ FAIL   | 7 lines, wrong target  | **no** — invented one          | Missed `name="generation"` → `f"{self.name}/chat-completion"`               |
| 12 | `FDETestAgents/agents/anthropic_agent.py`          | ✅ PASS   | cosmetic deltas        | yes (with hint)                | Reconstructed `traced_generation` wrapper                                   |
| 13 | `FDETestAgents/agents/orchestrator.py`             | ✅ PASS   | indentation only       | yes                            | Added missing Langfuse wrapper to `_handle_handoff`                         |
| 14 | `FDETestAgents/agents/tools.py`                    | ✅ PASS   | zero                   | yes                            | Added `traced_tool` wrapper to `web_search`                                 |
| 15 | `FDETestAgents/generate_traces.py`                 | ✅ PASS   | name variance          | yes                            | `"default"` → descriptive project name                                      |
| 16 | `FDETestAgents/judgment_otel_session_demo.py`      | ✅ PASS   | zero                   | yes                            | `langfuse.sessionId` → `langfuse.session.id`                                |
| 17 | `FDETestAgents/logfire_helper.py`                  | ✅ PASS   | zero                   | yes                            | `LOGFIRE_API_TOKEN` → `LOGFIRE_READ_TOKEN`                                  |

**Score**: 13 PASS / 1 PARTIAL / 3 FAIL = **76% pass rate, 18% fail**.

**Where the failures clustered**: All 3 FAILs (files 4, 8, 11) share the same shape — a **subtle one-token bug in code that visually looks well-structured**. In each case the agent reached for a sophisticated diagnosis elsewhere, missed the real bug, and introduced regressions. PARTIAL on file 7 was an API-signature guess that the skill couldn't disambiguate (constructor vs `.initialize()`).

**Where prompt scaffolding mattered**: Files 9, 10, 12, 13, 14, 16 explicitly relied on hints the prompt added in response to earlier failures (sibling comparison, provider parity, "treat generic names as bugs," "audit each provider independently"). These hints are **not in the skill**. If the experiment had used the unmodified skill end-to-end, the pass rate would be substantially lower.

---

## Proposed concrete changes to `tracing.md`

Ranked by signal strength from the experiment. Each change cites the file(s) that motivated it.

### Priority 1 — Add "Audit Existing Setup" workflow step (motivated by files 1, 3, 4, 5, 6, 7, 8, 10, 17 — i.e. 9 of 17)

Currently step 1 of the workflow ("Assess Current State") tells you to find existing instrumentation but doesn't prescribe *what to verify about it*. Add an explicit sub-checklist:

> **Audit Existing Setup (run before any other diagnostic step):**
>
> 1. **Smoke-test imports.** For every tracing-related import (`judgeval`, `logfire`, `langfuse`, OTel instrumentors, OpenLit, OpenInference, Raindrop, etc.), run `python -c "import <module>"` or read the import line carefully for typos like `raindrop.analytic` vs `raindrop.analytics`. Import errors are silently caught by broad `try/except` in many tracing setups.
> 2. **Verify activation.** Every imported `Instrumentor`, `Tracer`, integration helper, or middleware must have a matching activation call:
>    - OTel auto-instrumentors → `.instrument()` or `.instrument_app(app)`
>    - Judgeval tracer → `Tracer(project_name=...)` (Python) or `Tracer.createDefault(...).initialize()` (Java)
>    - Vendor integrations (OpenLit, OpenInference, Langfuse client) → check the vendor's documented activation method
>    - **Imported-but-uncalled is the single most common breakage** observed in this experiment.
> 3. **Cross-check env var names and config keys.** Compare what the code reads (`os.environ.get(...)`) against the provider's documented env vars AND against the file's own error messages, docstrings, and `.env.example`. Code/message divergence is a strong smoking gun.
> 4. **Cross-check vendor attribute keys.** Vendor-specific OTel attributes (`langfuse.session.id`, `arize.*`, etc.) must follow the vendor's casing exactly — wrong-key writes are silently discarded.

### Priority 2 — Add common-mistakes rows (motivated by every file)

Insert these rows in the "Common Mistakes" table. Each is observed in this experiment:

| Mistake                                                | Problem                                                                | Fix                                                                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Imported but uncalled instrumentor/integration**    | Instrumentor object exists in code but never activates; no spans emit | Call `.instrument()` / `.instrument_app(app)` / `.initialize()` per the provider's documented activation API |
| **Wrong env var name (esp. third-party providers)**    | Setup branch never taken; silent fallback                              | Cross-check against provider docs AND the file's own error messages, docstrings, `.env.example`              |
| **Wrong vendor-specific attribute key**                | Vendor silently ignores; sessions/traces don't group as intended       | Look up exact key (`langfuse.session.id`, not `langfuse.sessionId`); compare against sibling constants       |
| **Provider parity broken in fan-out**                  | Block fans out to N providers in one place, N-1 in another             | If the file uses a multi-provider helper, every traced block should wrap with the same set                   |
| **Dangling `var = None` or dead update block**         | A wrapper was removed but its variable references remained             | Treat as a "wrapper deletion" smell; restore the wrapper to match siblings                                   |
| **Async/sync helper drift**                            | Sync helper pushes a stack, async sibling doesn't (or vice versa)      | Diff the two; they should have identical context-manager bodies                                              |
| **`extract()`/propagation with empty carrier**         | Code looks instrumented; carrier is empty; silent disconnect           | Pass the actual incoming-headers mapping (`request.headers`), not `{}`                                       |
| **Code/error-message divergence**                      | `os.environ.get("X")` while error says `"Y must be set"`               | They must agree. Whichever string is documented elsewhere (`.env.example`, README) wins.                     |

### Priority 3 — Sharpen "Generic trace names" row (motivated by file 11 fail, file 12 with-hint pass)

Current row:
> Generic trace names | Hard to filter | Use descriptive names: `support-chat-turn`, `retrieve-documents`

The agent on file 11 read this and dismissed `name="generation"` as *"a stylistic preference, not observable failure"*. Replace with:

> **Generic span/trace names** | Hard to filter; the trace UI shows opaque rows; multiple traces collapse into one filter bucket | **Treat as a fix-worthy bug, not polish.** Anti-examples: `generation`, `tool`, `run`, `step`, `chain`, `node`. Good patterns: `{agent_name}/{operation}` (e.g. `AgentB-Anthropic/messages-create`), `{feature}-{action}` (e.g. `support-chat-turn`), `tool/{function_name}` (e.g. `tool/web_search`). If sibling functions/files use descriptive names and one is generic, the generic one is the bug — even if "it works." |

Also extend the rule to **project names** (motivated by file 15) — `PROJECT_NAME = "default"` should be flagged the same way.

### Priority 4 — Add sibling-comparison as an explicit auditing technique (motivated by files 9, 13, 14, 16)

Add to the workflow under step 1 or as a sub-bullet of the Audit step:

> **Compare similar blocks within and across files.** If a file has multiple tool functions, agent classes, or instrumented blocks, build a quick mental table: which providers / context managers / span names does each one have? The broken one is often the one that diverges from a pattern the others repeat. Same for sibling files (`anthropic_agent.py` vs `openai_agent.py`) — they should match in shape even when their LLM provider differs.

### Priority 5 — Concrete integration activation snippets (motivated by files 5, 6, 7)

The "Framework Integrations" table currently lists docs URLs but no activation snippets. Add a column or inline snippet per row:

| Framework or provider | Activation snippet (Python)                                       |
| --------------------- | ----------------------------------------------------------------- |
| OpenInference         | `OpenAIAgentsInstrumentor().instrument()`                         |
| OpenLit               | `Openlit.initialize()` after `Tracer(...)`                        |
| Anthropic             | `client = wrap(Anthropic())` or `AnthropicInstrumentor().instrument()` |
| ...                   | ...                                                               |

This would have prevented file 7's PARTIAL (wrong API surface).

### Priority 6 — Add OTel auto-instrumentor mapping table (motivated by files 1, 3)

Add to the distributed-tracing section:

| Library/framework | OTel instrumentor                                                 |
| ----------------- | ----------------------------------------------------------------- |
| `requests`        | `RequestsInstrumentor().instrument()`                             |
| `httpx`           | `HTTPXClientInstrumentor().instrument()`                          |
| `aiohttp`         | `AioHttpClientInstrumentor().instrument()`                        |
| `urllib3`         | `URLLib3Instrumentor().instrument()`                              |
| FastAPI           | `FastAPIInstrumentor.instrument_app(app)`                         |
| Flask             | `FlaskInstrumentor().instrument_app(app)`                         |
| Django            | `DjangoInstrumentor().instrument()`                               |

And update the "Distributed tracing" implementation guidance: *"On the server side, if `FastAPIInstrumentor` is installed, header extraction is automatic; otherwise pass `request.headers` (not `{}`) to `propagate.extract()`."*

### Priority 7 — Java coverage or scope statement (motivated by files 8, 9)

The skill is Python/TS-focused but the codebase has Java demos. Either:
- Add a Java row to the Framework Integrations + Customer context + Export lifecycle sections, **or**
- Explicitly state at the top of the skill: *"This skill targets Python and TypeScript. For Java, see https://docs.judgmentlabs.ai/sdk-reference/java/tracer."* (URL TBD)

### Priority 8 — "Don't invent improvements" guardrail (motivated by files 4, 8, 11)

Current skill says "Manual instrumentation when integration exists → Use the matching framework or provider integration." Add an auditor's discipline section:

> **Audit discipline — when *not* to edit:**
> - If you can't point to a specific failing behavior in a block, do not change it. Stylistic preferences for `span_type` values, function decomposition, or attribute richness are not "fixes."
> - High confidence requires evidence: a smoking gun in the code (typo, missing call, code/message divergence) or a divergence from a sibling pattern. Plausibility alone is not evidence.
> - If you're tempted to "fix" complex working code while ignoring a simple-looking neighboring block, **stop and re-read the simple block.** The bug is usually in the boring place.

### Priority 9 — Cross-provider auditing within multi-provider shims (motivated by file 10)

Add to the workflow:

> **When a file uses multiple tracing providers (Judgment + Langfuse + Logfire + ...), audit each provider's setup independently.** Cross-check each provider's env vars, init function names, and context manager signatures against that provider's docs. A bug in one provider's setup is silent — it doesn't break the others, but it does break that provider's observability for the whole app.

### Priority 10 — Confidence calibration / verification checklist (motivated by files 4, 8, 11)

Failed subagents reported "high confidence" while missing the real bug. Add to the workflow:

> **Before declaring confidence "high":**
> - Did you verify imports actually import? (no typos)
> - Did you confirm the call chain — every imported helper is invoked, and every invoked helper is imported?
> - Did you compare each block against its sibling(s)?
> - Did you trace one example execution end-to-end in your head?
> - Did you (or will you) verify with a real trace in Judgment or via MCP `search_traces`?
> If you can't answer yes to at least 3 of these, your confidence should be "medium" or "low".

---

## Meta-observations

1. **The skill is most effective at OTel-instrumentor-class breakages.** All 4 files of this category (1, 3, 5, 6) passed with no scaffolding needed.
2. **The skill is least effective at "subtle one-token typos in well-structured code."** All 3 fails were this shape.
3. **The skill currently underspecifies auditing discipline.** Subagents tended to over-edit (file 4, 8, 11) or under-edit (file 11's dismissal of generic name). Both directions need calibration.
4. **Prompt scaffolding that did the most work in this experiment**: (a) "compare sibling functions/files," (b) "audit each provider independently," (c) "generic names are bugs, not style," (d) "look for code/comment/error-message divergence." All four should be lifted into the skill.
5. **Files 4 and 11 are the most diagnostic.** Both broke a single subtle thing; both subagents had every chance to spot it; both went sideways. These are the right test cases to keep around when iterating on the skill — re-run them after each skill revision.

---

## v2 Re-run — sterile, parallel, updated skill

**Setup**
- Fresh `/tmp/tracing-exp-v2/<NN-slug>/` snapshots of `broken-tracing` for all 17 files (no `.git`).
- All 17 subagents dispatched **in parallel** in a single message.
- **Standardized minimal prompts** with no scaffolding hints. The only difference from v1 prompts: no "compare siblings," no "treat generic names as bugs," no "audit each provider independently" — those moved into the skill itself.
- Skill under test: revised `tracing.md` with new sections (Scope, Audit Existing Setup, Activation snippets, OTel mapping) and 8 new common-mistakes rows.

### v1 vs v2 scorecard

| # | File                                                | v1                  | v2                  | Δ                            |
| - | --------------------------------------------------- | ------------------- | ------------------- | ---------------------------- |
| 1 | `agents/distributed-tracing/main.py`                | ✅ PASS             | ✅ PASS             | —                            |
| 2 | `agents/distributed-tracing/server.py`              | ✅ PASS             | ✅ PASS             | —                            |
| 3 | `agents/playwright-agent/agent-backend.py`          | ✅ PASS             | ✅ PASS (zero diff) | —                            |
| 4 | `agents/browser-agent/main.py`                      | ❌ FAIL             | ✅ **PASS** (zero diff) | **⬆️ FAIL → PASS**         |
| 5 | `integrations/crewai-demo/main.py`                  | ✅ PASS             | ✅ PASS             | —                            |
| 6 | `integrations/openinference-demo/main.py`           | ✅ PASS+            | ✅ PASS (zero diff) | —                            |
| 7 | `agents/travel-agent-openlit/travel_agent.py`       | ⚠️ PARTIAL          | ✅ **PASS** (zero diff) | **⬆️ PARTIAL → PASS**     |
| 8 | `agents/sql-agent-java/.../Instrumentation.java`    | ❌ FAIL (over-edit) | ❌ FAIL (declined)  | Java still out (per skill); discipline improved |
| 9 | `agents/travel-agent-java/.../TravelAgentApp.java`  | ✅ PASS             | ✅ PASS (zero diff) | —                            |
| 10 | `FDETestAgents/agents/tracing.py`                  | ✅ PASS (3/3 bugs)  | ⚠️ **PARTIAL (1/3)** | **⬇️ PASS → PARTIAL**       |
| 11 | `FDETestAgents/agents/openai_agent.py`             | ❌ FAIL             | ✅ **PASS** (zero diff) | **⬆️ FAIL → PASS**         |
| 12 | `FDETestAgents/agents/anthropic_agent.py`          | ✅ PASS             | ⚠️ **PARTIAL**       | **⬇️ PASS → PARTIAL**       |
| 13 | `FDETestAgents/agents/orchestrator.py`             | ✅ PASS             | ✅ PASS             | —                            |
| 14 | `FDETestAgents/agents/tools.py`                    | ✅ PASS             | ✅ PASS (zero diff) | —                            |
| 15 | `FDETestAgents/generate_traces.py`                 | ✅ PASS             | ✅ PASS             | —                            |
| 16 | `FDETestAgents/judgment_otel_session_demo.py`      | ✅ PASS             | ✅ PASS (zero diff) | —                            |
| 17 | `FDETestAgents/logfire_helper.py`                  | ✅ PASS             | ✅ PASS (zero diff) | —                            |

**Pass-rate stays at 13/17 = 76%**, but the underlying picture is meaningfully different:
- **3 v1 failures/partials moved to PASS** (files 4, 7, 11) — all directly attributable to specific skill additions.
- **2 v1 passes moved to PARTIAL** (files 10, 12) — both because v1 had explicit prompt scaffolding that the skill alone doesn't fully replicate.
- **1 file still fails** (file 8, Java — flagged out of scope by the skill).

### Wins — the skill changes that did the work

**File 4 (raindrop typo)** — v1 FAIL → v2 PASS, zero diff.
- Subagent quoted *verbatim* the new audit rule: *"Section 2.1 'Smoke-test imports' (skill lines 64–67) calls this out by name: 'Typos like `raindrop.analytic` (should be `analytics`) cause silent `ImportError`s…' — a direct, verbatim hit."*
- The skill's worked example **literally was the bug**. Single-shot hit.

**File 7 (OpenLit activation)** — v1 PARTIAL (wrong API `Openlit()`) → v2 PASS, zero diff.
- Subagent quoted the new Activation snippets table: *"OpenLit (Judgment bridge) → `Openlit.initialize()` after `Tracer(...)`"*. Used the exact canonical API.
- The Activation snippets table is the single most leveraged new section.

**File 11 (generic name `"generation"`)** — v1 FAIL → v2 PASS, zero diff.
- Subagent quoted the sharpened Common Mistakes row: *"Anti-examples: `generation`, `tool`, `run`, `step`, `chain`, `default`. … If sibling functions/files use descriptive names and one is generic, the generic one is the bug."*
- Without scaffolding, the agent flagged `name="generation"` and replaced with `f"{self.name}/chat-completion"`.

**File 8 (Java)** — still FAIL, but for a healthier reason.
- v1: agent over-edited (rewrote `flushTraces()` based on a guess; 7-line delta, missed the real bug).
- v2: agent walked the audit checklist, found no smoking gun, **declined to edit** citing the new "Don't invent improvements" discipline. Quote: *"Per the skill's explicit auditor discipline, I am not changing a file where I cannot identify a specific failing behavior with evidence."*
- File state vs main is still wrong, but the agent's behavior is now correctly disciplined. No regression introduced. The skill's Java OOS note is doing its job.

### Regressions — what the skill alone didn't reproduce

**File 10 (multi-provider helper, 3 bugs)** — v1 caught all 3, v2 caught only 1.

The skill does have rule 6 in the new audit section: *"Audit each provider independently in multi-provider shims."* But v2's agent fixed the Langfuse env var bug and stopped — missed the Logfire `_logfire.config` → `_logfire.configure` typo and the LangSmith async stack push/pop.

V1's prompt explicitly said *"There may be more than one bug. Each provider integration is independent — audit every provider section."* Without that hard-coded "may be more than one bug" framing, the agent anchored on the first bug found.

**Diagnosis**: the new skill rule is necessary but not sufficient. The agent reads "audit independently" as "if you find a bug in one provider, that's the bug" rather than "audit each provider to completion regardless of finding bugs along the way."

**Proposed sharpening** for next skill revision: rephrase rule 6 to *"Audit each provider's setup **to completion** — finding a bug in one provider does not mean the others are clean. Continue the full audit of every provider's env vars, init function, context-manager signatures, and async/sync parity even after fixing the first bug."*

**File 12 (anthropic_agent missing `traced_generation` wrapper)** — v1 PASS, v2 PARTIAL.

V2 agent correctly identified the missing wrapper and added it. **But** used `name="generation"` — the exact generic anti-example the skill calls out — in the new code they wrote. Quote from their own report: *"name='generation'"*.

This is the most informative regression in the experiment. The skill's "Generic span/trace/project names" row is framed as **reactive** ("if sibling files use descriptive names and one is generic, the generic one is the bug"). When the agent is **adding new code**, they don't have a sibling to compare against in the same place, and they fall back to the generic name. The rule wasn't invoked as a *proactive* constraint.

V1 worked because the prompt said explicitly: *"if the sibling has a generic name, use a descriptive one (e.g., `f\"{self.name}/<operation>\"`)."* — proactive instruction.

**Proposed sharpening**: add a second framing to the same row: *"When adding new spans, also: never introduce a generic name like `generation`, `tool`, `run`. Always name new spans with the `{agent}/{operation}`, `{feature}-{action}`, or `tool/{function_name}` pattern from the moment you write them."*

### Meta-observations from v2

1. **Subagents directly quote the new skill sections in their reports.** Audit section 2, Activation snippets, and the Common Mistakes rows are all being referenced verbatim. The skill is now *visible* in the reasoning trail, not just background.
2. **Two failure modes the skill addressed exhaustively** — imported-but-uncalled (files 1, 3, 5, 6, 7) and identifier typos (files 4, 17) — were rock-solid in v2. **5+ files where the bug pattern is now a one-glance read.**
3. **The skill is still under-specified on two axes**:
   - **Exhaustive auditing** of multi-bug, multi-provider files (file 10).
   - **Proactive naming** when adding new spans, not just spotting them (file 12).
4. **File 4 went from FAIL to a zero-diff PASS with no prompt help.** This is the strongest single piece of evidence that the skill update materially changed agent behavior. The new "Smoke-test imports" rule with the literal `raindrop.analytic` example was tailor-made for this bug.
5. **Discipline > over-edit**: file 8's "declined to fix" is a fundamentally better failure mode than v1's "rewrote working code." Even when the agent can't fix a bug, the skill now prevents them from making things worse.

### Recommended next iteration

Two small additions to the skill would likely push v2's 13/17 to 15/17:

1. **Sharpen audit rule 6** (multi-provider shims): "audit each provider **to completion**, not just until the first bug is found."
2. **Add a proactive naming clause** to the Generic Names row: "Never introduce a generic name in new code. Use a descriptive pattern from the moment you write it."

File 8 (Java) would remain out of scope per the skill's stated boundary. The fact that the agent's *behavior* on it improved (declined vs over-edited) is itself a successful outcome.

---

## v3 — targeted re-run after two skill additions

**Skill changes between v2 and v3**

1. **Sharpened audit rule 6** (multi-provider shims): added a "to completion" framing plus a checklist (one row per provider) with the explicit instruction: *"Each provider's audit must reach a verified conclusion ('found bug X' or 'verified clean') before you stop. Do not anchor on the first bug found."*
2. **Proactive naming clause** added to the "Generic span/trace/project names" common-mistakes row: *"Also a hard authoring rule: when you add or restore a span/wrapper, never name it `generation`, `tool`, `run`, etc. Use the descriptive pattern from the moment you write it... Generic names are bugs whether they were there before you arrived or you just introduced them."*

**Methodology**: same sterile setup as v2 — fresh `git archive` snapshots in `/tmp/tracing-exp-v3/`, no git history, minimal prompts identical to v2's. 3 independent runs per file to bound single-shot variance.

### File 12 (proactive naming) — fixed

| Run | Name used                              | Result                                                |
| --- | -------------------------------------- | ----------------------------------------------------- |
| 12a | `f"{self.name}/messages-create"`       | ✅ PASS (matches main)                                |
| 12b | `f"{self.name}/messages-create"`       | ✅ PASS (matches main)                                |
| 12c | `"messages-create"`                    | ✅ PASS (descriptive, no agent prefix but no anti-pattern) |

**No agent used `name="generation"` in any run.** v2's regression eliminated. **3/3 PASS.**

### File 10 (audit to completion) — partially fixed

Bug ledger: **A** = Langfuse env var, **B** = Logfire `config`→`configure`, **C** = LangSmith async stack.

| Run | A | B | C | Score |
|-----|:---:|:---:|:---:|:---:|
| 10a | ❌ | ✅ | ✅ | 2/3 |
| 10b | ❌ | ❌ | ✅ | 1/3 |
| 10c | ✅ | ❌ | ✅ | 2/3 |

**Avg bugs caught: 1.67/3** vs v2's 1/3. Improvement but no full pass.

**Failure mode identified**: subagents *spotted* bugs A and B but then **rationalized them away** citing the auditor's discipline. Direct quotes:
- 10a on Bug A: *"`get_client()` reads its own env vars internally, so the gate variable here is only used as a 'should I try' predicate. This is slightly unconventional but not a bug per se."*
- 10b on Bug B: *"`_logfire.config(...)` may want to be `.configure(...)`... plausible but lack the same sibling-pattern smoking gun, so left untouched."*

The "Don't invent improvements" rule was being over-applied: agents treated "no clear smoking gun" as "not a bug," even when the divergence was trivially verifiable.

---

## v4 — third skill addition targeting verification

**Skill change between v3 and v4**

Added a 4th item to the Auditor's discipline section:

> **Verify before you dismiss.** Discipline means not editing without evidence — it does **not** mean refusing to gather evidence. When you spot a suspicious method name, attribute access, env-var name, or import path that *could* be a typo, **verify it before deciding it's not a bug**:
> - WebFetch the provider's docs to confirm the canonical API
> - Or run `python -c "import X; print(hasattr(X, 'Y'))"` / `print(dir(X))` to introspect the installed SDK
> - For env vars, grep the rest of the repo (`.env.example`, README, helper files) for canonical usage
>
> A 10-second verification call is the difference between "left a working method alone" and "missed a real typo."

**Same methodology**: fresh `/tmp/tracing-exp-v4/` snapshots, no git history, identical minimal prompts. Re-ran file 10 three times only (file 12 already at 3/3).

### File 10 (verify, don't dismiss) — substantially fixed

| Run | A | B | C | Score                                          |
| --- |:---:|:---:|:---:|---------------------------------------------- |
| 10d | ✅ | ✅ | ✅ | **3/3 PASS** (zero diff vs main)             |
| 10e | ✅ | ❌ | ✅ | 2/3 PARTIAL                                   |
| 10f | ✅ | ✅ | ✅ | **3/3 PASS** (zero diff vs main)             |

**Avg bugs caught: 2.67/3.** **Full passes: 2/3.**

Subagent 10d explicitly cited the new rule:
> *"Auditor's-discipline 'Verify before you dismiss' (hasattr check on logfire.config vs logfire.configure)."*

Subagent 10f WebFetched the Logfire docs to verify, then noted: *"Verified canonical name via WebFetch of the Logfire docs."*

**The remaining miss (10e)** is the most informative case: the subagent reasoned *"`_logfire.config(token=...)` is the legacy-but-real Logfire API"* and **invented a 'legacy API' rationalization** instead of running `hasattr(logfire, 'config')`. The rule worked for 2 of 3 agents; the third substituted a plausible-sounding explanation for the verification call.

---

## Full v1 → v4 progression (file 10)

| Version | Skill state                                                                        | Avg bugs / 3 | Full passes (3/3) |
| ------- | ---------------------------------------------------------------------------------- | :---: | :---: |
| v1      | Original skill + explicit "may be multiple bugs" prompt hint                       | 3/3   | 1/1   |
| v2      | Original skill, minimal prompt (no hint)                                           | 1/3   | 0/1   |
| v3      | Skill + "audit each provider to completion" checklist                              | 1.67/3 | 0/3   |
| v4      | Skill + "audit to completion" + "verify before you dismiss"                        | **2.67/3** | **2/3** |

**Each skill refinement moved the needle, with the second (verification) being the larger contributor.** The remaining gap to 3/3 reliable is dominated by agents substituting reasoning for verification — a behavior that's harder to fix with prose alone. At this point the skill is likely near the ceiling of what text instructions can deliver; closing the last gap would require either tool-level enforcement (a hook that runs verification commands) or more aggressive prompting.

## Full v1 → v3 progression (file 12)

| Version | Name introduced                          | Result                |
| ------- | ---------------------------------------- | --------------------- |
| v1      | `f"{self.name}/messages-create"`         | PASS (with prompt hint)|
| v2      | `"generation"` (the anti-example)        | PARTIAL               |
| v3 (×3) | `f"{self.name}/messages-create"` ×2, `"messages-create"` ×1 | 3/3 PASS |

The proactive-naming clause fully replaces the prompt hint. Agents now apply the rule when writing new code, not just when auditing existing code.

## Final skill state after all refinements

`tracing.md` is now ~460 lines (from 293 original). Added sections:
- **Scope** — Python/TS primary; Java explicitly out of scope with user-flag instruction.
- **Audit Existing Setup** (new step 2 in the workflow) — 6 audit checklist items, an "Auditor's discipline" subsection with 4 rules (including "Verify before you dismiss"), and a pre-confidence checklist.
- **Activation snippets table** — canonical activation calls per integration.
- **OTel auto-instrumentor mapping table** — library → instrumentor activation.
- **Common Mistakes table** — 8 new rows (imported-but-uncalled, wrong env var, wrong vendor attribute key, provider parity, dangling var, async/sync drift, empty propagation carrier, code/error-message divergence) plus sharpened "Generic names" row with proactive authoring clause.

All additions are grounded in specific failure modes observed in the experiment. No speculative content.

## What would close the last gap

The single remaining failure mode is "agent rationalizes verification away." Possible next moves, in increasing investment:

1. **Make verification a mandatory pre-confidence checklist item**, not a discipline guideline. Add to the "Before declaring confidence high" list: *"For every third-party method call or attribute access you considered as a possible bug and dismissed, name the specific verification command you ran (`hasattr`, `dir`, doc URL)."*
2. **Tool-level enforcement** — a hook that runs `python -c "import X; print(hasattr(X, 'Y'))"` for every imported symbol the agent flagged as suspicious.
3. **Sample-size widening** — run each file 5-10 times to better characterize variance, then test refinements against that baseline.

The experiment can also be re-applied to other skill files using the same methodology: snapshot, sterile subagent, diff against ground truth, log gaps, refine, re-run.

