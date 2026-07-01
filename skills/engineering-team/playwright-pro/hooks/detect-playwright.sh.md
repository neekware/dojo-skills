# detect-playwright.sh

> **Reference script — not executable.**
> Bundled as Markdown so the logic ships as readable reference without a
> raw executable in the packaged app. Copy it out to run it yourself.
> **Original path:** `engineering-team/playwright-pro/hooks/detect-playwright.sh`

```bash
#!/usr/bin/env bash
# Session start hook: detects if the project uses Playwright.
# Outputs context hint for Claude if playwright.config exists.

set -euo pipefail

# Check for Playwright config in current directory or common locations
PW_CONFIG=""
for config in playwright.config.ts playwright.config.js playwright.config.mjs; do
    if [[ -f "$config" ]]; then
        PW_CONFIG="$config"
        break
    fi
done

if [[ -z "$PW_CONFIG" ]]; then
    exit 0
fi

# Count existing test files
TEST_COUNT=$(find . -name "*.spec.ts" -o -name "*.spec.js" -o -name "*.test.ts" -o -name "*.test.js" 2>/dev/null | grep -v node_modules | wc -l | tr -d ' ')

echo "🎭 Playwright detected ($PW_CONFIG) — $TEST_COUNT test files found. Use /pw: commands for testing workflows."
```
