#!/usr/bin/env node
/**
 * ehAyeSkills Curation Pipeline
 *
 * Aggregates skills from multiple upstream repos into one canonical,
 * deduplicated, validated repository under Neekware control.
 *
 * Lineage:
 *   Origin repos (community)
 *     alirezarezvani/claude-skills        → actual SKILL.md files
 *     VoltAgent/awesome-agent-skills      → catalog of skill repos (README)
 *
 *   Neekware forks (our stable copies)
 *     neekware/claude-skills              → forked from alirezarezvani
 *     neekware/awesome-agent-skills       → forked from VoltAgent
 *
 *   Output
 *     neekware/ehaye-skills               → curated, validated, deduplicated
 *
 * The script builds from the Neekware forks and additionally checks whether
 * those forks are behind their true upstream origins.
 *
 * Usage:
 *   node scripts/curate.cjs              # full run: sync, extract, push
 *   node scripts/curate.cjs --check      # check only, no push
 *   node scripts/curate.cjs --no-push    # sync + extract, skip push
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Paths ───────────────────────────────────────────────────────────

const ROOT_DIR = path.resolve(__dirname, '..');
const UPSTREAM_DIR = path.join(ROOT_DIR, '.upstream');
const SKILLS_DIR = path.join(ROOT_DIR, 'skills');
const CATALOG_DIR = path.join(ROOT_DIR, 'catalog');
const MARKER_DIR = path.join(ROOT_DIR, '.upstream-markers');

// ── Colors ──────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function info(msg) { console.log(`${c.bold}${c.cyan}ℹ${c.reset} ${msg}`); }
function ok(msg) { console.log(`${c.green}✓${c.reset} ${msg}`); }
function warn(msg) { console.log(`${c.yellow}⚠${c.reset} ${msg}`); }
function err(msg) { console.error(`${c.red}✗${c.reset} ${msg}`); }
function step(msg) { console.log(`\n${c.bold}${c.cyan}── ${msg} ──${c.reset}`); }

// ── Upstream Sources ────────────────────────────────────────────────
// type: "skills" = contains SKILL.md files to copy
//       "catalog" = README-based catalog to parse
// url:    Neekware fork (what we build from)
// origin: true upstream (what the fork was forked from)

const UPSTREAMS = [
  {
    name: 'claude-skills',
    url: 'https://github.com/neekware/claude-skills.git',
    origin: 'https://github.com/alirezarezvani/claude-skills.git',
    type: 'skills',
  },
  {
    name: 'awesome-agent-skills',
    url: 'https://github.com/neekware/awesome-agent-skills.git',
    origin: 'https://github.com/VoltAgent/awesome-agent-skills.git',
    type: 'catalog',
  },
  {
    name: 'superpowers',
    url: 'https://github.com/obra/superpowers.git',
    origin: 'https://github.com/obra/superpowers.git',
    type: 'skills',
    skillsRoot: 'skills',
    bucket: 'superpowers',
    author: 'Jesse Vincent',
    license: 'MIT',
    sourceRepo: 'obra/superpowers',
    copyRootLicense: true,
  },
  {
    // 3rd-party media skills — collected under the "multimedia" bucket
    name: 'remotion-skills',
    url: 'https://github.com/remotion-dev/skills.git',
    origin: 'https://github.com/remotion-dev/skills.git',
    type: 'skills',
    skillsRoot: 'skills',
    bucket: 'multimedia',
    author: 'Remotion',
    license: 'MIT',
    sourceRepo: 'remotion-dev/skills',
  },
  {
    name: 'video-db-skills',
    url: 'https://github.com/video-db/skills.git',
    origin: 'https://github.com/video-db/skills.git',
    type: 'skills',
    skillsRoot: '',
    bucket: 'multimedia',
    author: 'VideoDB',
    license: 'MIT',
    sourceRepo: 'video-db/skills',
  },
  {
    // Flat repo: SKILL.md at root, install script present
    name: 'youtube-clipper-skill',
    url: 'https://github.com/op7418/Youtube-clipper-skill.git',
    origin: 'https://github.com/op7418/Youtube-clipper-skill.git',
    type: 'skills',
    skillsRoot: '',
    bucket: 'multimedia',
    author: 'op7418',
    license: 'MIT',
    sourceRepo: 'op7418/Youtube-clipper-skill',
  },
];

// ── Flags ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const NO_PUSH = args.includes('--no-push');
let CHANGES_DETECTED = false;

// ── Git helpers ─────────────────────────────────────────────────────

function exec(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...opts }).trim();
  } catch (e) {
    if (opts.ignoreError) return '';
    throw e;
  }
}

/** Get the remote HEAD sha for a repo URL (tries main then master). */
function remoteHead(url) {
  try {
    const out = exec(`git ls-remote --heads "${url}" main`);
    if (out) return out.split(/\s+/)[0];
  } catch { /* ignore */ }
  try {
    const out = exec(`git ls-remote --heads "${url}" master`);
    if (out) return out.split(/\s+/)[0];
  } catch { /* ignore */ }
  return '';
}

