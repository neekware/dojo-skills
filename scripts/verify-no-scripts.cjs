#!/usr/bin/env node
/**
 * verify-no-scripts
 *
 * Fails (exit 1) if any programming script or executable file is present in a
 * skills tree. Skills ship as read-only Markdown reference material; a raw
 * script (.py/.sh/.js/…) or any executable-bit file must NEVER ship because:
 *   1. macOS codesign cannot sign non-Mach-O text scripts, so the release
 *      signature-verification step fails the whole build.
 *   2. Shipping executable code we never run is a needless supply-chain surface.
 *
 * This is the guard that proves `script-to-markdown` did its job and that no
 * upstream change or converter bug silently reintroduced executables. Run it on
 * both the curated `skills/` tree and the exported `artifacts/bundle/skills/`.
 *
 * Usage:
 *   node scripts/verify-no-scripts.cjs [skillsDir]
 *
 * Default skillsDir: <repo>/skills
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const dirArg = args.find((a) => !a.startsWith('-'));
const SKILLS_DIR = dirArg ? path.resolve(dirArg) : path.join(ROOT_DIR, 'skills');

// Programming/script extensions that must never ship. Markdown (.md), data,
// text, and docs are fine — only source/executable code is forbidden.
const FORBIDDEN_EXTS = new Set([
  '.py', '.pyc', '.pyo', '.pyw',
  '.sh', '.bash', '.zsh', '.fish',
  '.js', '.mjs', '.cjs', '.jsx',
  '.ts', '.tsx',
  '.rb', '.pl', '.pm', '.php', '.php5',
  '.ps1', '.psm1', '.bat', '.cmd',
  '.rs', '.go', '.lua', '.r',
  '.c', '.h', '.cpp', '.cc', '.hpp',
  '.java', '.kt', '.swift', '.scala',
  '.exe', '.dll', '.dylib', '.so', '.bin', '.o', '.a',
]);

const SKIP_DIRS = new Set(['node_modules', '.git']);

function isExecutable(filePath) {
  try {
    return (fs.statSync(filePath).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.error(`✗ verify-no-scripts: dir not found: ${SKILLS_DIR}`);
    process.exit(1);
  }

  const files = walk(SKILLS_DIR);
  const offenders = [];

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const rel = path.relative(SKILLS_DIR, filePath).replace(/\\/g, '/');

    if (FORBIDDEN_EXTS.has(ext)) {
      offenders.push({ rel, reason: `forbidden extension ${ext}` });
      continue;
    }
    // Extensionless (or unknown-extension) executable-bit files are scripts too.
    if (isExecutable(filePath)) {
      offenders.push({ rel, reason: 'executable bit set' });
    }
  }

  if (offenders.length > 0) {
    console.error(
      `\n✗ verify-no-scripts: ${offenders.length} forbidden file(s) in ${SKILLS_DIR}`
    );
    for (const o of offenders) {
      console.error(`   ✗ ${o.rel}  (${o.reason})`);
    }
    console.error(
      '\n   Skills must ship as Markdown only. Run script-to-markdown, or remove these files.'
    );
    process.exit(1);
  }

  console.log(
    `✓ verify-no-scripts: no scripts/executables in ${path.relative(ROOT_DIR, SKILLS_DIR) || SKILLS_DIR} (${files.length} files scanned)`
  );
}

if (require.main === module) {
  main();
}

module.exports = { main };
