# Bootstrap Script Breakdown (Concept + Responsibilities)

This document explains the structure of the bootstrap script at a conceptual level: what each part is responsible for and why it exists.

---

## 1) Purpose and philosophy

The script is designed to set up a deterministic, repo-centric workflow that supports parallel work across tools (e.g., Claude Code and Cursor) while reducing context drift.

Key idea:
- The repository is the shared context surface
- Context is rebuilt from repo artifacts (docs + diffs + snapshots), not from chat history
- Commit history is treated as semantic checkpoints

---

## 2) Core dependencies and utilities

### 2.1 Standard Node modules
The script relies only on standard Node.js modules:
- fs / path / os for filesystem and OS-specific paths
- child_process for calling external tools (git, npx)

### 2.2 Console output helpers
Responsibilities:
- Provide consistent logs with colors
- Reduce noise by supporting silent command execution

Key helpers:
- log(): prints messages with a color
- runCommand(): executes shell commands (optionally silent)
- hasCommand(): checks whether a command exists on PATH

---

## 3) Safe filesystem primitives

These functions prevent accidental overwrites and keep setup repeatable.

### 3.1 Directory and file helpers
- ensureDir(): creates directories recursively
- safeRead(): reads a file or returns empty string
- writeFileSafe(): writes files with overwrite protection (skips if exists)
- chmodSafe(): sets executable bit where supported

### 3.2 Backups for destructive operations
- createBackup(): if hooks/configs already exist, the script can back them up into a timestamped folder before overwriting

Why this matters:
- You can run bootstrap on an existing repo without fear of losing important local setup

---

## 4) Repository preflight

### 4.1 Ensure a git repo exists
- ensureGitRepo(): runs `git init` if needed and ensures `.git/hooks` exists

### 4.2 Warn if working tree is dirty
- warnDirtyWorkingTree(): warns when there are uncommitted changes

Why this matters:
- Bootstrapping an existing project can change files; the warning reduces accidental state confusion

---

## 5) Project detection (new vs existing)

The script supports two modes:

### 5.1 New project
- Creates full templates (ARCHITECTURE/CONVENTIONS/ADR)

### 5.2 Existing project (degraded mode)
- If the repo looks like it already has code/docs but lacks `docs/ARCHITECTURE.md`, the script generates templates with a visible warning block

Degraded mode goal:
- Prevent tools from treating incomplete docs as ground truth
- Force incremental changes and explicit assumptions

Supporting helpers:
- detectProjectType(): decides “new” vs “existing”
- detectModules(): best-effort scan of common module directories
- detectTechStack(): best-effort scan for stack signals (package.json, pyproject.toml, Dockerfile, etc.)

---

## 6) Directory layout initialization

### 6.1 Create directories
- createDirectories(): creates a minimal structure:
  - docs/adr
  - .mcp
  - scripts
  - .serena
  - .github/workflows

Why this matters:
- Tools can rely on stable locations for context and workflow artifacts

---

## 7) Git ignore rules for generated artifacts

### 7.1 ensureGitignore()
Adds a dedicated section to `.gitignore` to exclude:
- .mcp/context.xml
- .mcp/context_incremental.txt
- .mcp/post-commit.log
- backups created by this system

Why this matters:
- Snapshots and logs are generated artifacts, not source
- Prevents “always dirty repo” syndrome

---

## 8) Documentation layer (project laws)

### 8.1 docs/ARCHITECTURE.md
- Defines purpose, invariants, modules, stack, context strategy (Onion Model), operating rules
- In existing projects: includes a DEGRADED MODE warning template that instructs tools to ask questions and avoid big refactors

### 8.2 docs/CONVENTIONS.md
- Defines commit message policy:
  - Main commits: type(scope): description
  - Checkpoints: checkpoint(scope): description
- Defines degraded mode behavior
- Defines snapshot files and incremental context generation
- Defines when to write ADRs

### 8.3 ADR template
- docs/adr/ADR_TEMPLATE.md

Why this matters:
- These docs become “Layer 0” of your context onion: always included, always trusted

---

## 9) Tool behavior constraints (Cursor rules)

### 9.1 .cursorrules
- Encodes the repo-first policy for Cursor
- Emphasizes small, incremental changes
- Makes ADR approval explicit
- Defines safety constraints (don’t modify core docs unless explicitly asked)

