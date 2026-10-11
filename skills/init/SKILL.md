---
name: init
description: Set up the orchestrator in the current project. Inspects the repo, writes .orchestrator.json with per-area check commands, validates it, and adds a short pointer to CLAUDE.md. Use once per project, before the orchestrate skill.
---

# Initialise the orchestrator in this project

Scripts are in `../../scripts/` relative to this skill's base directory (also `${CLAUDE_PLUGIN_ROOT}/scripts`).

1. **Inspect the repo** (main checkout). Find the parts that are built and tested separately: look for `package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`, `Makefile`, CI config, and any CLAUDE.md / README that names the commands. Each part becomes an **area** with a `path`, the `checks` (build, test, lint, typecheck: whatever the project really runs, in order, cheapest first) and an optional `setup` that a fresh worktree needs (for example `npm ci`; worktrees do not share `node_modules`).
2. **Find the collision-prone paths** for `conflictPaths`: migrations, generated code, API specs, lockfiles. Find security-relevant paths for `sensitivePaths` (auth, permissions, migrations, payments, secrets handling). Note shared resources in `sharedResources` (one dev database, fixed ports).
3. **Ask the user** only what you cannot read from the repo: which checks are mandatory, the main branch if not `main`, whether they want the reviewer on a stronger model for sensitive paths.
4. **Write `.orchestrator.json`** in the repo root. Fields (all optional except `areas`):

```json
{
  "mainBranch": "main",
  "remote": "origin",
  "worktreeDir": "../{repo}.worktrees",
  "branchPrefix": "task/",
  "gitConfig": [],
  "fixLineEndings": false,
  "taskCard": ".task.md",
  "checkTimeoutSec": 900,
  "areas": {
    "backend": { "path": "backend", "setup": "", "checks": ["make build", "make test"] }
  },
  "conflictPaths": [],
  "sensitivePaths": [],
  "sharedResources": []
}
```

   - `gitConfig`: `-c` options added to every git call, e.g. `["core.autocrlf=false"]` when the machine converts line endings and the repo is LF.
   - `fixLineEndings`: re-checkout the new worktree after creation (needed together with the line above on such machines).
   - `{repo}` in `worktreeDir` is the repository folder name; the default puts worktrees next to the repo, outside it.
5. **Commit the config** to be shared by the team: tell the user it should be committed (do not commit it yourself unless asked). The task card is excluded automatically by `new-task`, nothing to add to `.gitignore`.
6. **Validate:** `node <scripts>/doctor.mjs`. Fix every FAIL.
7. **CLAUDE.md pointer.** If the project has a CLAUDE.md, offer to add (do not duplicate the pipeline there):

```
## Orchestration (main session only)
For any code change, use the `orchestrator:orchestrate` skill. Config: `.orchestrator.json`. Subagents skip this.
```

If the project already has its own `.claude/agents/coder.md` or `reviewer.md`, tell the user that project agents shadow the plugin's and ask whether to remove them.
