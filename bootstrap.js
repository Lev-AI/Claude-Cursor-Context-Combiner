#!/usr/bin/env node
/**
 * AI Development Bootstrap Script
 * - Deterministic project context (Repomix) + optional semantic expansion (Serena)
 * - Commit policy enforcement (main commits + checkpoint commits)
 * - Automatic snapshot regeneration after each commit (post-commit hook)
 *
 * Philosophy: minimal setup, repo is the source of truth, sync via git history + snapshots.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  const c = COLORS[color] || COLORS.reset;
  process.stdout.write(c + msg + COLORS.reset + '\n');
}

function runCommand(cmd, { silent = false } = {}) {
  try {
    const out = cp.execSync(cmd, { stdio: silent ? 'pipe' : 'inherit', encoding: 'utf8' });
    return out ?? '';
  } catch (e) {
    if (silent) return '';
    throw e;
  }
}

function hasCommand(cmd) {
  const whichCmd = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`;
  const res = runCommand(whichCmd, { silent: true });
  return !!(res && res.trim());
}

function ensureDir(dirPath) {
  if (!dirPath || dirPath === '.' || dirPath === '/') return;
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function writeFileSafe(filePath, content, { overwrite = false } = {}) {
  const exists = fs.existsSync(filePath);
  if (exists && !overwrite) {
    log(`  ↪ Skipped (exists): ${filePath}`, 'yellow');
    return { wrote: false, skipped: true };
  }
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
  log(`  ✓ ${filePath}`, 'green');
  return { wrote: true, skipped: false };
}

function chmodSafe(filePath, mode) {
  try {
    fs.chmodSync(filePath, mode);
  } catch {
    // Non-fatal (Windows, some FS)
  }
}

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function createBackup(pathsToBackup) {
  const backupDir = `.ai-dev-backup-${timestampId()}`;
  let did = false;

  for (const p of pathsToBackup) {
    if (!fs.existsSync(p)) continue;
    const dest = path.join(backupDir, p);
    ensureDir(path.dirname(dest));
    try {
      fs.cpSync(p, dest, { recursive: true });
      did = true;
    } catch (e) {
      // fs.cpSync may fail on very old node; fallback
      try {
        if (fs.lstatSync(p).isDirectory()) {
          ensureDir(dest);
          // minimal dir copy fallback (shallow)
          for (const entry of fs.readdirSync(p)) {
            const src2 = path.join(p, entry);
            const dst2 = path.join(dest, entry);
            if (fs.lstatSync(src2).isDirectory()) continue;
            fs.copyFileSync(src2, dst2);
          }
        } else {
          fs.copyFileSync(p, dest);
        }
        did = true;
      } catch {
        log(`  ⚠️  Backup failed for: ${p}`, 'yellow');
      }
    }
  }

  if (did) log(`🛟 Backup created: ${backupDir}`, 'green');
  return did ? backupDir : null;
}

function ensureGitRepo() {
  if (!fs.existsSync('.git')) {
    log('🧩 No .git detected. Running: git init', 'yellow');
    runCommand('git init', { silent: false });
  }
  ensureDir('.git/hooks');
}

function warnDirtyWorkingTree() {
  const status = runCommand('git status --porcelain', { silent: true });
  if (status && status.trim()) {
    log('⚠️  Working tree is DIRTY (uncommitted changes detected).', 'yellow');
    log('   Recommendation: commit/stash before running bootstrap on an existing project.', 'yellow');
  }
}

function detectProjectType() {
  const hasGit = fs.existsSync('.git');
  const hasCode =
    fs.existsSync('src') ||
    fs.existsSync('lib') ||
    fs.existsSync('app') ||
    fs.existsSync('backend') ||
    fs.existsSync('packages') ||
    fs.existsSync('services');
  const hasDocs = fs.existsSync('docs');
  const hasArch = fs.existsSync('docs/ARCHITECTURE.md');

  if (hasGit && (hasCode || hasDocs) && !hasArch) return 'existing';
  return 'new';
}

function detectModules() {
  try {
    const candidates = ['src', 'app', 'lib', 'backend', 'packages', 'services'];
    const found = [];
    for (const base of candidates) {
      if (!fs.existsSync(base)) continue;
      const items = fs.readdirSync(base, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => `${base}/${d.name}/`);
      if (items.length) found.push(...items.map(x => `- ${x}`));
    }
    if (!found.length) return '- No common module directories found';
    return found.join('\n');
  } catch {
    return '- Unable to detect modules';
  }
}

function detectTechStack() {
  const detected = [];
  try {
    // Node / TS
    if (fs.existsSync('package.json')) {
      detected.push('- Node.js (package.json)');
      try {
        const pkg = JSON.parse(safeRead('package.json'));
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        if (deps.typescript) detected.push('- TypeScript');
        if (deps.react) detected.push('- React');
        if (deps.next) detected.push('- Next.js');
        if (deps.express) detected.push('- Express');
        if (deps['@nestjs/core']) detected.push('- NestJS');
        if (deps.prisma) detected.push('- Prisma');
      } catch {
        detected.push('- Node.js (unable to parse dependencies)');
      }
    }

    // Python
    if (fs.existsSync('pyproject.toml')) detected.push('- Python (pyproject.toml)');
    if (fs.existsSync('requirements.txt')) detected.push('- Python (requirements.txt)');

    // Go / Rust / Java / Ruby / PHP / .NET
    if (fs.existsSync('go.mod')) detected.push('- Go (go.mod)');
    if (fs.existsSync('Cargo.toml')) detected.push('- Rust (Cargo.toml)');
    if (fs.existsSync('pom.xml') || fs.existsSync('build.gradle')) detected.push('- Java (Maven/Gradle)');
    if (fs.existsSync('Gemfile')) detected.push('- Ruby (Gemfile)');
    if (fs.existsSync('composer.json')) detected.push('- PHP (composer.json)');
    // .NET: global.json or any *.csproj in repo root (fs.existsSync does not expand globs)
    let hasCsproj = false;
    if (fs.existsSync('global.json')) {
      hasCsproj = true;
    } else {
      try {
        const entries = fs.readdirSync('.', { withFileTypes: true });
        hasCsproj = entries.some(e => e.isFile() && e.name.endsWith('.csproj'));
      } catch {
        // ignore
      }
    }
    if (hasCsproj) detected.push('- .NET');

    // Containers
    if (fs.existsSync('Dockerfile') || fs.existsSync('docker-compose.yml') || fs.existsSync('compose.yaml')) detected.push('- Docker');
  } catch {
    // ignore
  }

  return detected.length ? detected.join('\n') : '- Unable to detect tech stack';
}

function createDirectories() {
  const dirs = [
    'docs/adr',
    '.mcp',
    'scripts',
    '.serena',
    '.github/workflows',
  ];
  for (const d of dirs) {
    ensureDir(d);
    log(`  ✓ ${d}/`, 'green');
  }
}

function ensureGitignore() {
  const gitignorePath = '.gitignore';
  const mcpSection = `
# AI Development System - Generated Artifacts
.mcp/context.xml
.mcp/context_incremental.txt
.mcp/post-commit.log
.ai-dev-backup-*/

