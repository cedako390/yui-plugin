# Brief templates

Agents do not see the conversation. A brief must stand on its own.

## Coder brief

```
Task: <full task text, verbatim from the user plus decisions made while planning>
Worktree (absolute path): <path>
Branch: <task/slug>   (do not run git branch/worktree/commit)
Relevant files: <paths and why>
Acceptance criteria:
- <observable condition>
Checks: run `node <scripts>/check.mjs <worktree>` before reporting; it prints one line per check.
Report: at most 30 lines (changed files, checks, open questions). Do not paste diffs or full command output.
```

For fix rounds add: `Reviewer findings (address each one; say fixed, or why you disagree):` and the findings.

## Reviewer brief

```
Task: <same task text as the coder got>
Worktree (absolute path): <path>
Coder report: <the report>
Checks: re-run `node <scripts>/check.mjs <worktree>`.
Report: verdict line first, findings only for real problems, at most 40 lines.
```

Add `model: "opus"` to the Agent call when `new-task.mjs` printed `sensitive: yes`.