Why this matters:
- It reduces tool-driven redesigns and forces alignment with your declared system rules

---

## 10) Snapshot configuration (Repomix)

### 10.1 repomix.config.json
Responsibilities:
- Defines what gets included in snapshots (docs, common code dirs, README, docker files)
- Defines what must be ignored (node_modules, .git, generated artifacts, logs, temp)
- Enables git signals:
  - includeDiffs
  - includeLogs
  - logsCount

Output target:
- .mcp/context.xml

Why this matters:
- This is your deterministic handoff artifact: tools can consume it repeatedly without relying on chat history

---

## 11) MCP configuration snippets (examples)

### 11.1 .mcp/*.example.json
- Provides example MCP server definitions for:
  - Repomix (npx ... repomix --mcp)
  - Serena (uvx ... start-mcp-server)

Why this matters:
- On different clients/OSes MCP config locations vary
- Examples lower friction without forcing auto-editing user configs

---

## 12) Commit policy enforcement (local + CI)

### 12.1 Local enforcement: .git/hooks/commit-msg
- Rejects commits that do not match allowed patterns
- Allows merge/revert commits

### 12.2 Local automation: .git/hooks/post-commit
- After each commit:
  - appends to .mcp/post-commit.log
  - runs `npx -y repomix` to regenerate .mcp/context.xml
- Serena is intentionally NOT auto-run (can be heavy)

### 12.3 CI safety net: .github/workflows/commit-policy.yml
- Validates commit subjects on PRs and pushes

Why this matters:
- Commit messages become reliable semantic labels
- Snapshots are always fresh after commits
- CI prevents drift when collaborating

---

## 13) Helper scripts (human-friendly workflow)

The script generates helper commands under `scripts/`.

### 13.1 Commit helpers
- scripts/commit-checkpoint.(sh|bat)
- scripts/commit-main.(sh|bat)

Goal:
- Make correct commit formats effortless

### 13.2 Incremental context generator
- scripts/generate-context.(sh|bat)

Builds `.mcp/context_incremental.txt` using the Onion Model:
- Layer 0: ARCHITECTURE + CONVENTIONS + latest ADRs
- Layer 1: git diff against base branch + content of changed files

Goal:
- Provide a lightweight “delta context” when you don’t want a full snapshot

### 13.3 ADR creation helper
- scripts/create-adr.sh

Goal:
- One command to create a correctly numbered ADR from the template

### 13.4 Optional Serena helper
- scripts/serena-index.sh

Goal:
- Provide a safe, manual entry point for heavy indexing

---

## 14) Claude Desktop MCP auto-setup (optional)

### 14.1 Config path resolution
- resolveClaudeDesktopConfigPath(): picks the best-known config location per OS

### 14.2 JSON merge
- deepMerge(): merges server definitions into an existing config

### 14.3 setupMcpForClaudeDesktop()
- Writes merged config
- Creates a backup if the config exists
- Supports “do not overwrite existing servers” behavior

Why this matters:
- Reduces MCP setup friction for Claude Desktop users
- Still respects user’s existing configuration via backups

---

## 15) Health check mode

### 15.1 healthCheck()
Validates that the system is correctly installed:
- Required commands exist (git/node/npx)
- Expected files exist
- .gitignore excludes generated artifacts
- Repomix snapshot can be generated

Output:
- A pass/fail checklist with hints

Why this matters:
- Gives confidence that switching between tools will work reliably

---

## 16) Main command flow

### 16.1 Supported commands
- init (default)
- check

### 16.2 init flow (high-level)
- Preflight (git init, dirty warning)
- Detect project type (new vs existing)
- Create directories
- Ensure .gitignore
- Create docs templates
- Create .cursorrules
- Create repomix config
- Create MCP examples
- Create git hooks
- Create helper scripts
- Create CI workflow
- Optional MCP setup for Claude Desktop
- Generate initial snapshot

Why this matters:
- It’s a one-command bootstrap into a deterministic multi-tool workflow

---

## 17) What to extend next (conceptual)

If you later want to support more tools, the safest extension points are:
- Additional snapshot formats (without changing the source-of-truth rule)
- Additional “Layer 2” expansion tools (kept optional)
- More strict invariants in docs/ARCHITECTURE.md
- Additional health checks

Keep the core invariant:
- Tools never sync with each other directly
- They sync through the repository + generated context artifacts