# Environment (secrets)
.env
`;

  let content = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf8')
    : '';

  if (content.includes('.mcp/context.xml')) {
    log(' ✓ .gitignore already configured', 'green');
    return;
  }

  const newContent = content.trimEnd() + mcpSection + '\n';
  fs.writeFileSync(gitignorePath, newContent, 'utf8');
  log(' ✓ Updated .gitignore', 'green');
}

function createDocs(projectType) {
  const isDegraded = projectType === 'existing';

  const degradedBlock = isDegraded
    ? `> ⚠️ **DEGRADED MODE TEMPLATE**
>
> **For AI (Claude Code/Cursor):**
> - This file is INCOMPLETE. Treat recommendations as SUGGESTIONS only.
> - Before making architectural changes, request human review.
> - Prioritize incremental changes over redesigns.
> - If something is unclear, ASK. State assumptions explicitly.
>
> **For Developers:**
> - Review and complete all sections marked with [TODO]
> - Document your current architecture truthfully
> - Update this file as you refine the system
> - Remove this warning when complete
>
> **To exit degraded mode:** Complete all [TODO] sections below.
>
---

`
    : '';

  const architecture = `# ARCHITECTURE

${degradedBlock}## Purpose
${isDegraded ? '[TODO: Describe what this system does and why it exists]' : 'Describe what this system does and why it exists.'}

## System Invariants (Non‑Negotiable)
- LLMs are executors, not sources of truth
- Repo (Git) is the source of truth
- Architecture docs > code
- Decisions are written (ADR), not implied
- Context is rebuilt from the repository snapshot, not from chat history

## Modules
${isDegraded ? `[TODO: List your main modules/components]

Detected modules (verify):
${detectModules()}` : '[List your main modules/components]'}

## Tech Stack
${isDegraded ? `[TODO: Verify and document]

Detected (best‑effort):
${detectTechStack()}` : '[Document your tech stack]'}

## Context Strategy (Onion Model)
Layer 0 — Always included:
- docs/ARCHITECTURE.md
- docs/CONVENTIONS.md
- latest ADRs (docs/adr)

Layer 1 — Incremental delta:
- git diff against base branch (default: main)
- changed files content

