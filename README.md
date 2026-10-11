# yui-skill: orchestrator plugin for Claude Code

The main session plans and delegates; `coder` and `reviewer` subagents work in a separate git worktree per task; scripts do the git and check mechanics (worktree, collision check, checks, commit, fast-forward merge, push), so they cost almost no context.

```
plan -> worktree -> coder -> reviewer -> (loop) -> commit + merge + push
```

## Install

Requires Claude Code, Node >= 18, git >= 2.31.

```
/plugin marketplace add cedako390/yui-skill
/plugin install orchestrator@claude-orchestrator
```

Restart the session, then once per project:

```
/orchestrator:init
```

It inspects the repo, writes `.orchestrator.json` and validates it. Commit that file (worktrees and `finish-task` need a clean main branch).

## Use

Ask for any code change in the main session; the `orchestrator:orchestrate` skill runs the pipeline. Check the setup any time with:

```
node <plugin>/scripts/doctor.mjs
```

## `.orchestrator.json`

Only `areas` is required.

```json
{
  "areas": {
    "backend":  { "path": "backend",  "checks": ["make build", "make test"] },
    "frontend": { "path": "frontend", "setup": "npm ci", "checks": ["npm run check", "npm run build"] }
  },
  "conflictPaths": ["backend/db/migrations"],
  "sensitivePaths": ["backend/internal/auth"],
  "sharedResources": ["One shared dev database: never drop it"]
}
```

| Field | Default | Meaning |
|---|---|---|
| `areas` | required | `path`, optional `setup` (run in a new worktree), `checks` (run in order, first failure stops the area) |
| `mainBranch`, `remote` | `main`, `origin` | Merge target; no remote means no push |
| `worktreeDir`, `branchPrefix` | `../{repo}.worktrees`, `task/` | Worktree location (keep it outside the repo) and branch prefix |
| `gitConfig`, `fixLineEndings` | `[]`, `false` | e.g. `["core.autocrlf=false"]` plus `true` on machines that convert line endings |
| `conflictPaths` | `[]` | Paths that collide between parallel tasks (migrations, generated code) |
| `sensitivePaths` | `[]` | Tasks touching these are reviewed by `opus` instead of `sonnet` |
| `sharedResources` | `[]` | Notes printed when a task starts |
| `checkTimeoutSec` | `900` | Per-command timeout |

Full example: `examples/rcrm.orchestrator.json`.

## Notes

- Parallel orchestrator sessions are supported: each task has a card (`.task.md`) and `new-task` refuses to start on a collision (exit 2).
- A project's own `.claude/agents/coder.md` or `reviewer.md` shadows the plugin's.
- Never force-pushes, only fast-forward merges.

MIT
