# Judgment Skills

[Agent Skills](https://github.com/anthropics/skills) that teach AI coding assistants how to work with [Judgment](https://judgmentlabs.ai) for tracing, evaluations, code judges, datasets, MCP server workflows, and agent performance workflows.

## Skills

| Skill                         | Description                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [judgment](./skills/judgment) | Main skill for adding Judgment tracing and evaluations, choosing scorer patterns, using code judges, and following Judgment SDK best practices. |
| [mcp-server-best-practices](./skills/mcp-server-best-practices) | Standalone skill for using the Judgment MCP server effectively, including full-text trace search, batched queries, and production data workflows. |

## Installation

### Use your coding agent

Use your coding agent with this instruction so it can install the Judgment
skill and apply it to your task.

```txt
Install the Judgment skill from github.com/JudgmentLabs/skills
and use it to add tracing to this application
following Judgment best practices.
```

For MCP-specific workflows:

```txt
Install the mcp-server-best-practices skill from github.com/JudgmentLabs/skills.
```

### Cursor

Install from the [Cursor Directory](https://cursor.directory/plugins/judgment):

```
/add-plugin judgment
```

Or via the skills CLI:

```bash
npx skills add JudgmentLabs/skills --skill "judgment" --agent cursor
npx skills add JudgmentLabs/skills --skill "mcp-server-best-practices" --agent cursor
```

### Claude Code

Add the marketplace and install:

```bash
claude plugin marketplace add JudgmentLabs/skills
claude plugin install judgment@judgment-skills
```

Or via the skills CLI:

```bash
npx skills add JudgmentLabs/skills --skill "judgment" --agent claude-code
npx skills add JudgmentLabs/skills --skill "mcp-server-best-practices" --agent claude-code
```

### Install with npx

```bash
npx skills add JudgmentLabs/skills --skill "judgment"
npx skills add JudgmentLabs/skills --skill "mcp-server-best-practices"
```

## Prerequisites

Set your Judgment credentials before asking an agent to run traces or evaluations:

```bash
export JUDGMENT_API_KEY=...
export JUDGMENT_ORG_ID=...
```

## Usage

Once installed, your agent can use these skills when you ask it to:

- Add Judgment tracing to an agent or workflow
- Test model, prompt, tool, or agent config changes with OfflineTracer before production
- Evaluate agent outputs with Judgment
- Create or debug Python code judges
- Choose scorer patterns for offline and hosted evaluations
- Use the Judgment MCP server for production traces, behaviors, prompts, automations, agent memory, and agent threads
- Look up current Judgment docs and SDK reference pages
