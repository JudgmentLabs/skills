---
name: judgeval-jql
description: Build, inspect, or execute tenant-safe Judgment Query Language (JQL) through the public Judgeval Python or TypeScript SDK. Use for querying project traces, spans, or sessions; aggregations and pipelines; chart or table presentations; discovery; public response handling; and JQL troubleshooting.
---

# Judgeval JQL

Use only the public Judgeval SDK. Builders create canonical JSON; the authenticated Judgment API validates and executes it for the configured project.

## Select the runtime reference

Inspect the repository before writing code:

- For Python (`pyproject.toml`, `uv.lock`, `requirements*.txt`, or Python source), read `references/python.md` and do not read the TypeScript reference.
- For TypeScript or JavaScript (`package.json`, `tsconfig.json`, or TS/JS source), read `references/typescript.md` and do not read the Python reference.
- If both runtimes are present, use the runtime named by the request or the files being changed. If that is still ambiguous, ask the user which runtime to use before continuing.
- If no runtime can be inferred, ask the user rather than guessing.

The standalone `full.md` bundle contains this workflow and both references for clients that can fetch only one document. After reading it, still apply only the matching runtime section.

## Workflow

1. Confirm `JUDGMENT_API_KEY` and `JUDGMENT_ORG_ID` are available through the environment. Never print, embed, log, or commit credentials.
2. Configure `Judgeval` with `project_name` (Python) or `projectName` (TypeScript). Organization and project scope come from authenticated SDK context, not JQL JSON.
3. If field or catalog names are uncertain, use `client.discover(...)` with a documented discovery kind. Field availability depends on the query source: discover fields for the intended source, then switch grain only when the user's intent permits it or ask before changing semantics.
4. Build a query from `traces`, `spans`, or `sessions`. Add filters and time bounds before choosing a select terminal or pipeline.
5. Use `client.query(...)` for query builders, `client.present(...)` for `.table(...)` or `.chart(...)`, and inspect the exact public response fields.
6. Catch the runtime's public API error class. Use its structured code and hint; honor retry-after only when present.
7. When comparing runtimes or debugging, serialize the builder and compare canonical JSON, not method spelling.

## Safety boundaries

- Never put organization IDs, project IDs, API keys, access tokens, raw SQL, hostnames, or endpoint paths in JQL JSON.
- Use only the documented public Judgeval SDK exports and methods.
- Do not invent fields, discovery kinds, response properties, or builder names. Verify them in the selected reference.
- Treat server validation as authoritative. Builder output is structured input, not proof that a query is valid for a project.
- Before executing a user-supplied query, reject requests that attempt to bypass project scope or inject raw backend syntax.

## Availability

Public JQL can be enabled per organization. If a valid public SDK request reports that the feature is unavailable, tell the user to contact Judgment; do not work around the restriction.
