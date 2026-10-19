import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { adaptAgent, applyAgentsField, syncPluginAgents } from './claude-agents.mjs';

const BOM = '\uFEFF';
const BODY = '\n# Body\n\nreadonly: true\nmodel: fast\n';
const DENY = 'disallowedTools: Edit, Write, NotebookEdit, Agent';
const agent = (frontmatter, body = BODY) => `---\n${frontmatter}\n---\n${body}`;
const fm = text => text.replace(BOM, '').replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---/)[1];
const adaptFm = frontmatter => fm(adaptAgent(agent(`name: a\ndescription: d\n${frontmatter}`)));
const denies = out => assert.match(out, new RegExp(`^${DENY}$`, 'm'));

test('returns null when no Cursor-only key is present', () => {
  assert.equal(adaptAgent(agent('name: a\ndescription: d\nmodel: inherit')), null);
});

for (const value of ['true', '"true"', "'true'", 'True', 'yes', 'no', 'off', '0', 'true # reads only', 'maybe']) {
  test(`readonly: ${value} denies the write tools (fails closed)`, () => {
    const out = adaptFm(`readonly: ${value}`);
    denies(out);
    assert.doesNotMatch(out, /readonly/i);
  });
}

for (const value of ['false', '"false"', 'False', 'FALSE', 'false # writes']) {
  test(`readonly: ${value} drops the key without a deny list`, () => {
    assert.doesNotMatch(adaptFm(`readonly: ${value}`), /readonly|disallowedTools/i);
  });
}

test('matches the readonly key case-insensitively and with space before the colon', () => {
  denies(adaptFm('Readonly : true'));
});

const HIDDEN_KEYS = {
  'a double-quoted key': '"readonly": true',
  'an upper-case quoted key': '"READONLY": true',
  'a single-quoted key': "'is_background': true",
  'an indented key': '  readonly: true',
  'a tab-indented key': '\treadonly: true',
  'a flow map': 'meta: {readonly: true}',
  'a flow map with a spaced colon': 'meta: {readonly : true}',
  'a complex key': '? is_background\n: true',
};
for (const [shape, frontmatter] of Object.entries(HIDDEN_KEYS)) {
  test(`throws on a Cursor key hidden in ${shape}`, () => {
    assert.throws(() => adaptAgent(agent(`name: a\ndescription: d\n${frontmatter}`)), /not a plain top-level key/);
  });
}

test('throws on a Cursor key hidden in fully indented frontmatter', () => {
  assert.throws(() => adaptAgent(agent('  name: a\n  readonly: true')), /not a plain top-level key/);
});

test('allows a key that only ends in readonly', () => {
  assert.equal(adaptAgent(agent('name: a\ndescription: d\nnotreadonly: true')), null);
});

test('allows the word readonly in prose', () => {
  assert.equal(adaptAgent(agent('name: a\ndescription: Runs readonly checks on is_background jobs')), null);
});

for (const key of ['readonly', 'is_background', 'disallowedTools', 'model', 'effort', 'background']) {
  test(`throws on a duplicate ${key} key`, () => {
    const text = agent(`name: a\ndescription: d\nreadonly: true\n${key}: false\n${key}: false`);
    assert.throws(() => adaptAgent(text), new RegExp(`duplicate ${key.toLowerCase()}`));
  });
}

test('ignores an empty entry in an existing disallowedTools', () => {
  assert.match(adaptFm('disallowedTools: Bash,\nreadonly: true'), /^disallowedTools: Bash, Edit, Write, NotebookEdit, Agent$/m);
});

test('merges readonly into an existing scalar disallowedTools without duplicating the key', () => {
  assert.deepEqual(adaptFm('disallowedTools: Bash, Edit\nreadonly: true').match(/^disallowedTools:.*$/gm), [
    'disallowedTools: Bash, Edit, Write, NotebookEdit, Agent',
  ]);
});

