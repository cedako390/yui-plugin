#!/usr/bin/env node
// Split one task between parallel coders working in the same worktree.
//
//   node parts.mjs plan --parts "backend=backend/internal,backend/api;frontend=frontend/src"
//       Checks that the parts own disjoint paths and do not share a conflictPaths entry.
//       Prints the owned paths of each part to paste into the coder briefs. Exit 2 = overlap.
//
//   node parts.mjs verify <worktree> --parts "<same string>"
//       After the coders finished: lists changed files that belong to no part. Exit 1 = out of scope.
//       (Files cannot be attributed to a particular coder in a shared worktree, only to the plan.)
import path from 'node:path';
import {
  changedFiles, die, list, loadConfig, mainRoot, overlaps, parseArgs, run, touches,
} from './lib.mjs';

function parseParts(spec) {
  if (!spec) die('give --parts "name=path1,path2;name2=path3"');
  const parts = spec.split(';').map((chunk) => {
    const [name, paths] = chunk.split('=');
    const owned = list(paths);
    if (!name || !owned.length) die(`bad part "${chunk}", expected name=path1,path2`);
    return { name: name.trim(), paths: owned };
  });
  if (parts.length < 2) die('a split needs at least two parts');
  return parts;
}

await run(async () => {
  const { flags, pos } = parseArgs(process.argv.slice(2));
  const mode = pos[0];
  const parts = parseParts(flags.parts);
  const cfg = loadConfig(mainRoot());

  if (mode === 'plan') {
    const problems = [];
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        for (const a of parts[i].paths) {
          for (const b of parts[j].paths) {
            if (overlaps(a, b)) problems.push(`"${parts[i].name}" (${a}) overlaps "${parts[j].name}" (${b})`);
          }
        }
        for (const p of cfg.conflictPaths) {
          if (touches(parts[i].paths, [p]) && touches(parts[j].paths, [p])) {
            problems.push(`"${parts[i].name}" and "${parts[j].name}" both touch shared path "${p}": run them sequentially`);
          }
        }
      }
    }
    if (problems.length) {
      console.log('OVERLAP: do not run these parts in parallel.');
      for (const p of problems) console.log(`- ${p}`);
      process.exit(2);
    }
    console.log('OK: parts are disjoint. Owned paths for the briefs:');
    for (const p of parts) console.log(`- ${p.name}: ${p.paths.join(', ')} (touch nothing else)`);
    console.log('Parts that depend on each other (a client waiting for a new endpoint) must still run in order.');
    return;
  }

  if (mode === 'verify') {
    const wt = path.resolve(pos[1] || process.cwd());
    const all = parts.flatMap((p) => p.paths);
    const outside = changedFiles(wt, cfg).filter((f) => !all.some((p) => overlaps(f, p)));
    if (!outside.length) {
      console.log('OK: every changed file belongs to a part');
      return;
    }
    console.log('OUT OF SCOPE: changed files that no part owns:');
    for (const f of outside) console.log(`- ${f}`);
    console.log('Send these back to the coder that should not have touched them, or extend the plan on purpose.');
    process.exit(1);
  }

  die('usage: parts.mjs plan|verify ...');
});
