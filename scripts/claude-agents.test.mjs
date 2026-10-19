import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { adaptAgent, syncPluginAgents } from './claude-agents.mjs';

const agent = (frontmatter, body = '\n# Body\n\nmodel: fast stays in the body\n') =>
  `---\n${frontmatter}\n---\n${body}`;

test('returns null when no Cursor-only key is present', () => {
  assert.equal(adaptAgent(agent('name: a\ndescription: d\nmodel: inherit')), null);
});

test('maps readonly: true to disallowedTools for the write tools', () => {
  const out = adaptAgent(agent('name: a\ndescription: d\nreadonly: true'));
  assert.match(out, /^disallowedTools: Edit, Write, NotebookEdit$/m);
  assert.doesNotMatch(out, /^readonly:/m);
});

test('drops readonly: false without adding disallowedTools', () => {
  const out = adaptAgent(agent('name: a\ndescription: d\nreadonly: false'));
  assert.doesNotMatch(out, /readonly|disallowedTools/);
});

test('maps is_background: true to background: true', () => {
  const out = adaptAgent(agent('name: a\ndescription: d\nis_background: true'));
  assert.match(out, /^background: true$/m);
  assert.doesNotMatch(out, /is_background/);
});

test('maps model: fast to haiku', () => {
  const out = adaptAgent(agent('name: a\ndescription: d\nmodel: fast'));
  assert.match(out, /^model: haiku$/m);
});

test('drops a model Claude Code cannot resolve so the agent uses the default order', () => {
  const out = adaptAgent(agent('name: a\ndescription: d\nmodel: grok-4.6[effort=xhigh]'));
  assert.equal(out, agent('name: a\ndescription: d'));
});

test('keeps a Claude model id unchanged', () => {
  assert.equal(adaptAgent(agent('name: a\ndescription: d\nmodel: claude-opus-5-5')), null);
});

test('leaves the body untouched, including lines that look like frontmatter', () => {
  const body = '\n# Body\n\nreadonly: true\nmodel: fast\n';
  const out = adaptAgent(agent('name: a\ndescription: d\nreadonly: true', body));
  assert.ok(out.endsWith(`---\n${body}`));
});

test('preserves a multi-line description block', () => {
  const fm = 'name: a\ndescription: >-\n  line one\n  line two\nis_background: true';
  const out = adaptAgent(agent(fm));
  assert.match(out, /description: >-\n  line one\n  line two\n/);
});

test('returns null for a file without frontmatter', () => {
  assert.equal(adaptAgent('# no frontmatter\nreadonly: true\n'), null);
});

const pluginWith = files => {
  const dir = mkdtempSync(join(tmpdir(), 'claude-agents-'));
  mkdirSync(join(dir, 'agents'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'agents', name), text);
  return dir;
};

test('lists generated copies and untouched originals together', () => {
  const dir = pluginWith({
    'a.md': agent('name: a\ndescription: d\nreadonly: true'),
    'b.md': agent('name: b\ndescription: d'),
  });
  assert.deepEqual(syncPluginAgents(dir), ['./agents/claude-code/a.md', './agents/b.md']);
  assert.match(readFileSync(join(dir, 'agents/claude-code/a.md'), 'utf-8'), /disallowedTools/);
});

test('returns null and removes stale copies once no agent needs adapting', () => {
  const dir = pluginWith({ 'b.md': agent('name: b\ndescription: d') });
  mkdirSync(join(dir, 'agents/claude-code'));
  writeFileSync(join(dir, 'agents/claude-code/old.md'), 'stale');
  assert.equal(syncPluginAgents(dir), null);
  assert.equal(existsSync(join(dir, 'agents/claude-code')), false);
});

test('refuses agent subfolders, which a manifest list would silently drop', () => {
  const dir = pluginWith({ 'a.md': agent('name: a\ndescription: d\nreadonly: true') });
  mkdirSync(join(dir, 'agents/review'));
  assert.throws(() => syncPluginAgents(dir), /unsupported agent subfolders review/);
});

test('ignores files in agents/ that are not .md agents', () => {
  const dir = pluginWith({
    'a.md': agent('name: a\ndescription: d\nreadonly: true'),
    'README.txt': 'notes',
  });
  assert.deepEqual(syncPluginAgents(dir), ['./agents/claude-code/a.md']);
});
