#!/usr/bin/env node
/**
 * script-to-markdown
 *
 * Converts every executable/programming script inside the curated `skills/`
 * tree into a Markdown (.md) file and removes the original script.
 *
 * Why: the packaged app ships `skills/` as read-only resources. Raw script
 * files (.py/.sh/.js/…) carry the executable bit and are NOT Mach-O binaries,
 * so macOS codesign cannot sign them — which breaks the signature verification
 * step of the release build. They are also a needless supply-chain/exec
 * surface. We never execute bundled skill scripts; they are reference material.
 * Converting each to a fenced Markdown code block preserves the knowledge
 * (readable, greppable, attributed) while shipping zero executables.
 *
 * Each `foo.py` becomes `foo.py.md` containing a provenance header and the
 * original source in a fenced code block tagged with the right language.
 *
 * Idempotent: re-running skips scripts already converted (a matching `.md`
 * sibling that wraps this file), and never touches existing Markdown.
 *
 * Usage:
 *   node scripts/script-to-markdown.cjs [skillsDir]
 *   node scripts/script-to-markdown.cjs --dry-run
 *
 * Default skillsDir: <repo>/skills
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const dirArg = args.find((a) => !a.startsWith('-'));
const SKILLS_DIR = dirArg ? path.resolve(dirArg) : path.join(ROOT_DIR, 'skills');

// Extension → fenced-code language + human label. Anything here (or any file
// with the executable bit that is clearly a text script) gets converted.
const SCRIPT_LANGS = {
  '.py': 'python',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.rb': 'ruby',
  '.pl': 'perl',
  '.php': 'php',
  '.ps1': 'powershell',
  '.rs': 'rust',
  '.go': 'go',
  '.lua': 'lua',
  '.r': 'r',
};

const SKIP_DIRS = new Set(['node_modules', '.git']);

function isExecutable(filePath) {
  try {
    return (fs.statSync(filePath).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/** Detect a shebang-led text script that has no known extension. */
function hasShebang(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(2);
    fs.readSync(fd, buf, 0, 2, 0);
    fs.closeSync(fd);
    return buf.toString('utf8') === '#!';
  } catch {
    return false;
  }
}

function langFromShebang(filePath) {
  try {
    const firstLine = fs.readFileSync(filePath, 'utf8').split(/\r?\n/, 1)[0] || '';
    if (/python/.test(firstLine)) return 'python';
    if (/(bash|sh|zsh)\b/.test(firstLine)) return 'bash';
    if (/node/.test(firstLine)) return 'javascript';
    if (/ruby/.test(firstLine)) return 'ruby';
    if (/perl/.test(firstLine)) return 'perl';
    if (/php/.test(firstLine)) return 'php';
  } catch {
    /* ignore */
  }
  return 'text';
}

/**
 * Decide whether a file is a programming script we should convert, and return
 * its fenced-code language. Returns null to leave the file untouched.
 */
function scriptLang(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.md') return null; // never touch markdown
  if (SCRIPT_LANGS[ext]) return SCRIPT_LANGS[ext];
  // Extensionless helpers (review-package, sdd-workspace, task-brief, …):
  // convert only when they are executable text scripts (shebang present).
  if (!ext && isExecutable(filePath) && hasShebang(filePath)) {
    return langFromShebang(filePath);
  }
  return null;
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

function buildMarkdown(filePath, lang) {
  const rel = path.relative(SKILLS_DIR, filePath).replace(/\\/g, '/');
  const name = path.basename(filePath);
  const source = fs.readFileSync(filePath, 'utf8').replace(/\s+$/, '');
  // Guard against a stray ``` inside the source closing the fence early.
  const fence = source.includes('```') ? '````' : '```';
  return [
    `# ${name}`,
    '',
    '> **Reference script — not executable.**',
    '> Bundled as Markdown so the logic ships as readable reference without a',
    '> raw executable in the packaged app. Copy it out to run it yourself.',
    `> **Original path:** \`${rel}\``,
    '',
    `${fence}${lang}`,
    source,
    fence,
    '',
  ].join('\n');
}

function main() {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.error(`✗ skills dir not found: ${SKILLS_DIR}`);
    process.exit(1);
  }

  const files = walk(SKILLS_DIR);
  let converted = 0;
  let skipped = 0;

  for (const filePath of files) {
    const lang = scriptLang(filePath);
    if (!lang) continue;

    const mdPath = `${filePath}.md`;
    if (fs.existsSync(mdPath)) {
      // Already converted in a prior run; drop the lingering original.
      if (!DRY_RUN) fs.rmSync(filePath, { force: true });
      skipped++;
      continue;
    }

    const rel = path.relative(SKILLS_DIR, filePath).replace(/\\/g, '/');
    if (DRY_RUN) {
      console.log(`  would convert: ${rel} → ${path.basename(mdPath)} (${lang})`);
      converted++;
      continue;
    }

    fs.writeFileSync(mdPath, buildMarkdown(filePath, lang));
    fs.rmSync(filePath, { force: true });
    console.log(`  ✓ ${rel} → ${path.basename(mdPath)} (${lang})`);
    converted++;
  }

  console.log('');
  console.log(
    `${DRY_RUN ? '[dry-run] ' : ''}script-to-markdown: ${converted} converted, ${skipped} already done`
  );
}

if (require.main === module) {
  main();
}

module.exports = { main, scriptLang };
