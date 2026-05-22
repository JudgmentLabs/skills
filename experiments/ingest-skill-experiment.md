# Ingest Skill Experiment

Stress-test of `skills/judgment/references/ingest.md` via isolated subagents (no git history) fixing broken third-party tracing on `JudgmentLabs/internal-agents` branch `broken-tracing` (commit `3c889b8`; gold = parent `0ca12ad`). Per-iter agent reports and fixes live under `.ingest-skill-eval/results/` (R1–R3) and `.ingest-skill-eval/round4/` (R4) in the experiment worktree.

## Iteration Summary

| Iter | Skill | Test set | Score | Key changes |
|---|---|---|---|---|
| R1 | Original (705 lines) | 17 files | 13/17 (76%) | Baseline. |
| R2 | +4 edits (779 lines) | 17 files | 16/17 (94%) | Silent-init-failure guardrail, JVM scope carve-out, config-string regression bug class, non-interactive plan-and-trees fallback. |
| R3 | +6 edits (835 lines) | 3 re-tested | 17/17 (100%) | Three-bucket out-of-scope template, span-name wording tightened, hybrid OTel callout. |
| R4 | Expanded test set | 3 new cases | 20/20 (100%) | +Braintrust, +Langfuse near-miss, +TypeScript Vercel AI SDK. |

R1 missed five files in two patterns: dead-end deferrals to `tracing.md` for JVM bugs `tracing.md` doesn't cover (2 cases), and an un-named silent-init-failure shape (1 case caught only 1 of 3 bugs). R2 closed both — score to 16/17 with zero regressions; the lone holdout (iter 2, cosmetic span-name regression) was deferred to R3.

## Iteration 3 — Surgical refinements (94% → 100%)

Six targeted edits closed iter 2 and addressed skill-clarity notes from R2 agents.

1. **Span-name regression wording tightened** — R2's bullet said cosmetic span names "ingest fine but lose attribution." Agents read this as non-blocking and didn't act. Tightened to "fix-now regression when sibling-diff yields one literal value."
2. **Three-bucket After-the-Audit template** — Deferred to `tracing.md` / Customer follow-up required / Other findings. Replaces the prior single-bucket callout that mixed actionable referrals with non-actionable noise.
3. **§1 native-vs-relay bucket split** — mirrors the After-the-Audit template; agents know at scope-decision time which downstream bucket a bug shape will route to.
4. **JVM scope carve-out recast** — enumerates in-scope-here vs out-of-scope-but-`tracing.md`-doesn't-cover-it (the dead-end shape R1 iter-13/14 stumbled on).
5. **Hybrid OTel callout** added to the Logfire playbook for the Judgment+Langfuse fan-out case (iter 7).
6. **Stale "After the Audit" example replaced** — the JVM-init example contradicted the new carve-out. Plus four orphan "defer to `tracing.md`" references the verification pass found and patched.

### Re-tested iters

| Iter | R2 | R3 | Delta |
|---|---|---|---|
| 2 (openai_agent — cosmetic span name) | MISS | **FULL FIX** — agent cited "sibling-pattern fix" and "restores agent attribution" verbatim from the new wording | Edit 1 closed iter 2 |
| 7 (otel_session_demo — hybrid Judgment+Langfuse OTel constant) | Defensible non-fix, no customer callout | Defensible non-fix **+ explicit customer-action surfacing** | Edit 5 working |
| 13 (sql-agent-java) | FULL FIX | FULL FIX maintained, no longer cites the stale template example | Edits 2, 4, 6 verified |

### Signals

- Soft language is invisible to agents. Findings must be explicitly classified as actionable vs informational.
- Three-bucket model functions as designed top-down. ~1-in-3 runs misses an applicable Customer-follow-up finding (replicate variance, not skill failure).
- Significant structural edits leave dangling cross-references — verification pass at edit-time pays off.

## Iteration 4 — Test set expansion (20/20)

Coverage gaps from R1–R3: Braintrust untested despite being a named provider; no concentrated near-miss-keys case; no TypeScript.

