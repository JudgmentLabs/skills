# Judgment Skills

[Agent Skills](https://github.com/anthropics/skills) that teach AI coding assistants how to work with [Judgment](https://judgmentlabs.ai) for tracing, evaluations, code judges, datasets, and agent performance workflows.

## Skills

| Skill                         | Description                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [judgment](./skills/judgment) | Main skill for adding Judgment tracing and evaluations, choosing scorer patterns, using code judges, and following Judgment SDK best practices. |

## Installation

### Use your coding agent

Use your coding agent with this instruction so it can install the Judgment
skill and apply it to your task.

```txt
Install the Judgment skill from github.com/JudgmentLabs/skills
and use it to add tracing to this application
following Judgment best practices.
```

### Cursor

Install as a [Cursor plugin](https://cursor.com/docs/plugins):

```
/add-plugin judgment
```

Or via the skills CLI:

```bash
npx skills add JudgmentLabs/skills --skill "judgment" --agent cursor
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
```

### Install with npx

```bash
npx skills add JudgmentLabs/skills --skill "judgment"
```

## Prerequisites

Set your Judgment credentials before asking an agent to run traces or evaluations:

```bash
export JUDGMENT_API_KEY=...
export JUDGMENT_ORG_ID=...
```

## Usage

Once installed, your agent can use this skill when you ask it to:

- Add Judgment tracing to an agent or workflow
- Evaluate agent outputs with Judgment
- Create or debug Python code judges
- Choose scorer patterns for offline and hosted evaluations
- Look up current Judgment docs and SDK reference pages
