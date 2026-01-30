# Claude Client Compatibility Report

## Overview

This project is **not tied to a specific Claude user interface**.
It is built around a **repository-first workflow**, where Git history, structured files, and generated context artifacts serve as the shared source of truth.

Claude Desktop is used as a **reference client** for some optional automation features, but the **core workflow works equally well** with:

- Claude Code Desktop
- Claude Code CLI
- Claude VS Code extension
- Any Claude interface that can read files from a repository

---

## Core workflow (client-agnostic)

The following components are **fully independent of the Claude client** being used:

- Git-based project state and intent tracking
- Commit-driven workflow and commit discipline
- Deterministic repository snapshots (`.mcp/context.xml`)
- Incremental context generation
- ADRs, architecture docs, and conventions
- Cursor ↔ Claude parallel work via a shared repository
- Post-commit hooks and context regeneration
- Tech stack detection and project bootstrapping

These elements operate purely on:
- files
- Git history
- shell scripts

As a result, **the same workflow applies regardless of how Claude is accessed**.

---

## Claude Desktop (reference client)

Claude Desktop is treated as the **reference implementation** for one specific reason:

- It provides a stable and documented configuration format for **MCP (Model Context Protocol) servers**

Because of this, the bootstrap script includes an **optional convenience feature**:

```bash
node bootstrap.js init --setup-mcp
```

This flag:
- automatically merges Repomix and Serena MCP servers into Claude Desktop configuration
- creates backups before modifying any config files
- reduces manual setup friction for Desktop users

**This step is optional and not required for the workflow to function.**

---

## Claude Code CLI

When using Claude Code via the CLI:

- The bootstrap workflow works without modification
- MCP auto-setup is simply skipped
- Context artifacts are generated the same way
- Files are passed to Claude CLI manually or via custom tooling

The repository remains the shared context; only the interaction method differs.

---

## Claude VS Code extension

When using the Claude VS Code extension:

- The workflow remains unchanged
- Context files are opened directly in the editor
- ADRs, architecture docs, and snapshots are available as normal files
- MCP auto-setup is not required

VS Code acts as another UI layer over the same repository-based system.

---

## Summary of differences

| Aspect | Desktop | CLI | VS Code |
|------|--------|-----|--------|
| Core workflow | ✅ | ✅ | ✅ |
| Repository as shared context | ✅ | ✅ | ✅ |
| Commit-driven context | ✅ | ✅ | ✅ |
| MCP auto-setup | ✅ (optional) | ❌ | ❌ |
| Manual MCP setup | Optional | Optional | Optional |
| Required for workflow | ❌ | ❌ | ❌ |

---

## Key design principle

> The system defines the context.
> Tools are interchangeable interfaces.

Claude Desktop is **not a dependency** — it is simply the most convenient client for demonstrating MCP automation today.

