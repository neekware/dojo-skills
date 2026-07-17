# DOJO.md — dojo-skills Development Notes

> **Scope:** Build commands, validation workflow, repo conventions, and gotchas for contributors working on the Dojo Skills pipeline.

## Build & Tooling

- Use `pnpm` (not `npm run`) when running scripts in the engine repo that consume these skills.
- `node scripts/curate.cjs` — full pipeline: sync upstreams → extract skills → build catalog → export bundle. Add `--no-push` to skip the git commit/push at the end.
- `node scripts/export-bundle.cjs` — rebuild only the `artifacts/bundle/` export from `skills/` without re-syncing upstreams.
- `node scripts/parse-catalog.cjs` — parse the awesome-agent-skills README into catalog entries.

## Conventions

- Skill name for the output directory comes from the frontmatter `name` field, not the source directory name (e.g. video-db ships its skill in a `python/` folder, but the skill is named `videodb`).

## Gotchas

- Skills bundle export (`scripts/export-bundle.cjs`) must copy the **full skill directory** (rules/, reference/, scripts/, templates/, assets/), not just SKILL.md. `copySkillResources()` handles this — if a skill references bundled files that 404 at runtime, this function was likely bypassed or broken.
- Skills curation pipeline (`scripts/curate.cjs`): always commit to **main first**, then merge main→release. Never push directly to release — it diverges the branches.
