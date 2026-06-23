#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const readJSON = p => JSON.parse(readFileSync(p, 'utf-8'));

// Acronyms to keep uppercase in display names
const ACRONYMS = new Set(['CLI', 'PR', 'SDK', 'MCP', 'API', 'URL', 'CI', 'CD']);

// Overrides for names that should not be title-cased
const DISPLAY_NAME_OVERRIDES = { pstack: 'pstack' };

function toDisplayName(name) {
  if (DISPLAY_NAME_OVERRIDES[name]) return DISPLAY_NAME_OVERRIDES[name];
  return name
    .split('-')
    .map(w => ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

const marketplace = readJSON(join(root, '.claude-plugin', 'marketplace.json'));
const REPO_SLUG = 'SmailG/claude-cursor-plugins';
const MARKETPLACE_NAME = marketplace.name;

const tableRows = marketplace.plugins
  .map(p => {
    const displayName = toDisplayName(p.name);
    const author = p.author?.name ?? 'Cursor';
    const category = p.category === 'developer-tools' ? 'Developer Tools' : p.category;
    const pluginPath = p.source.replace(/^\.\//, '');
    return `| \`${p.name}\` | [${displayName}](${pluginPath}/) | ${author} | ${category} | ${p.description} |`;
  })
  .join('\n');

const readme = `\
# cursor-plugins-claude

[Cursor's official plugins](https://github.com/cursor/plugins) adapted for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Cursor ships a set of high-quality agent plugins — rules, skills, and MCP integrations — but they target Cursor's own runtime. This fork adds the \`.claude-plugin/\` manifests that Claude Code needs, so you can install the same plugins with a single command.

## Quick start

\`\`\`sh
# 1. Add the marketplace
/plugin marketplace add ${REPO_SLUG}

# 2. Install any plugin
/plugin install cursor-team-kit@${MARKETPLACE_NAME}
\`\`\`

You can install as many plugins as you need:

\`\`\`sh
/plugin install continual-learning@${MARKETPLACE_NAME}
/plugin install teaching@${MARKETPLACE_NAME}
\`\`\`

## Available plugins

| \`name\` | Plugin | Author | Category | \`description\` (from marketplace) |
|:-------|:-------|:-------|:---------|:--------------------------------------|
${tableRows}

## What changed from upstream

This fork adds a \`.claude-plugin/\` directory at the repo root and inside each plugin, containing the marketplace and plugin manifests required by Claude Code. No plugin logic or rules have been modified — the plugins behave identically to their upstream versions.

## Keeping up to date

This repo tracks [cursor/plugins](https://github.com/cursor/plugins) and syncs automatically every day via a [GitHub Actions workflow](.github/workflows/sync-upstream.yml) — upstream changes are rebased in, new plugin manifests are generated, and a PR is opened and auto-merged once CI passes. No manual steps needed.

## License

MIT
`;

writeFileSync(join(root, 'README.md'), readme);
console.log(`README.md rebuilt (${marketplace.plugins.length} plugins)`);
