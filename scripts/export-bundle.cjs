#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_SKILLS_DIR = path.join(ROOT, 'skills');
const OUTPUT_DIR = path.join(ROOT, 'artifacts', 'bundle');
const OUTPUT_SKILLS_DIR = path.join(OUTPUT_DIR, 'skills');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');
const README_PATH = path.join(OUTPUT_DIR, 'README.md');
const ROOT_PACKAGE = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const DEFAULT_LICENSE = ROOT_PACKAGE.license || 'UNKNOWN';
const KEEP_FILE_NAMES = new Set(['LICENSE', 'LICENSE.md', 'NOTICE', 'NOTICE.md', 'COPYING']);

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function mkdirp(target) {
  fs.mkdirSync(target, { recursive: true });
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function titleCaseSlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };

  const lines = match[1].split(/\r?\n/);
  const frontmatter = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      i += 1;
      continue;
    }

    const key = keyMatch[1];
    const value = keyMatch[2];
    if (value === '') {
      const nested = {};
      i += 1;
      while (i < lines.length) {
        const nestedLine = lines[i];
        const nestedMatch = nestedLine.match(/^\s{2,}([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!nestedMatch) break;
        nested[nestedMatch[1]] = nestedMatch[2].replace(/^['\"]|['\"]$/g, '');
        i += 1;
      }
      frontmatter[key] = nested;
      continue;
    }

    frontmatter[key] = value.replace(/^['\"]|['\"]$/g, '');
    i += 1;
  }

  return { frontmatter, body: match[2] };
}

function inferCreator(frontmatter, bucket) {
  const metadata = frontmatter.metadata || {};
  const author = metadata.author || frontmatter.author || frontmatter.authors;
  if (author && String(author).trim()) {
    return String(author).trim();
  }
  return titleCaseSlug(bucket);
}

function inferNamespace(frontmatter, bucket) {
  const metadata = frontmatter.metadata || {};
  const namespace = metadata.source || metadata.repo || metadata.company || frontmatter.source;
  if (namespace && String(namespace).trim()) {
    return slugify(namespace);
  }
  return slugify(bucket);
}

function inferLicense(frontmatter) {
  const metadata = frontmatter.metadata || {};
  return frontmatter.license || metadata.license || DEFAULT_LICENSE;
}

function licenseFilesFor(skillDir) {
  return fs
    .readdirSync(skillDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && KEEP_FILE_NAMES.has(entry.name))
    .map((entry) => entry.name);
}

function collectSkillDirectories(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(full, 'SKILL.md');
    if (fs.existsSync(skillFile)) {
      acc.push(full);
    }
    const nestedSkills = path.join(full, 'skills');
    if (fs.existsSync(nestedSkills) && fs.statSync(nestedSkills).isDirectory()) {
      collectSkillDirectories(nestedSkills, acc);
    }
  }
  return acc;
}

function buildHeader({ creator, license, sourceRepo, sourceBucket, originalPath }) {
  return [
    '> **Creator:** ' + creator,
    '> **License:** ' + license,
    '> **Source Repo:** `' + sourceRepo + '`',
    '> **Source Bucket:** `' + sourceBucket + '`',
    '> **Original Path:** `' + originalPath.replace(/\\/g, '/') + '`',
    '',
  ].join('\n');
}

function normalizeAttributionLine(value) {
  return value.replace(/[`*]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function hasEquivalentAttribution(body, header) {
  const normalizedBodyLines = new Set(
    body
      .split(/\r?\n/)
      .map((line) => normalizeAttributionLine(line))
      .filter(Boolean)
  );

  const headerLines = header
    .split(/\r?\n/)
    .map((line) => normalizeAttributionLine(line))
    .filter(Boolean);

  return headerLines.every((line) => normalizedBodyLines.has(line));
}

function injectAttribution(body, header) {
  const trimmedBody = body.trimStart();
  if (hasEquivalentAttribution(trimmedBody, header)) {
    return trimmedBody.endsWith('\n') ? trimmedBody : trimmedBody + '\n';
  }

  const normalizedBody = trimmedBody.endsWith('\n') ? trimmedBody : trimmedBody + '\n';
  return normalizedBody + '\n' + header;
}

function copySkillResources(srcDir, destDir) {
  // Copy every file/directory inside a skill except SKILL.md (already written),
  // node_modules, and dotfiles. Preserves rules/, reference/, scripts/,
  // templates/, assets/, and any other bundled resources.
  const SKIP = new Set(['node_modules', 'SKILL.md', '.git']);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;

    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyDirRecursive(srcDir, destDir) {
  mkdirp(destDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      const stat = fs.lstatSync(srcPath);
      if (stat.isSymbolicLink()) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function main() {
  rmrf(OUTPUT_DIR);
  mkdirp(OUTPUT_SKILLS_DIR);

  const sourceRepo = 'neekware/ehaye-skills';
  const bucketDirs = fs.readdirSync(SOURCE_SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  const manifest = [];

  for (const bucketEntry of bucketDirs) {
    const bucket = bucketEntry.name;
    const bucketDir = path.join(SOURCE_SKILLS_DIR, bucket);
    const skillDirs = collectSkillDirectories(bucketDir);

    for (const skillDir of skillDirs) {
      const skillFile = path.join(skillDir, 'SKILL.md');
      const raw = fs.readFileSync(skillFile, 'utf8');
      const { frontmatter, body } = parseFrontmatter(raw);
      const name = frontmatter.name || path.basename(skillDir);
      const description = frontmatter.description || '';
      const creator = inferCreator(frontmatter, bucket);
      const license = inferLicense(frontmatter);
      const namespace = inferNamespace(frontmatter, bucket);
      const relativeSkillPath = path.relative(SOURCE_SKILLS_DIR, skillDir);
      const targetDir = path.join(OUTPUT_SKILLS_DIR, namespace, slugify(name));
      mkdirp(targetDir);

      const header = buildHeader({
        creator,
        license,
        sourceRepo,
        sourceBucket: bucket,
        originalPath: relativeSkillPath,
      });

      fs.writeFileSync(path.join(targetDir, 'SKILL.md'), injectAttribution(body, header));

      // Copy the full skill directory (rules/, reference/, scripts/, templates/,
      // assets/, LICENSE, etc.) so skills that reference bundled files resolve
      // correctly at runtime. SKILL.md was already written above; skip it here.
      for (const licenseFile of licenseFilesFor(skillDir)) {
        fs.copyFileSync(path.join(skillDir, licenseFile), path.join(targetDir, licenseFile));
      }
      copySkillResources(skillDir, targetDir);

      manifest.push({
        name,
        description,
        creator,
        namespace,
        license,
        sourceRepo,
        sourceBucket: bucket,
        originalPath: relativeSkillPath.replace(/\\/g, '/'),
        bundledPath: path.relative(OUTPUT_DIR, path.join(targetDir, 'SKILL.md')).replace(/\\/g, '/'),
      });
    }
  }

  manifest.sort((a, b) => a.creator.localeCompare(b.creator) || a.name.localeCompare(b.name));
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ skills: manifest }, null, 2) + '\n');
  fs.writeFileSync(
    README_PATH,
    [
      '# Bundled Skills Export',
      '',
      'Generated from the canonical `skills/` source tree for application packaging.',
      '',
      '- Markdown-first export',
      '- Creator-owned folders',
      '- Visible attribution and license appended to the bottom of each `SKILL.md`',
      '- `manifest.json` contains source and license metadata for every bundled skill',
      '',
      `Generated skills: ${manifest.length}`,
      '',
    ].join('\n')
  );
  console.log(`Exported ${manifest.length} skills to ${OUTPUT_DIR}`);
}

main();
