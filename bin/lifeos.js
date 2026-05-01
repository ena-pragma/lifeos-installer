#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_REPO = 'https://github.com/ena-pragma/lifeos.git';
const DEFAULT_CHANNEL = 'stable';
const DEFAULT_DIR = path.join(os.homedir(), '.lifeos', 'app');
const DEFAULT_LABEL = 'com.enapragma.lifeos';
const DEFAULT_PORT = '3333';

function usage() {
  console.log(`LifeOS installer

Usage:
  lifeos install [--channel stable|main] [--dir <path>] [--port 3333]
  lifeos up      [--channel stable|main] [--dir <path>] [--port 3333]
  lifeos doctor  [--dir <path>] [--port 3333]
  lifeos open    [--port 3333]
  lifeos path
  lifeos uninstall [--dir <path>] [--keep-config]

Quick start:
  npx @enapragma/lifeos install

Defaults:
  repo:    ${DEFAULT_REPO}
  channel: ${DEFAULT_CHANNEL}
  dir:     ${DEFAULT_DIR}
`);
}

function parse(argv) {
  const args = argv.slice(2);
  const opts = {
    command: 'install',
    repo: process.env.LIFEOS_REPO || DEFAULT_REPO,
    channel: process.env.LIFEOS_CHANNEL || DEFAULT_CHANNEL,
    dir: process.env.LIFEOS_INSTALL_DIR || DEFAULT_DIR,
    port: process.env.PORT || DEFAULT_PORT,
    label: process.env.LIFEOS_LAUNCHD_LABEL || DEFAULT_LABEL,
    keepConfig: false,
    skipDoctor: false,
  };
  if (args[0] && !args[0].startsWith('-')) opts.command = args.shift();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') opts.command = 'help';
    else if (arg === '--repo') opts.repo = needValue(args, ++i, arg);
    else if (arg === '--channel' || arg === '--branch') opts.channel = needValue(args, ++i, arg);
    else if (arg === '--dir') opts.dir = expandHome(needValue(args, ++i, arg));
    else if (arg === '--port') opts.port = needValue(args, ++i, arg);
    else if (arg === '--label') opts.label = needValue(args, ++i, arg);
    else if (arg === '--keep-config') opts.keepConfig = true;
    else if (arg === '--skip-doctor') opts.skipDoctor = true;
    else die(`Unknown option: ${arg}`);
  }
  opts.dir = expandHome(opts.dir);
  return opts;
}

function needValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('-')) die(`${flag} needs a value`);
  return value;
}

function expandHome(value) {
  const s = String(value || '');
  if (s === '~') return os.homedir();
  if (s.startsWith('~/')) return path.join(os.homedir(), s.slice(2));
  return path.resolve(s);
}

function step(text) { console.log(`\n→ ${text}`); }
function ok(text) { console.log(`  ✓ ${text}`); }
function warn(text) { console.log(`  ⚠ ${text}`); }
function die(text) { console.error(`  ✗ ${text}`); process.exit(1); }

function run(command, args, opts = {}) {
  const pretty = [command].concat(args || []).join(' ');
  if (opts.print !== false) console.log(`  $ ${pretty}`);
  const res = spawnSync(command, args || [], {
    cwd: opts.cwd || process.cwd(),
    env: Object.assign({}, process.env, opts.env || {}),
    stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });
  if (res.error) {
    if (opts.optional) return res;
    die(`${pretty} failed: ${res.error.message}`);
  }
  if (res.status !== 0 && !opts.optional) die(`${pretty} exited ${res.status}`);
  return res;
}

function has(command) {
  const res = run('bash', ['-lc', `command -v ${shellQuote(command)}`], { capture: true, print: false, optional: true });
  return res.status === 0 && String(res.stdout || '').trim();
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function preflight() {
  step('Checking prerequisites');
  const missing = [];
  for (const cmd of ['git', 'node', 'npm', 'tmux']) {
    if (has(cmd)) ok(`${cmd} found`);
    else missing.push(cmd);
  }
  if (missing.length) {
    die(`Missing ${missing.join(', ')}. Install with: brew install ${missing.join(' ')}`);
  }
  if (has('pi')) ok('pi found');
  else warn('pi not found. bin/up will try to install pi.dev, or terminals may not auto-launch an agent.');
  if (has('gh')) {
    const gh = run('gh', ['auth', 'status', '-h', 'github.com'], { capture: true, print: false, optional: true });
    if (gh.status === 0) ok('GitHub auth found');
    else warn('GitHub auth is missing or expired. Private repo installs need: gh auth login -h github.com && gh auth setup-git');
  }
}

function gitValue(cwd, args) {
  const res = run('git', args, { cwd, capture: true, print: false, optional: true });
  return res.status === 0 ? String(res.stdout || '').trim() : '';
}

function gitSummary(cwd) {
  const branch = gitValue(cwd, ['branch', '--show-current']) || 'detached';
  const rev = gitValue(cwd, ['rev-parse', '--short', 'HEAD']) || 'unknown';
  return `${branch}@${rev}`;
}

const GENERATED_FILES = new Set(['.lifeos-heartbeat.json']);

function dirtyFiles(cwd) {
  const res = run('git', ['status', '--porcelain'], { cwd, capture: true, print: false, optional: true });
  if (res.status !== 0) return [];
  return String(res.stdout || '')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line => {
      const file = line.slice(3).trim();
      return file.includes(' -> ') ? file.split(' -> ').pop().trim() : file;
    });
}

