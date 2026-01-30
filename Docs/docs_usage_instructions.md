# Usage Instructions — AI Development Workflow

This document explains how to use the system in practice. It focuses on *workflow*, not internal implementation.

---

## Overview

This workflow is designed to work with both new and existing projects.

When applied to an existing repository, the first goal is **not refactoring**, but documenting the current state and introducing commit-based coordination.

For a **new project**, initialize a Git repository first:

```bash
git init
```

Then run the bootstrap script.

---

## 1. Installation (one time)

Run the bootstrap script in the root of your project (empty or existing):

```bash
# Initialize project structure, hooks, and documents
node bootstrap.js init

# OR initialize and also configure Claude Desktop MCP (recommended)
node bootstrap.js init --setup-mcp

# Optional: overwrite existing git hooks/scripts (creates a backup first)
node bootstrap.js init --force

# Show all commands and options
node bootstrap.js --help
```

After this, restart **Claude Desktop** so it can detect the new MCP tools (if you used `--setup-mcp`).

---

## 2. Daily workflow

Your main responsibility is to keep the **history clean**. All tools synchronize **only through commits**.

### Scenario: “I want to add a new feature”

---

### Step 1: Architecture & planning (Claude Code)

Use Claude Code to define intent and rules.

Example prompt:

> Plan a payment module. Review ARCHITECTURE.md and create an ADR for Stripe integration.

Claude will:

- Read existing architecture
- Create a new ADR file (for example: `docs/adr/ADR-003-stripe.md`)

**Important:** Ask Claude to commit the change.

At this moment:

- The commit is created
- The post-commit hook runs
- Project context is automatically updated

---

### Step 2: Implementation (Cursor)

Switch to Cursor for implementation.

- Open Cursor
- Pull latest changes (or wait if working locally)
- Review the ADR created by Claude
- Write code manually or with Cursor’s AI assistance

#### Intermediate progress (checkpoint commits)

Instead of chaotic commits like `wip` or `fix`, use checkpoint helpers:

```bash
# macOS / Linux
./scripts/commit-checkpoint.sh auth "added token validation"

# Windows
scripts\commit-checkpoint.bat auth "added token validation"
```

This creates a semantic checkpoint commit:

```
checkpoint(auth): added token validation
```

The system understands this as work-in-progress, but context is still refreshed.

---

### Step 3: Finalization (main commit)

When the feature is complete:

```bash
# macOS / Linux
./scripts/commit-main.sh feat payment "implemented basic Stripe payment flow"

# Windows
scripts\commit-main.bat feat payment "implemented basic Stripe payment flow"
```

This commit becomes a **stable rule** for the system.

---

### Step 4: Review (Claude Code)

Return to Claude Code for review.

Example prompt:

> Review the latest changes against ADR-003. Are there any security gaps?

Thanks to Repomix, Claude sees a fresh snapshot of the project state.

---

## 3. Common commands

| Action              | macOS / Linux                                   | Windows                                        | Purpose                     |
| ------------------- | ----------------------------------------------- | ---------------------------------------------- | --------------------------- |
| Initialize system   | `node bootstrap.js init`                        | `node bootstrap.js init`                       | Initial setup               |
| Init + MCP setup    | `node bootstrap.js init --setup-mcp`            | `node bootstrap.js init --setup-mcp`           | Setup and configure Claude Desktop MCP |
| Init (overwrite)    | `node bootstrap.js init --force`                | `node bootstrap.js init --force`               | Overwrite hooks/scripts (backup created) |
| Health check        | `node bootstrap.js check`                       | `node bootstrap.js check`                      | Validate setup              |
| Show usage / help   | `node bootstrap.js --help`                     | `node bootstrap.js --help`                     | List commands and options   |
| Checkpoint commit   | `./scripts/commit-checkpoint.sh <scope> <msg>`  | `scripts\commit-checkpoint.bat <scope> <msg>`  | Save progress (Cursor only) |
| Main commit         | `./scripts/commit-main.sh <type> <scope> <msg>` | `scripts\commit-main.bat <type> <scope> <msg>` | Finalize work (Cursor only) |
| Create ADR          | `./scripts/create-adr.sh <slug>`                | (use Git Bash)                                 | Record decisions (slug e.g. stripe-integration) |
| Incremental context | `./scripts/generate-context.sh`                 | `scripts\generate-context.bat`                 | Reduce token usage          |

---

## 4. Saving tokens (Onion Context Model)

For large projects, sending the full repository to Claude can be expensive.

Use incremental context instead:

```bash
./scripts/generate-context.sh
```

This generates:

```
.mcp/context_incremental.txt
```

This file contains:

- Architecture (always)
- Latest ADRs
- Only files changed in the current branch

Upload this file to Claude instead of the entire project.

---

## 5. Troubleshooting

**Q: Claude does not see my changes**\
A: Did you commit them?

Context snapshots are updated **only after commits**. If needed, you can run `npx repomix` manually.

---

**Q: Git rejects my commit message**\
A: The commit does not follow conventions.

❌ Invalid:

```
git commit -m "fixed bug"
```

✅ Valid:

```
git commit -m "fix(auth): handle null token"
```

Or use helper scripts to avoid mistakes.

---

**Q: Permission errors on Windows**\
A: Run the terminal as Administrator or use Git Bash.

The script attempts to handle permission issues automatically, but some environments still require elevated rights.

---

## 6. Known limitations

- **Windows incremental context:** `scripts/generate-context.bat` includes only one ADR; use Git Bash and `./scripts/generate-context.sh` for up to five.
- **Paths with spaces:** Generate-context scripts may not handle changed filenames containing spaces correctly.
- **Post-commit on Windows:** Runs in Git’s shell (Git Bash); ensure Git for Windows is installed.
- **create-adr:** No Windows batch; use Git Bash for `./scripts/create-adr.sh <slug>`.

