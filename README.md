<div align="center">

<img src="images/dojo-logo.png" alt="Dojo Logo" width="150">

# dojo-skills

### Curated Skills for Dojo Dojo

</div>

Curated, validated skill repository for [Dojo Dojo](https://dojo.io).

This repo is the **single source of truth** for skills consumed by DojoWorkspace. Rather than pulling
from multiple upstream repos at runtime, we aggregate, validate, deduplicate, and prune skills here
under our control.

## How it works

```mermaid
flowchart TD
    subgraph "Upstream Origins (community)"
        OCS["alirezarezvani/claude-skills\n(SKILL.md files)"]
        OAS["VoltAgent/awesome-agent-skills\n(catalog of skill repos)"]
    end

    subgraph "Neekware Forks (our stable copies)"
        FCS["neekware/claude-skills"]
        FAS["neekware/awesome-agent-skills"]
    end

    subgraph "Curation Pipeline (scripts/curate.cjs)"
        STALE["Check fork staleness\n(fork vs origin HEAD)"]
        SYNC["Clone / Sync\n(shallow clone, SHA tracking)"]
        VALIDATE["Validate\n(frontmatter, name, desc, body ≥ 50 chars)"]
        DEDUP["Deduplicate\n(name + bucket uniqueness)"]
        PRUNE["Prune\n(skip invalid, remove noise)"]
        CATALOG["Parse Catalog\n(README → catalog.json)"]
    end

    subgraph "neekware/dojo-skills (output)"
        SKILLS["skills/\n(bucket / skill-name / SKILL.md)"]
        CAT["catalog/\ncatalog.json"]
        MARKERS[".upstream-markers/\n(SHA checksums)"]
    end

    OCS -. "fork" .-> FCS
    OAS -. "fork" .-> FAS
    OCS -- "ls-remote" --> STALE
    OAS -- "ls-remote" --> STALE
    FCS -- "ls-remote" --> STALE
    FAS -- "ls-remote" --> STALE
    FCS -- "clone" --> SYNC
    FAS -- "clone" --> SYNC
    STALE --> SYNC
    SYNC --> VALIDATE
    VALIDATE --> DEDUP
    DEDUP --> PRUNE
    PRUNE --> SKILLS
    SYNC --> CATALOG
    CATALOG --> CAT
    SYNC --> MARKERS

    style OCS fill:#3b2e1a,stroke:#f59e0b,color:#e2e8f0
    style OAS fill:#3b2e1a,stroke:#f59e0b,color:#e2e8f0
    style FCS fill:#2d4a3e,stroke:#4ade80,color:#e2e8f0
    style FAS fill:#2d4a3e,stroke:#4ade80,color:#e2e8f0
    style STALE fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style SYNC fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style VALIDATE fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style DEDUP fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style PRUNE fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style CATALOG fill:#1e3a5f,stroke:#60a5fa,color:#e2e8f0
    style SKILLS fill:#4a2d5e,stroke:#c084fc,color:#e2e8f0
    style CAT fill:#4a2d5e,stroke:#c084fc,color:#e2e8f0
    style MARKERS fill:#4a2d5e,stroke:#c084fc,color:#e2e8f0
```

## Directory structure

```
dojo-skills/
├── scripts/
│   ├── curate.cjs           # Main pipeline script
│   └── parse-catalog.cjs    # README → catalog.json parser
├── skills/                   # Curated skill files (bucket/name/SKILL.md)
├── catalog/
│   └── catalog.json          # Parsed catalog of known skill repos
├── .upstream-markers/        # SHA markers tracking last-synced upstream commits
├── .upstream/                # (gitignored) Cloned upstream repos (cache)
├── artifacts/
│   └── bundle/               # Generated markdown-only app bundle (exported)
├── package.json
└── .gitignore
```

## Usage

### Full sync (check → pull → extract → commit → push)

```bash
node scripts/curate.cjs
```

### Check only (are upstreams ahead? are forks stale?)

```bash
node scripts/curate.cjs --check
```

Exit code 1 if forks are behind origins or if Neekware forks have uncurated changes. Exit code 0 if
everything is current.

### Sync without pushing

```bash
node scripts/curate.cjs --no-push
```

### Using npm scripts

```bash
npm run curate           # full sync + push
npm run curate:check     # check only
npm run curate:local     # sync without push
pnpm bundle:export       # generate markdown-only app bundle in artifacts/bundle/
pnpm bundle:clean        # remove generated bundle artifact
```

## Adding new upstream sources

Edit the `UPSTREAMS` array in `scripts/curate.cjs`:

```js
const UPSTREAMS = [
  {
    name: "claude-skills",
    url: "https://github.com/neekware/claude-skills.git",
    origin: "https://github.com/alirezarezvani/claude-skills.git",
    type: "skills",
  },
  {
    name: "awesome-agent-skills",
    url: "https://github.com/neekware/awesome-agent-skills.git",
    origin: "https://github.com/VoltAgent/awesome-agent-skills.git",
    type: "catalog",
  },
];
```

| Field    | Description                                                          |
| -------- | -------------------------------------------------------------------- |
| `name`   | Local identifier for the upstream                                    |
| `url`    | Neekware fork URL (what we build from)                               |
| `origin` | True upstream URL (what the fork was forked from)                    |
| `type`   | `skills` = contains SKILL.md files; `catalog` = README-based catalog |

## Skill validation rules

A skill is only included if its `SKILL.md`:

- Has YAML frontmatter (`---` delimiters)
- Contains `name:` in frontmatter
- Contains `description:` in frontmatter
- Has at least 50 characters of body content after frontmatter

## App bundle export

The source repository keeps two forms of the skills corpus:

- `skills/` — canonical full source corpus for curation and maintenance
- `artifacts/bundle/` — generated markdown-only export for application packaging

The bundle export is intended for app resource pipelines and contains:

- `SKILL.md`
- markdown companions when needed
- license files when present
- bottom-appended attribution and license metadata without duplication

Generate it with:

```bash
pnpm bundle:export
```

## License

MIT

## Acknowledgments

This repository aggregates and curates content from the following upstream sources, both licensed
under the **MIT License**:

- **[alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills)** The original
  skill definitions (SKILL.md files, reference docs, and bundled scripts). Forked to
  [neekware/claude-skills](https://github.com/neekware/claude-skills) as our stable working copy.
  Copyright (c) alirezarezvani. MIT License.

- **[VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills)**
  Community-maintained catalog of agent skill repositories, used to generate the
  `catalog/catalog.json` index of known skill sources. Forked to
  [neekware/awesome-agent-skills](https://github.com/neekware/awesome-agent-skills) as our stable
  working copy. Copyright (c) VoltAgent. MIT License.

We gratefully acknowledge the original authors and contributors of these projects. Full license text
for each upstream is available in their respective repositories.
