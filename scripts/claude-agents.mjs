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
// YAML 1.2 booleans only: a YAML 1.2 parser reads `no` or `off` as a (truthy) string.
const FALSY = new Set(['false']);
const TRUTHY = new Set(['true']);
const BOM = '\uFEFF';
const FRONTMATTER = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;
const TOP_LEVEL_KEY = /^([A-Za-z_]+)[ \t]*:[ \t]*(.*)$/;
// A Cursor key in any shape: quoted, indented, in a flow map, or as a `? key` complex key.
const CURSOR_KEY_MENTION = /\b(readonly|is_background)['"]?[ \t]*(?::|$)/gim;
const UNIQUE_KEYS = ['readonly', 'is_background', 'disallowedtools', 'model', 'effort', 'background'];
const GENERATED_PATH = /^\.\/(agents|\.claude-plugin\/agents)\/[^/]+\.md$/;
// A quoted or `? ` key with a backslash could spell a Cursor key in escapes.
const ESCAPED_KEY = /^[ \t]*(?:['"]|\?)[^\n]*\\/m;

const stripComment = raw => raw.replace(/\s+#.*$/, '').trim();
// `"True" # note` → `true`
const normalizeValue = raw => stripComment(raw).replace(/^(['"])(.*)\1$/, '$2').trim();

const parseKeys = lines =>
  lines.flatMap((line, index) => {
    const kv = line.match(TOP_LEVEL_KEY);
    if (!kv) return [];
    const quoted = /^['"]/.test(stripComment(kv[2]));
    return [{ index, key: kv[1].toLowerCase(), value: normalizeValue(kv[2]), quoted }];
  });

// How often each Cursor key appears in any shape.
const cursorKeyMentions = text =>
  [...text.matchAll(CURSOR_KEY_MENTION)].reduce((counts, m) => {
    const name = m[1].toLowerCase();
    return new Map(counts).set(name, (counts.get(name) ?? 0) + 1);
  }, new Map());

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
  if (existing.value === '' || /^[[>|]/.test(existing.value)) {
    throw new Error('readonly agent with a YAML-list or block disallowedTools; merge it by hand');
  }
  const current = existing.value.split(',').map(t => t.trim()).filter(Boolean);
  return [...new Set([...current, ...DENIED_TOOLS])];
}

function adaptBackground(value, hasExplicitBackground) {
  const lower = value.toLowerCase();
  if (!TRUTHY.has(lower) && !FALSY.has(lower)) throw new Error(`is_background: ${value}`);
  return TRUTHY.has(lower) && !hasExplicitBackground ? ['background: true'] : [];
}

// Throws unless every Cursor key is a plain top-level key and no relevant key repeats.
function checkKeys(frontmatter, keys, source) {
  if (ESCAPED_KEY.test(frontmatter)) throw new Error(`${source}: escaped quoted or complex key`);
  for (const [name, count] of cursorKeyMentions(frontmatter)) {
    const plain = keys.filter(k => k.key === name).length;
    if (count !== plain) throw new Error(`${source}: ${name} is not a plain top-level key`);
  }
  for (const name of UNIQUE_KEYS) {
    if (keys.filter(k => k.key === name).length > 1) throw new Error(`${source}: duplicate ${name}`);
  }
}

// Returns { [lineIndex]: replacementLines } for one frontmatter block, plus lines to append.
function planFrontmatter(lines, keys) {
  const byKey = new Map(keys.map(k => [k.key, k]));
  const replacements = new Map();
  const append = [];

  const readonly = byKey.get('readonly');
  if (readonly) {
    replacements.set(readonly.index, []);
    // A quoted "false" is a string, which Cursor reads as true.
    if (readonly.quoted || !FALSY.has(readonly.value.toLowerCase())) {
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

  const model = byKey.get('model');
  if (model) {
    const { lines: modelLines, effort } = adaptModel(model.value);
    if (modelLines[0] !== lines[model.index]) replacements.set(model.index, modelLines);
    if (effort && !byKey.has('effort')) append.push(`effort: ${effort}`);
  }

  return { replacements, append };
}

// Returns the adapted file text, or null when the agent needs no change.
export function adaptAgent(text, source = 'the upstream agent') {
  const bom = text.startsWith(BOM) ? BOM : '';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const body = text.slice(bom.length).replace(/\r\n/g, '\n');
  const match = body.match(FRONTMATTER);

  if (!match) {
    if (cursorKeyMentions(body).size > 0) throw new Error(`${source}: Cursor keys outside frontmatter`);
    return null;
  }

  const lines = match[1].split('\n');
  const keys = parseKeys(lines);
  checkKeys(match[1], keys, source);
  const { replacements, append } = planFrontmatter(lines, keys);
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

// Relative paths of the .md agents in agents/ subfolders, which Claude Code also scans.
function nestedAgents(agentsDir, prefix = '') {
  return readdirSync(join(agentsDir, prefix), { withFileTypes: true }).flatMap(entry => {
    const rel = join(prefix, entry.name);
    if (entry.isDirectory()) return nestedAgents(agentsDir, rel);
    return prefix && isAgentFile(join(agentsDir, prefix), entry) ? [rel] : [];
  });
}

// Deletes the generated folder, refusing if it holds anything the generator did not write.
function clearGenerated(generatedDir) {
  if (!existsSync(generatedDir)) return;
  const markerPath = join(generatedDir, MARKER);
  if (!existsSync(markerPath)) {
    throw new Error(`${generatedDir} exists but was not generated here; refusing to delete it`);
  }
  const written = new Set(readFileSync(markerPath, 'utf-8').split('\n').filter(Boolean));
  const foreign = readdirSync(generatedDir).filter(f => f !== MARKER && !written.has(f));
  if (foreign.length > 0) throw new Error(`${generatedDir} holds files not generated here: ${foreign}`);
  rmSync(generatedDir, { recursive: true });
}

const readAgent = (agentsDir, file) => adaptAgent(readFileSync(join(agentsDir, file), 'utf-8'), `agents/${file}`);

// Regenerates <pluginDir>/.claude-plugin/agents/ and returns the manifest `agents` paths, or
// null when every agent loads correctly from the default scan.
export function syncPluginAgents(pluginDir) {
  const agentsDir = join(pluginDir, 'agents');
  const generatedDir = join(pluginDir, GENERATED_DIR);
  const entries = existsSync(agentsDir) ? readdirSync(agentsDir, { withFileTypes: true }) : [];
  const files = entries.filter(e => isAgentFile(agentsDir, e)).map(e => e.name).sort();
  const adapted = new Map(files.map(f => [f, readAgent(agentsDir, f)]).filter(([, text]) => text !== null));

  // Fail before touching anything: a nested agent would load unadapted, and a manifest list
  // would silently drop agents in subfolders.
  const nested = entries.some(e => e.isDirectory()) ? nestedAgents(agentsDir) : [];
  const nestedAdapted = nested.filter(f => readAgent(agentsDir, f) !== null);
  if (nestedAdapted.length > 0) throw new Error(`${agentsDir}: nested agents need adapting: ${nestedAdapted}`);
  if (adapted.size === 0) {
    clearGenerated(generatedDir);
    return null;
  }
  const subfolders = entries.filter(e => e.isDirectory()).map(e => e.name);
  if (subfolders.length > 0) throw new Error(`${agentsDir}: unsupported agent subfolders ${subfolders}`);

  clearGenerated(generatedDir);
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(join(generatedDir, MARKER), [...adapted.keys()].join('\n') + '\n');
  for (const [file, text] of adapted) writeFileSync(join(generatedDir, file), text);

  return files.map(f => (adapted.has(f) ? `./${GENERATED_DIR}/${f}` : `./agents/${f}`));
}

const isGeneratedAgentsField = value =>
  value === undefined ||
  (Array.isArray(value) && value.every(p => GENERATED_PATH.test(p)));

// The manifest with its `agents` field set to `agents`, or removed when `agents` is null.
// Refuses to replace an `agents` field this script did not write.
export function applyAgentsField(manifest, agents) {
  const { agents: previous, ...rest } = manifest;
  if (!isGeneratedAgentsField(previous)) {
    throw new Error(`manifest "${manifest.name}" sets its own agents field; merge it by hand`);
  }
  return agents ? { ...rest, agents } : rest;
}
