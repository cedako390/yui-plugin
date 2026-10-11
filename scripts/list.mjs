#!/usr/bin/env node
// Usage: node list.mjs
// One line per task worktree: session, start, areas, dirty files, commits ahead of main.
// Check the session names against ListAgents to tell active tasks from abandoned ones.
import { git, loadConfig, mainRoot, otherWorktrees, readCard, run } from './lib.mjs';

await run(async () => {
  const root = mainRoot();
  const cfg = loadConfig(root);
  const wts = otherWorktrees(root);
  if (!wts.length) {
    console.log('no task worktrees');
    return;
  }
  for (const wt of wts) {
    const card = readCard(wt.path, cfg);
    let dirty = '?';
    let ahead = '?';
    try {
      dirty = git(wt.path, ['status', '--porcelain']).split('\n').filter(Boolean).length;
      ahead = git(wt.path, ['rev-list', '--count', `${cfg.mainBranch}..HEAD`]);
    } catch {
      // keep the placeholders
    }
    console.log(
      `${wt.slug} | session: ${card.session} | started: ${card.started || '?'} | areas: ${card.areas.join(',') || '-'} | dirty: ${dirty} | ahead: ${ahead}${card.migrations ? ' | migrations' : ''}${card.exists ? '' : ' | NO CARD'}`,
    );
    if (card.task) console.log(`  ${card.task}`);
  }
});