for (const list of ['disallowedTools:\n  - Bash', 'disallowedTools: [Bash]']) {
  test(`refuses to merge into a YAML-list disallowedTools (${list.split('\n')[0]})`, () => {
    const text = agent(`name: a\ndescription: d\n${list}\nreadonly: true`);
    assert.throws(() => adaptAgent(text), /YAML-list/);
  });
}

for (const value of ['true', 'TRUE', '"True"']) {
  test(`maps is_background: ${value} to background: true`, () => {
    const out = adaptFm(`is_background: ${value}`);
    assert.match(out, /^background: true$/m);
    assert.doesNotMatch(out, /is_background/);
  });
}

for (const value of ['false', 'False']) {
  test(`drops is_background: ${value}`, () => {
    assert.doesNotMatch(adaptFm(`is_background: ${value}`), /background/);
  });
}

test('keeps an explicit background key instead of adding a second one', () => {
  assert.deepEqual(adaptFm('background: false\nis_background: true').match(/background:.*/g), [
    'background: false',
  ]);
});

for (const value of ['later', 'yes', 'no', '1']) {
  test(`throws on an is_background value it cannot read (${value})`, () => {
    assert.throws(() => adaptAgent(agent(`name: a\ndescription: d\nis_background: ${value}`)), /is_background/);
  });
}

for (const value of ['fast', "'fast'", 'fast # cheap', 'Fast']) {
  test(`model: ${value} maps to haiku`, () => {
    assert.match(adaptFm(`model: ${value}`), /^model: haiku$/m);
  });
}

for (const model of ['sonnet', 'opus', 'haiku', 'fable', 'inherit', 'claude-opus-5-5', 'opus[1m]']) {
  test(`keeps the Claude model ${model} unchanged`, () => {
    assert.equal(adaptAgent(agent(`name: a\ndescription: d\nmodel: ${model}`)), null);
  });
}

test('trims space before a model suffix', () => {
  assert.match(adaptFm('model: sonnet [1m]'), /^model: sonnet\[1m\]$/m);
});

test('drops a model value with more than one suffix', () => {
  assert.doesNotMatch(adaptFm('model: sonnet[x][y]'), /model:/);
});

test('normalizes a quoted Claude model instead of dropping it', () => {
  assert.match(adaptFm('model: "sonnet"'), /^model: sonnet$/m);
});

test('drops best, which is not a subagent model value', () => {
  assert.doesNotMatch(adaptFm('model: best'), /model:/);
});

test('drops a non-Claude model but keeps its effort', () => {
  const out = adaptFm('model: grok-4.6[effort=xhigh]');
  assert.doesNotMatch(out, /model:/);
  assert.match(out, /^effort: xhigh$/m);
});

test('splits a Claude model with an effort suffix into model and effort', () => {
  const out = adaptFm('model: claude-opus-5[effort=high]');
  assert.match(out, /^model: claude-opus-5$/m);
  assert.match(out, /^effort: high$/m);
});

for (const level of ['low', 'medium', 'high', 'xhigh', 'max']) {
  test(`keeps the effort level ${level}`, () => {
    assert.match(adaptFm(`model: grok[effort=${level}]`), new RegExp(`^effort: ${level}$`, 'm'));
  });
}

test('reads the effort level case-insensitively', () => {
  assert.match(adaptFm('model: grok[effort=High]'), /^effort: high$/m);
});

test('does not override an existing effort key', () => {
  assert.deepEqual(adaptFm('effort: low\nmodel: grok[effort=max]').match(/effort:.*/g), ['effort: low']);
});

test('ignores an effort level Claude Code does not have', () => {
  assert.doesNotMatch(adaptFm('model: grok[effort=turbo]'), /effort/);
});

