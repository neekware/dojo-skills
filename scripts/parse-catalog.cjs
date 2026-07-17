#!/usr/bin/env node
/**
 * Catalog Parser for dojo-skills
 *
 * Parses the awesome-agent-skills README.md and emits a clean catalog.json.
 * Deduplicates, skips meta/non-skill repos, and normalizes descriptions.
 *
 * Usage: node parse-catalog.cjs <readme-path> <output-path>
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node parse-catalog.cjs <readme.md> <output.json>');
  process.exit(1);
}

const [readmePath, outputPath] = args;

// ── Repos to exclude (meta repos, not actual skill repos) ───────────
const SKIP_REPOS = new Set([
  'voltagent/awesome-agent-skills',
  'voltagent/awesome-ai-agent-papers',
  'voltagent/voltagent',
  'neekware/awesome-agent-skills',
  'neekware/claude-skills',
  'neekware/dojo-skills',
  'snyk/agent-scan',
]);

// ── Section header cleaner ──────────────────────────────────────────

function cleanSection(raw) {
  let s = raw.trim();

  const isSecurity = /^security\s+skills?\s+by\s+/i.test(s);
  s = s.replace(/^security\s+skills?\s+by\s+/i, '');
  s = s.replace(/^skills?\s+by\s+/i, '');
  s = s.replace(/\s+for their dev team\.?$/i, '');
  s = s.replace(/\s+team\s+for\s+terraform$/i, ' (Terraform)');
  s = s.replace(/\s+teams?\.?$/i, '');
  s = s.replace(/^official\s+/i, 'Official ');

  if (isSecurity && s.length > 0) {
    s = `${s} (security)`;
  }

  return s.trim();
}

// ── Parse README ────────────────────────────────────────────────────

function parseReadme(markdown) {
  const lines = markdown.split('\n');
  let currentSection = '';
  const repos = new Map();

  for (const line of lines) {
    const h3Match = line.match(/<h3[^>]*>([^<]+)<\/h3>/);
    if (h3Match) {
      currentSection = cleanSection(h3Match[1]);
      continue;
    }

    const mdH3Match = line.match(/^### (.+)/);
    if (mdH3Match) {
      const text = mdH3Match[1].trim();
      if (
        !/^(?:\.NET|Java|Python|Rust|TypeScript|General)\s+Skills?$/i.test(text) &&
        !/^(?:Community Skills|Skill Quality Standards|Skills Paths)/i.test(text) &&
        !/^(?:Marketing|Productivity|Development|Context|Specialized|n8n|Other)/i.test(text)
      ) {
        currentSection = cleanSection(text);
      }
      continue;
    }

    const inlineMatch = line.match(/^\*\*(?:Security\s+)?(?:Skills?)\s+by\s+([^*]+)\*\*/i);
    if (inlineMatch) {
      currentSection = cleanSection(`Skills by ${inlineMatch[1].trim()}`);
    }

    const isSkillEntry =
      /^\s*-\s+\*\*\[/.test(line) || /^\*\*(?:Security\s+)?(?:Skills?|Skill)\s/i.test(line);
    if (!isSkillEntry) continue;

    const repoRegex = /github\.com\/([^/\s)]+)\/([^/\s)"]+)/g;
    let match;
    while ((match = repoRegex.exec(line)) !== null) {
      const owner = match[1];
      const repo = match[2].replace(/\.git$/, '');
      const key = `${owner}/${repo}`;

      if (SKIP_REPOS.has(key.toLowerCase())) continue;

      if (repos.has(key)) {
        repos.get(key).skillCount++;
      } else {
        repos.set(key, {
          description: currentSection || key,
          skillCount: 1,
        });
      }
    }
  }

  return Array.from(repos.entries()).map(([repo, meta]) => ({
    repo,
    description: meta.description,
  }));
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(readmePath)) {
    console.error(`README not found: ${readmePath}`);
    process.exit(1);
  }

  const markdown = fs.readFileSync(readmePath, 'utf-8');
  const catalog = parseReadme(markdown);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2));

  console.log(`  ✓ catalog.json (${catalog.length} repos, ${(Buffer.byteLength(JSON.stringify(catalog)) / 1024).toFixed(1)} KB)`);
}

main();