function privateRepoHelp() {
  return 'Could not access ena-pragma/lifeos. Make sure this machine has org repo access, then run: gh auth login -h github.com && gh auth setup-git';
}

function prepareUpdateWorktree(cwd) {
  const dirty = dirtyFiles(cwd);
  if (!dirty.length) return;
  const unsafe = dirty.filter(file => !GENERATED_FILES.has(file));
  if (unsafe.length) {
    die(`LifeOS has local changes I will not overwrite: ${unsafe.join(', ')}. Commit, stash, or remove them, then rerun \`lifeos up\`.`);
  }
  warn(`Discarding generated runtime changes before update: ${dirty.join(', ')}`);
  for (const file of dirty) {
    run('git', ['restore', '--staged', '--worktree', '--', file], { cwd, optional: true, print: false });
    const full = path.join(cwd, file);
    if (fs.existsSync(full) && gitValue(cwd, ['ls-files', '--others', '--exclude-standard', '--', file])) {
      fs.rmSync(full, { force: true });
    }
  }
}

function ensureSource(opts) {
  if (!fs.existsSync(opts.dir)) {
    step(`Cloning LifeOS ${opts.channel}`);
    fs.mkdirSync(path.dirname(opts.dir), { recursive: true });
    const cloned = run('git', ['clone', '--branch', opts.channel, opts.repo, opts.dir], { optional: true });
    if (cloned.status !== 0) {
      die(privateRepoHelp());
    }
    ok(`cloned ${gitSummary(opts.dir)} to ${opts.dir}`);
    return { cloned: true, before: '', after: gitSummary(opts.dir) };
  }

  if (!fs.existsSync(path.join(opts.dir, '.git'))) {
    die(`${opts.dir} exists but is not a git checkout. Move it aside or pass --dir.`);
  }

  const before = gitSummary(opts.dir);
  step(`Updating LifeOS ${opts.channel}`);
  ok(`current: ${before}`);
  run('git', ['remote', 'set-url', 'origin', opts.repo], { cwd: opts.dir, optional: true, print: false });
  prepareUpdateWorktree(opts.dir);
  const fetched = run('git', ['fetch', 'origin', opts.channel, '--tags'], { cwd: opts.dir, optional: true });
  if (fetched.status !== 0) die(privateRepoHelp());
  run('git', ['checkout', opts.channel], { cwd: opts.dir });
  run('git', ['pull', '--ff-only', 'origin', opts.channel], { cwd: opts.dir });
  const after = gitSummary(opts.dir);
  ok(before === after ? `already current: ${after}` : `updated: ${before} → ${after}`);
  return { cloned: false, before, after };
}

function lifeosEnv(opts) {
  return {
    PORT: String(opts.port),
    LIFEOS_LAUNCHD_LABEL: opts.label,
  };
}

function install(opts) {
  preflight();
  const source = ensureSource(opts);
  step(source.cloned ? 'Starting LifeOS' : 'Restarting LifeOS');
  run('bash', ['bin/up'], { cwd: opts.dir, env: lifeosEnv(opts) });
  if (!opts.skipDoctor) doctor(opts);
  console.log(`\nLifeOS is ready: http://127.0.0.1:${opts.port}`);
  console.log(`Installed source: ${source.after}`);
  console.log('Next: run `lifeos open` or open the URL in your browser.');
}

function doctor(opts) {
  step('Running doctor');
  run('npm', ['run', 'doctor'], {
    cwd: opts.dir,
    env: Object.assign(lifeosEnv(opts), { LIFEOS_URL: `http://127.0.0.1:${opts.port}` }),
  });
}

function openLifeOS(opts) {
  run('open', [`http://127.0.0.1:${opts.port}`], { print: false, optional: true });
  console.log(`Opened http://127.0.0.1:${opts.port}`);
}

function uninstall(opts) {
  step('Stopping LifeOS');
  const plist = path.join(os.homedir(), 'Library', 'LaunchAgents', `${opts.label}.plist`);
  run('launchctl', ['bootout', `gui/${process.getuid()}`, plist], { optional: true });
  if (fs.existsSync(plist)) fs.rmSync(plist, { force: true });
  run('pkill', ['-f', path.join(opts.dir, 'server.js')], { optional: true, print: false });
  if (fs.existsSync(opts.dir)) {
    step(`Removing ${opts.dir}`);
    fs.rmSync(opts.dir, { recursive: true, force: true });
  }
  if (!opts.keepConfig) warn('Kept ~/.lifeos config/cockpit data by default. Run `rm -rf ~/.lifeos` for a full wipe.');
  ok('uninstalled');
}

function main() {
  const opts = parse(process.argv);
  if (opts.command === 'help' || opts.command === '--help') return usage();
  if (opts.command === 'install' || opts.command === 'up') return install(opts);
  if (opts.command === 'doctor') return doctor(opts);
  if (opts.command === 'open') return openLifeOS(opts);
  if (opts.command === 'path') return console.log(opts.dir);
  if (opts.command === 'uninstall') return uninstall(opts);
  die(`Unknown command: ${opts.command}`);
}

main();
