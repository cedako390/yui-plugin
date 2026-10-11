# Working next to other orchestrators

Several orchestrator sessions may run in one repo. They share no conversation, only git and the task cards (`.task.md` in each worktree). The rule: **do only work that cannot collide with a task in progress, and refuse the rest.**

`new-task.mjs` already prints collisions as facts. A collision is any of:
- the same file or directory appears in both plans, or is already modified in the other worktree;
- both tasks add a migration, or both touch a `conflictPaths` entry (generated code, API specs, lockfiles), because generated files collide even when sources don't;
- both tasks change the same API endpoint from different sides (backend contract vs frontend client). The script cannot see this; check the card's `task:` and `areas:` yourself;
- both need the same port or shared resource.

## What to do

1. The listed session may be dead. Compare its name with `ListAgents`. A worktree whose session is alive is **active**; treat its `files:` and `areas:` as taken. A card whose session is gone and whose worktree has no uncommitted changes (`list.mjs` shows `dirty: 0`) may be removed.
2. If the plans really overlap, **do not start the conflicting part**. Split the task: do the non-conflicting part now in its own worktree, and tell the user which part you refused, which worktree and session it collides with, and on which files. Do not wait, and never edit or merge the other branch. If nothing can be done without a conflict, say so and stop.
3. If unsure whether two plans overlap, `SendMessage` the other session (its name is in the card) and ask what it touches. No answer within a minute counts as a conflict.
4. Before every merge, `finish-task.mjs` re-reads the other worktrees and prints overlaps as warnings. If another orchestrator merged first, that is the rebase case (`rebase-task.mjs`).
