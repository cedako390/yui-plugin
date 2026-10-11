#!/usr/bin/env node
// Usage: node rebase-task.mjs <slug> [--wip]
// Rebases the task branch onto the main branch. With --wip, uncommitted work is committed
// as a temporary WIP commit first and turned back into working-tree changes afterwards.
// Exit 3 = conflicts; the rebase is left in progress for the coder to resolve.
import fs from 'node:fs';
import {
  checkSlug, die, git, gitTry, loadConfig, mainRoot, parseArgs, run, tail, worktreePath,
} from './lib.mjs';

await run(async () => {
  const { flags, pos } = parseArgs(process.argv.slice(2), ['wip']);
  const slug = pos[0];
  checkSlug(slug);
  const root = mainRoot();
  const cfg = loadConfig(root);
  const wt = worktreePath(root, cfg, slug);
  if (!fs.existsSync(wt)) die(`worktree not found: ${wt}`);

  const dirty = git(wt, ['status', '--porcelain']);
  let wip = false;
  if (dirty) {
    if (!flags.wip) die('worktree has uncommitted changes; commit them or pass --wip');
    git(wt, ['add', '-A'], cfg.gitConfig);
    git(wt, ['commit', '-q', '-m', 'WIP'], cfg.gitConfig);
    wip = true;
  }

  const r = gitTry(wt, ['rebase', cfg.mainBranch], cfg.gitConfig);
  if (r.code !== 0) {
    const files = git(wt, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);
    console.log(`CONFLICT during rebase${wip ? ' (a temporary WIP commit is on the branch)' : ''}. Conflicted files:`);
    for (const f of files) console.log(`- ${f}`);
    console.log(`Delegate resolution to the coder in ${wt}, then "git rebase --continue" and re-run checks.\n${tail(r.err, 5)}`);
    process.exit(3);
  }
  if (wip) {
    git(wt, ['reset', '--soft', 'HEAD~1'], cfg.gitConfig);
    git(wt, ['reset', '-q'], cfg.gitConfig);
  }
  console.log(`OK rebased ${slug} onto ${cfg.mainBranch}${wip ? '; uncommitted work restored' : ''}. Regenerate generated code if sources changed, then re-run checks.`);
});