Layer 2 — Dynamic expansion (on demand):
- callers / references / dependencies
- retrieved via Serena (optional)

## Operating Rules
- Use **meaningful commits** as checkpoints of intent (even if small)
- After each commit: regenerate snapshot (.mcp/context.xml)
- Use ADRs for architectural decisions that change boundaries, invariants, or contracts
`;

  const conventions = `# CONVENTIONS

## Commit Message Policy

All commits MUST follow one of two templates.

### Main commits (feature work)
\`type(scope): short description\`

Where \`type\` ∈ \`feat|fix|refactor|docs|test|chore\`

Examples:
- feat(auth): add oauth skeleton
- fix(api): handle empty token
- refactor(core): split router

### Checkpoint commits (micro checkpoints)
\`checkpoint(scope): short description\`

Examples:
- checkpoint(ui): adjust spacing
- checkpoint(docs): update wording

Enforcement:
- Local git hook: .git/hooks/commit-msg
- CI safety net: .github/workflows/commit-policy.yml

## Degraded Mode

If docs/ARCHITECTURE.md contains "DEGRADED MODE TEMPLATE":
- AI must treat architecture as incomplete
- AI must ask clarifying questions
- AI must avoid large refactors without explicit approval

## Snapshot / Context

- Full snapshot: .mcp/context.xml (generated by Repomix)
- Incremental snapshot: .mcp/context_incremental.txt (generated by scripts/generate-context.sh)

## ADR

Use ADRs for:
- changing module boundaries
- introducing new core dependencies
- changing APIs/contracts
- changing invariants or data flows
`;

  const adrTemplate = `# ADR-XXX: <Title>

**Status:** Draft | Accepted | Rejected
**Date:** YYYY-MM-DD
**Deciders:** <names>

## Context
<What problem are we solving?>

## Decision
<What did we decide?>

## Rationale
<Why this decision?>

## Consequences
<Good and bad effects>

## Alternatives Considered
<Other options>

## References
- Links / docs / PRs
`;

  writeFileSafe('docs/ARCHITECTURE.md', architecture, { overwrite: false });
  writeFileSafe('docs/CONVENTIONS.md', conventions, { overwrite: false });
  writeFileSafe('docs/adr/ADR_TEMPLATE.md', adrTemplate, { overwrite: false });
}

function createCursorRules() {
  const rules = `# Cursor AI Rules

You operate inside a deterministic AI-assisted development system.

## Absolute rules
- Repo (Git) is the source of truth.
- Do NOT rely on chat history as source of truth.
- Follow docs/ARCHITECTURE.md and docs/CONVENTIONS.md.
- Write small, incremental changes; prefer patch-sized PRs.
- For architectural changes: create/update an ADR and request approval.

## Commit policy
- Suggest commit messages that match CONVENTIONS.md.
- Prefer **checkpoint** commits for micro-steps during implementation.
- Prefer **main** commits when completing a meaningful slice.

## Working in Degraded Mode
If you see in docs/ARCHITECTURE.md:
"⚠️ DEGRADED MODE TEMPLATE"

**This means:**
- Documentation is incomplete
- Your recommendations are SUGGESTIONS only
- Request approval before architectural changes

**DO:**
- Ask clarifying questions
- Explain assumptions explicitly
- Suggest small changes first

**DON'T:**
- Assume architectural decisions
- Make large refactors
- Change module boundaries

## Safety
- Do not modify docs/ARCHITECTURE.md, docs/CONVENTIONS.md, or ADRs unless explicitly instructed.
- Avoid deleting files unless explicitly requested.
`;

  writeFileSafe('.cursorrules', rules, { overwrite: false });
}

function createRepomixConfig() {
  // Repomix config (Onion Model header + git signals)
  // The actual packed content is controlled by include/ignore patterns.
  const config = {
    output: {
      filePath: '.mcp/context.xml',
      style: 'xml',
      headerText:
        '# AI Development System Context (Onion Model)\n' +
        'Layer 0 (Always): docs/ARCHITECTURE.md, docs/CONVENTIONS.md, latest ADRs\n' +
        'Layer 1 (Delta): git diffs and changed files (use scripts/generate-context.sh for incremental)\n' +
        'Layer 2 (Expansion): on demand via Serena tools\n' +
        '\n' +
        'This snapshot represents current project reality from the repository.\n',
    },
    include: [
      'docs/**',
      'src/**',
      'app/**',
      'lib/**',
      'backend/**',
      'packages/**',
      'services/**',
      'README.md',
      'Dockerfile',
      'docker-compose.yml',
      'compose.yaml',
    ],
    ignore: {
      useDefaultPatterns: true,
      customPatterns: [
        'node_modules/**',
        '.git/**',
        '.ai-dev-backup-*/**',
        '.serena/cache/**',
        '.serena/tmp/**',
        '.serena/logs/**',
        '.mcp/context.xml',
        '.mcp/context_incremental.txt',
        '**/*.log',
        '**/*.tmp',
        '**/.DS_Store',
      ],
    },
    git: {
      includeDiffs: true,
      includeLogs: true,
      logsCount: 30,
    },
  };

  writeFileSafe('repomix.config.json', JSON.stringify(config, null, 2) + '\n', { overwrite: false });
}

