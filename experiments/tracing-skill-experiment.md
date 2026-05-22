# Tracing Skill Experiment

Stress-test of `skills/judgment/references/tracing.md`. 17 files seeded with mixed-severity tracing bugs (non-Judgeval providers) on `internal-agents:broken-tracing` (commit `3c889b8`). Sterile subagents (no git history, minimal prompts) fix them using only the skill; diff against `main`; iterate the skill against the same test set.

## v1 → v4 progression

The two most diagnostic files were #10 (`FDETestAgents/agents/tracing.py` — 3 independent provider bugs: Langfuse env var, Logfire method name, LangSmith async stack) and #12 (`FDETestAgents/agents/anthropic_agent.py` — missing `traced_generation` wrapper).

| Version | Skill change                                            | File 10 (bugs/3, full passes) | File 12              |
| ------- | ------------------------------------------------------- | :---: | :---: |
| v1      | Original skill + scaffolding hints in prompts           | 3/3, 1/1 | PASS (w/ hint)       |
| v2      | First round of skill additions, minimal prompts         | 1/3, 0/1 | PARTIAL (used `"generation"`) |
| v3      | + audit-each-provider-to-completion + proactive naming  | 1.67/3, 0/3 | **3/3 PASS**         |
| v4      | + "verify before you dismiss"                           | **2.67/3, 2/3** | (already at 3/3 in v3) |

Each refinement moved the needle.

## Key learnings

- **v2 regressions revealed that prompt scaffolding was doing the work in v1.** Moving "compare siblings," "audit each provider independently," and "treat generic names as bugs" out of prompts and into the skill closed 3 v1 fails (files 4 `browser-agent` raindrop typo, 7 OpenLit API, 11 generic `"generation"` name) on the first pass.
- **File 10 needed two rules.** Audit-to-completion (v3) lifted catch rate but agents still rationalized real bugs away ("plausible but lacks a smoking gun"). "Verify before you dismiss" (v4) lifted further with 2/3 full passes. The remaining miss is an agent inventing a "legacy API" rationalization for `_logfire.config` instead of running `hasattr(logfire, 'config')`.
- **File 12 needed a proactive naming clause.** Agents writing new code in v2 chose `name="generation"` until the skill forbade introducing generic names in authored code, not just spotting them in existing code.

## What would close the last gap

The residual failure mode is "agent rationalizes verification away." Best next move: promote verification from a discipline guideline to a mandatory pre-confidence checklist item — *"name the verification command you ran for each suspicious symbol you dismissed."* Beyond that: tool-level enforcement (a hook that runs `hasattr` on flagged symbols), or larger sample sizes per file (5–10 runs to bound variance).

Same methodology applies to other skill files: snapshot, sterile subagent, diff against ground truth, log gaps, refine, re-run.
