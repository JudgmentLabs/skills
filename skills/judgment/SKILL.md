---
name: judgment
description: Use Judgment for agent tracing, evaluations, code judges, datasets, and monitoring. Use when integrating Judgment or judgeval, adding tracing to agents/workflows, creating evaluations or scorers, debugging traces, or looking up Judgment SDK usage and docs.
allowed-tools:
  - WebFetch(domain:docs.judgmentlabs.ai)
  - Bash(curl *docs.judgmentlabs.ai/*)
---

# Judgment

This skill helps you use Judgment effectively across common agent development workflows: instrumenting applications, evaluating outputs, creating code judges, and looking up current Judgment docs.

## Core Principles

Follow these principles for all Judgment work:

1. **Docs first**: Fetch current Judgment docs and refer to refernce files before implementing SDK patterns from memory.
2. **Instrument the real path**: Add tracing to the functions, tools, and LLM calls the app actually executes.
3. **Pick the right tracing reference based on the customer's setup**:
   - **No tracing yet, OR existing native judgeval code** (`@judgment.observe`, `judgeval.tracer.Tracer`, `wrap(client)`, JVM `JudgmentTracer`): start with [references/tracing.md](references/tracing.md). This is the integration-from-scratch and native-tracer audit guide.
   - **Existing third-party tracing that feeds Judgment via the ingest pipeline** (Braintrust, Langfuse, LangSmith, Logfire, OpenInference, OpenLIT, raw OpenTelemetry / GenAI semconv, `judgeval.integrations.*` relays): start with [references/ingest.md](references/ingest.md). This is the third-party audit guide; keep the customer on their existing provider, make ingested traces eval-ready.
   - **Mixed file (both native judgeval AND third-party SDK in the same module)**: default to [references/tracing.md](references/tracing.md). The assumption is the customer is migrating from the third-party provider to native judgeval, so the destination state is judgeval-native and `tracing.md` is the primary guide. Use `ingest.md` only as a secondary reference if the customer needs the legacy third-party traces to stay eval-ready during the transition.
4. **Stay on the tracer surface**: In most cases, use Judgment's tracer, wrappers, and documented integrations directly. Do not reach into underlying provider objects or create additional wrapper layers unless the current docs require it or a real instrumentation gap remains after using the supported integration.
5. **Start small**: For evaluations, begin with a focused example set and one scorer before expanding.
6. **Use the right scorer**: Use prompt/hosted scorers for rubric-based judgment and Python code judges for deterministic logic, custom dependencies, or trace inspection.
7. **Keep credentials out of chat**: Ask the user to set `JUDGMENT_API_KEY` and `JUDGMENT_ORG_ID` locally rather than pasting secrets.

## Use Case References

- Adding native judgeval tracing, or auditing existing native judgeval code: [references/tracing.md](references/tracing.md)
- Auditing existing third-party tracing instrumentation (Braintrust, Langfuse, LangSmith, Logfire, OpenInference, OpenLIT, raw OpenTelemetry) that feeds Judgment via the ingest pipeline: [references/ingest.md](references/ingest.md)
- Creating evaluations and choosing scorers: [references/evaluations.md](references/evaluations.md)
- Creating Python code judges: [references/code-judges.md](references/code-judges.md)
- Using Judgment docs and SDK references: [references/docs.md](references/docs.md)
