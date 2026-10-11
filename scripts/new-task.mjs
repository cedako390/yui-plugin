#!/usr/bin/env node
// Usage: node new-task.mjs <slug> --task "<text>" --areas a,b --files p1,p2
//          [--migrations yes|no] [--ports 3000,8080] [--session <name>]
// Checks for collisions with other worktrees, creates branch + worktree, installs
// dependencies, writes the task card. Exit 2 = conflict (nothing created).
import fs from 'node:fs';
import path from 'node:path';
import {
  branchName, checkSlug, die, findConflicts, git, gitTry, list, loadConfig, mainRoot,
  parseArgs, run, sh, stamp, tail, touches, worktreePath,
} from './lib.mjs';

await run(async () => {
  const { flags, pos } = parseArgs(process.argv.slice(2));
  const slug = pos[0];
  checkSlug(slug);
  const root = mainRoot();
  const cfg = loadConfig(root);
  const areas = list(flags.areas);
  const files = list(flags.files);
  const mine = {
    files,
    migrations: /^y/i.test(flags.migrations || 'no'),
    ports: list(flags.ports),
  };
  for (const a of areas) if (!cfg.areas[a]) die(`unknown area "${a}"; configured: ${Object.keys(cfg.areas).join(', ') || 'none'}`);

  const dirty = git(root, ['status', '--porcelain', '--untracked-files=no']);
  if (dirty) console.log(`WARN: main checkout has uncommitted tracked changes:\n${tail(dirty, 10)}`);

  const conflicts = findConflicts(root, cfg, mine, slug);
  if (conflicts.length) {
    console.log('CONFLICT: nothing was created. Split the task or refuse the conflicting part.');
    for (const c of conflicts) console.log(`- ${c}`);
    process.exit(2);
  }

  const wt = worktreePath(root, cfg, slug);
  const branch = branchName(cfg, slug);
  if (fs.existsSync(wt)) die(`worktree already exists: ${wt}`);
  git(root, ['worktree', 'add', '-b', branch, wt, cfg.mainBranch], cfg.gitConfig);

  if (cfg.fixLineEndings) {
    git(wt, ['rm', '-r', '--cached', '-q', '.'], cfg.gitConfig);
    git(wt, ['reset', '--hard', '-q', 'HEAD'], cfg.gitConfig);
  }
  const status = git(wt, ['status', '--porcelain']);
  if (status) die(`new worktree is not clean:\n${tail(status, 10)}`);

  // The card must never be committed.
  const exclude = path.resolve(wt, git(wt, ['rev-parse', '--git-path', 'info/exclude']));
  const current = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
  if (!current.split('\n').includes(cfg.taskCard)) {
    fs.mkdirSync(path.dirname(exclude), { recursive: true });
    fs.appendFileSync(exclude, `${current && !current.endsWith('\n') ? '\n' : ''}${cfg.taskCard}\n`);
  }

  for (const a of areas) {
    const setup = cfg.areas[a].setup;
    if (!setup) continue;
    const r = sh(setup, path.join(wt, cfg.areas[a].path), cfg.checkTimeoutSec);
    if (!r.ok) {
      console.log(`SETUP FAILED in area "${a}" (${setup}); worktree kept at ${wt}\n${tail(r.out)}`);
      process.exit(4);
    }
    console.log(`setup ok: ${a} (${setup}, ${Math.round(r.ms / 1000)}s)`);
  }

  const card = [
    `# ${slug}`,
    `session: ${flags.session || 'unknown'}`,
    `started: ${stamp()}`,
    `task: ${(flags.task || '').replace(/\s+/g, ' ').trim()}`,
    `areas: ${areas.join(', ')}`,
    `files: ${files.join(', ')}`,
    `migrations: ${mine.migrations ? 'yes' : 'no'}`,
    `ports: ${mine.ports.length ? mine.ports.join(', ') : 'none'}`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(wt, cfg.taskCard), card);

  console.log(`OK worktree: ${wt}`);
  console.log(`branch: ${branch}`);
  console.log(`sensitive: ${touches(files, cfg.sensitivePaths) ? 'yes (use the stronger reviewer model)' : 'no'}`);
  if (cfg.sharedResources.length) console.log(`shared resources: ${cfg.sharedResources.join(' | ')}`);
  if (gitTry(root, ['remote']).out === '') console.log('note: repo has no remote; finish-task will skip push');
});