function createMcpSnippets() {
  // These are EXAMPLES only. Real locations vary by OS/client.
  const claudeExample = {
    mcpServers: {
      repomix: {
        command: 'npx',
        args: ['-y', 'repomix', '--mcp'],
      },
      serena: {
        command: 'uvx',
        args: ['--from', 'git+https://github.com/oraios/serena.git', 'serena', 'start-mcp-server'],
      },
    },
  };

  const cursorExample = {
    mcpServers: {
      repomix: {
        command: 'npx',
        args: ['-y', 'repomix', '--mcp'],
      },
      serena: {
        command: 'uvx',
        args: ['--from', 'git+https://github.com/oraios/serena.git', 'serena', 'start-mcp-server'],
      },
    },
  };

  writeFileSafe('.mcp/claude_desktop_config.example.json', JSON.stringify(claudeExample, null, 2) + '\n', { overwrite: false });
  writeFileSafe('.mcp/cursor_mcp_config.example.json', JSON.stringify(cursorExample, null, 2) + '\n', { overwrite: false });
}

function createGitHubAction() {
  const workflow = `name: Commit Policy

on:
  pull_request:
  push:
    branches: [ main, master ]

jobs:
  commit-policy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Validate commit messages
        shell: bash
        run: |
          set -e
          BASE="\${{ github.event.pull_request.base.sha }}"
          HEAD="\${{ github.sha }}"

          # For push events where BASE is empty, validate the last 50 commits.
          if [ -z "$BASE" ]; then
            RANGE="HEAD~50..HEAD"
          else
            RANGE="$BASE..$HEAD"
          fi

          echo "Validating commit subjects in range: $RANGE"
          BAD=0

          while IFS= read -r subject; do
            if [[ "$subject" =~ ^(Merge\ |Revert\ ) ]]; then
              continue
            fi
            if [[ "$subject" =~ ^(feat|fix|refactor|docs|test|chore)(\([a-z0-9_-]+\))?:\ .+ ]]; then
              continue
            fi
            if [[ "$subject" =~ ^checkpoint(\([a-z0-9_-]+\))?:\ .+ ]]; then
              continue
            fi
            echo "❌ Invalid commit subject: $subject"
            BAD=1
          done < <(git log --format=%s "$RANGE")

          if [ "$BAD" -eq 1 ]; then
            echo "Commit policy failed."
            exit 1
          fi

          echo "✅ Commit policy passed."
`;

  writeFileSafe('.github/workflows/commit-policy.yml', workflow, { overwrite: false });
}

function createGitHooks({ overwrite = false } = {}) {
  const commitMsgHook = `#!/bin/sh
# Commit Message Policy (main + checkpoint)
MSG_FILE="$1"
SUBJECT="$(head -n 1 "$MSG_FILE" | tr -d '\\r')"

# Allow merge/revert commits
echo "$SUBJECT" | grep -Eq '^(Merge |Revert )' && exit 0

# Main commits
echo "$SUBJECT" | grep -Eq '^(feat|fix|refactor|docs|test|chore)(\\([a-z0-9_-]+\\))?: .+' && exit 0

# Checkpoint commits
echo "$SUBJECT" | grep -Eq '^checkpoint(\\([a-z0-9_-]+\\))?: .+' && exit 0

echo ""
echo "❌ Invalid commit message:"
echo "   $SUBJECT"
echo ""
echo "Allowed formats:"
echo "  - feat(scope): description"
echo "  - fix(scope): description"
echo "  - refactor(scope): description"
echo "  - docs(scope): description"
echo "  - test(scope): description"
echo "  - chore(scope): description"
echo "  - checkpoint(scope): description"
echo ""
exit 1
`;

  const postCommitHook = `#!/bin/sh
# Post-commit hook: regenerate deterministic snapshot for handoff (Cursor ⇄ Claude)
# Non-fatal: commit already happened; we log errors.

LOG_DIR=".mcp"
LOG_FILE="$LOG_DIR/post-commit.log"
mkdir -p "$LOG_DIR"

echo "---- $(date) ----" >> "$LOG_FILE"

if command -v npx >/dev/null 2>&1; then
  # Repomix reads repomix.config.json and writes .mcp/context.xml
  npx -y repomix >> "$LOG_FILE" 2>&1 || echo "[WARN] repomix failed" >> "$LOG_FILE"
else
  echo "[WARN] npx not found; cannot run repomix" >> "$LOG_FILE"
fi

# Serena is optional; do NOT auto-index here (can be heavy). Provide manual script instead.
exit 0
`;

  // Backup if we are overwriting
  const hookPaths = ['.git/hooks/commit-msg', '.git/hooks/post-commit'];
  if (overwrite) createBackup(hookPaths);

  writeFileSafe('.git/hooks/commit-msg', commitMsgHook, { overwrite });
  writeFileSafe('.git/hooks/post-commit', postCommitHook, { overwrite });

  chmodSafe('.git/hooks/commit-msg', 0o755);
  chmodSafe('.git/hooks/post-commit', 0o755);
}