test('marks the copy as generated from its source', () => {
  const out = fm(adaptAgent(agent('name: a\ndescription: d\nreadonly: true'), 'agents/a.md'));
  assert.match(out, /^# Generated by scripts\/sync-manifests\.mjs from agents\/a\.md; do not edit\.$/m);
});

test('leaves the body untouched, including lines that look like frontmatter', () => {
  const body = '\n# Body\n\n---\nreadonly: true\nmodel: fast\n';
  assert.ok(adaptAgent(agent('name: a\ndescription: d\nreadonly: true', body)).endsWith(`---\n${body}`));
});

test('keeps blank lines in the frontmatter', () => {
  assert.match(adaptFm('readonly: true\n\nmodel: inherit'), /\n\nmodel: inherit/);
});

test('leaves indented keys inside a block value untouched', () => {
  const out = adaptFm('readonly: true\nnotes: |\n  readonly: false\n  model: fast');
  denies(out);
  assert.match(out, /^  readonly: false$/m);
  assert.match(out, /^  model: fast$/m);
});

test('handles CRLF line endings and keeps them', () => {
  const out = adaptAgent(agent('name: a\ndescription: d\nreadonly: true').replace(/\n/g, '\r\n'));
  denies(fm(out));
  assert.doesNotMatch(out.replace(/\r\n/g, ''), /\n/);
});

test('handles a byte-order mark and keeps it', () => {
  const out = adaptAgent(BOM + agent('name: a\ndescription: d\nreadonly: true'));
  assert.ok(out.startsWith(`${BOM}---\n`));
  denies(fm(out));
});

test('handles a closing fence with trailing space or at end of file', () => {
  assert.match(adaptAgent('---\nname: a\nreadonly: true\n--- \nbody'), /disallowedTools/);
  assert.match(adaptAgent('---\nname: a\nreadonly: true\n---'), /disallowedTools/);
});

test('throws when Cursor keys appear but no frontmatter is recognised', () => {
  assert.throws(() => adaptAgent('---\nname: a\nreadonly: true\n'), /outside frontmatter/);
});

test('returns null for a file without frontmatter or Cursor keys', () => {
  assert.equal(adaptAgent('# just notes\n'), null);
});

const READONLY = agent('name: a\ndescription: d\nreadonly: true');
const PLAIN = agent('name: b\ndescription: d', '\n# Body\n');
const pluginWith = files => {
  const dir = mkdtempSync(join(tmpdir(), 'claude-agents-'));
  mkdirSync(join(dir, 'agents'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'agents', name), text);
  return dir;
};

test('lists generated copies and untouched originals in a fixed order', () => {
  const dir = pluginWith({ 'z.md': PLAIN, 'B.md': READONLY, 'a.md': READONLY });
  assert.deepEqual(syncPluginAgents(dir), [
    './.claude-plugin/agents/B.md',
    './.claude-plugin/agents/a.md',
    './agents/z.md',
  ]);
  denies(fm(readFileSync(join(dir, '.claude-plugin/agents/a.md'), 'utf-8')));
});

test('includes a symlinked agent file', () => {
  const dir = pluginWith({ 'a.md': READONLY });
  writeFileSync(join(dir, 'real.md'), PLAIN);
  symlinkSync(join(dir, 'real.md'), join(dir, 'agents', 'link.md'));
  assert.deepEqual(syncPluginAgents(dir), ['./.claude-plugin/agents/a.md', './agents/link.md']);
});

test('adapts a symlinked agent that needs it', () => {
  const dir = pluginWith({});
  writeFileSync(join(dir, 'real.md'), READONLY);
  symlinkSync(join(dir, 'real.md'), join(dir, 'agents', 'link.md'));
  assert.deepEqual(syncPluginAgents(dir), ['./.claude-plugin/agents/link.md']);
});

test('ignores files in agents/ that are not .md agents', () => {
  const dir = pluginWith({ 'a.md': READONLY, 'README.txt': 'readonly: true' });
  assert.deepEqual(syncPluginAgents(dir), ['./.claude-plugin/agents/a.md']);
});

test('returns null for a plugin without an agents/ folder', () => {
  assert.equal(syncPluginAgents(mkdtempSync(join(tmpdir(), 'claude-agents-'))), null);
});

test('removes its own stale copies once no agent needs adapting', () => {
  const dir = pluginWith({ 'a.md': READONLY });
  syncPluginAgents(dir);
  writeFileSync(join(dir, 'agents', 'a.md'), PLAIN);
  assert.equal(syncPluginAgents(dir), null);
  assert.equal(existsSync(join(dir, '.claude-plugin/agents')), false);
});

test('replaces a stale copy whose source was deleted', () => {
  const dir = pluginWith({ 'a.md': READONLY, 'b.md': READONLY });
  syncPluginAgents(dir);
  writeFileSync(join(dir, 'agents', 'b.md'), PLAIN);
  syncPluginAgents(dir);
  assert.equal(existsSync(join(dir, '.claude-plugin/agents/b.md')), false);
});

for (const files of [{ 'a.md': READONLY }, { 'b.md': PLAIN }]) {
  test(`refuses to delete a .claude-plugin/agents folder it did not generate (${Object.keys(files)})`, () => {
    const dir = pluginWith(files);
    mkdirSync(join(dir, '.claude-plugin/agents'), { recursive: true });
    writeFileSync(join(dir, '.claude-plugin/agents/upstream.md'), 'theirs');
    assert.throws(() => syncPluginAgents(dir), /not generated here/);
    assert.equal(readFileSync(join(dir, '.claude-plugin/agents/upstream.md'), 'utf-8'), 'theirs');
  });
}

test('allows agent subfolders whose agents need no adapting', () => {
  const dir = pluginWith({ 'b.md': PLAIN });
  mkdirSync(join(dir, 'agents/extra/deeper'), { recursive: true });
  writeFileSync(join(dir, 'agents/extra/deeper/c.md'), PLAIN);
  assert.equal(syncPluginAgents(dir), null);
});

test('refuses a nested agent that needs adapting, even when the top level needs none', () => {
  const dir = pluginWith({ 'b.md': PLAIN });
  mkdirSync(join(dir, 'agents/review/deeper'), { recursive: true });
  writeFileSync(join(dir, 'agents/review/deeper/ro.md'), READONLY);
  assert.throws(() => syncPluginAgents(dir), /nested agents need adapting: review\/deeper\/ro\.md/);
});

test('refuses to delete a file it did not write inside its own folder', () => {
  const dir = pluginWith({ 'a.md': READONLY });
  syncPluginAgents(dir);
  writeFileSync(join(dir, '.claude-plugin/agents/upstream.md'), 'theirs');
  assert.throws(() => syncPluginAgents(dir), /not generated here: upstream\.md/);
  assert.equal(readFileSync(join(dir, '.claude-plugin/agents/upstream.md'), 'utf-8'), 'theirs');
});

test('refuses subfolders when adapting, and keeps the previous copies', () => {
  const dir = pluginWith({ 'a.md': READONLY });
  syncPluginAgents(dir);
  mkdirSync(join(dir, 'agents/review'));
  assert.throws(() => syncPluginAgents(dir), /unsupported agent subfolders review/);
  assert.equal(existsSync(join(dir, '.claude-plugin/agents/a.md')), true);
});

test('applyAgentsField sets, replaces and removes the agents field', () => {
  const base = { name: 'p', description: 'd' };
  assert.deepEqual(applyAgentsField(base, ['./x.md']), { ...base, agents: ['./x.md'] });
  assert.deepEqual(applyAgentsField({ ...base, agents: ['./.claude-plugin/agents/old.md'] }, ['./x.md']).agents, ['./x.md']);
  assert.deepEqual(applyAgentsField({ ...base, agents: ['./.claude-plugin/agents/old.md'] }, null), base);
  assert.deepEqual(applyAgentsField(base, null), base);
});

for (const agents of [['./extra/more.md'], './agents/', [42], ['./agents/sub/x.md'], ['../agents/x.md']]) {
  test(`applyAgentsField refuses to replace an agents field it did not write (${JSON.stringify(agents)})`, () => {
    assert.throws(() => applyAgentsField({ name: 'p', agents }, ['./agents/x.md']), /sets its own agents field/);
    assert.throws(() => applyAgentsField({ name: 'p', agents }, null), /sets its own agents field/);
  });
}