/** Read the stored SHA marker for an upstream. */
function localMarker(name) {
  const file = path.join(MARKER_DIR, `${name}.sha`);
  try {
    return fs.readFileSync(file, 'utf-8').trim();
  } catch {
    return '';
  }
}

/** Write a SHA marker. */
function writeMarker(name, sha) {
  fs.mkdirSync(MARKER_DIR, { recursive: true });
  fs.writeFileSync(path.join(MARKER_DIR, `${name}.sha`), sha);
}

// ── Phase 1: Check upstreams ────────────────────────────────────────

function checkUpstreams() {
  step('Checking upstreams for changes');

  let anyStale = false;

  for (const up of UPSTREAMS) {
    const remote = remoteHead(up.url);
    const local = localMarker(up.name);

    if (!remote) {
      warn(`${up.name}: could not reach remote`);
      continue;
    }

    if (remote === local) {
      ok(`${up.name}: up to date (${remote.slice(0, 8)})`);
    } else {
      if (!local) {
        info(`${up.name}: first sync → ${remote.slice(0, 8)}`);
      } else {
        info(`${up.name}: stale (local ${local.slice(0, 8)} → remote ${remote.slice(0, 8)})`);
      }
      anyStale = true;
      CHANGES_DETECTED = true;
    }
  }

  if (!anyStale) {
    ok('All upstreams are current — nothing to do');
    if (CHECK_ONLY) process.exit(0);
  }
}

// ── Phase 1b: Check if Neekware forks are behind their origins ─────

function checkForkStaleness() {
  step('Checking Neekware forks against upstream origins');

  let anyBehind = false;

  for (const up of UPSTREAMS) {
    if (!up.origin) continue;

    const forkHead = remoteHead(up.url);
    const originHead = remoteHead(up.origin);

    if (!forkHead) {
      warn(`${up.name}: could not reach Neekware fork`);
      continue;
    }
    if (!originHead) {
      warn(`${up.name}: could not reach upstream origin`);
      continue;
    }

    if (forkHead === originHead) {
      ok(`${up.name}: fork is current with origin (${originHead.slice(0, 8)})`);
    } else {
      anyBehind = true;
      warn(`${up.name}: fork may be behind origin`);
      info(`  fork:   ${forkHead.slice(0, 8)} (neekware/${up.name})`);
      info(`  origin: ${originHead.slice(0, 8)} (${up.origin.replace('https://github.com/', '').replace('.git', '')})`);
      info(`  → sync fork: git fetch upstream && git push origin main`);
    }
  }

  if (!anyBehind) {
    ok('All forks are in sync with their origins');
  }

  return anyBehind;
}

// ── Phase 2: Sync repos ────────────────────────────────────────────

