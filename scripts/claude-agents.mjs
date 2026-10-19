// Cursor agent frontmatter → Claude Code frontmatter.
//
// Upstream agents use Cursor-only keys (`readonly`, `is_background`, `model: fast`) that Claude
// Code ignores, so a "read-only" reviewer gets every tool. Upstream files stay untouched — the
// sync workflow resolves merge conflicts in upstream's favour — so adapted copies are generated
// under <plugin>/agents/claude-code/ and the plugin manifest lists every agent file explicitly
// (a manifest `agents` field replaces Claude Code's default agents/ scan).

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';

export const GENERATED_DIR = 'claude-code';

const WRITE_TOOLS = 'Edit, Write, NotebookEdit';
const CLAUDE_MODEL_ALIASES = new Set(['sonnet', 'opus', 'haiku', 'fable', 'best', 'inherit']);
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;

const isClaudeModel = value => CLAUDE_MODEL_ALIASES.has(value) || value.startsWith('claude-');

// Returns the replacement line(s) for one top-level frontmatter line, or undefined to keep it.
function adaptLine(key, value) {
  if (key === 'readonly') return value === 'true' ? [`disallowedTools: ${WRITE_TOOLS}`] : [];
  if (key === 'is_background') return value === 'true' ? ['background: true'] : [];
  if (key !== 'model') return undefined;
  if (value === 'fast') return ['model: haiku'];
  return isClaudeModel(value) ? undefined : [];
}

// Returns the adapted file text, or null when the agent needs no change.
export function adaptAgent(text) {
  const match = text.match(FRONTMATTER);
  if (!match) return null;

  let changed = false;
  const lines = match[1].split('\n').flatMap(line => {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*?)\s*$/);
    const replacement = kv ? adaptLine(kv[1], kv[2]) : undefined;
    if (replacement === undefined) return [line];
    changed = true;
    return replacement;
  });

  if (!changed) return null;
  return `---\n${lines.join('\n')}\n---\n${text.slice(match[0].length)}`;
}

// Regenerates <pluginDir>/agents/claude-code/ and returns the manifest `agents` paths, or null
// when every agent loads correctly from the default scan.
export function syncPluginAgents(pluginDir) {
  const agentsDir = join(pluginDir, 'agents');
  const generatedDir = join(agentsDir, GENERATED_DIR);
  rmSync(generatedDir, { recursive: true, force: true });
  if (!existsSync(agentsDir)) return null;

  const entries = readdirSync(agentsDir, { withFileTypes: true });
  const nested = entries.filter(e => e.isDirectory()).map(e => e.name);
  // A manifest list would silently drop agents in subfolders; fail loudly until they're handled.
  if (nested.length > 0) throw new Error(`${agentsDir}: unsupported agent subfolders ${nested}`);
  const files = entries.filter(e => e.isFile() && e.name.endsWith('.md')).map(e => e.name).sort();
  const adapted = new Map(
    files
      .map(f => [f, adaptAgent(readFileSync(join(agentsDir, f), 'utf-8'))])
      .filter(([, text]) => text !== null),
  );
  if (adapted.size === 0) return null;

  mkdirSync(generatedDir, { recursive: true });
  for (const [file, text] of adapted) writeFileSync(join(generatedDir, file), text);

  return files.map(f => (adapted.has(f) ? `./agents/${GENERATED_DIR}/${f}` : `./agents/${f}`));
}
