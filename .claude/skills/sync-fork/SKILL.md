# Sync Fork with Upstream

## Overview

This repository is a fork of `cursor/plugins` that integrates `.claude-plugin/` manifests for Claude Code compatibility. The maintainers preserve a single custom commit layered on top of the upstream repository. Syncing involves rebasing that commit onto the latest `upstream/main` and refreshing all Claude Code manifests accordingly.

## Workflow

### 1. Fetch and analyze

```sh
git fetch upstream
git log --oneline HEAD..upstream/main        # new upstream commits
git log --oneline upstream/main..HEAD        # our commits (should be 1)
git diff --stat HEAD..upstream/main          # what changed upstream
```

If `HEAD..upstream/main` is empty, there's nothing to sync.

### 2. Rebase

```sh
git rebase upstream/main
```

We maintain exactly one commit on top of upstream. Rebase keeps history linear.

### 3. Resolve conflicts

**README.md** will almost always conflict. The resolution strategy:

- Use **upstream's content** as the foundation (it contains the current plugin inventory)
- Reapply fork-specific sections: title, description, quick-start, changelog notes, and update guidance
- Update plugin tables and installation examples to reflect the current plugin ecosystem

### 4. Handle plugin changes

Review the upstream diff for added, removed, or renamed plugin directories.

**For each ADDED plugin:**
- Create `<plugin>/.claude-plugin/plugin.json` with the plugin's metadata
- Add entry to `.claude-plugin/marketplace.json`
- Add row to README.md plugin table

**For each REMOVED plugin:**
- Delete `<plugin>/.claude-plugin/plugin.json`
- Remove entry from `.claude-plugin/marketplace.json`
- Remove row from README.md plugin table

**For each RENAMED plugin:**
- Treat as remove old + add new

### 5. Complete rebase

```sh
git add -A
git rebase --continue
```

### 6. Verify

```sh
git log --oneline -5                    # our commit on top
git diff upstream/main --stat           # only .claude-plugin/ files + README.md
```

Every plugin directory should have `.claude-plugin/plugin.json`. The marketplace.json `plugins` array should match the set of plugin directories exactly.

### 7. Push

```sh
git push --force-with-lease origin main
```

## Why rebase + force push (not PRs)

This approach maintains the single-commit structure. PRs would create merge commits, breaking the single-commit structure.

The verification step serves as the review checkpoint.