function createScripts({ overwrite = false } = {}) {
  const commitCheckpoint = `#!/bin/sh
# Quick checkpoint commit (enforced by commit-msg hook)
# Usage: scripts/commit-checkpoint.sh <scope> <message...>

set -e
SCOPE="$1"
shift || true
MSG="$*"

if [ -z "$SCOPE" ] || [ -z "$MSG" ]; then
  echo "Usage: scripts/commit-checkpoint.sh <scope> <message...>"
  exit 1
fi

git add -A
git commit -m "checkpoint($SCOPE): $MSG"
`;

  const commitMain = `#!/bin/sh
# Main commit
# Usage: scripts/commit-main.sh <type> <scope> <message...>
# type: feat|fix|refactor|docs|test|chore

set -e
TYPE="$1"
SCOPE="$2"
shift 2 || true
MSG="$*"

if [ -z "$TYPE" ] || [ -z "$SCOPE" ] || [ -z "$MSG" ]; then
  echo "Usage: scripts/commit-main.sh <type> <scope> <message...>"
  exit 1
fi

git add -A
git commit -m "$TYPE($SCOPE): $MSG"
`;

  const genContext = `#!/bin/sh
# Incremental context generator (Onion Model)
# Usage: scripts/generate-context.sh [base_branch] [output_file]

set -e
BASE_BRANCH="\${1:-main}"
OUT="\${2:-.mcp/context_incremental.txt}"

mkdir -p .mcp
echo "# AI Development System Context (Incremental / Onion Model)" > "$OUT"
echo "" >> "$OUT"

# Layer 0 — Laws
for f in docs/ARCHITECTURE.md docs/CONVENTIONS.md; do
  if [ -f "$f" ]; then
    echo "=== $f ===" >> "$OUT"
    cat "$f" >> "$OUT"
    echo "" >> "$OUT"
  fi
done

# Latest ADRs (up to 5)
ls -1t docs/adr/ADR-*.md 2>/dev/null | head -n 5 | while read -r adr; do
  echo "--- $adr ---" >> "$OUT"
  cat "$adr" >> "$OUT"
  echo "" >> "$OUT"
done

# Layer 1 — Delta
echo "=== git diff $BASE_BRANCH...HEAD ===" >> "$OUT"
git diff "$BASE_BRANCH...HEAD" >> "$OUT" || true
echo "" >> "$OUT"

# Changed files content
CHANGED=$(git diff --name-only "$BASE_BRANCH...HEAD" || true)
for file in $CHANGED; do
  if [ -f "$file" ]; then
    echo "=== $file ===" >> "$OUT"
    cat "$file" >> "$OUT"
    echo "" >> "$OUT"
  fi
done

echo "✅ Wrote incremental context: $OUT"
`;

  const adrCreate = `#!/bin/sh
# Create ADR from template with auto-increment ID
# Usage: scripts/create-adr.sh <slug>
set -e

SLUG="$1"
if [ -z "$SLUG" ]; then
  echo "Usage: scripts/create-adr.sh <slug>"
  exit 1
fi

mkdir -p docs/adr

LAST=$(ls -1 docs/adr/ADR-[0-9][0-9][0-9]-*.md 2>/dev/null | sed -E 's/.*ADR-([0-9]+)-.*/\\1/' | sort -n | tail -1)
if [ -z "$LAST" ]; then
  NEXT=1
else
  NEXT=$((LAST + 1))
fi

ID=$(printf "%03d" "$NEXT")
FILE="docs/adr/ADR-$ID-$SLUG.md"

cat > "$FILE" <<'EOF'
# ADR-XXX: <Title>

**Status:** Draft | Accepted | Rejected
**Date:** YYYY-MM-DD
**Deciders:** <names>

## Context
<What problem are we solving?>

## Decision
<What did we decide?>

## Rationale
<Why this decision?>

## Consequences
<Good and bad effects>

## Alternatives Considered
<Other options>

## References
- Links / docs / PRs
EOF

# Replace placeholders
DATE=$(date +%Y-%m-%d)
sed -i.bak -e "s/ADR-XXX/ADR-$ID/g" -e "s/YYYY-MM-DD/$DATE/g" "$FILE" 2>/dev/null || true
rm -f "$FILE.bak" 2>/dev/null || true

echo "✅ Created $FILE"
echo "Next:"
echo "  1) Fill sections"
echo "  2) Commit: git commit -m \"docs(adr): add ADR-$ID $SLUG\""
`;

  const serenaIndex = `#!/bin/sh
# Optional: index the project for Serena (can be heavy)
# Requires uv/uvx or python environment; see Serena docs.
# Usage: scripts/serena-index.sh

set -e
echo "Starting Serena MCP server / indexing is environment-specific."
echo "Suggested (uvx) command:"
echo "  uvx --from git+https://github.com/oraios/serena.git serena project index"
echo ""
echo "If you already have Serena installed as a CLI, run:"
echo "  serena project index"
`;


  // Windows convenience wrappers (optional)
  const commitCheckpointBat = `@echo off
setlocal enabledelayedexpansion
set SCOPE=%1
if "%SCOPE%"=="" goto usage
shift
set "MSG="
set "FIRST=1"

:buildmsg
if "%~1"=="" goto checkmsg
if "!FIRST!"=="1" (set "MSG=%~1" & set "FIRST=0") else (set "MSG=!MSG! %~1")
shift
goto buildmsg

:checkmsg
if "%MSG%"=="" goto usage

git add -A
git commit -m "checkpoint(%SCOPE%): %MSG%"
exit /b 0

:usage
echo Usage: scripts\\commit-checkpoint.bat ^<scope^> ^<message...^>
exit /b 1
`;

  const commitMainBat = `@echo off
setlocal enabledelayedexpansion
set TYPE=%1
set SCOPE=%2
if "%TYPE%"=="" goto usage
if "%SCOPE%"=="" goto usage
shift
shift
set "MSG="
set "FIRST=1"

:buildmsg
if "%~1"=="" goto checkmsg
if "!FIRST!"=="1" (set "MSG=%~1" & set "FIRST=0") else (set "MSG=!MSG! %~1")
shift
goto buildmsg

:checkmsg
if "%MSG%"=="" goto usage

git add -A
git commit -m "%TYPE%(%SCOPE%): %MSG%"
exit /b 0

:usage
echo Usage: scripts\\commit-main.bat ^<type^> ^<scope^> ^<message...^>
echo type: feat^|fix^|refactor^|docs^|test^|chore
exit /b 1
`;

  const genContextBat = `@echo off
setlocal enabledelayedexpansion
set BASE_BRANCH=%1
if "%BASE_BRANCH%"=="" set BASE_BRANCH=main
set OUT=%2
if "%OUT%"=="" set OUT=.mcp\context_incremental.txt

if not exist .mcp mkdir .mcp

echo # AI Development System Context (Incremental / Onion Model)> "%OUT%"
echo.>> "%OUT%"

for %%F in (docs\ARCHITECTURE.md docs\CONVENTIONS.md) do (
  if exist %%F (
    echo === %%F ===>> "%OUT%"
    type %%F>> "%OUT%"
    echo.>> "%OUT%"
  )
)

for /f "delims=" %%A in ('dir /b /o-d docs\adr\ADR-*.md 2^>nul') do (
  echo --- docs\adr\%%A --->> "%OUT%"
  type docs\adr\%%A>> "%OUT%"
  echo.>> "%OUT%"
  goto afteradr
)
:afteradr

echo === git diff %BASE_BRANCH%...HEAD ===>> "%OUT%"
git diff %BASE_BRANCH%...HEAD>> "%OUT%" 2>nul
echo.>> "%OUT%"

for /f "delims=" %%F in ('git diff --name-only %BASE_BRANCH%...HEAD 2^>nul') do (
  if exist %%F (
    echo === %%F ===>> "%OUT%"
    type %%F>> "%OUT%"
    echo.>> "%OUT%"
  )
)

echo Wrote incremental context: %OUT%
`;

  writeFileSafe('scripts/commit-checkpoint.sh', commitCheckpoint, { overwrite });
  writeFileSafe('scripts/commit-main.sh', commitMain, { overwrite });
  writeFileSafe('scripts/generate-context.sh', genContext, { overwrite });
  writeFileSafe('scripts/create-adr.sh', adrCreate, { overwrite });
  writeFileSafe('scripts/serena-index.sh', serenaIndex, { overwrite });

// Windows scripts
writeFileSafe('scripts/commit-checkpoint.bat', commitCheckpointBat, { overwrite });
writeFileSafe('scripts/commit-main.bat', commitMainBat, { overwrite });
writeFileSafe('scripts/generate-context.bat', genContextBat, { overwrite });

  chmodSafe('scripts/commit-checkpoint.sh', 0o755);
  chmodSafe('scripts/commit-main.sh', 0o755);
  chmodSafe('scripts/generate-context.sh', 0o755);
  chmodSafe('scripts/create-adr.sh', 0o755);
  chmodSafe('scripts/serena-index.sh', 0o755);
}