function syncUpstreams() {
  step('Syncing upstream repos');
  fs.mkdirSync(UPSTREAM_DIR, { recursive: true });

  for (const up of UPSTREAMS) {
    const dest = path.join(UPSTREAM_DIR, up.name);
    const gitDir = path.join(dest, '.git');

    if (fs.existsSync(gitDir)) {
      info(`Updating ${up.name}...`);
      try {
        exec(`git fetch --depth=1 origin`, { cwd: dest });
        exec(`git reset --hard FETCH_HEAD`, { cwd: dest });
      } catch {
        warn(`Pull failed for ${up.name}, re-cloning...`);
        fs.rmSync(dest, { recursive: true, force: true });
        exec(`git clone --depth=1 "${up.url}" "${dest}"`);
      }
    } else {
      info(`Cloning ${up.name}...`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      exec(`git clone --depth=1 "${up.url}" "${dest}"`);
    }

    ok(`${up.name} synced`);
  }
}

// ── Phase 3: Extract & validate skills ─────────────────────────────

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function validateSkill(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return false;
  }

  const match = raw.match(FRONTMATTER_RE);
  if (!match) return false;

  const frontmatter = match[1];
  const body = match[2];

  // Must have name and description in frontmatter
  const hasName = /^name\s*:/im.test(frontmatter);
  const hasDesc = /^description\s*:/im.test(frontmatter);
  if (!hasName || !hasDesc) return false;

  // Body must have at least 50 chars of content
  if (body.trim().length < 50) return false;

  return true;
}

/**
 * Extract the `name` field from a SKILL.md frontmatter. Returns '' if absent.
 */
function parseSkillName(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const match = raw.match(FRONTMATTER_RE);
    if (!match) return '';
    const nameMatch = match[1].match(/^name\s*:\s*(.+)$/im);
    if (!nameMatch) return '';
    return nameMatch[1].trim().replace(/^['"]|['"]$/g, '');
  } catch {
    return '';
  }
}

/**
 * Recursively find all files matching a name under a directory.
 */
function findFiles(dir, filename) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      results.push(...findFiles(full, filename));
    } else if (entry.name === filename) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Recursively copy a directory, skipping junk.
 */
