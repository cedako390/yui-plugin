#!/usr/bin/env node
// Usage: node finish-task.mjs <slug> (--message "<text>" | --message-file <file>)
//          (--paths p1,p2 | --all) [--no-merge] [--no-push] [--keep]
// Commits in the worktree, fast-forward merges into the main branch, pushes, removes the
// worktree and branch. Exit 3 = main moved (rebase first), 5 = push failed (merged locally).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  branchName, changedFiles, checkSlug, die, findConflicts, git, gitTry, list, loadConfig,
  mainRoot, parseArgs, readCard, run, tail, worktreePath,
} from './lib.mjs';

await run(async () => {
  const { flags, pos } = parseArgs(process.argv.slice(2), ['all', 'no-merge', 'no-push', 'keep']);
  const slug = pos[0];
  checkSlug(slug);
  const root = mainRoot();
  const cfg = loadConfig(root);
  const wt = worktreePath(root, cfg, slug);
  const branch = branchName(cfg, slug);
  if (!fs.existsSync(wt)) die(`worktree not found: ${wt}`);

  let messageFile = flags['message-file'];
  if (!messageFile) {
    if (!flags.message) die('give --message or --message-file');
    messageFile = path.join(os.tmpdir(), `orchestrator-msg-${slug}.txt`);
    fs.writeFileSync(messageFile, `${flags.message}\n`);
  }
  if (!flags.paths && !flags.all) die('give --paths <task files> or --all, so unrelated changes are never committed by accident');

  if (flags.all) git(wt, ['add', '-A'], cfg.gitConfig);
  else git(wt, ['add', '--', ...list(flags.paths)], cfg.gitConfig);
  const staged = git(wt, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  const leftover = git(wt, ['status', '--porcelain']).split('\n').filter((l) => l && !/^[AMDRC] /.test(l));
  if (staged.length) {
    git(wt, ['commit', '-q', '-F', messageFile], cfg.gitConfig);
    console.log(`committed ${staged.length} file(s)`);
  } else if (git(wt, ['rev-list', '--count', `${cfg.mainBranch}..HEAD`]) === '0') {
    die('nothing to commit and the branch has no commits ahead of main');
  }
  if (leftover.length) console.log(`WARN: uncommitted changes left in the worktree:\n${tail(leftover.join('\n'), 15)}`);
  const hash = git(wt, ['rev-parse', '--short', 'HEAD']);

  if (flags['no-merge']) {
    console.log(`OK committed ${hash} on ${branch}; merge skipped`);
    return;
  }

  // Re-read the other cards before merging into main.
  const card = readCard(wt, cfg);
  const warnings = findConflicts(root, cfg, { files: changedFiles(wt, cfg), migrations: card.migrations, ports: [] }, slug);
  for (const w of warnings) console.log(`WARN overlap with another worktree: ${w}`);

  const current = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (current !== cfg.mainBranch) die(`main checkout is on "${current}", expected "${cfg.mainBranch}"`);
  const mainDirty = git(root, ['status', '--porcelain', '--untracked-files=no']);
  if (mainDirty) die(`main checkout has uncommitted tracked changes; stop and tell the user:\n${tail(mainDirty, 10)}`);

  const hasRemote = gitTry(root, ['remote', 'get-url', cfg.remote]).code === 0;
  if (hasRemote) git(root, ['pull', '--ff-only', cfg.remote, cfg.mainBranch], cfg.gitConfig);
  const merge = gitTry(root, ['merge', '--ff-only', branch], cfg.gitConfig);
  if (merge.code !== 0) {
    console.log(`MAIN MOVED: fast-forward failed. Run rebase-task.mjs ${slug}, re-run checks, then finish again.\n${tail(merge.err)}`);
    process.exit(3);
  }

  if (hasRemote && !flags['no-push']) {
    const push = gitTry(root, ['push', cfg.remote, cfg.mainBranch]);
    if (push.code !== 0) {
      console.log(`PUSH FAILED (already merged into local ${cfg.mainBranch}):\n${tail(push.err)}`);
      process.exit(5);
    }
  }

  if (!flags.keep) {
    git(root, ['worktree', 'remove', wt]);
    git(root, ['branch', '-d', branch]);
  }
  console.log(`OK merged ${hash} into ${cfg.mainBranch}${hasRemote && !flags['no-push'] ? ' and pushed' : ''}${flags.keep ? '; worktree kept' : '; worktree removed'}`);
});
