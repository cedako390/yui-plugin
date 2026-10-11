// Shared helpers for the orchestrator scripts. Node >= 18, no dependencies.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const CONFIG_FILE = '.orchestrator.json';

export const DEFAULTS = {
  mainBranch: 'main',
  remote: 'origin',
  worktreeDir: '../{repo}.worktrees',
  branchPrefix: 'task/',
  gitConfig: [],
  fixLineEndings: false,
  taskCard: '.task.md',
  checkTimeoutSec: 900,
  areas: {},
  conflictPaths: [],
  sensitivePaths: [],
  sharedResources: [],
};

export function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

// Run a script body and turn thrown errors into a one-line failure.
export async function run(fn) {
  try {
    await fn();
  } catch (e) {
    die(`ERROR: ${e.message}`);
  }
}

export function parseArgs(argv, boolFlags = []) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      pos.push(a);
      continue;
    }
    const key = a.slice(2);
    if (boolFlags.includes(key)) {
      flags[key] = true;
    } else {
      const v = argv[++i];
      if (v === undefined) die(`--${key} needs a value`);
      flags[key] = v;
    }
  }
  return { flags, pos };
}

export function list(s) {
  return (s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function gitTry(cwd, args, cfg = []) {
  const full = ['-c', 'core.quotepath=false', ...cfg.flatMap((c) => ['-c', c]), ...args];
  const r = spawnSync('git', full, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

export function git(cwd, args, cfg = []) {
  const r = gitTry(cwd, args, cfg);
  if (r.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed (${r.code}): ${r.err || r.out}`);
  }
  return r.out;
}

// The main checkout, even when called from inside a worktree.
export function mainRoot(cwd = process.cwd()) {
  const r = gitTry(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (r.code !== 0) die('Not inside a git repository');
  return path.dirname(path.resolve(r.out));
}

// Tolerates a UTF-8 BOM, which some Windows tools add.
export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

export function loadConfig(root) {
  const file = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(file)) {
    die(`${CONFIG_FILE} not found in ${root}. Run the orchestrator init skill (/yui:init) first.`);
  }
  let user;
  try {
    user = readJson(file);
  } catch (e) {
    die(`${CONFIG_FILE} is not valid JSON: ${e.message}`);
  }
  return { ...DEFAULTS, ...user };
}

export function validateConfig(cfg, root) {
  const problems = [];
  const arr = ['gitConfig', 'conflictPaths', 'sensitivePaths', 'sharedResources'];
  for (const k of arr) {
    if (!Array.isArray(cfg[k])) problems.push(`${k} must be an array`);
  }
  if (typeof cfg.areas !== 'object' || cfg.areas === null || Array.isArray(cfg.areas)) {
    problems.push('areas must be an object');
    return problems;
  }
  if (Object.keys(cfg.areas).length === 0) problems.push('areas is empty: no checks will run');
  for (const [name, a] of Object.entries(cfg.areas)) {
    if (typeof a.path !== 'string') problems.push(`areas.${name}.path must be a string`);
    else if (!fs.existsSync(path.join(root, a.path))) problems.push(`areas.${name}.path "${a.path}" does not exist`);
    if (a.checks !== undefined && !Array.isArray(a.checks)) problems.push(`areas.${name}.checks must be an array`);
    if (a.setup !== undefined && typeof a.setup !== 'string') problems.push(`areas.${name}.setup must be a string`);
  }
  return problems;
}

export function worktreePath(root, cfg, slug) {
  const dir = cfg.worktreeDir.replace('{repo}', path.basename(root));
  return path.resolve(root, dir, slug);
}

export function branchName(cfg, slug) {
  return `${cfg.branchPrefix}${slug}`;
}

export function checkSlug(slug) {
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    die('slug must be short kebab-case: lowercase letters, digits and dashes');
  }
}

// Other worktrees of the repo (everything except the main checkout).
export function otherWorktrees(root) {
  const out = git(root, ['worktree', 'list', '--porcelain']);
  const result = [];
  for (const block of out.split(/\n\s*\n/)) {
    const wt = {};
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) wt.path = path.resolve(line.slice(9));
      else if (line.startsWith('branch ')) wt.branch = line.slice(7).replace('refs/heads/', '');
    }
    if (wt.path && wt.path !== path.resolve(root)) result.push({ ...wt, slug: path.basename(wt.path) });
  }
  return result;
}

export function readCard(wtPath, cfg) {
  const file = path.join(wtPath, cfg.taskCard);
  const card = { exists: false, session: 'unknown', started: '', areas: [], files: [], migrations: false, ports: [], task: '' };
  if (!fs.existsSync(file)) return card;
  card.exists = true;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([a-z]+):\s*(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'session' || k === 'started' || k === 'task') card[k] = v.trim();
    else if (k === 'areas' || k === 'files') card[k] = list(v);
    else if (k === 'migrations') card.migrations = /^yes/i.test(v.trim());
    else if (k === 'ports') card.ports = /^none/i.test(v.trim()) ? [] : list(v);
  }
  return card;
}

export function mergeBase(wt, cfg) {
  return git(wt, ['merge-base', cfg.mainBranch, 'HEAD']);
}

// Files this worktree has changed relative to where it branched off, committed or not.
export function changedFiles(wt, cfg) {
  const tracked = git(wt, ['diff', '--name-only', mergeBase(wt, cfg)]).split('\n');
  const untracked = git(wt, ['ls-files', '--others', '--exclude-standard']).split('\n');
  return [...new Set([...tracked, ...untracked].filter(Boolean))];
}

const norm = (p) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');

export function overlaps(a, b) {
  const x = norm(a);
  const y = norm(b);
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

export function touches(paths, patterns) {
  return paths.some((p) => patterns.some((q) => overlaps(p, q)));
}

// Facts about collisions with other active worktrees. The orchestrator decides what to do.
export function findConflicts(root, cfg, mine, selfSlug) {
  const found = [];
  for (const wt of otherWorktrees(root)) {
    if (wt.slug === selfSlug) continue;
    const card = readCard(wt.path, cfg);
    if (!card.exists) continue; // not an orchestrator task (e.g. an IDE scratch workspace)
    let theirs = card.files;
    try {
      theirs = [...new Set([...card.files, ...changedFiles(wt.path, cfg)])];
    } catch {
      // a broken worktree still has its card
    }
    const who = `${wt.slug} (session: ${card.session})`;

    for (const f of mine.files) {
      const hit = theirs.find((t) => overlaps(f, t));
      if (hit) found.push(`files: "${f}" overlaps "${hit}" in ${who}`);
    }
    if (mine.migrations && card.migrations) found.push(`migrations: both tasks add migrations; other: ${who}`);
    for (const p of cfg.conflictPaths) {
      if (touches(mine.files, [p]) && touches(theirs, [p])) found.push(`shared path "${p}" touched by both; other: ${who}`);
    }
    for (const port of mine.ports || []) {
      if (card.ports.includes(port)) found.push(`port ${port} is used by ${who}`);
    }
  }
  return [...new Set(found)];
}

// Run a shell command; returns { ok, out, ms }.
export function sh(command, cwd, timeoutSec = 900) {
  const t0 = Date.now();
  const r = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    timeout: timeoutSec * 1000,
    maxBuffer: 256 * 1024 * 1024,
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const timedOut = r.error && r.error.code === 'ETIMEDOUT';
  return { ok: r.status === 0 && !r.error, out: timedOut ? `${out}\nTIMEOUT after ${timeoutSec}s` : out, ms: Date.now() - t0 };
}

export function tail(text, n = 25) {
  return text.trimEnd().split('\n').slice(-n).join('\n');
}

export function stamp(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
}