function normalizeSkillFrontmatter(raw, metadata = {}) {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return raw;

  const lines = match[1]
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^(\s*)(name|description)(\s*:\s*)(.*?)(\s*)$/);
      if (!m) return line;
      const [, indent, key, sep, value, trailing] = m;
      const trimmed = value.trim();
      if (trimmed.length >= 2) {
        const quote = trimmed[0];
        if ((quote === "'" || quote === '"') && trimmed[trimmed.length - 1] === quote) {
          const inner = trimmed.slice(1, -1);
          if (!inner.includes(':') && !/^[!&*?@`\-|>{\[]/.test(inner)) {
            return `${indent}${key}${sep}${inner}${trailing}`;
          }
        }
      }
      return line;
    });

  if (metadata.license && !lines.some((line) => /^license\s*:/i.test(line))) {
    lines.push(`license: ${metadata.license}`);
  }

  const hasMetadata = lines.some((line) => /^metadata\s*:/i.test(line));
  if (!hasMetadata && (metadata.author || metadata.sourceRepo)) {
    lines.push('metadata:');
    if (metadata.author) lines.push(`  author: ${metadata.author}`);
    if (metadata.sourceRepo) lines.push(`  upstreamRepo: ${metadata.sourceRepo}`);
  }

  return `---\n${lines.join('\n')}\n---\n${match[2]}`;
}

function copyDir(src, dest, metadata = {}) {
  // Skip all dotfiles/dotdirs and node_modules
  const SKIP = new Set(['node_modules']);
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip symlinks
    const stat = fs.lstatSync(srcPath);
    if (stat.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, metadata);
    } else if (entry.name === 'SKILL.md') {
      const raw = fs.readFileSync(srcPath, 'utf-8');
      fs.writeFileSync(destPath, normalizeSkillFrontmatter(raw, metadata));
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Buckets owned by ehAyeSkills (not sourced from any upstream).
// The curate script never deletes these — they are our own skills.
const OWN_BUCKETS = new Set([
  'ehaye',
]);

function extractSkills() {
  step('Extracting and validating skills');

  // Only delete upstream-sourced buckets, preserve our own
  if (fs.existsSync(SKILLS_DIR)) {
    for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
      if (entry.isDirectory() && !OWN_BUCKETS.has(entry.name)) {
        fs.rmSync(path.join(SKILLS_DIR, entry.name), { recursive: true, force: true });
      }
    }
  }
  fs.mkdirSync(SKILLS_DIR, { recursive: true });

  let total = 0, valid = 0, invalid = 0, dupes = 0;
  const seen = new Set();

  for (const up of UPSTREAMS) {
    if (up.type !== 'skills') continue;

    const repoRoot = path.join(UPSTREAM_DIR, up.name);
    const src = path.join(repoRoot, up.skillsRoot || '');
    if (!fs.existsSync(src)) {
      warn(`Upstream ${up.name} not found at ${src}`);
      continue;
    }

    info(`Processing skills from ${up.name}...`);

    const skillFiles = findFiles(src, 'SKILL.md');

    for (const skillFile of skillFiles) {
      total++;
      const skillDir = path.dirname(skillFile);
      const skillName = path.basename(skillDir);

      // Determine bucket from directory structure
      const relative = path.relative(src, skillDir);
      const segments = relative.split(path.sep);

      // Only keep top-level curated skills:
      //   <bucket>/<skill>/SKILL.md
      // For upstreams with a synthetic bucket and skillsRoot, keep:
      //   <skill>/SKILL.md
      // Skip nested helper skills such as:
      //   engineering/agenthub/skills/eval/SKILL.md
      // Skip bucket-level umbrella files such as:
      //   engineering-team/SKILL.md
      let bucket;
      if (up.bucket) {
        if (segments.length !== 1 || segments.includes('skills')) {
          continue;
        }
        bucket = up.bucket;
      } else {
        if (segments.length !== 2 || segments.includes('skills')) {
          continue;
        }
        bucket = segments[0];
      }

      // Validate
      if (!validateSkill(skillFile)) {
        invalid++;
        continue;
      }

      // Prefer the frontmatter name for the output directory when it
      // differs from the source directory name (e.g. video-db's "python"
      // dir contains a skill named "videodb").
      const frontmatterName = parseSkillName(skillFile);
      const outputName = frontmatterName || skillName;

      // Dedupe check
      const key = `${outputName}|${bucket}`;
      if (seen.has(key)) {
        dupes++;
        continue;
      }
      seen.add(key);

      // Copy skill directory (use frontmatter-derived name for the dest dir)
      const destDir = path.join(SKILLS_DIR, bucket, outputName);
      copyDir(skillDir, destDir, up);

      if (up.copyRootLicense) {
        const upstreamLicense = path.join(repoRoot, 'LICENSE');
        const destLicense = path.join(destDir, 'LICENSE');
        if (fs.existsSync(upstreamLicense) && !fs.existsSync(destLicense)) {
          fs.copyFileSync(upstreamLicense, destLicense);
        }
      }

      valid++;
    }
  }

  console.log('');
  ok(`Skills extracted: ${valid} valid, ${invalid} invalid, ${dupes} duplicates (${total} total)`);
}

// ── Phase 4: Parse catalog ─────────────────────────────────────────

// ── Phase 3b: Format skills with prettier ─────────────────────────

function formatSkills() {
  step('Formatting markdown with prettier');

  const prettierBin = path.join(ROOT_DIR, 'node_modules', '.bin', 'prettier');
  if (!fs.existsSync(prettierBin)) {
    warn('prettier not installed — run: npm install');
    return;
  }

  try {
    exec(`"${prettierBin}" --write "skills/**/*.md"`, { cwd: ROOT_DIR });
    ok('Skills formatted');
  } catch (e) {
    warn(`Prettier failed: ${e.message}`);
  }
}

// ── Phase 4: Parse catalog ────────────────────────────────────────

function extractCatalog() {
  step('Building catalog');

  fs.mkdirSync(CATALOG_DIR, { recursive: true });
  const outputFile = path.join(CATALOG_DIR, 'catalog.json');

  // Start with our own curated skills repo + the official Agent Skills
  // spec repo — always first in the catalog, manually maintained.
  const catalog = [
    { repo: 'neekware/ehaye-skills', description: 'ehAye Curated Skills (patent-prep, trademark-prep, and more)' },
    { repo: 'agentskills/agentskills', description: 'Agent Skills — official open standard, specification, and reference library' },
  ];

  // Parse third-party repos from awesome-agent-skills README
  const readme = path.join(UPSTREAM_DIR, 'awesome-agent-skills', 'README.md');
  if (fs.existsSync(readme)) {
    try {
      exec(`node "${path.join(__dirname, 'parse-catalog.cjs')}" "${readme}" "${outputFile}"`);
      const parsed = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
      catalog.push(...parsed);
    } catch (e) {
      err(`Catalog parsing failed: ${e.message}`);
    }
  } else {
    warn('awesome-agent-skills README.md not found — catalog will only contain ehAyeSkills');
  }

  fs.writeFileSync(outputFile, JSON.stringify(catalog, null, 2));
  console.log(`  ${c.green}✓${c.reset} catalog.json (${catalog.length} repos)`);
}

// ── Phase 5: Update markers ────────────────────────────────────────

function updateMarkers() {
  step('Updating upstream markers');

  for (const up of UPSTREAMS) {
    const remote = remoteHead(up.url);
    if (remote) {
      writeMarker(up.name, remote);
      ok(`${up.name} → ${remote.slice(0, 8)}`);
    }
  }
}

// ── Phase 6: Commit & push ─────────────────────────────────────────

function commitAndPush() {
  step('Committing changes');

  try {
    exec(`git add skills/ catalog/ .upstream-markers/`, { cwd: ROOT_DIR });
  } catch {
    // git add can fail if dirs don't exist yet — ok
  }

  const diffOutput = exec(`git diff --cached --quiet`, { cwd: ROOT_DIR, ignoreError: true });
  // If exit 0, no changes
  try {
    execSync('git diff --cached --quiet', { cwd: ROOT_DIR, stdio: 'pipe' });
    ok('No changes to commit');
    return;
  } catch {
    // Non-zero exit = there ARE changes, proceed
  }

  const timestamp = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  const skillCount = findFiles(SKILLS_DIR, 'SKILL.md').length;

  const sourceLines = UPSTREAMS.map(up => {
    const sha = localMarker(up.name);
    return `  - ${up.name} (${sha.slice(0, 8)})`;
  }).join('\n');

  const commitMsg = `chore: curate skills — ${skillCount} skills @ ${timestamp}\n\nSources:\n${sourceLines}`;

  exec(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd: ROOT_DIR });
  ok('Committed');

  if (NO_PUSH) {
    warn('Skipping push (--no-push)');
    return;
  }

  info('Pushing to origin...');
  exec('git push origin HEAD', { cwd: ROOT_DIR });
  ok('Pushed to neekware/ehaye-skills');
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  console.log(`\n${c.bold}${c.cyan}🧩 ehAyeSkills Curation Pipeline${c.reset}`);
  console.log('════════════════════════════════════');

  // Verify git is available
  try {
    exec('git --version');
  } catch {
    err('Git is not installed or not in PATH.');
    err('Install Git: https://git-scm.com/downloads');
    process.exit(1);
  }

  const forksBehind = checkForkStaleness();
  checkUpstreams();

  if (CHECK_ONLY) {
    if (CHANGES_DETECTED || forksBehind) {
      console.log('');
      if (forksBehind) warn('Neekware forks are behind their upstream origins — sync forks first');
      if (CHANGES_DETECTED) warn('Forks have changes not yet curated — run without --check to sync');
      process.exit(1);
    }
    process.exit(0);
  }

  syncUpstreams();
  extractSkills();
  formatSkills();
  extractCatalog();
  updateMarkers();
  commitAndPush();

  console.log('');
  ok('Curation complete ✓');
  console.log('');
}

main();
