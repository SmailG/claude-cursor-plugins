#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

import { applyAgentsField, syncPluginAgents } from './claude-agents.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');

const SKIP = new Set([
  '.git', '.github', '.claude', '.claude-plugin', '.cursor-plugin',
  'schemas', 'scripts', 'docs', 'node_modules',
]);

const readJSON = p => JSON.parse(readFileSync(p, 'utf-8'));
const writeJSON = (p, d) => writeFileSync(p, JSON.stringify(d, null, 2) + '\n');

// All top-level dirs that have a .cursor-plugin/plugin.json
const pluginDirs = readdirSync(root).filter(name => {
  if (SKIP.has(name) || name.startsWith('.')) return false;
  const full = join(root, name);
  return statSync(full).isDirectory() && existsSync(join(full, '.cursor-plugin', 'plugin.json'));
});

const pluginDirSet = new Set(pluginDirs);
let added = 0;
let removed = 0;

// Add missing .claude-plugin/plugin.json for new plugins
for (const dir of pluginDirs) {
  const dest = join(root, dir, '.claude-plugin', 'plugin.json');
  if (!existsSync(dest)) {
    const src = readJSON(join(root, dir, '.cursor-plugin', 'plugin.json'));
    mkdirSync(join(root, dir, '.claude-plugin'), { recursive: true });
    writeJSON(dest, {
      name: src.name,
      description: src.description ?? '',
      author: src.author ?? { name: 'Cursor', email: 'plugins@cursor.com' },
    });
    console.log(`  + ${dir}/.claude-plugin/plugin.json`);
    added++;
  }
}

// Point each manifest at Claude Code copies of agents that use Cursor-only frontmatter
for (const dir of pluginDirs) {
  const manifestPath = join(root, dir, '.claude-plugin', 'plugin.json');
  const manifest = readJSON(manifestPath);
  const next = applyAgentsField(manifest, syncPluginAgents(join(root, dir)));
  if (JSON.stringify(next) !== JSON.stringify(manifest)) {
    writeJSON(manifestPath, next);
    console.log(`  ~ ${dir}/.claude-plugin/plugin.json (agents)`);
  }
}

// Remove .claude-plugin/ for plugins deleted upstream: the folder holds nothing else. A folder
// with other content is a Claude-native plugin upstream ships, so leave it alone.
for (const name of readdirSync(root)) {
  if (SKIP.has(name) || name.startsWith('.') || pluginDirSet.has(name)) continue;
  const full = join(root, name);
  if (!existsSync(full) || !statSync(full).isDirectory()) continue;
  const claudeDir = join(full, '.claude-plugin');
  const onlyClaudeDir = readdirSync(full).every(entry => entry === '.claude-plugin');
  if (onlyClaudeDir && existsSync(join(claudeDir, 'plugin.json'))) {
    rmSync(claudeDir, { recursive: true });
    console.log(`  - ${name}/.claude-plugin/`);
    removed++;
  }
}

// Build name→dir map from current .claude-plugin/plugin.json files
const nameToDir = new Map(
  pluginDirs.map(dir => {
    const p = readJSON(join(root, dir, '.claude-plugin', 'plugin.json'));
    return [p.name, dir];
  }),
);
const currentNames = new Set(nameToDir.keys());

// Rebuild marketplace.json, preserving existing plugin order and appending new ones
const marketplacePath = join(root, '.claude-plugin', 'marketplace.json');
const existing = readJSON(marketplacePath);
const existingNames = existing.plugins.map(p => p.name);
const existingNameSet = new Set(existingNames);

const orderedNames = [
  ...existingNames.filter(n => currentNames.has(n)),
  ...[...currentNames].filter(n => !existingNameSet.has(n)).sort(),
];

const plugins = orderedNames.map(name => {
  const dir = nameToDir.get(name);
  const plugin = readJSON(join(root, dir, '.claude-plugin', 'plugin.json'));
  return {
    name: plugin.name,
    description: plugin.description,
    source: `./${dir}`,
    category: 'developer-tools',
    author: plugin.author,
  };
});

writeJSON(marketplacePath, {
  $schema: existing.$schema,
  name: existing.name,
  description: existing.description,
  owner: existing.owner,
  plugins,
});

console.log(`Manifests synced: ${plugins.length} plugins (+${added} -${removed})`);
