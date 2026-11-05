// Unit tests for the project card pick (lib/projects.ts): npm test.
//
// pickProject maps cited chunk ids to knowledge-base files and keeps the ones
// under projects/. The pick is printed so a wrong card reads as a wrong slug,
// not just a failed count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickProject, predictProject, projectBySlug, PROJECTS } from '../lib/projects.ts';

const chunks = [
  { chunk_id: 'res-1', filename: 'knowledge-base/projects/ai-resume.md' },
  { chunk_id: 'res-2', filename: 'knowledge-base\\projects\\ai-resume.md' },
  { chunk_id: 'rb-1', filename: 'knowledge-base/projects/regimen-builder.md' },
  { chunk_id: 'rb-2', filename: 'knowledge-base/projects/regimen-builder.md' },
  // dtx- also prefixes an experience file: no card for it.
  { chunk_id: 'dtx-exp', filename: 'knowledge-base/experience/deciem.md' },
  // A project file that is not in the launch list.
  { chunk_id: 'fl-1', filename: 'knowledge-base/projects/fundlocal-ai-capstone.md' },
  { chunk_id: 'nofile', filename: null },
];

const cases = [
  { name: 'one project cited', ids: ['res-1'], want: 'ai-resume' },
  { name: 'Windows path', ids: ['res-2'], want: 'ai-resume' },
  { name: 'most cited wins', ids: ['res-1', 'rb-1', 'rb-2'], want: 'regimen-builder' },
  { name: 'tie goes to first cited', ids: ['rb-1', 'res-1'], want: 'regimen-builder' },
  { name: 'experience file, same prefix', ids: ['dtx-exp'], want: null },
  { name: 'project not at launch', ids: ['fl-1'], want: null },
  { name: 'no filename', ids: ['nofile'], want: null },
  { name: 'id not retrieved', ids: ['ghost'], want: null },
  { name: 'nothing cited', ids: [], want: null },
];

for (const c of cases) {
  test(`pickProject: ${c.name}`, () => {
    const got = pickProject(c.ids, chunks);
    console.log(`  ${c.name}: [${c.ids.join(', ')}] -> ${got}`);
    assert.equal(got, c.want);
  });
}

test('every launch project resolves by slug and has two questions', () => {
  assert.equal(PROJECTS.length, 12);
  for (const p of PROJECTS) {
    assert.equal(projectBySlug(p.slug), p);
    assert.equal(p.questions.length, 2);
  }
});

test('predictProject: counts every retrieved chunk, ties to the first retrieved', () => {
  const got = predictProject(chunks);
  console.log(`  all chunks -> ${got}`);
  // ai-resume 2, regimen-builder 2: ai-resume was retrieved first.
  assert.equal(got, 'ai-resume');
  assert.equal(predictProject(chunks.slice(2)), 'regimen-builder');
  assert.equal(predictProject([{ chunk_id: 'dtx-exp', filename: 'knowledge-base/experience/deciem.md' }]), null);
});