function resolveClaudeDesktopConfigPath() {
  // Best-effort paths; may vary by install/OS.
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appdata, 'Claude', 'claude_desktop_config.json');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  // linux
  return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

function deepMerge(obj, patch) {
  if (!patch || typeof patch !== 'object') return obj;
  const out = Array.isArray(obj) ? [...obj] : { ...(obj || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function setupMcpForClaudeDesktop({ overwriteExistingServers = true } = {}) {
  const cfgPath = resolveClaudeDesktopConfigPath();
  const dir = path.dirname(cfgPath);
  ensureDir(dir);

  const existingRaw = safeRead(cfgPath);
  let existing = {};
  if (existingRaw && existingRaw.trim()) {
    try {
      existing = JSON.parse(existingRaw);
    } catch {
      // If config is invalid JSON, keep a backup and start fresh
      createBackup([cfgPath]);
      existing = {};
    }
  }

  const patch = {
    mcpServers: {
      repomix: {
        command: 'npx',
        args: ['-y', 'repomix', '--mcp'],
      },
      serena: {
        command: 'uvx',
        args: ['--from', 'git+https://github.com/oraios/serena.git', 'serena', 'start-mcp-server'],
      },
    },
  };

  // If user doesn't want to overwrite existing server definitions, respect them.
  if (!overwriteExistingServers && existing && existing.mcpServers) {
    for (const k of Object.keys(patch.mcpServers)) {
      if (existing.mcpServers[k]) delete patch.mcpServers[k];
    }
  }

  // Backup before write
  if (fs.existsSync(cfgPath)) createBackup([cfgPath]);

  const merged = deepMerge(existing, patch);
  // Force write because we explicitly asked for setup
  writeFileSafe(cfgPath, JSON.stringify(merged, null, 2) + '\n', { overwrite: true });

  log(`🔌 Claude Desktop MCP config updated: ${cfgPath}`, 'green');
  log('   Restart Claude Desktop to apply changes.', 'cyan');
}

function healthCheck() {
  log('\n🩺 Health check (bootstrap + sync invariants)', 'cyan');

  const checks = [];

  // Commands
  checks.push({ name: 'git', ok: hasCommand('git'), hint: 'Install Git and ensure it is on PATH.' });
  checks.push({ name: 'node', ok: hasCommand('node'), hint: 'Install Node.js (LTS recommended).' });
  checks.push({ name: 'npx', ok: hasCommand('npx'), hint: 'Install Node.js (npx comes with npm).' });

  // Files (expected after init)
  const expectedFiles = [
    'docs/ARCHITECTURE.md',
    'docs/CONVENTIONS.md',
    'docs/adr/ADR_TEMPLATE.md',
    '.cursorrules',
    'repomix.config.json',
    '.git/hooks/commit-msg',
    '.git/hooks/post-commit',
    'scripts/commit-checkpoint.sh',
    'scripts/commit-main.sh',
    'scripts/generate-context.sh',
    'scripts/create-adr.sh',
    '.github/workflows/commit-policy.yml',
  ];

  for (const f of expectedFiles) {
    checks.push({ name: f, ok: fs.existsSync(f), hint: 'Run: node bootstrap.js init' });
  }

  const gitignoreOk = fs.existsSync('.gitignore') &&
    fs.readFileSync('.gitignore', 'utf8').includes('.mcp/context.xml');
  checks.push({
    name: '.gitignore (excludes .mcp/)',
    ok: gitignoreOk,
    hint: 'Run: node bootstrap.js init (will update .gitignore)',
  });

  // Snapshot generation
  let snapshotOk = false;
  if (hasCommand('npx')) {
    try {
      ensureDir('.mcp');
      runCommand('npx -y repomix', { silent: true });
      snapshotOk = fs.existsSync('.mcp/context.xml');
    } catch {
      snapshotOk = false;
    }
  }
  checks.push({
    name: '.mcp/context.xml (repomix snapshot)',
    ok: snapshotOk,
    hint: 'Run: npx -y repomix (repomix.config.json must exist)',
  });

  // Print
  let pass = 0;
  for (const c of checks) {
    if (c.ok) {
      log(`  ✓ ${c.name}`, 'green');
      pass += 1;
    } else {
      log(`  ✗ ${c.name}`, 'red');
      log(`    ↪ ${c.hint}`, 'dim');
    }
  }

  const pct = Math.round((pass / checks.length) * 100);
  log(`\nResult: ${pass}/${checks.length} checks passed (${pct}%).`, pct === 100 ? 'green' : 'yellow');
  if (pct < 100) {
    log('Fix the red items above, then re-run: node bootstrap.js check', 'cyan');
  } else {
    log('System looks ready. You can switch tools and rely on repo snapshots + commit history.', 'cyan');
  }
}

function generateInitialSnapshot() {
  ensureDir('.mcp');
  if (!hasCommand('npx')) {
    log('  ⚠️  npx not found. Skipping initial snapshot generation.', 'yellow');
    return;
  }
  try {
    log('🧠 Generating initial snapshot via Repomix → .mcp/context.xml', 'cyan');
    runCommand('npx -y repomix', { silent: false });
    log('  ✓ .mcp/context.xml generated', 'green');
  } catch (e) {
    log('  ⚠️  Repomix snapshot generation failed. You can run later: npx -y repomix', 'yellow');
  }
}

function usage() {
  log('Usage:', 'cyan');
  log('  node bootstrap.js init [--force] [--setup-mcp]\n  node bootstrap.js check\n', 'cyan');
  log('Options:', 'cyan');
  log('  --force       Allow overwriting existing git hooks/scripts if present (backup is created)\n  --setup-mcp   Merge MCP servers into Claude Desktop config (creates backup)\n', 'cyan');
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'init';
  const force = args.includes('--force');
  const setupMcp = args.includes('--setup-mcp');

  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    usage();
    process.exit(0);
  }

  if (cmd === 'check') {
    healthCheck();
    process.exit(0);
  }

  if (cmd !== 'init') {
    usage();
    process.exit(1);
  }

  log('\n🧠 AI Development Bootstrap (Repomix + optional Serena)', 'cyan');
  ensureGitRepo();
  warnDirtyWorkingTree();

  const projectType = detectProjectType();
  if (projectType === 'existing') {
    log('📦 Detected: Existing project (no architecture docs) → DEGRADED MODE templates', 'yellow');
  } else {
    log('✨ Detected: New project → creating full structure', 'green');
  }

  log('\n📁 Creating directories', 'cyan');
  createDirectories();

  log('\n🙈 Ensuring .gitignore', 'cyan');
  ensureGitignore();

  log('\n📚 Creating docs (ARCHITECTURE / CONVENTIONS / ADR template)', 'cyan');
  createDocs(projectType);

  log('\n🧩 Creating Cursor rules (.cursorrules)', 'cyan');
  createCursorRules();

  log('\n🧰 Creating Repomix config (repomix.config.json)', 'cyan');
  createRepomixConfig();

  log('\n🔌 Creating MCP config snippets (.mcp/*.example.json)', 'cyan');
  createMcpSnippets();

  log('\n🔒 Creating Git hooks (commit policy + post-commit snapshot)', 'cyan');
  createGitHooks({ overwrite: force });

  log('\n🧪 Creating helper scripts (commit + ADR + incremental context)', 'cyan');
  createScripts({ overwrite: force });

  log('\n🛡 Creating CI safety net (GitHub Actions)', 'cyan');
  createGitHubAction();

  if (setupMcp) {
    log('\n🔌 Setting up MCP in Claude Desktop config (--setup-mcp)', 'cyan');
    setupMcpForClaudeDesktop({ overwriteExistingServers: true });
  } else {
    log('\nℹ️  MCP setup skipped. Use --setup-mcp to auto-merge into Claude Desktop config.', 'dim');
    log('   Or manually copy from: .mcp/claude_desktop_config.example.json', 'dim');
  }

  log('\n⚙️  Generating initial snapshot', 'cyan');
  generateInitialSnapshot();

  log('\n✅ Bootstrap complete.', 'green');
  log('Next:', 'cyan');
  log('  1) Open docs/ARCHITECTURE.md and fill TODOs if in degraded mode', 'cyan');
  log('  2) Use scripts/commit-checkpoint(.sh/.bat) and scripts/commit-main(.sh/.bat) for consistent commits', 'cyan');
  log('  3) Switch between tools: they can read repo state + commit history + .mcp/context.xml', 'cyan');
  log('  4) Run health check anytime: node bootstrap.js check', 'cyan');
  log('', 'reset');
}

main();
