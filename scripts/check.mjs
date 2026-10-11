#!/usr/bin/env node
// Usage: node check.mjs <worktree> [--areas a,b]
// Runs the configured checks of every touched area (or the listed ones). Prints one line
// per check; on failure only the tail of the output. Full logs go to a temp file.
// Exit 1 = some check failed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  changedFiles, die, list, loadConfig, mainRoot, overlaps, parseArgs, run, sh, tail,
} from './lib.mjs';

await run(async () => {
  const { flags, pos } = parseArgs(process.argv.slice(2));
  const wt = path.resolve(pos[0] || process.cwd());
  const cfg = loadConfig(mainRoot(wt));
  const names = Object.keys(cfg.areas);
  if (!names.length) die('no areas configured in .orchestrator.json');

  let areas = list(flags.areas);
  if (!areas.length) {
    const changed = changedFiles(wt, cfg);
    areas = names.filter((n) => changed.some((f) => cfg.areas[n].path === '.' || overlaps(f, cfg.areas[n].path)));
    if (!areas.length) {
      console.log('RESULT: PASS (no files changed in any configured area)');
      return;
    }
  }

  const log = path.join(os.tmpdir(), `orchestrator-check-${path.basename(wt)}.log`);
  fs.writeFileSync(log, '');
  let failed = false;
  for (const a of areas) {
    const area = cfg.areas[a];
    if (!area) die(`unknown area "${a}"`);
    for (const cmd of area.checks || []) {
      const r = sh(cmd, path.join(wt, area.path), cfg.checkTimeoutSec);
      fs.appendFileSync(log, `\n===== [${a}] ${cmd} (${r.ok ? 'pass' : 'FAIL'}) =====\n${r.out}`);
      console.log(`${r.ok ? 'PASS' : 'FAIL'} [${a}] ${cmd} (${Math.round(r.ms / 1000)}s)`);
      if (!r.ok) {
        console.log(tail(r.out));
        failed = true;
        break; // later checks of this area are noise after a failure
      }
    }
  }
  console.log(`RESULT: ${failed ? 'FAIL' : 'PASS'} (areas: ${areas.join(', ')}; full log: ${log})`);
  if (failed) process.exit(1);
});
