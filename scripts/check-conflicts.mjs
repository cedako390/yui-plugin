#!/usr/bin/env node
// Usage: node check-conflicts.mjs --files p1,p2 [--migrations yes|no] [--ports 3000] [--self <slug>]
// Prints OK or a list of facts about collisions with other worktrees. Exit 2 = conflicts.
import { findConflicts, list, loadConfig, mainRoot, parseArgs, run } from './lib.mjs';

await run(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const root = mainRoot();
  const cfg = loadConfig(root);
  const conflicts = findConflicts(
    root,
    cfg,
    { files: list(flags.files), migrations: /^y/i.test(flags.migrations || 'no'), ports: list(flags.ports) },
    flags.self,
  );
  if (!conflicts.length) {
    console.log('OK: no collisions with other worktrees');
    return;
  }
  console.log('CONFLICT:');
  for (const c of conflicts) console.log(`- ${c}`);
  console.log('Verify with ListAgents whether the other session is alive; if unsure, ask it via SendMessage.');
  process.exit(2);
});
