#!/usr/bin/env node
// Usage: node doctor.mjs
// Validates the environment and .orchestrator.json of the current project.
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE, DEFAULTS, gitTry, mainRoot, readJson, run, validateConfig } from './lib.mjs';

await run(async () => {
  let bad = 0;
  const ok = (m) => console.log(`OK   ${m}`);
  const no = (m) => {
    bad++;
    console.log(`FAIL ${m}`);
  };

  const major = Number(process.versions.node.split('.')[0]);
  (major >= 18 ? ok : no)(`node ${process.versions.node} (need >= 18)`);

  const root = mainRoot();
  ok(`git repository: ${root}`);

  const file = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(file)) {
    no(`${CONFIG_FILE} missing; run /orchestrator:init`);
    process.exit(1);
  }
  let cfg;
  try {
    cfg = { ...DEFAULTS, ...readJson(file) };
    ok(`${CONFIG_FILE} parses`);
  } catch (e) {
    no(`${CONFIG_FILE} is not valid JSON: ${e.message}`);
    process.exit(1);
  }

  for (const p of validateConfig(cfg, root)) no(p);
  (gitTry(root, ['rev-parse', '--verify', cfg.mainBranch]).code === 0 ? ok : no)(`branch "${cfg.mainBranch}" exists`);
  if (gitTry(root, ['remote', 'get-url', cfg.remote]).code === 0) ok(`remote "${cfg.remote}" configured`);
  else console.log(`WARN no remote "${cfg.remote}": finish-task will merge locally and skip the push`);

  const autocrlf = gitTry(root, ['config', 'core.autocrlf']).out;
  if (autocrlf === 'true' && !cfg.gitConfig.includes('core.autocrlf=false')) {
    console.log('WARN core.autocrlf=true on this machine; consider "gitConfig": ["core.autocrlf=false"] and "fixLineEndings": true');
  }
  console.log(bad ? `${bad} problem(s)` : 'all good');
  if (bad) process.exit(1);
});
