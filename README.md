# Judgment Skills

[Agent Skills](https://github.com/anthropics/skills) that teach AI coding assistants how to work with [Judgment](https://judgmentlabs.ai) for tracing, evaluations, code judges, datasets, and agent performance workflows.

## Skills

| Skill                         | Description                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [judgment](./skills/judgment) | Main skill for adding Judgment tracing and evaluations, choosing scorer patterns, using code judges, and following Judgment SDK best practices. |

## Installation

### Cursor

```bash
npx skills add JudgmentLabs/skills --skill "judgment" --agent cursor
```

Or install manually:

```bash
mkdir -p .cursor/skills/judgment
curl -fsSL https://raw.githubusercontent.com/JudgmentLabs/skills/main/skills/judgment/SKILL.md \
  -o .cursor/skills/judgment/SKILL.md
```

### Claude Code

```bash
npx skills add JudgmentLabs/skills --skill "judgment" --agent claude-code
```

Or install manually:

```bash
mkdir -p .claude/skills/judgment
curl -fsSL https://raw.githubusercontent.com/JudgmentLabs/skills/main/skills/judgment/SKILL.md \
  -o .claude/skills/judgment/SKILL.md
```

### Windsurf

```bash
npx skills add JudgmentLabs/skills --skill "judgment" --agent windsurf
```

### Codex

```bash
npx skills add JudgmentLabs/skills --skill "judgment" --agent codex
```

### Other agents

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
