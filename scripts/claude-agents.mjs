// Cursor agent frontmatter → Claude Code frontmatter.
//
// Upstream agents use Cursor-only keys (`readonly`, `is_background`, `model: fast`) that Claude
// Code ignores, so a "read-only" reviewer gets every tool. Upstream files stay untouched — the
// sync workflow resolves merge conflicts in upstream's favour — so adapted copies are generated
// under the fork-owned <plugin>/.claude-plugin/agents/ and the plugin manifest lists every agent
// file explicitly (a manifest `agents` field replaces Claude Code's default agents/ scan).
//
// Every doubt fails closed: an unreadable `readonly` value still denies writes, and a file or
// layout the converter cannot handle throws instead of shipping a writable agent.

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export const GENERATED_DIR = '.claude-plugin/agents';
const MARKER = '.generated-by-sync-manifests';

const DENIED_TOOLS = ['Edit', 'Write', 'NotebookEdit', 'Agent'];
const CLAUDE_MODEL_ALIASES = new Set(['sonnet', 'opus', 'haiku', 'fable', 'inherit']);
const EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const FALSY = new Set(['false', 'no', 'off', '0']);
const TRUTHY = new Set(['true', 'yes', 'on', '1']);
const FRONTMATTER = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;
const TOP_LEVEL_KEY = /^([A-Za-z_]+)[ \t]*:[ \t]*(.*)$/;
const CURSOR_KEY_ANYWHERE = /^[ \t]*['"]?(readonly|is_background)['"]?[ \t]*:/im;
const QUOTED_CURSOR_KEY = /^['"](readonly|is_background)['"][ \t]*:/im;
const SNIFF_LINES = 40;

// `"True" # note` → `true`
const normalizeValue = raw =>
  raw.replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();

const parseKeys = lines =>
  lines.flatMap((line, index) => {
    const kv = line.match(TOP_LEVEL_KEY);
    return kv ? [{ index, key: kv[1].toLowerCase(), value: normalizeValue(kv[2]) }] : [];
  });

// `grok-4.6[effort=xhigh]` → { base: 'grok-4.6', suffix: '', effort: 'xhigh' }
function splitModel(value) {
  const match = value.match(/^([^[]+)(\[[^\]]*\])?$/);
  if (!match) return { base: value, suffix: '', effort: undefined };
  const suffix = match[2] ?? '';
  const effort = suffix.match(/effort=([a-z]+)/i)?.[1].toLowerCase();
  return { base: match[1].trim(), suffix: effort ? '' : suffix, effort };
}

function adaptModel(value) {
  const { base, suffix, effort } = splitModel(value);
  const lower = base.toLowerCase();
  const claude = lower === 'fast' ? 'haiku' : lower;
  const isClaude = CLAUDE_MODEL_ALIASES.has(claude) || claude.startsWith('claude-');
  const model = isClaude ? [`model: ${claude}${suffix}`] : [];
  return { lines: model, effort: EFFORT_LEVELS.has(effort) ? effort : undefined };
}

function deniedTools(existing) {
  if (existing === undefined) return DENIED_TOOLS;
  if (existing.value === '' || existing.value.startsWith('[')) {
    throw new Error('readonly agent with a YAML-list disallowedTools; merge it by hand');
  }
  const current = existing.value.split(',').map(t => t.trim()).filter(Boolean);
  return [...new Set([...current, ...DENIED_TOOLS])];
}

function adaptBackground(value, hasExplicitBackground) {
  const lower = value.toLowerCase();
  if (!TRUTHY.has(lower) && !FALSY.has(lower)) throw new Error(`is_background: ${value}`);
  return TRUTHY.has(lower) && !hasExplicitBackground ? ['background: true'] : [];
}

// Returns { [lineIndex]: replacementLines } for one frontmatter block, plus lines to append.
function planFrontmatter(lines) {
  const keys = parseKeys(lines);
  const byKey = new Map(keys.map(k => [k.key, k]));
  const replacements = new Map();
  const append = [];

  const readonly = byKey.get('readonly');
  if (readonly) {
    replacements.set(readonly.index, []);
    if (!FALSY.has(readonly.value.toLowerCase())) {
      const existing = byKey.get('disallowedtools');
      const tools = `disallowedTools: ${deniedTools(existing).join(', ')}`;
      if (existing) replacements.set(existing.index, [tools]);
      else append.push(tools);
    }
  }

  const background = byKey.get('is_background');
  if (background) {
    replacements.set(background.index, adaptBackground(background.value, byKey.has('background')));
  }

  for (const model of keys.filter(k => k.key === 'model')) {
    const { lines: modelLines, effort } = adaptModel(model.value);
    if (modelLines[0] !== lines[model.index]) replacements.set(model.index, modelLines);
    if (effort && !byKey.has('effort')) append.push(`effort: ${effort}`);
  }

  return { replacements, append };
}

// Returns the adapted file text, or null when the agent needs no change.
export function adaptAgent(text, source = 'the upstream agent') {
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const body = text.slice(bom.length).replace(/\r\n/g, '\n');
  const match = body.match(FRONTMATTER);

  if (!match) {
    const head = body.split('\n').slice(0, SNIFF_LINES).join('\n');
    if (CURSOR_KEY_ANYWHERE.test(head)) throw new Error(`${source}: Cursor keys outside frontmatter`);
    return null;
  }

  if (QUOTED_CURSOR_KEY.test(match[1])) throw new Error(`${source}: quoted Cursor key`);
  const lines = match[1].split('\n');
  const { replacements, append } = planFrontmatter(lines);
  if (replacements.size === 0 && append.length === 0) return null;

  const adapted = lines.flatMap((line, i) => replacements.get(i) ?? [line]);
  const marker = `# Generated by scripts/sync-manifests.mjs from ${source}; do not edit.`;
  const frontmatter = [marker, ...adapted, ...append].join('\n');
  const out = `---\n${frontmatter}\n---\n${body.slice(match[0].length)}`;
  return bom + out.replace(/\n/g, eol);
}

const isAgentFile = (dir, entry) =>
  entry.name.endsWith('.md') &&
  (entry.isFile() || (entry.isSymbolicLink() && statSync(join(dir, entry.name)).isFile()));

function clearGenerated(generatedDir) {
  if (!existsSync(generatedDir)) return;
  if (!existsSync(join(generatedDir, MARKER))) {
    throw new Error(`${generatedDir} exists but was not generated here; refusing to delete it`);
  }
  rmSync(generatedDir, { recursive: true });
}

// Regenerates <pluginDir>/.claude-plugin/agents/ and returns the manifest `agents` paths, or
// null when every agent loads correctly from the default scan.
export function syncPluginAgents(pluginDir) {
  const agentsDir = join(pluginDir, 'agents');
  const generatedDir = join(pluginDir, GENERATED_DIR);
  const entries = existsSync(agentsDir) ? readdirSync(agentsDir, { withFileTypes: true }) : [];
  const files = entries.filter(e => isAgentFile(agentsDir, e)).map(e => e.name).sort();
  const adapted = new Map(
    files
      .map(f => [f, adaptAgent(readFileSync(join(agentsDir, f), 'utf-8'), `agents/${f}`)])
      .filter(([, text]) => text !== null),
  );

  if (adapted.size === 0) {
    clearGenerated(generatedDir);
    return null;
  }
  // A manifest list would silently drop agents in subfolders; fail before touching anything.
  const nested = entries.filter(e => e.isDirectory()).map(e => e.name);
  if (nested.length > 0) throw new Error(`${agentsDir}: unsupported agent subfolders ${nested}`);

  clearGenerated(generatedDir);
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(join(generatedDir, MARKER), 'Regenerated by scripts/sync-manifests.mjs.\n');
  for (const [file, text] of adapted) writeFileSync(join(generatedDir, file), text);

  return files.map(f => (adapted.has(f) ? `./${GENERATED_DIR}/${f}` : `./agents/${f}`));
}

// The manifest with its `agents` field set to `agents`, or removed when `agents` is null.
export function applyAgentsField(manifest, agents) {
  const { agents: _previous, ...rest } = manifest;
  return agents ? { ...rest, agents } : rest;
}
