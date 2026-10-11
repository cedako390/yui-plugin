---
name: run
description: Use in the main session for ANY code change in a project that has .orchestrator.json. Plans the work, creates a branch and worktree, delegates to the coder and reviewer subagents, then commits and merges. Not for subagents.
---

# Orchestrate a code change

You are the **orchestrator**: you plan, delegate, and own git history. You do not write code yourself. If you are a subagent, stop reading: this skill is not for you.

Scripts live in `../../scripts/` relative to this skill's base directory (also `${CLAUDE_PLUGIN_ROOT}/scripts`). Run them with `node <scripts>/<name>.mjs`. They print short results; do not read their source. Paths below are shortened to `<s>/`.

First time in a project: `node <s>/doctor.mjs`. If `.orchestrator.json` is missing, run the `/yui:init` skill.

## Pipeline

1. **Plan.** Read only what you need to split the task into subtasks. If requirements are ambiguous, ask the user before delegating.
2. **Leftovers.** `node <s>/list.mjs`. A worktree with uncommitted work from an unfinished task is resumed, not deleted; ask the user if unclear. Compare the sessions it names with `ListAgents`.
3. **Start.** `node <s>/new-task.mjs <slug> --task "<request>" --areas <a,b> --files <paths you expect to touch> --migrations yes|no --ports <ports|omit> --session "<your session name>"`.
   It checks other worktrees for collisions, creates the branch and worktree, installs dependencies and writes the task card.
   - Exit 2 = **conflict**. Do not start the conflicting part. Read `reference/conflicts.md`, split the task, and tell the user what you refused and why.
   - Its `sensitive:` line says which reviewer model to use (step 5).
   - `unknown area "<x>"`: the area is missing from `.orchestrator.json`. Adding it is a config edit, so do it directly in the main checkout (commit it, since worktrees and `finish-task` need a clean main), then re-run.
   - A WARN about uncommitted tracked changes in the main checkout means someone's work is sitting there; mention it to the user, do not touch it.
   - Show script output in full: do not pipe it through `tail`/`head`, the exit-code lines are the signal.
4. **Code.** Delegate each subtask to the `yui:coder` agent. The coder does not see this conversation, so the brief must contain: the full task text, the absolute worktree path, relevant files, acceptance criteria, the check command `node <s>/check.mjs <worktree>` (absolute path), and the report limit "at most 30 lines, no diffs or full command output". Read `reference/briefs.md` the first time for the full template; do not write briefs from memory.
   **Parallel coders in one task.** Only for independent parts (different areas, no part waits for another's output). Before starting:
   `node <s>/parts.mjs plan --parts "backend=backend/internal,backend/api;frontend=frontend/src"`.
   Exit 2 = overlap or a shared `conflictPaths` entry: run those parts one after another. On OK, start one coder per part in the same worktree with the owned paths from its output in each brief ("touch nothing else"). When all have finished, run `node <s>/parts.mjs verify <worktree> --parts "<same string>"`; files outside every part go back to the coder that should not have touched them. Then run `check.mjs` once for the whole worktree and send **one** review. If a part depends on another (a client for a new endpoint), run them in order instead.
5. **Review.** Delegate to `yui:reviewer` with the same task text, the worktree path, the coder's report, the same check command and the limit "verdict first, at most 40 lines". The reviewer's default model is `sonnet`; pass `model: "opus"` when `sensitive: yes`.
6. **Loop.** On `VERDICT: CHANGES_REQUESTED` send the findings to the coder (same worktree), then review again. After 3 rounds escalate to the user with the remaining findings.
7. **Finish.** On `VERDICT: APPROVED`:
   `node <s>/finish-task.mjs <slug> --message "<reviewer's message + attribution trailer>" --paths <task files>`
   (`--all` only when everything in the worktree belongs to the task). It commits, fast-forward merges into the main branch, pushes and removes the worktree.
   - Exit 3 = main moved: `node <s>/rebase-task.mjs <slug>` (add `--wip` if the worktree is dirty), re-run `node <s>/check.mjs <worktree>`, then finish again. Rebase conflicts go to the coder, never resolve them yourself in the main checkout.
8. **Report** to the user: what was done, review rounds, check results, commit hash. Never report success without evidence; say plainly if a check failed or was skipped.

## Rules

- Never run two agents in the main checkout, and never run two unrelated tasks in one worktree. All rounds of one task use the same worktree.
- Subtasks of one task run sequentially unless they touch different files. Separate tasks get separate worktrees.
- The main checkout is only for the main branch: planning, merging, pushing. If `git status` there shows changes an agent made by mistake, stop and tell the user.
- Run `node <s>/check.mjs <worktree>` yourself after any rebase, and whenever a report looks suspicious or lacks the `RESULT:` line; otherwise the coder and reviewer already ran it.
- Honour the project's own rules (CLAUDE.md, `sharedResources` printed by `new-task`), for example shared databases that must not be dropped.

## Keeping cost down

- Briefs and agent reports are the bulk of your context. Keep briefs complete but tight, and require short reports.
- Do not read diffs the reviewer already read. Trust the verdict plus the check output.
- After a task is merged, suggest starting a fresh session; all state lives in git and the task cards.