| Case | File | Bug shapes seeded |
|---|---|---|
| 18 — Braintrust | `agents/braintrust-support-chat/main.py` | Missing `type=` on `@braintrust.traced`; `metadata.session_id` instead of `chat_conversation_id` (near-miss); missing `metadata.provider`; tool dispatch with no `@traced` wrapper. |
| 19 — Langfuse near-miss | `agents/langfuse-near-miss-chat/main.py` | 8 simultaneous near-miss bugs: model in metadata not kwarg; identity on observation not `update_current_trace`; `ls_*` keys in Langfuse code; `promptTokens`/`completionTokens` legacy keys; tool span missing `tool/` prefix. |
| 20 — Vercel AI SDK + raw OTel (TS) | `agents/vercel-ai-sdk-otel-chat/route.ts` | Missing `experimental_telemetry`; `session_id`/`model`/`input`/`output` keys instead of `session.id`/`gen_ai.*`; `gen_ai.system` missing; usage tokens not stamped. |

Cases committed alongside the original 17 (commit `313db97`).

| Case | Grade |
|---|---|
| 18 (Braintrust) | **FULL FIX + restructure better than designed gold** — agent split into `chat_handler` (function) + `call_llm` (llm) + `search_documents` (tool), exactly mirroring the skill's worked example. Designed gold had collapsed function+LLM into one span. |
| 19 (Langfuse near-miss) | **PERFECT MATCH** — all 8 near-miss bugs caught. Diff vs gold purely cosmetic. |
| 20 (Vercel AI SDK) | **FULL FIX + Vercel telemetry-metadata propagation** — agent additionally wired identity into `experimental_telemetry.metadata` for AI-SDK-auto-emitted child spans, beyond the designed gold. |

### Signals

- Braintrust playbook content is high-fidelity despite zero prior coverage.
- Near-miss-keys + identity-at-trace-root guardrails compose — 8 bugs in one pass.
- Logfire playbook is effectively language-agnostic; agents translate Python↔TS without prompting.
- **Sterility caveat:** cases 19 and 20 shipped with bug-hinting docstrings agents cited. Fixes were correct anyway, but future seeds should use neutral docstrings.

## Post-validation refinements (not harness-validated)

After R4 closed the validation phase, two docs-architecture changes followed:

1. **Plan + Trees A/B/C now inlined as After-the-Audit defaults** — agents were producing them during the §2 plan-gate but dropping them from the §5 deliverable. Three Braintrust replicates with minimal prompts confirmed the fix; not a full iteration's worth of validation, but structurally observable.
2. **SKILL.md / tracing.md / ingest.md routing restructure.** SKILL.md becomes the router; ingest.md drops all `tracing.md` cross-references; After-the-Audit collapses to two callouts (native-judgeval escalations now go to the Judgment team, not to a doc that didn't cover the bug). Java/JVM aligned to fully out-of-scope (matches `tracing.md`'s Scope decision) — the R2/R3-validated JVM raw-OTel carve-out was removed in favor of consistent scoping. Vercel AI SDK callout added to the Logfire playbook based on a fresh fetch of https://ai-sdk.dev/docs/ai-sdk-core/telemetry. These are tracked in `PROGRESS.md`.

## Conclusions

- **Named-bug patterns are the highest-leverage skill content.** When the skill names a bug shape with its canonical fix, agents apply it verbatim. When it doesn't, agents invent fixes or punt.
- **Sibling-pattern check is the second-highest yield.** N-1 siblings with a wrapper + 1 without = reliably found.
- **Soft language is invisible.** Findings must be explicitly classified as actionable vs informational.
- **Dead-end deferrals are worse than no deferral.** Routing through SKILL.md and keeping leaf docs free of cross-references is the durable shape.

Future test-set candidates: more cross-service propagation cases (R1 had only one), per-provider wrong-attribute-key bug shapes for Braintrust/LangSmith/Logfire (R4 case 19 concentrated on Langfuse only), TypeScript native judgeval (no coverage).
